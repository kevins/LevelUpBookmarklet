import type { ActionDefinition, DynamicsContext, IconName, StoredProfileV1 } from './core/types';
import { ActionRegistry } from './core/action-registry';
import { ActionRunner } from './core/action-runner';
import { CleanupRegistry } from './core/cleanup-registry';
import { ContextService } from './core/context-service';
import { DecorationManager } from './core/decoration-manager';
import { DynamicsApi } from './core/dynamics-api';
import { MakerUrlFactory } from './core/maker-url-factory';
import { MetadataService } from './core/metadata-service';
import { SolutionResolver } from './core/solution-resolver';
import { StorageService, sharedDomain } from './core/storage-service';
import { mergeOrder } from './core/action-codes';
import { copyText, openUrl } from './core/xrm-helpers';
import { adminCenterUrl, cloudFor } from './core/cloud';
import { createEnvironmentResolver } from './core/environment';
import { CSS_TEXT } from './ui/styles';
import { icon } from './ui/icons';
import { APP_VERSION, BUILD_ID } from './version';
import { UiService } from './ui/ui-service';

const HOST_ID = 'd365-levelup-bookmarklet-host';
const DOCK_CLASS = 'd365lu-bookmarklet-docked';
const categories: { id: ActionDefinition['category']; title: string }[] = [
  { id: 'form', title: 'Form' }, { id: 'navigation', title: 'Navigation' }, { id: 'debugging', title: 'Debugging' }, { id: 'tools', title: 'Tools' }
];

type RuntimeWindow = Window & {
  __D365LU_BOOT__?: () => void;
  __D365_LEVELUP_BOOKMARKLET__?: LevelUpBookmarklet;
};

type DragState = { pointerId: number; startX: number; startY: number; left: number; top: number; width: number; height: number; moved: boolean };
/** A tile being rearranged: it follows the pointer as a lifted copy while its place in the grid moves live. */
type SortState = { section: ActionDefinition['category'] | 'favorites'; id: string; pointerId: number; startX: number; startY: number; offsetX: number; offsetY: number; wrap: HTMLElement; holder: HTMLElement; tile: HTMLButtonElement; before: string[]; ghost?: HTMLElement; moved: boolean };

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
}

/** Text inputs, selects and contenteditable regions: typing there must not reach the page's shortcuts. */
function editable(target: EventTarget | undefined): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || (target instanceof HTMLInputElement && !['button', 'checkbox', 'radio', 'submit', 'reset'].includes(target.type)) || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement);
}

/** Focus from the keyboard (tooltips follow it; focus from a click or a re-render doesn't show them). */
function focusVisible(target: HTMLElement): boolean { try { return target.matches(':focus-visible'); } catch { return false; } }

