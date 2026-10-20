// Changes the signed-in user's Dynamics UI language for good: "Show Dynamics in <language>" in the translator's menus
// and the standalone "Dynamics language" bookmarklet. Unlike LangSession's switches, nothing switches it back.
// Like Personal options it sets the UI and the help language (usersettings uilanguageid and helplanguageid) and
// leaves the locale (dates and numbers) alone; then it reads the language back from the database (Consistency:
// Strong, past every cache) until it says so. Showing it is the refresh's job (ui/refresh.ts): UCI keeps the old
// language's labels for minutes otherwise.
// The bookmarklet runs beside the translator, so it keeps to the translator's rules (the Translator's language session): its change
// goes under the translator's language lock and switch window and drops its repair marker (adoptUiLanguage), as the
// translator's own menu does through LangSession.adoptLanguage; otherwise a translator in this or another tab puts
// the old one back. A lock still held after the wait means "busy, try again", never "go ahead without it".
// Shared with the standalone bookmarklets: no import beyond lcid.ts, and fetchApi is their whole Web API client.

import { lcidName, tagLcid } from './lcid';
import type { Lcid } from './model';

/** The two calls this needs; the translator passes its Http, the bookmarklets fetchApi. */
export interface UiApi {
  get(path: string, headers: Record<string, string>): Promise<any>;
  patch(path: string, body: unknown): Promise<unknown>;
}

/** The Dataverse answer was not 2xx; `status` 0 when it never came. */
export interface ApiError extends Error {
  status: number;
}

/** The switch was sent, but the read-backs never showed it (the page is refreshed anyway: it shows what the server has). */
export class NotConfirmed extends Error {}

/** Every read goes past the browser's cache, UCI's service worker and the replicas (core/http, langsession readUi). */
const FRESH = { Consistency: 'Strong', 'If-None-Match': 'null', 'x-ms-sw-skipcache': '1' };
const us = (userId: string) => `usersettingscollection(${userId.replace(/[{}]/g, '').toLowerCase()})`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The user's UI language as the database has it now. */
export async function readUiLanguage(api: UiApi, userId: string): Promise<Lcid> {
  const r = await api.get(`${us(userId)}?$select=uilanguageid`, FRESH);
  const lcid = Number(r?.uilanguageid);
  if (!(lcid > 0)) throw new Error('Dataverse did not say which language your Dynamics is in.');
  return lcid;
}

/**
 * Sets the user's UI and help language to `lcid`, then reads it back until the database says so (up to `tries` reads,
 * a little longer apart each time). Throws the PATCH's error when it failed (nothing changed), NotConfirmed when the
 * reads never showed it.
 */
export async function setUiLanguage(api: UiApi, userId: string, lcid: Lcid, o: { tries?: number; sleep?: (ms: number) => Promise<unknown> } = {}): Promise<void> {
  try {
    await api.patch(us(userId), { uilanguageid: lcid, helplanguageid: lcid });
  } catch (e) {
    // Refused (400): a help language that can't be chosen. The UI language alone, as before the help language existed.
    if ((e as ApiError)?.status !== 400) throw e;
    await api.patch(us(userId), { uilanguageid: lcid });
  }
  const n = o.tries ?? 5;
  for (let i = 0; i < n; i++) {
    if ((await readUiLanguage(api, userId).catch(() => 0)) === lcid) return;
    if (i < n - 1) await (o.sleep ?? sleep)(250 * (i + 1));
  }
  throw new NotConfirmed(`Dataverse did not confirm the switch to ${lcidName(lcid)}.`);
}

/**
 * The language the page shows: the one `<html lang>` names when it is one of `langs`, else `fallback` (the page
 * context's). After a change made elsewhere the server and the page context already say the new language while UCI
 * still renders the old one for minutes: "the other language" is the one not on screen.
 */
export function shownLanguage(langs: readonly Lcid[], fallback: Lcid, tag = typeof document === 'undefined' ? '' : document.documentElement?.lang || ''): Lcid {
  const dom = tagLcid(tag);
  return dom && langs.includes(dom) ? dom : fallback;
}

/** The translator's repair marker of a temporary switch (the Translator's language session); org and user ids lower case, no braces. */
export const markerKey = (org: string, user: string): string => `dxt:langrestore:${org}:${user}`;
/**
 * The Web Lock a translator holds for every operation that depends on the UI language, its switches and the
 * check after them included (the Translator's language session `hold`).
 */
export const langLock = (org: string, user: string): string => `dxt:lang:${org}:${user}`;
/** The Web Lock a translator holds exclusively while it has the user switched for a moment (the Translator's language session). */
export const windowLock = (org: string, user: string): string => `dxt:langwin:${org}:${user}`;

/** Web Locks (navigator.locks), as far as these need them. */
export interface Locks {
  request(name: string, options: { mode?: 'exclusive' | 'shared'; signal?: AbortSignal }, fn: () => Promise<unknown>): Promise<unknown>;
}

/** Where adoptUiLanguage and the bookmarklets' refresh find the locks and the marker (tests pass their own). */
export interface LockEnv {
  locks: Locks | null;
  storage: (Pick<Storage, 'removeItem'> & Partial<Pick<Storage, 'getItem'>>) | null;
}

/**
 * The translator's marker says one of its language switches was sent, never answered, and may still run on the
 * server (the Translator's language session `until`): it would switch the language and back afterwards.
 */
export function switchInDoubt(storage: LockEnv['storage'], org: string, user: string, now = Date.now()): boolean {
  try {
    return Number(JSON.parse(storage?.getItem?.(markerKey(org, user)) || 'null')?.until) > now;
  } catch {
    return false;
  }
}

