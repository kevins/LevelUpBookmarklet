// What the standalone bookmarklets (refresh.ts, language.ts) share: the Dynamics page check, one run at a time, the
// record's unsaved changes, and the reload itself. Small on purpose: these bookmarklets carry no translator code.

import { lcidName } from '../core/lcid';
import { browserEnv, fetchApi, leftSwitched, LockBusy, readUiLanguage, switchInDoubt, switchMarker, windowLock, withLock, type LockEnv, type Locks, type UiApi } from '../core/uilang';
import { refreshNow, showNote, STAYED } from '../ui/refresh';

/** Hosts of Dynamics 365 / Power Apps model-driven apps. */
const DYNAMICS = /\.(dynamics\.com|dynamics\.us|microsoftdynamics\.us|dynamics\.cn|appsplatform\.us)$/i;

/** The page's Xrm (or a same-origin frame's, classic web client); null without one. */
export function xrmOf(): any {
  const w = window as any;
  if (w.Xrm?.Utility?.getGlobalContext) return w.Xrm;
  try {
    for (const f of Array.from(document.querySelectorAll('iframe'))) {
      const x = (f.contentWindow as any)?.Xrm;
      if (x?.Utility?.getGlobalContext) return x;
    }
  } catch {
    /* cross-origin frame */
  }
  return null;
}

/**
 * True on a Dynamics page, and when no other run of a tool is going on in this tab. Anywhere else it says so and
 * does nothing: the purge must never clear another site's storage.
 */
export function begin(tool: string): boolean {
  if (!xrmOf() && !DYNAMICS.test(location.hostname)) {
    alert(`Open a Dynamics 365 / Power Apps model-driven app (https://<org>.crm.dynamics.com/main.aspx…), then click ${tool} again.`);
    return false;
  }
  const w = window as unknown as { __dxtTool?: number };
  // A second click while the first still runs (a stuck one is taken over after a minute): said, never silent.
  if (w.__dxtTool && Date.now() - w.__dxtTool < 60_000) {
    const n = showNote('Already running. One moment…');
    setTimeout(() => n.remove(), 2500);
    return false;
  }
  w.__dxtTool = Date.now();
  return true;
}

/** The run is over without a reload (cancelled, or a problem was shown). */
export function end(): void {
  delete (window as unknown as { __dxtTool?: number }).__dxtTool;
}

/** False when the open record has unsaved changes the user would rather keep. */
export function mayLeave(xrm: any): boolean {
  let dirty = false;
  try {
    dirty = !!xrm?.Page?.data?.getIsDirty?.();
  } catch {
    dirty = false;
  }
  return !dirty || confirm('This record has unsaved changes. Refresh the page anyway and lose them?');
}

export const errText = (e: unknown): string => (e as Error)?.message || String(e);
export const guid = (s: unknown): string => String(s ?? '').replace(/[{}]/g, '').toLowerCase();

/** The page context's org and user ids, as the translator keys its locks and marker ('' when unknown). */
export function idsOf(xrm: any): { org: string; user: string } {
  let gc: any = null;
  try {
    gc = xrm?.Utility?.getGlobalContext?.();
  } catch {
    gc = null;
  }
  return { org: guid(gc?.organizationSettings?.organizationId), user: guid(gc?.userSettings?.userId) };
}

/**
 * Longest wait for a translator's switch whose answer was lost: it can't run LOST_MS (the Translator's language session, 150 s) after
 * it was sent, and its marker says until when; a little more for the clocks.
 */
export const DOUBT_MS = 160_000;

/**
 * The refresh (ui/refresh.ts refreshNow: the purge, then the fresh reload), inside the translator's switch window
 * (shared, waiting at most 15 s) and holding it until the page is gone, so the reload never boots in a language a
 * translator in this or another tab switched to for a moment. Still switched after the wait: nothing reloads, and
 * `busy` says so. Every switch's marker says until when it may run (core/uilang switchInDoubt), and a translator holds
 * the window until it can't; one whose answer was lost may still run after its tab has gone, and nothing holds the
 * window then. So a switch in doubt seen once the window is held is waited out outside it, saying so, as the
 * translator's quiet() does (DOUBT_MS at most), then the window is taken again. A marker still there is a switch that
 * never finished: the language is read, and while the user is still in the one it switched to (leftSwitched), or it
 * can't be read, nothing reloads and the reason is said. A page still here after STAYED ms was kept (a "Leave site?"
 * prompt answered Stay): the note goes and the bookmarklet can be clicked again.
 */