function relativeTime(timestamp: number): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60_000); if (minutes < 1) return 'Just now'; if (minutes < 60) return `${minutes}m ago`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h ago`; return `${Math.floor(hours / 24)}d ago`;
}

export class LevelUpBookmarklet {
  readonly version = APP_VERSION;
  readonly buildId = BUILD_ID;
  readonly host: HTMLDivElement;
  readonly shadow: ShadowRoot;
  readonly registry = new ActionRegistry();
  readonly storage = new StorageService();
  readonly context = new ContextService();
  readonly cleanup = new CleanupRegistry();
  readonly decorations = new DecorationManager();
  readonly ui: UiService;
  readonly runner: ActionRunner;
  private panel: HTMLElement;
  private tooltip: HTMLElement;
  private current: DynamicsContext = { sourceWindow: window, clientUrl: '', isForm: false };
  private queries = new Map<string, string>();
  private visible = true;
  private destroyed = false;
  private floating = false;
  private drag?: DragState;
  private sorting?: SortState;
  private renderPending = false;
  /** Whether the last interaction was the keyboard: focus is put back after a rebuild only for keyboard users. */
  private keyboard = false;
  private pointerInside = false;
  private recentShown?: StoredProfileV1['recentActions'];
  private shownProfile?: string;
  private chrome!: HTMLElement;
  private docked = false;
  private wide = typeof matchMedia === 'function' ? matchMedia('(min-width: 721px)') : undefined;
  private suppressClick = false;
  private dockStyle: HTMLStyleElement;
  private unsubscribeStorage?: () => void;
  private unwatchStorage?: () => void;
  private unsubscribeContext?: () => void;
  // Esc hides the panel only when pressed inside it, and only after the control that has focus had its turn (a search
  // box clears itself first): it listens on the host while the event bubbles. Dialogs handle their own Esc. Keys
  // pressed in Dynamics or in the Translator's language chooser never reach it.
  private keyHandler = (event: KeyboardEvent) => { if (event.key !== 'Escape' || event.defaultPrevented) return; if (!this.ui.closeDialog()) this.hide(); };
  private clickBlocker = (event: Event) => { if (!this.suppressClick) return; event.preventDefault(); event.stopImmediatePropagation(); this.suppressClick = false; };
  private beginDrag = (event: PointerEvent) => {
    const target = event.target as HTMLElement | null;
    if (event.button !== 0 || !target || target.closest('button,input,textarea,select,a,.d365lu-modal-layer,.d365lu-favorite-tile')) return;
    const rect = this.host.getBoundingClientRect();
    this.drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, width: rect.width, height: rect.height, moved: false };
    document.addEventListener('pointermove', this.moveDrag); document.addEventListener('pointerup', this.endDrag); document.addEventListener('pointercancel', this.endDrag);
  };
  private moveDrag = (event: PointerEvent) => {
    const drag = this.drag; if (!drag) return; const dx = event.clientX - drag.startX; const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    if (!drag.moved) { drag.moved = true; this.suppressClick = true; this.floating = true; this.host.classList.add('d365lu-floating'); this.setDocked(false); Object.assign(this.host.style, { right: 'auto', bottom: 'auto', width: `${drag.width}px`, height: `${drag.height}px` }); try { this.panel.setPointerCapture(drag.pointerId); } catch { /* released over an iframe: pointerup still ends the drag */ } }
    this.place(drag.left + dx, drag.top + dy, drag.height); event.preventDefault();
  };
  /** Keeps the floating panel inside the window, its footer visible. */
  private place(left: number, top: number, height = this.host.getBoundingClientRect().height): void {
    const width = this.host.getBoundingClientRect().width || 406; const y = Math.max(0, Math.min(top, innerHeight - 120));
    Object.assign(this.host.style, { left: `${Math.max(0, Math.min(left, innerWidth - width))}px`, top: `${y}px`, height: `${Math.max(120, Math.min(height, innerHeight - y))}px` });
  }
  private onResize = () => { if (this.visible && this.floating) { const rect = this.host.getBoundingClientRect(); this.place(rect.left, rect.top); } };
  private onWidth = () => { if (this.visible && !this.floating) this.setDocked(true); };
  private endDrag = (_event: PointerEvent) => {
    document.removeEventListener('pointermove', this.moveDrag); document.removeEventListener('pointerup', this.endDrag); document.removeEventListener('pointercancel', this.endDrag);
    if (this.drag?.moved) {
      setTimeout(() => { this.suppressClick = false; }); try { this.panel.releasePointerCapture(this.drag.pointerId); } catch { /* not captured */ }
    }
    this.drag = undefined;
  };

  constructor() {
    this.dockStyle = document.createElement('style'); this.dockStyle.textContent = `html.${DOCK_CLASS}{width:calc(100% - 406px)!important;max-width:calc(100% - 406px)!important}html.${DOCK_CLASS} body{width:100%!important;max-width:100%!important}@media(max-width:720px){html.${DOCK_CLASS},html.${DOCK_CLASS} body{width:100%!important;max-width:100%!important}}`; (document.head ?? document.documentElement).append(this.dockStyle);
    this.host = document.createElement('div'); this.host.id = HOST_ID; Object.assign(this.host.style, { position: 'fixed', top: '0', right: '0', bottom: '0', width: 'min(406px, 100vw)', zIndex: '2147483000', pointerEvents: 'none' }); document.documentElement.append(this.host); this.setDocked(true);
    this.shadow = this.host.attachShadow({ mode: 'open' }); const style = document.createElement('style'); style.textContent = CSS_TEXT; this.shadow.append(style); this.ui = new UiService(this.shadow); this.panel = element('aside', 'd365lu-panel'); this.shadow.append(this.panel); this.tooltip = element('div', 'd365lu-tooltip'); this.tooltip.hidden = true; this.shadow.append(this.tooltip); this.installChrome(); this.panel.addEventListener('pointerdown', this.beginDrag); this.panel.addEventListener('pointerenter', () => { this.pointerInside = true; }); this.panel.addEventListener('pointerleave', () => { this.pointerInside = false; const profile = this.storage.get(); if (profile.settings.showRecentlyUsed && JSON.stringify(this.recentShown ?? []) !== JSON.stringify(profile.recentActions)) this.render(); }); this.panel.addEventListener('click', this.clickBlocker, true); this.panel.addEventListener('scroll', this.hideTooltip, true);
    this.host.addEventListener('pointerdown', () => { this.keyboard = false; }, true); this.host.addEventListener('keydown', event => { if (!['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) this.keyboard = true; }, true);
    this.ui.keyboardFocus = () => this.keyboard;
    // Typing in the panel's search boxes stays in Level Up: Dynamics' page shortcuts must not see those keys.
    for (const type of ['keydown', 'keyup', 'keypress']) this.host.addEventListener(type, event => { if (editable(event.composedPath()[0])) event.stopPropagation(); });
    this.wide?.addEventListener('change', this.onWidth); window.addEventListener('resize', this.onResize);
    const context = () => this.context.resolve(); const api = new DynamicsApi(context); const metadata = new MetadataService(api, context);
    const { environmentId } = createEnvironmentResolver(api, context);
    const maker = new MakerUrlFactory(environmentId, async () => cloudFor((await context()).clientUrl)); const solutions = new SolutionResolver(api);
    const deps = { ui: this.ui, api, metadata, maker, solutions, decorations: this.decorations, storage: this.storage, context: this.context, cleanup: this.cleanup, signal: new AbortController().signal, isCurrent: () => true };
    this.runner = new ActionRunner(this.registry, deps);
    this.storage.load();
    this.unsubscribeStorage = this.storage.subscribe(profile => { if (!this.onlyRecentChanged(profile)) this.render(); }); this.unwatchStorage = this.storage.watch(); this.unsubscribeContext = this.context.subscribe(ctx => { if (this.current.clientUrl) { this.runner.cancelAll(); this.ui.closeDialog(); this.decorations.clear(); this.cleanup.run(); } this.current = ctx; this.render(); }); this.context.start(); this.host.addEventListener('keydown', this.keyHandler); this.render();
    if (this.storage.isMemoryOnly()) this.ui.toast('Browser storage is unavailable; changes will last only for this page.', 'warning');
  }

  private async refreshContext(): Promise<void> { this.current = await this.context.resolve(); if (!this.destroyed) this.render(); }
  private setDocked(active: boolean): void {
    const docked = active && !this.floating && (this.wide ? this.wide.matches : innerWidth > 720); this.ui?.setDocked(docked && this.visible);
    if (docked === this.docked) return; this.docked = docked;
    document.documentElement.classList.toggle(DOCK_CLASS, docked); requestAnimationFrame(() => dispatchEvent(new Event('resize')));
  }
  private dock(): void { this.floating = false; this.host.classList.remove('d365lu-floating'); Object.assign(this.host.style, { top: '0', right: '0', bottom: '0', left: '', width: 'min(406px, 100vw)', height: '' }); this.setDocked(true); }
  toggle(): void { if (this.visible) this.hide(); else this.show(); }
  // A hidden panel closes its dialog (no invisible Audit History or Compare requests keep running).
  hide(): void { this.visible = false; this.ui.closeDialog(); this.hideTooltip(); this.host.style.display = 'none'; this.setDocked(false); this.context.pause(); }
  show(): void { this.visible = true; this.host.style.display = ''; this.dock(); const scroll = this.panel.querySelector<HTMLElement>('.d365lu-scroll'); if (scroll) scroll.scrollTop = 0; this.pointerInside = false; this.storage.sync(); this.context.resume(); void this.refreshContext(); }

  destroy(): void {
    if (this.destroyed) return; this.destroyed = true; this.runner.cancelAll(); this.ui.closeDialog(); this.unsubscribeStorage?.(); this.unwatchStorage?.(); this.unsubscribeContext?.(); this.context.stop(); this.decorations.dispose(); this.cleanup.run(); this.host.removeEventListener('keydown', this.keyHandler); this.wide?.removeEventListener('change', this.onWidth); window.removeEventListener('resize', this.onResize); this.setDocked(false); this.dockStyle.remove(); this.host.remove(); delete (window as RuntimeWindow).__D365_LEVELUP_BOOKMARKLET__;
  }

  private installChrome(): void {
    const chrome = element('div', 'd365lu-chrome'); const close = this.tool('close', 'Close bookmarklet', () => this.hide()); close.classList.add('d365lu-window-close');
    // Shown only while the panel floats: puts it back against the right edge.
    const dock = this.tool('pin', 'Dock to the right', () => { this.dock(); close.focus(); }); dock.classList.add('d365lu-dock'); chrome.append(dock, close); this.shadow.append(chrome); this.chrome = chrome;
  }

  /**
   * A click only added the action to Recently Used, which stays as it is while the pointer is over the panel: nothing on
   * screen changes, so the panel isn't rebuilt. Rebuilding would swap out the tile just clicked and cut its ripple short.
   * The list catches up when the pointer leaves.
   */
  private onlyRecentChanged(profile: StoredProfileV1): boolean {
    if (!this.pointerInside || !this.recentShown || this.shownProfile === undefined || this.sorting?.moved) return false;
    const kept = new Set(profile.recentActions.map(item => item.id)); if (this.recentShown.some(item => !kept.has(item.id))) return false; // removed: redraw now
    return this.shownProfile === JSON.stringify({ ...profile, updatedAt: 0, recentActions: [] });
  }

  private render(): void {
    if (this.destroyed) return;
    // Rebuilding the panel mid-drag would pull the tile from under the pointer: wait for the drop.
    if (this.sorting?.moved) { this.renderPending = true; return; } this.hideTooltip(); const previous = this.panel.querySelector<HTMLElement>('.d365lu-scroll'), previousScroll = previous?.scrollTop ?? 0; const profile = this.storage.get(); this.shownProfile = JSON.stringify({ ...profile, updatedAt: 0, recentActions: [] });
    // Keep what the user is looking at in place when Recently Used or Favorites change above it.
    let anchors: { key: string; top: number }[] = [];
    if (previous && previousScroll > 0) { const edge = previous.getBoundingClientRect().top; anchors = [...previous.querySelectorAll<HTMLElement>('[data-key]')].filter(item => !item.dataset.key!.includes(':recent:') && item.getBoundingClientRect().bottom > edge).slice(0, 8).map(item => ({ key: item.dataset.key!, top: item.getBoundingClientRect().top - edge })); }
    const light = profile.settings.theme === 'light'; this.panel.className = `d365lu-panel${light ? ' light' : ''}`; this.chrome.classList.toggle('light', light); this.ui.setTheme(profile.settings.popupTheme);
    // Keep keyboard focus (and a search box's caret) on the same control across the rebuild.
    const active = this.shadow.activeElement as HTMLElement | null; const focusKey = active && this.panel.contains(active) && (this.keyboard || active instanceof HTMLInputElement) ? active.dataset.key : undefined;
    const caret = active instanceof HTMLInputElement ? [active.selectionStart ?? 0, active.selectionEnd ?? 0] as const : undefined;
    this.panel.replaceChildren();
    const scroll = element('main', 'd365lu-scroll'); this.panel.append(scroll);
    if (profile.settings.showRecentlyUsed) this.renderRecent(scroll, profile); this.renderFavorites(scroll, profile); categories.forEach(category => this.renderActions(scroll, category.id, category.title, profile)); this.panel.append(this.renderFooter(profile)); const restore = () => {
      scroll.scrollTop = previousScroll; if (!anchors.length) return; const nodes = new Map([...scroll.querySelectorAll<HTMLElement>('[data-key]')].map(item => [item.dataset.key!, item]));
      const anchor = anchors.find(item => nodes.has(item.key)); if (anchor) scroll.scrollTop += nodes.get(anchor.key)!.getBoundingClientRect().top - scroll.getBoundingClientRect().top - anchor.top;
    }; restore(); requestAnimationFrame(restore);
    if (focusKey) { const target = [...this.panel.querySelectorAll<HTMLElement>('[data-key]')].find(node => node.dataset.key === focusKey); target?.focus({ preventScroll: true }); if (caret && target instanceof HTMLInputElement) target.setSelectionRange(caret[0], caret[1]); }
  }

  private expanded(id: string, profile: StoredProfileV1): boolean { return profile.settings.sections[id] ?? true; }

  private section(parent: HTMLElement, id: string, title: string, count: number, profile: StoredProfileV1, content: (body: HTMLElement) => void, tools: HTMLElement[] = [], leadingIcon?: IconName): void {
    const open = this.expanded(id, profile); const card = element('section', `d365lu-section${id === 'recent' || id === 'favorites' ? ' featured' : ''}`); const head = element('header', 'd365lu-section-head'); const heading = element('h2', '', title); const badge = element('span', 'd365lu-badge', String(count)); const grow = element('span', 'd365lu-grow'); const toggle = this.tool('expand', `${open ? 'Collapse' : 'Expand'} ${title}`, () => this.storage.setSection(id, !this.expanded(id, this.storage.get()))); toggle.className = `d365lu-icon-btn${open ? ' expanded' : ''}`; toggle.setAttribute('aria-expanded', String(open)); toggle.dataset.key = `expand:${id}`; card.dataset.section = id;
    const query = this.queries.get(id)?.trim(); const chip = query ? element('button', 'd365lu-query', `"${query}"`) : undefined; if (chip) { chip.append(icon('close', 12)); this.wireTooltip(chip, `Clear ${title} search`); chip.onclick = event => { event.stopPropagation(); this.setQuery(id, ''); (card.querySelector<HTMLElement>('input[data-search]') ?? toggle).focus(); }; }
    if (leadingIcon) head.append(icon(leadingIcon, 18)); head.append(heading, badge); if (chip) head.append(chip); if (id === 'recent') head.append(...tools); head.append(grow); if (id !== 'recent') head.append(...tools); head.append(toggle); head.onclick = event => { if ((event.target as HTMLElement).closest('button,input')) return; this.storage.setSection(id, !this.expanded(id, this.storage.get())); }; card.append(head);
    if (open) { const body = element('div', 'd365lu-section-body'); content(body); card.append(body); } parent.append(card);
  }

  private renderRecent(parent: HTMLElement, profile: StoredProfileV1): void {
    // While the pointer is over the panel, Recently Used keeps its order so tiles never move under the cursor; it
    // catches up when the pointer leaves (or the panel is shown again).
    // Only the order is held: actions removed (Clear) disappear at once.
    const kept = new Set(profile.recentActions.map(item => item.id));
    const recent = this.pointerInside && this.recentShown ? this.recentShown.filter(item => kept.has(item.id)) : profile.recentActions; this.recentShown = recent;
    const items = recent.flatMap(recent => { const action = this.registry.get(recent.id); return action ? [{ recent, action }] : []; }); if (!items.length) return;
    const clear = this.tool('close', 'Clear recent actions', () => this.storage.resetRecent()); clear.classList.add('d365lu-recent-clear');
    this.section(parent, 'recent', 'Recently Used', items.length, profile, body => { const grid = element('div', 'd365lu-grid'); items.forEach(item => { const tile = this.actionTile(item.action, profile, undefined, false); tile.append(element('div', 'd365lu-age', relativeTime(item.recent.timestamp))); grid.append(tile); }); body.append(grid); }, [clear], 'history');
  }

  private renderFavorites(parent: HTMLElement, profile: StoredProfileV1): void {
    const actions = profile.favorites.map(id => this.registry.get(id)).filter((action): action is ActionDefinition => Boolean(action)); if (!actions.length) return;
    this.section(parent, 'favorites', 'Favorites', actions.length, profile, body => { const grid = element('div', 'd365lu-grid'); actions.forEach(action => grid.append(this.actionTile(action, profile, 'favorites'))); body.append(grid); });
  }

  private renderActions(parent: HTMLElement, category: ActionDefinition['category'], title: string, profile: StoredProfileV1): void {
    const actions = this.sectionOrder(category, profile).flatMap(actionId => { const action = this.registry.get(actionId); return action && !profile.favorites.includes(actionId) ? [action] : []; }); if (!actions.length) return; const id = `section-${category}`;
    const query = this.queries.get(id) ?? ''; const shown = actions.filter(action => this.matches(action, query)).length;
    this.section(parent, id, title, shown, profile, body => {
      const holder = element('div', profile.settings.layout === 'grid' ? 'd365lu-grid' : 'd365lu-list'); actions.forEach(action => { const tile = this.actionTile(action, profile, category); tile.hidden = !this.matches(action, query); holder.append(tile); }); if (!shown) holder.append(element('div', 'd365lu-empty', `No actions found for "${query.trim()}".`));
      body.append(this.searchControls(id, title, profile), holder);
    });
  }

  private sectionOrder(category: ActionDefinition['category'], profile: StoredProfileV1): string[] { return mergeOrder(this.registry.category(category).map(action => action.id), profile.settings.actionOrder[category]); }

  private searchControls(id: string, title: string, profile: StoredProfileV1): HTMLElement {
    const row = element('div', 'd365lu-searchrow'); const field = element('label', 'd365lu-search'); field.append(icon('search', 20)); const input = element('input', 'd365lu-input') as HTMLInputElement; const clear = this.tool('close', `Clear ${title} search`, () => { this.setQuery(id, ''); input.focus(); }); clear.className = 'd365lu-search-clear';
    input.placeholder = `Search ${title.toLowerCase()}...`; input.value = this.queries.get(id) ?? ''; input.dataset.key = `search:${id}`; input.dataset.search = id; input.setAttribute('aria-label', `Search ${title}`); clear.hidden = !input.value; input.oninput = () => this.setQuery(id, input.value);
    // Esc clears a search first; an empty box lets Esc hide the panel as usual.
    input.onkeydown = event => { if (event.key === 'Escape' && input.value) { event.preventDefault(); event.stopPropagation(); this.setQuery(id, ''); } };
    field.append(input, clear);
    const layout = element('div', 'd365lu-layout'); const grid = this.tool('grid', 'Grid view', () => this.storage.setLayout('grid')); const list = this.tool('list', 'List view', () => this.storage.setLayout('list')); grid.classList.toggle('selected', profile.settings.layout === 'grid'); list.classList.toggle('selected', profile.settings.layout === 'list'); grid.setAttribute('aria-pressed', String(profile.settings.layout === 'grid')); list.setAttribute('aria-pressed', String(profile.settings.layout === 'list')); grid.dataset.key = `layout:${id}:grid`; list.dataset.key = `layout:${id}:list`; layout.append(grid, list); row.append(field, layout); return row;
  }

  /** Filters a section's tiles in place: the search box keeps focus and every keystroke reaches it. */
  private setQuery(id: string, value: string): void {
    if (value.trim()) this.queries.set(id, value); else this.queries.delete(id);
    const card = [...this.panel.querySelectorAll<HTMLElement>('.d365lu-section')].find(node => node.dataset.section === id); if (!card) return;
    const query = value.trim(); const input = card.querySelector<HTMLInputElement>('input[data-search]'); if (input && input.value !== value) input.value = value;
    const clear = card.querySelector<HTMLElement>('.d365lu-search-clear'); if (clear) clear.hidden = !value;
    let shown = 0; card.querySelectorAll<HTMLElement>('.d365lu-tile-wrap[data-action]').forEach(wrap => { const action = this.registry.get(wrap.dataset.action ?? ''); const match = !action || this.matches(action, query); wrap.hidden = !match; if (match) shown++; });
    // A collapsed section has no tiles on the page: count from its actions.
    if (!card.querySelector('.d365lu-section-body')) { const profile = this.storage.get(); shown = this.sectionOrder(id.replace(/^section-/, '') as ActionDefinition['category'], profile).filter(actionId => { const action = this.registry.get(actionId); return action && !profile.favorites.includes(actionId) && this.matches(action, query); }).length; }
    const badge = card.querySelector('.d365lu-badge'); if (badge) badge.textContent = String(shown);
    const holder = card.querySelector<HTMLElement>('.d365lu-grid,.d365lu-list'); let empty = holder?.querySelector<HTMLElement>('.d365lu-empty');
    if (holder && !shown && !empty) { empty = element('div', 'd365lu-empty'); holder.append(empty); }
    if (empty) { empty.hidden = Boolean(shown); empty.textContent = `No actions found for "${query}".`; }
    const head = card.querySelector('.d365lu-section-head'); head?.querySelector('.d365lu-query')?.remove();
    if (head && query) { const title = head.querySelector('h2')?.textContent ?? ''; const chip = element('button', 'd365lu-query', `"${query}"`); chip.append(icon('close', 12)); this.wireTooltip(chip, `Clear ${title} search`); chip.onclick = event => { event.stopPropagation(); this.setQuery(id, ''); (card.querySelector<HTMLElement>('input[data-search]') ?? card.querySelector<HTMLElement>('.d365lu-icon-btn'))?.focus(); }; head.querySelector('.d365lu-badge')?.after(chip); }
  }
  private matches(action: ActionDefinition, value: string): boolean { const query = value.trim().toLowerCase(); return !query || action.label.toLowerCase().includes(query) || action.description.toLowerCase().includes(query); }

  private actionTile(action: ActionDefinition, profile: StoredProfileV1, dragSection?: ActionDefinition['category'] | 'favorites', showFavorite = true): HTMLElement {
    const wrap = element('div', 'd365lu-tile-wrap'); wrap.dataset.action = action.id; const tile = element('button', 'd365lu-tile') as HTMLButtonElement; tile.type = 'button'; tile.dataset.key = `tile:${dragSection ?? 'recent'}:${action.id}`; const state = action.availability(this.current);
    // Unavailable tiles stay focusable and draggable (so any section can be arranged on any page) and say why on hover;
    // a click shows the reason instead of running.
    tile.setAttribute('aria-disabled', String(!state.available)); tile.setAttribute('aria-label', action.label); const stacked = action.id === 'form:clear-logical-names'; const label = element('span', stacked ? 'd365lu-stack-label' : '', action.label); if (stacked) label.replaceChildren(document.createTextNode('Clear '), document.createElement('br'), document.createTextNode('Names')); tile.append(icon(action.icon), label); this.wireTooltip(tile, state.available ? action.description : state.reason ?? action.description); tile.onclick = () => void this.runner.run(action.id, action.newTab ? this.context.snapshot() : undefined); wrap.append(tile);
    if (showFavorite) { const remove = dragSection === 'favorites'; const favorite = element('button', `d365lu-fav${remove ? ' subtle' : ''}`); favorite.type = 'button'; favorite.dataset.key = `fav:${dragSection ?? 'recent'}:${action.id}`; favorite.append(icon(remove ? 'close' : 'favorite', 12)); this.wireTooltip(favorite, remove ? 'Remove from favorites' : 'Add to favorites'); favorite.onclick = event => { event.stopPropagation(); this.storage.toggleFavorite(action.id); }; wrap.append(favorite); }
    if (dragSection) this.wireSort(wrap, tile, action.id, dragSection); return wrap;
  }


  /** The order of the tiles in a holder as they stand on screen. */
  private shownIds(holder: HTMLElement): string[] { return [...holder.querySelectorAll<HTMLElement>(':scope > .d365lu-tile-wrap[data-action]')].map(wrap => wrap.dataset.action!); }

  private saveOrder(section: SortState['section'], ids: string[]): void {
    if (section === 'favorites') this.storage.setFavoriteOrder(ids); else this.storage.setActionOrder(section, this.registry.category(section).map(action => action.id), ids);
  }

  /** Slides tiles from where they were to where they are now (they moved in the DOM a moment ago). */
  private slide(before: Map<HTMLElement, DOMRect>): void {
    for (const [wrap, rect] of before) {
      const now = wrap.getBoundingClientRect(); const dx = rect.left - now.left, dy = rect.top - now.top;
      if ((dx || dy) && typeof wrap.animate === 'function' && wrap !== this.sorting?.wrap) wrap.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }

  private sortMove = (event: PointerEvent) => {
    const sort = this.sorting; if (!sort || event.pointerId !== sort.pointerId) return;
    if (!sort.moved) {
      if (Math.abs(event.clientX - sort.startX) + Math.abs(event.clientY - sort.startY) < 6) return;
      // Lift the tile: a copy follows the pointer, its place stays as a dashed slot that moves through the grid.
      sort.moved = true; this.suppressClick = true; this.hideTooltip();
      const rect = sort.wrap.getBoundingClientRect(); const ghost = sort.wrap.cloneNode(true) as HTMLElement; ghost.classList.add('d365lu-sort-ghost'); ghost.removeAttribute('data-action');
      Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px` }); this.panel.append(ghost); sort.ghost = ghost;
      sort.wrap.classList.add('d365lu-sort-slot'); this.panel.classList.add('d365lu-sorting');
      try { sort.tile.setPointerCapture(sort.pointerId); } catch { /* released already */ }
    }
    event.preventDefault();
    if (sort.ghost) { sort.ghost.style.left = `${event.clientX - sort.offsetX}px`; sort.ghost.style.top = `${event.clientY - sort.offsetY}px`; }
    // The tile under the pointer: the slot goes before it, or after it past its middle (across in the grid, down in the list).
    const list = sort.holder.classList.contains('d365lu-list');
    const wraps = [...sort.holder.querySelectorAll<HTMLElement>(':scope > .d365lu-tile-wrap[data-action]')].filter(wrap => !wrap.hidden);
    const target = wraps.find(wrap => { if (wrap === sort.wrap) return false; const box = wrap.getBoundingClientRect(); return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom; });
    if (target) {
      const box = target.getBoundingClientRect(); const after = list ? event.clientY > box.top + box.height / 2 : event.clientX > box.left + box.width / 2;
      const reference = after ? target.nextElementSibling : target;
      if (reference !== sort.wrap && reference !== sort.wrap.nextElementSibling) {
        const before = new Map(wraps.map(wrap => [wrap, wrap.getBoundingClientRect()] as const));
        sort.holder.insertBefore(sort.wrap, reference); this.slide(before);
      }
    }
    // Near the top or bottom of the panel, scroll it so any slot can be reached.
    const scroll = this.panel.querySelector<HTMLElement>('.d365lu-scroll'); if (scroll) { const area = scroll.getBoundingClientRect(); if (event.clientY < area.top + 40) scroll.scrollTop -= 12; else if (event.clientY > area.bottom - 40) scroll.scrollTop += 12; }
  };

  private sortEnd = (event: PointerEvent, cancelled = false) => {
    const sort = this.sorting; if (!sort || event.pointerId !== sort.pointerId) return;
    this.sorting = undefined; document.removeEventListener('pointermove', this.sortMove); document.removeEventListener('pointerup', this.sortUp); document.removeEventListener('pointercancel', this.sortCancel); document.removeEventListener('keydown', this.sortKey, true);
    try { sort.tile.releasePointerCapture(sort.pointerId); } catch { /* not captured */ }
    if (!sort.moved) return; // a click, not a drag
    sort.ghost?.remove(); sort.wrap.classList.remove('d365lu-sort-slot'); this.panel.classList.remove('d365lu-sorting'); setTimeout(() => { this.suppressClick = false; });
    const after = this.shownIds(sort.holder);
    if (!cancelled && after.join() !== sort.before.join()) { this.renderPending = false; this.saveOrder(sort.section, after); }
    else this.render(); // cancelled or unchanged: put the tiles back as saved
  };
  private sortUp = (event: PointerEvent) => this.sortEnd(event);
  private sortCancel = (event: PointerEvent) => this.sortEnd(event, true);
  private sortKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && this.sorting) { event.preventDefault(); event.stopPropagation(); this.sortEnd({ pointerId: this.sorting.pointerId } as PointerEvent, true); } };

  private wireSort(wrap: HTMLElement, tile: HTMLButtonElement, id: string, section: SortState['section']): void {
    tile.classList.add('d365lu-favorite-tile');
    tile.addEventListener('pointerdown', event => {
      if (event.button !== 0 || this.sorting || !wrap.parentElement) return;
      const rect = wrap.getBoundingClientRect();
      this.sorting = { section, id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, wrap, holder: wrap.parentElement, tile, before: this.shownIds(wrap.parentElement), moved: false };
      document.addEventListener('pointermove', this.sortMove); document.addEventListener('pointerup', this.sortUp); document.addEventListener('pointercancel', this.sortCancel); document.addEventListener('keydown', this.sortKey, true);
    });
    tile.addEventListener('dragstart', event => event.preventDefault()); // no browser drag image: the tile itself moves
    // Alt+arrows move the focused tile one place, for keyboard users.
    tile.addEventListener('keydown', event => {
      if (!event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || !wrap.parentElement) return;
      event.preventDefault(); event.stopPropagation();
      const ids = this.shownIds(wrap.parentElement); const index = ids.indexOf(id); const to = index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1);
      if (index < 0 || to < 0 || to >= ids.length) return;
      ids.splice(index, 1); ids.splice(to, 0, id); this.keyboard = true; this.saveOrder(section, ids);
    });
  }

  private tool(iconName: IconName, title: string, action: () => void, size = 18): HTMLButtonElement {
    const tool = element('button', 'd365lu-tool') as HTMLButtonElement; tool.type = 'button'; tool.dataset.key = `tool:${title}`; tool.setAttribute('aria-label', title); tool.append(icon(iconName, size)); this.wireTooltip(tool, title); tool.onclick = event => { event.stopPropagation(); action(); }; return tool;
  }

  private hideTooltip = (): void => { this.tooltip.hidden = true; };
  private showTooltip(target: HTMLElement, text: string): void {
    const tip = this.tooltip; tip.textContent = text; tip.hidden = false; tip.classList.remove('below'); tip.style.left = '0px'; tip.style.top = '0px';
    const anchor = target.getBoundingClientRect(); const rect = tip.getBoundingClientRect(); const width = tip.offsetWidth || rect.width; const height = tip.offsetHeight || rect.height; const margin = 6; const gap = 8;
    const left = Math.max(margin, Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - margin)); const roomAbove = anchor.top - margin - gap; const roomBelow = window.innerHeight - anchor.bottom - margin - gap; const below = roomAbove < height && roomBelow > roomAbove; const rawTop = below ? anchor.bottom + gap : anchor.top - height - gap; const top = Math.max(margin, Math.min(rawTop, window.innerHeight - height - margin));
    tip.classList.toggle('below', below); tip.style.left = `${left}px`; tip.style.top = `${top}px`; tip.style.setProperty('--tip-arrow-left', `${Math.max(8, Math.min(width - 8, anchor.left + anchor.width / 2 - left))}px`);
  }
  private wireTooltip(target: HTMLElement, text: string): void {
    if (!target.hasAttribute('aria-label')) target.setAttribute('aria-label', text); target.onmouseenter = () => this.showTooltip(target, text); target.onmouseleave = this.hideTooltip; target.onfocus = () => { if (focusVisible(target)) this.showTooltip(target, text); }; target.onblur = this.hideTooltip; target.onpointerdown = this.hideTooltip;
  }

  private renderFooter(profile: StoredProfileV1): HTMLElement {
    const footer = element('footer', 'd365lu-footer'); const status = element('button', 'd365lu-status') as HTMLButtonElement; const dot = element('span', `d365lu-dot${this.current.xrm ? '' : ' off'}`); const text = element('span', '', this.current.xrm ? 'Connected' : 'Not connected'); status.append(dot, text); status.setAttribute('aria-label', `${this.current.xrm ? 'Connected' : 'Not connected'}: ${this.current.clientUrl || 'open a supported model-driven app'}`); this.wireTooltip(status, this.current.clientUrl || 'Open a supported model-driven app'); status.onclick = () => { try { openUrl(this.current, adminCenterUrl(this.current.clientUrl, this.current.environmentId)); } catch (error) { this.ui.toast(error instanceof Error ? error.message : String(error), 'error'); } };
    const light = this.tool('light', 'Light sidebar', () => this.storage.setTheme('light')); const dark = this.tool('moon', 'Dark sidebar', () => this.storage.setTheme('dark')); light.classList.toggle('selected', profile.settings.theme === 'light'); dark.classList.toggle('selected', profile.settings.theme === 'dark'); light.setAttribute('aria-pressed', String(profile.settings.theme === 'light')); dark.setAttribute('aria-pressed', String(profile.settings.theme === 'dark'));
    const theme = element('span', 'd365lu-theme'); theme.append(light, dark); footer.append(status, this.tool('settings', 'Settings', () => this.showSettings()), theme); return footer;
  }

  private showSettings(): void {
    const profile = this.storage.get();
    this.ui.dialog('Settings & Profile', (body, footer, close) => {
      const group = (title: string) => { const box = element('section', 'd365lu-group'); box.append(element('h3', 'd365lu-group-title', title)); body.append(box); return box; };
      // Segmented choices; `primary` marks the pressed one (aria-pressed for screen readers).
      const choice = (parent: HTMLElement, label: string, values: { label: string; active: boolean; run: () => void }[]) => {
        const row = element('div', 'd365lu-field'); row.append(element('label', '', label)); const choices = element('div', 'd365lu-seg'); choices.setAttribute('role', 'group'); choices.setAttribute('aria-label', label);
        values.forEach(value => { const option = element('button', value.active ? 'primary' : '', value.label); option.type = 'button'; option.setAttribute('aria-pressed', String(value.active)); option.onclick = () => { choices.querySelectorAll('button').forEach(other => { other.classList.remove('primary'); other.setAttribute('aria-pressed', 'false'); }); option.classList.add('primary'); option.setAttribute('aria-pressed', 'true'); value.run(); }; choices.append(option); });
        row.append(choices); parent.append(row);
      };
      const check = (parent: HTMLElement, label: string, checked: boolean, run: (on: boolean) => void) => { const input = element('input') as HTMLInputElement; input.type = 'checkbox'; input.checked = checked; input.onchange = () => run(input.checked); const row = element('label', 'd365lu-check'); row.append(input, document.createTextNode(label)); parent.append(row); };
      const appearance = group('Appearance');
      choice(appearance, 'Sidebar', [{ label: 'Light', active: profile.settings.theme === 'light', run: () => this.storage.setTheme('light') }, { label: 'Dark', active: profile.settings.theme === 'dark', run: () => this.storage.setTheme('dark') }]);
      choice(appearance, 'Popups', [{ label: 'Light', active: profile.settings.popupTheme === 'light', run: () => this.storage.setPopupTheme('light') }, { label: 'Dark', active: profile.settings.popupTheme === 'dark', run: () => this.storage.setPopupTheme('dark') }]);
      choice(appearance, 'Action layout', [{ label: 'Grid', active: profile.settings.layout === 'grid', run: () => this.storage.setLayout('grid') }, { label: 'List', active: profile.settings.layout === 'list', run: () => this.storage.setLayout('list') }]);
      const behavior = group('Behavior');
      check(behavior, 'Show Recently Used', profile.settings.showRecentlyUsed, on => this.storage.setRecentEnabled(on));
      check(behavior, 'Developer Logging', profile.settings.developerLogging, on => this.storage.setLogging(on));
      const shared = group('Every environment'); const domain = sharedDomain();
      shared.append(element('p', 'd365lu-sync-note', this.storage.isLocalOnly() ? 'This browser blocked the shared settings cookie, so changes made here stay in this environment. Copy the settings code to use them elsewhere.' : domain ? `Themes, layout, favorites and button order are the same in every environment on ${domain} in this browser; Recently Used stays with each environment. For another browser or cloud, copy the settings code there.` : 'Copy the settings code to use these settings in another environment or browser.'));
      const transfer = element('div', 'd365lu-inline'); const copyCode = element('button', 'd365lu-btn', 'Copy settings code'); copyCode.type = 'button'; const pasteCode = element('button', 'd365lu-btn', 'Paste settings code'); pasteCode.type = 'button';
      copyCode.onclick = () => void copyText(this.storage.exportCode()).then(() => this.ui.toast('Settings code copied', 'success'), error => this.ui.toast(error instanceof Error ? error.message : String(error), 'error'));
      pasteCode.onclick = () => void this.importSettings();
      transfer.append(copyCode, pasteCode); shared.append(transfer);
      const reset = group('Reset'); const resets = element('div', 'd365lu-inline');
      ([['Reset Recently Used', 'd365lu-btn', () => this.storage.resetRecent()], ['Reset Settings', 'd365lu-btn caution', () => void this.resetSettings()], ['Reset All', 'd365lu-btn caution', () => void this.resetAll()]] as const).forEach(([label, className, run]) => { const action = element('button', className, label); action.type = 'button'; action.onclick = run; resets.append(action); });
      reset.append(resets);
      const done = element('button', 'd365lu-btn primary', 'Close'); done.type = 'button'; done.onclick = close; footer.append(done);
    }, { size: 'md', subtitle: `Level Up ${this.version}` });
  }

  // A confirm replaces the Settings dialog; Settings comes back afterwards, whatever the answer.
  private async resetSettings(): Promise<void> { if (await this.ui.confirm('Reset settings?', 'Reset themes, layout, favorites, button order and logging in every environment?', { ok: 'Reset', danger: true })) this.storage.resetSettings(); this.showSettings(); }
  private async resetAll(): Promise<void> { if (await this.ui.confirm('Reset everything?', 'Reset all settings, favorites, button order and recently used actions in every environment?', { ok: 'Reset', danger: true })) this.storage.resetAll(); this.showSettings(); }
  private async importSettings(): Promise<void> {
    const values = await this.ui.prompt('Paste settings code', [{ name: 'code', label: 'Settings code', placeholder: 'LevelUp:1.…' }], { ok: 'Apply', subtitle: 'Replaces this browser\'s themes, layout, favorites and button order.' }); if (!values) { if (this.visible && !this.destroyed) this.showSettings(); return; }
    const applied = this.storage.importCode(values.code ?? ''); this.showSettings(); // the message shows in the reopened Settings
    this.ui.toast(applied ? 'Settings applied' : 'That is not a Level Up settings code.', applied ? 'success' : 'error');
  }
}

export function findExistingHost(): HTMLElement | null { return document.getElementById(HOST_ID); }
