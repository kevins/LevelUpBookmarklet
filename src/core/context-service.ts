import type { DynamicObject, DynamicsContext } from './types';

const cleanGuid = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value.replace(/[{}]/g, '') : undefined;

function readXrm(candidate: Window): DynamicObject | undefined {
  try { return (candidate as Window & { Xrm?: DynamicObject }).Xrm; } catch { return undefined; }
}

/** Resolves within ms, or with undefined. */
async function within<T>(promise: Promise<T> | T, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([Promise.resolve(promise), new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), ms); })]); }
  catch { return undefined; } finally { clearTimeout(timer); }
}

/**
 * Finds the page's Dynamics context and tells subscribers when it changes (navigation inside the app).
 * Checked every 750 ms while the panel is shown, every 2.5 s while it is hidden (decorations of the previous record
 * must still be cleared after navigation), not at all while the tab is in the background, and on history navigation.
 * The check is cheap: the top window's Xrm is read first (frames are scanned only on pages without one), and the app
 * id comes from the page address (the app API only when the address has none).
 */
export class ContextService {
  private listeners = new Set<(ctx: DynamicsContext) => void>();
  private pollTimer?: number;
  private lastSignature = '';
  private refreshing = false;
  private started = false;
  private paused = false;
  private appIds = new Map<string, string>();
  private onNavigation = () => { void this.refreshSubscribers(); };
  private onVisibility = () => { this.schedule(); if (!document.hidden) this.onNavigation(); };

  start(): void {
    this.started = true;
    window.addEventListener('popstate', this.onNavigation);
    window.addEventListener('hashchange', this.onNavigation);
    document.addEventListener('visibilitychange', this.onVisibility);
    // Chromium reports pushState/replaceState navigation too (UCI moves between records that way).
    this.navigation()?.addEventListener('currententrychange', this.onNavigation);
    this.schedule();
    this.onNavigation();
  }

  private navigation(): EventTarget | undefined { return (window as Window & { navigation?: EventTarget }).navigation; }

  stop(): void {
    this.started = false;
    window.removeEventListener('popstate', this.onNavigation);
    window.removeEventListener('hashchange', this.onNavigation);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.navigation()?.removeEventListener('currententrychange', this.onNavigation);
    this.schedule();
    this.listeners.clear();
  }

  /** The panel is hidden: stop polling (history navigation is still noticed). */
  pause(): void { this.paused = true; this.schedule(); }
  /** The panel is shown again: poll, and check now. */
  resume(): void { this.paused = false; this.schedule(); this.onNavigation(); }

  private pollEvery = 0;
  private schedule(): void {
    const every = this.started && !document.hidden ? (this.paused ? 2500 : 750) : 0;
    if (every === this.pollEvery) return;
    if (this.pollTimer !== undefined) { window.clearInterval(this.pollTimer); this.pollTimer = undefined; }
    this.pollEvery = every; if (every) this.pollTimer = window.setInterval(this.onNavigation, every);
  }

  subscribe(listener: (ctx: DynamicsContext) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async refreshSubscribers(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      const context = await this.resolve();
      const signature = [Boolean(context.xrm), context.clientUrl, context.appId, context.environmentId, context.organizationId, context.pageType, context.entityName, context.entityId, context.formId, context.isForm].join('|');
      if (signature === this.lastSignature) return;
      // Remembered only after every listener ran, so a listener that failed sees the change again on the next check.
      let failed = false;
      for (const listener of [...this.listeners]) { try { listener(context); } catch { failed = true; } }
      if (!failed) this.lastSignature = signature;
    } catch { /* the page is between states (a form tearing down); the next check retries */ }
    finally { this.refreshing = false; }
  }

  private frames(): Window[] {
    const found: Window[] = [];
    try { if (window.top && window.top !== window) found.push(window.top); } catch { /* cross-origin */ }
    for (const frame of Array.from(document.querySelectorAll('iframe'))) {
      try { if (frame.contentWindow && frame.getClientRects().length) found.push(frame.contentWindow); } catch { /* cross-origin */ }
    }
    return found;
  }

  /**
   * The context as the page is now, without waiting: new-tab actions use it inside the click. Its appId is the one in
   * the page address, or the last one the app API gave for that address.
   */
  snapshot(): DynamicsContext {
    const sourceWindow = readXrm(window) ? window : this.frames().find(readXrm) ?? window;
    const xrm = readXrm(sourceWindow);
    const read = <T>(get: () => T): T | undefined => { try { return get(); } catch { return undefined; } };
    const global = read(() => xrm?.Utility?.getGlobalContext?.());
    const pageInput = read(() => xrm?.Utility?.getPageContext?.()?.input) ?? {};
    const form = read(() => xrm?.Page);
    const entity = read(() => form?.data?.entity);
    const org = read(() => global?.organizationSettings) ?? {};
    const clientUrl = read(() => global?.getClientUrl?.()?.replace(/\/$/, '')) ?? '';
    const addressApp = cleanGuid(read(() => new URL(sourceWindow.location.href).searchParams.get('appid')) ?? undefined);
    const formId = cleanGuid(read(() => form?.ui?.formSelector?.getCurrentItem?.()?.getId?.()));
    return {
      sourceWindow,
      xrm,
      form,
      global,
      clientUrl,
      environmentId: cleanGuid(org.bapEnvironmentId),
      organizationId: cleanGuid(org.organizationId),
      organizationUniqueName: org.uniqueName,
      entityName: pageInput.entityName ?? read(() => entity?.getEntityName?.()),
      entityId: cleanGuid(pageInput.entityId ?? read(() => entity?.getId?.())),
      formId,
      appId: cleanGuid(pageInput.appId) ?? addressApp ?? this.appIds.get(this.appKey(sourceWindow, clientUrl)),
      pageType: pageInput.pageType,
      isForm: Boolean(entity && form?.ui)
    };
  }

  /** The app API's answer is remembered per page address (switching apps changes the address). */
  private appKey(source: Window, clientUrl: string): string { try { return `${clientUrl}|${source.location.pathname}`; } catch { return clientUrl; } }

  async resolve(): Promise<DynamicsContext> {
    const context = this.snapshot();
    if (!context.appId && context.global?.getCurrentAppProperties) {
      let pending: Promise<DynamicObject> | undefined; try { pending = context.global.getCurrentAppProperties(); } catch { /* not in an app */ }
      const appId = cleanGuid((await within(pending ?? Promise.resolve(undefined), 1000))?.appId);
      if (appId) { context.appId = appId; this.appIds.set(this.appKey(context.sourceWindow, context.clientUrl), appId); }
    }
    return context;
  }
}