export async function reload(
  ids: { org: string; user: string },
  note: { set?(text: string): void; remove(): void },
  o: {
    /** What to say when the page was not reloaded because a translator kept its switch past the wait. */
    busy?: string;
    /** Reads the user's language (default: this page's Dataverse). */
    api?: UiApi;
    // Tests:
    locks?: Locks | null;
    storage?: LockEnv['storage'];
    refresh?: () => Promise<unknown>;
    stayed?: number;
    wait?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<unknown>;
  } = {},
): Promise<void> {
  const env = o.locks === undefined || o.storage === undefined ? browserEnv() : null;
  const locks = o.locks === undefined ? env!.locks : o.locks;
  const storage = o.storage === undefined ? env!.storage : o.storage;
  const now = o.now ?? Date.now;
  const known = !!ids.org && !!ids.user;
  const wait = o.wait ?? 15_000;
  // A doubt is seen only once the window is held: the longest one, after the longest wait for the window.
  const stop = now() + wait + DOUBT_MS;
  let busy = false;
  /** Why nothing reloads ('' when it did, or it is said by `busy`). */
  let why = '';
  for (let again = true; again; ) {
    again = false;
    try {
      await withLock(locks, known ? windowLock(ids.org, ids.user) : '', 'shared', wait, async () => {
        // In doubt with the window free: left by a tab that went away (one still running holds the window), waited out below.
        if (known && switchInDoubt(storage, ids.org, ids.user, now())) return void (again = true);
        const m = known ? switchMarker(storage, ids.org, ids.user) : null;
        if (m) {
          note.set?.('Checking your Dynamics language…');
          let lang = 0;
          try {
            lang = await readUiLanguage(o.api ?? fetchApi(clientUrl()), ids.user);
          } catch (e) {
            why = `Dynamics was not refreshed: a language switch of the translator did not finish, and your Dynamics language could not be read to check it (${errText(e).replace(/[.!?]+$/, '')}). Click Dynamics refresh again in a moment.`;
            return;
          }
          if (leftSwitched(m, lang)) {
            why = `Dynamics was not refreshed: a language switch of the translator did not finish, and your Dynamics is still in ${lcidName(lang)}, the language it switched to for a moment. Open the translator (it puts ${lcidName(m.lcid)} back when it starts), or choose your language with Dynamics language, then refresh.`;
            return;
          }
        }
        // refreshNow reloads whatever the purge did; should anything else go wrong, a plain reload.
        await (o.refresh ?? refreshNow)().catch(() => location.reload());
        await new Promise((r) => setTimeout(r, o.stayed ?? STAYED));
      });
    } catch (e) {
      // Reloading now would boot the page (and cache its labels) in the language switched to for a moment.
      busy = e instanceof LockBusy;
    }
    // Outside the window, so a translator started meanwhile can take it to wait it out too.
    while (again && switchInDoubt(storage, ids.org, ids.user, now())) {
      const until = switchMarker(storage, ids.org, ids.user)?.until ?? Infinity;
      if (until > stop) {
        why = "Dynamics was not refreshed: a language switch of the translator that didn't answer may still run on the server for a few minutes, and a refresh now could show Dynamics in the wrong language. Click Dynamics refresh again in a few minutes.";
        again = false;
        break;
      }
      note.set?.(`Waiting to be sure an earlier language switch of the translator has finished (at most ${Math.ceil((until - now()) / 1000)} s)…`);
      stillRunning();
      await (o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms))))(1000);
    }
  }
  note.remove();
  if (busy) alert(o.busy ?? 'Dynamics was not refreshed: the translator has your language switched for a moment in this or another tab. Click Dynamics refresh again once it has finished.');
  else if (why) alert(why);
  end();
}

/** This page's Dataverse (the classic web client's frame included). */
function clientUrl(): string {
  try {
    return String(xrmOf()?.Utility?.getGlobalContext?.()?.getClientUrl?.() || location.origin);
  } catch {
    return location.origin;
  }
}

/** A run waiting for minutes is no stuck one: a second click still says "Already running". */
function stillRunning(): void {
  const w = window as unknown as { __dxtTool?: number };
  if (w.__dxtTool) w.__dxtTool = Date.now();
}