/**
 * The translator's repair marker (the Translator's language session Marker): the user's own language, the one a switch went to (absent
 * in markers of older versions) and until when it may still run. Null without one.
 */
export function switchMarker(storage: LockEnv['storage'], org: string, user: string): { lcid: Lcid; to?: Lcid; until?: number } | null {
  try {
    const v = JSON.parse(storage?.getItem?.(markerKey(org, user)) || 'null');
    if (!(v && Number(v.lcid) > 0)) return null;
    return { lcid: Number(v.lcid), to: Number(v.to) > 0 ? Number(v.to) : undefined, until: Number(v.until) > 0 ? Number(v.until) : undefined };
  } catch {
    return null;
  }
}

/**
 * The user is still in the language a marker's switch went to, so its switch back never ran (the Translator's language session
 * markerSays: 'repair' or 'ask'): the language Dataverse has now is the translator's for a moment, not the user's.
 */
export const leftSwitched = (m: { lcid: Lcid; to?: Lcid }, now: Lcid): boolean => now !== m.lcid && (m.to === undefined || now === m.to);

/** The browser's Web Locks and localStorage; null where missing or blocked. */
export function browserEnv(): LockEnv {
  let storage: LockEnv['storage'] = null;
  try {
    storage = localStorage;
  } catch {
    storage = null;
  }
  const locks = typeof navigator === 'undefined' ? null : (navigator as Navigator & { locks?: Locks }).locks;
  return { locks: locks && typeof locks.request === 'function' ? locks : null, storage };
}

/** A translator still held its lock after the wait (withLock): nothing was done. */
export class LockBusy extends Error {
  constructor() {
    super('The translator is switching your Dynamics language for a moment, or reading or saving labels in it, in this or another tab. Nothing was changed: try again once it has finished.');
  }
}

/**
 * Runs `fn` holding the translator's Web Lock `name` (langLock, windowLock: never in the middle of a translator's
 * temporary switch, in this or another tab), waiting at most `ms` for it. Still held after that: LockBusy, and `fn`
 * never runs (a slow save or page load is no reason to change the language under it). Without Web Locks or a name,
 * or when the browser refuses the lock itself, there is no lock to keep to (the translator has its in-tab locks only
 * then) and `fn` runs.
 */
export async function withLock<T>(locks: Locks | null | undefined, name: string, mode: 'exclusive' | 'shared', ms: number, fn: () => Promise<T>): Promise<T> {
  if (!locks || !name) return fn();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  let ran = false;
  try {
    return (await locks.request(name, { mode, signal: ac.signal }, () => {
      clearTimeout(t);
      ran = true;
      return fn();
    })) as T;
  } catch (e) {
    if (ran) throw e;
    if (ac.signal.aborted) throw new LockBusy();
    return fn(); // refused
  } finally {
    clearTimeout(t);
  }
}

/**
 * setUiLanguage for a tool beside the translator (the "Dynamics language" bookmarklet), as LangSession.adoptLanguage
 * does it: under the translator's language lock and switch window (exclusive, in that order, waiting at most `wait`
 * ms for each), so it never lands between a translator batch's switch and its switch back, or before the check after
 * it (which would set the old language again), and with the translator's repair marker removed once the change was
 * sent (read back or not), so no translator puts the old language back, now or at its next start. Without `org` it
 * is setUiLanguage alone. Throws as setUiLanguage does, and LockBusy (nothing sent) when a lock is still held or a
 * switch of the translator's may still run (switchInDoubt: its switch back would undo this one).
 */
export async function adoptUiLanguage(
  api: UiApi,
  org: string,
  user: string,
  lcid: Lcid,
  o: { env?: LockEnv; wait?: number; tries?: number; sleep?: (ms: number) => Promise<unknown> } = {},
): Promise<void> {
  const { locks, storage } = o.env ?? browserEnv();
  const ids = !!org && !!user;
  const wait = o.wait ?? 15_000;
  const set = async () => {
    if (ids && switchInDoubt(storage, org, user)) throw new LockBusy();
    let sent = false;
    try {
      await setUiLanguage(api, user, lcid, o);
      sent = true;
    } catch (e) {
      sent = e instanceof NotConfirmed;
      throw e;
    } finally {
      if (sent && ids)
        try {
          storage?.removeItem(markerKey(org, user));
        } catch {
          /* storage blocked */
        }
    }
  };
  await withLock(locks, ids ? langLock(org, user) : '', 'exclusive', wait, () => withLock(locks, ids ? windowLock(org, user) : '', 'exclusive', wait, set));
}

/** A minimal Web API client for the standalone bookmarklets (same-origin session, no caches). */
export function fetchApi(origin: string, version = '9.2'): UiApi & { send(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<any> } {
  const base = `${origin.replace(/\/+$/, '')}/api/data/v${version}/`;
  const send = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    let r: Response;
    try {
      r = await fetch(base + path, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', 'x-ms-sw-skipcache': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw Object.assign(new Error(`Could not reach Dataverse (${(e as Error)?.message || 'network error'}).`), { status: 0 });
    }
    const text = r.status === 204 ? '' : await r.text().catch(() => '');
    if (!r.ok) {
      let m = '';
      try {
        m = JSON.parse(text)?.error?.message || '';
      } catch {
        m = text.slice(0, 200);
      }
      if (r.status === 401) m = 'Your Dynamics session has expired. Reload the page and sign in again.';
      throw Object.assign(new Error(m || `Dataverse returned HTTP ${r.status}.`), { status: r.status });
    }
    return text ? JSON.parse(text) : {};
  };
  return { send, get: (p, h) => send('GET', p, undefined, h), patch: (p, b) => send('PATCH', p, b) };
}
