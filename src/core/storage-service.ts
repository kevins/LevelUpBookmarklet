import { STORAGE_VERSION } from '../version';
import { canonicalId, decodeIds, encodeIds, hasUnknownCodes, mergeOrder } from './action-codes';
import type { RecentAction, StoredProfileV1, ThemeMode } from './types';

// Settings follow you to every Dynamics environment in this browser profile.
// localStorage belongs to one origin (org1.crm.dynamics.com never sees org2.crm4.dynamics.com's), so the
// whole profile is also kept in one small cookie on the parent domain (dynamics.com, microsoftdynamics.us,
// appsplatform.us, ...) that every environment there reads. Each copy carries the time it was changed and the
// newest one wins. Every change first picks up a newer shared copy, so a tab left open on another environment
// can't write its stale button order back over yours, and open panels pick up changes when their tab is shown.

export const PROFILE_KEY = 'd365-levelup-bookmarklet:profile:v1';
export const SHARED_COOKIE = 'lu_settings';
const LEGACY_FAVORITES = 'd365_levelup_favorites_v1';
const LEGACY_ORDER = 'd365_levelup_action_order_v1';
const EXPORT_PREFIX = 'LevelUp:';
const MAX_RECENT = 5;
/** A copy stamped further ahead than this is not trusted (another site under the domain can write the cookie). */
const MAX_AHEAD = 86_400_000;
/** Hosts of Dynamics 365 / Power Apps: only there is the shared cookie set on the parent domain. */
const DYNAMICS_HOST = /\.(dynamics\.com|dynamics\.us|microsoftdynamics\.us|dynamics\.cn|appsplatform\.us)$/i;
const COOKIE_AGE = 34_560_000; // 400 days, the longest Chromium keeps a cookie; every change renews it.
const SECTION_KEYS = ['recent', 'favorites', 'section-form', 'section-navigation', 'section-debugging', 'section-tools'];
const ORDER_KEYS = ['form', 'navigation', 'debugging', 'tools'];
const FLAG_COUNT = 5; // sidebar theme, layout, Recently Used, logging, popup theme

const defaults = (): StoredProfileV1 => ({
  version: STORAGE_VERSION,
  updatedAt: 0,
  settings: { theme: 'dark', popupTheme: 'light', sections: {}, actionOrder: {}, layout: 'grid', developerLogging: false, showRecentlyUsed: true },
  favorites: [],
  recentActions: []
});

function validActionOrder(value: unknown): Record<string, string[]> {
  const order: Record<string, string[]> = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) Object.entries(value as Record<string, unknown>).forEach(([key, ids]) => { if (Array.isArray(ids)) order[key] = unique(ids.filter((id): id is string => typeof id === 'string').map(canonicalId)); });
  return order;
}

const unique = (ids: string[]) => ids.filter((id, index) => ids.indexOf(id) === index);

function validSections(value: unknown): Record<string, boolean> {
  const sections: Record<string, boolean> = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) Object.entries(value as Record<string, unknown>).forEach(([key, open]) => { if (typeof open === 'boolean') sections[key] = open; });
  return sections;
}

export function validateProfile(value: unknown): StoredProfileV1 {
  if (!value || typeof value !== 'object') throw new Error('Profile must be a JSON object.');
  const raw = value as Record<string, unknown>;
  if (raw.version === 0) {
    const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings as Record<string, unknown> : raw;
    value = {
      version: 1,
      settings: {
        theme: settings.theme === 'light' ? 'light' : 'dark',
        popupTheme: settings.popupTheme === 'dark' ? 'dark' : 'light',
        layout: settings.layout === 'list' ? 'list' : 'grid',
        developerLogging: Boolean(settings.developerLogging),
        showRecentlyUsed: settings.showRecentlyUsed !== false,
        sections: settings.sections,
        actionOrder: settings.actionOrder
      },
      favorites: Array.isArray(raw.favorites) ? raw.favorites : [],
      recentActions: Array.isArray(raw.recentActions) ? raw.recentActions : []
    };
  }
  const migrated = value as Record<string, unknown>;
  if (migrated.version !== 1) throw new Error('Unsupported profile version.');
  const settings = migrated.settings as Record<string, unknown> | undefined;
  if (!settings) throw new Error('Profile structure is invalid.');
  const theme = settings.theme;
  const layout = settings.layout;
  if (theme !== 'light' && theme !== 'dark') throw new Error('Theme is invalid.');
  if (layout !== 'grid' && layout !== 'list') throw new Error('Layout is invalid.');
  const favorites = Array.isArray(migrated.favorites) ? unique(migrated.favorites.filter((id): id is string => typeof id === 'string').map(canonicalId)) : [];
  return {
    version: 1,
    updatedAt: typeof migrated.updatedAt === 'number' && Number.isFinite(migrated.updatedAt) && migrated.updatedAt <= Date.now() + MAX_AHEAD ? migrated.updatedAt : 0,
    settings: {
      theme: theme as ThemeMode,
      // Profiles saved before popups had their own theme get light popups.
      popupTheme: settings.popupTheme === 'dark' ? 'dark' : 'light',
      layout,
      developerLogging: Boolean(settings.developerLogging),
      showRecentlyUsed: settings.showRecentlyUsed !== false,
      sections: validSections(settings.sections),
      actionOrder: validActionOrder(settings.actionOrder)
    },
    favorites,
    recentActions: Array.isArray(migrated.recentActions) ? (migrated.recentActions.filter(item => {
      const recent = item as Record<string, unknown>;
      return typeof recent?.id === 'string' && typeof recent.timestamp === 'number' && typeof recent.count === 'number';
    }) as RecentAction[]).map(item => ({ ...item, id: canonicalId(item.id) })).filter((item, index, all) => all.findIndex(other => other.id === item.id) === index).slice(0, MAX_RECENT) : []
  };
}

/**
 * The shared copy, in a cookie-safe text form that needs no escaping:
 * `1.<changed>.<flags>.<sections>.<form order>.<navigation order>.<debugging order>.<tools order>.<favorites>.<recent>`
 * Flags: sidebar theme (d/l), layout (g/l), Recently Used (1/0), logging (1/0), popup theme (l/d; missing = light).
 * Actions are two-character codes (action-codes.ts); an empty order means the default order.
 */
export function encodeShared(profile: StoredProfileV1, withRecent = true): string {
  const settings = profile.settings;
  const flags = `${settings.theme === 'light' ? 'l' : 'd'}${settings.layout === 'list' ? 'l' : 'g'}${settings.showRecentlyUsed ? 1 : 0}${settings.developerLogging ? 1 : 0}${settings.popupTheme === 'dark' ? 'd' : 'l'}`;
  const sections = SECTION_KEYS.map(key => settings.sections[key] === undefined ? '-' : settings.sections[key] ? '1' : '0').join('');
  const recent = withRecent ? profile.recentActions.flatMap(item => { const code = encodeIds([item.id]); return code ? [`${code}${Math.max(1, Math.floor(item.count)).toString(36)}:${Math.max(0, Math.floor(item.timestamp / 1000)).toString(36)}`] : []; }).join('*') : '';
  return ['1', Math.max(0, Math.floor(profile.updatedAt)).toString(36), flags, sections, ...ORDER_KEYS.map(key => encodeIds(settings.actionOrder[key] ?? [])), encodeIds(profile.favorites), recent].join('.');
}

export function decodeShared(value: string): StoredProfileV1 | undefined {
  const parts = value.trim().split('.');
  if (parts[0] !== '1' || parts.length !== 10) return undefined;
  const [, changed = '', flags = '', sections = '', form = '', navigation = '', debugging = '', tools = '', favorites = '', recent = ''] = parts;
  const updatedAt = parseInt(changed, 36);
  if (!/^[0-9a-z]+$/.test(changed) || !Number.isSafeInteger(updatedAt) || !/^[dl][gl][01][01](?:[dl][0-9a-z]*)?$/.test(flags)) return undefined; // later builds may add flags
  if (updatedAt > Date.now() + MAX_AHEAD) return undefined; // stamped in the future: planted to win every comparison
  const profile = defaults();
  profile.updatedAt = updatedAt;
  profile.settings.theme = flags[0] === 'l' ? 'light' : 'dark';
  profile.settings.layout = flags[1] === 'l' ? 'list' : 'grid';
  profile.settings.showRecentlyUsed = flags[2] === '1';
  profile.settings.developerLogging = flags[3] === '1';
  profile.settings.popupTheme = flags[4] === 'd' ? 'dark' : 'light';
  SECTION_KEYS.forEach((key, index) => { const state = sections[index]; if (state === '1' || state === '0') profile.settings.sections[key] = state === '1'; });
  [form, navigation, debugging, tools].forEach((codes, index) => { const ids = decodeIds(codes); if (ids.length) profile.settings.actionOrder[ORDER_KEYS[index]!] = ids; });
  profile.favorites = decodeIds(favorites);
  profile.recentActions = recent ? recent.split('*').flatMap(entry => {
    const [id] = decodeIds(entry.slice(0, 2)); const [count = '', seconds = ''] = entry.slice(2).split(':');
    const timestamp = parseInt(seconds, 36) * 1000; const uses = parseInt(count, 36);
    return id && Number.isSafeInteger(timestamp) && Number.isSafeInteger(uses) && uses > 0 ? [{ id, timestamp, count: uses }] : [];
  }).slice(0, MAX_RECENT) : [];
  return profile;
}

function cookieValues(name: string): string[] {
  try {
    const prefix = `${name}=`;
    return document.cookie.split(';').map(part => part.trim()).filter(part => part.startsWith(prefix)).map(part => part.slice(prefix.length));
  } catch { return []; }
}

let probed: { host: string; domain: string } | undefined;

/**
 * The broadest parent domain this page may set cookies on: dynamics.com for org.crm.dynamics.com,
 * microsoftdynamics.us for org.crm.microsoftdynamics.us. Browsers refuse public suffixes, so the first
 * candidate that sticks is the registrable domain. Empty (a host-only cookie) for any site that is not a Dynamics
 * 365 / Power Apps host, and for localhost and IP addresses.
 */
export function sharedDomain(): string {
  const host = location.hostname;
  if (probed?.host === host) return probed.domain;
  let domain = '';
  const labels = host.split('.');
  if (DYNAMICS_HOST.test(host) && labels.length > 2 && !/^[\d.]+$/.test(host) && !host.includes(':')) {
    for (let index = labels.length - 2; index > 0 && !domain; index--) {
      const candidate = labels.slice(index).join('.'); const name = `lu_probe_${index}`;
      try {
        document.cookie = `${name}=1; Domain=${candidate}; Path=/; Max-Age=30; SameSite=Lax${secure()}`;
        if (cookieValues(name).includes('1')) domain = candidate;
        document.cookie = `${name}=; Domain=${candidate}; Path=/; Max-Age=0; SameSite=Lax${secure()}`;
      } catch { /* try a narrower domain */ }
    }
  }
  probed = { host, domain };
  return domain;
}

const secure = () => location.protocol === 'https:' ? '; Secure' : '';

function writeCookie(name: string, value: string, maxAge = COOKIE_AGE, domain = sharedDomain()): void {
  try { document.cookie = `${name}=${value}; ${domain ? `Domain=${domain}; ` : ''}Path=/; Max-Age=${maxAge}; SameSite=Lax${secure()}`; } catch { /* local copy remains */ }
}

/** The newest readable shared copy (a host-only and a domain cookie of the same name can both be visible). */
function readShared(): StoredProfileV1 | undefined {
  return cookieValues(SHARED_COOKIE).map(decodeShared).filter((profile): profile is StoredProfileV1 => Boolean(profile)).sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

function readLocal(): StoredProfileV1 | undefined {
  try { const raw = localStorage.getItem(PROFILE_KEY); return raw ? validateProfile(JSON.parse(raw)) : undefined; } catch { return undefined; }
}

/** Favorites and order from the cookies of older builds of this bookmarklet (JSON in two cookies on dynamics.com). */
function readLegacy(profile: StoredProfileV1): boolean {
  const parse = (name: string): unknown => { const [value] = cookieValues(name); if (value === undefined) return undefined; try { return JSON.parse(decodeURIComponent(value)); } catch { return undefined; } };
  const favorites = parse(LEGACY_FAVORITES); const order = parse(LEGACY_ORDER); let found = false;
  if (Array.isArray(favorites)) { profile.favorites = unique(favorites.filter((id): id is string => typeof id === 'string').map(canonicalId)); found = true; }
  if (order && typeof order === 'object' && !Array.isArray(order)) { profile.settings.actionOrder = validActionOrder(order); found = true; }
  return found;
}

/**
 * A cookie written by a newer build is left alone (format version above 1, or actions this build doesn't know):
 * rewriting it would drop that build's newer buttons from favorites and order. This build keeps its changes locally.
 * A copy stamped in the future is not a newer build's: it is overwritten.
 */
function newerShared(): boolean {
  return cookieValues(SHARED_COOKIE).some(value => {
    const parts = value.split('.'); const version = Number(parts[0]); const changed = parseInt(parts[1] ?? '', 36);
    if (!Number.isSafeInteger(changed) || changed > Date.now() + MAX_AHEAD) return false;
    if (Number.isInteger(version) && version > 1) return true;
    if (version === 1 && (parts[2] ?? '').length > FLAG_COUNT) return true; // settings this build doesn't know
    const recent = (parts[9] ?? '').split('*').map(entry => entry.slice(0, 2)).join('');
    return version === 1 && [...parts.slice(4, 9), recent].some(hasUnknownCodes);
  });
}

/** Settings never changed: an old profile like this must not become the shared copy for every environment. */
function untouched(profile: StoredProfileV1): boolean {
  const settings = profile.settings, fresh = defaults().settings;
  return settings.theme === fresh.theme && settings.popupTheme === fresh.popupTheme && settings.layout === fresh.layout && settings.developerLogging === fresh.developerLogging && settings.showRecentlyUsed === fresh.showRecentlyUsed
    && !Object.keys(settings.sections).length && !Object.keys(settings.actionOrder).length && !profile.favorites.length;
}

/** A shared copy with this environment's own Recently Used (the cookie doesn't carry it). */
function withRecent(shared: StoredProfileV1, local: StoredProfileV1 | undefined): StoredProfileV1 {
  return { ...shared, recentActions: local?.recentActions ?? [] };
}

function canWriteLocal(): boolean {
  try { const key = `${PROFILE_KEY}:probe`; localStorage.setItem(key, '1'); localStorage.removeItem(key); return true; } catch { return false; }
}

function removeLegacy(): void {
  for (const name of [LEGACY_FAVORITES, LEGACY_ORDER]) if (cookieValues(name).length) { writeCookie(name, '', 0, 'dynamics.com'); writeCookie(name, '', 0, ''); }
}

export class StorageService {
  private profile = defaults();
  private memoryOnly = false;
  private sharedFailed = false;
  private listeners = new Set<(profile: StoredProfileV1) => void>();

  load(): StoredProfileV1 {
    this.memoryOnly = !canWriteLocal();
    const local = readLocal(); const shared = readShared();
    if (shared && shared.updatedAt >= (local?.updatedAt ?? 0)) {
      this.profile = withRecent(shared, local); this.persistLocal();
    } else {
      this.profile = local ?? defaults();
      const legacy = !shared && readLegacy(this.profile);
      // A profile saved by an older build has no change time: stamp it so it becomes the shared copy. Untouched
      // defaults are not shared, so opening a new environment first can't replace settings made elsewhere.
      if (legacy || (local && (this.profile.updatedAt || !untouched(this.profile)))) {
        if (legacy || !this.profile.updatedAt) this.profile.updatedAt = Date.now();
        this.persist();
      }
    }
    if (!this.sharedFailed) removeLegacy();
    return this.get();
  }

  get(): StoredProfileV1 { return structuredClone(this.profile); }

  /** Picks up a newer copy saved in another environment or tab. Returns true when the profile changed. */
  sync(): boolean {
    if (!this.adoptNewer()) return false;
    this.notify();
    return true;
  }

  /** Keeps this panel current while it is open: tab shown or focused, other tabs of this origin, cookie changes. */
  watch(): () => void {
    const check = () => { this.sync(); };
    const visible = () => { if (document.visibilityState === 'visible') check(); };
    const storage = (event: StorageEvent) => { if (event.key === PROFILE_KEY || event.key === null) check(); };
    const cookies = (globalThis as { cookieStore?: EventTarget }).cookieStore;
    document.addEventListener('visibilitychange', visible); window.addEventListener('focus', check); window.addEventListener('storage', storage);
    try { cookies?.addEventListener('change', check); } catch { /* polling on focus still applies */ }
    return () => { document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', check); window.removeEventListener('storage', storage); try { cookies?.removeEventListener('change', check); } catch { /* ignore */ } };
  }

  isMemoryOnly(): boolean { return this.memoryOnly; }
  /** True when the shared cookie could not be written, so other environments won't see changes made here. */
  isLocalOnly(): boolean { return this.sharedFailed; }
  subscribe(listener: (profile: StoredProfileV1) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  setTheme(theme: ThemeMode): void { this.change(profile => { profile.settings.theme = theme; }); }
  setPopupTheme(theme: ThemeMode): void { this.change(profile => { profile.settings.popupTheme = theme; }); }
  setLayout(layout: 'grid' | 'list'): void { this.change(profile => { profile.settings.layout = layout; }); }
  setLogging(enabled: boolean): void { this.change(profile => { profile.settings.developerLogging = enabled; }); }
  setRecentEnabled(enabled: boolean): void { this.change(profile => { profile.settings.showRecentlyUsed = enabled; if (!enabled) profile.recentActions = []; }); }
  setSection(id: string, expanded: boolean): void { this.change(profile => { profile.settings.sections[id] = expanded; }); }

  toggleFavorite(id: string): void {
    this.change(profile => { const index = profile.favorites.indexOf(id); if (index >= 0) profile.favorites.splice(index, 1); else profile.favorites.push(id); });
  }

  moveFavorite(id: string, targetId: string, after: boolean): void {
    this.change(profile => {
      const favorites = profile.favorites.filter(item => item !== id);
      const target = favorites.indexOf(targetId);
      if (id === targetId || target < 0 || !profile.favorites.includes(id)) return;
      favorites.splice(target + (after ? 1 : 0), 0, id);
      profile.favorites = favorites;
    });
  }

  /** `registered` is the section's actions in registry order; the saved order is merged in (mergeOrder). */
  moveAction(section: string, registered: string[], id: string, targetId: string, after: boolean): void {
    this.change(profile => {
      const ids = mergeOrder(registered, profile.settings.actionOrder[section]);
      if (id === targetId || !ids.includes(id) || !ids.includes(targetId)) return;
      const order = ids.filter(item => item !== id);
      order.splice(order.indexOf(targetId) + (after ? 1 : 0), 0, id);
      profile.settings.actionOrder[section] = order;
    });
  }

  /**
   * The tiles of a section as they now stand on screen (`shown`): their slots in the full saved order are refilled in
   * the new sequence, so actions not drawn there (favorites, hidden by a search) keep their places.
   */
  setActionOrder(section: string, registered: string[], shown: string[]): void {
    this.change(profile => {
      const full = mergeOrder(registered, profile.settings.actionOrder[section]); const moved = shown.filter(id => full.includes(id)); const set = new Set(moved); let next = 0;
      profile.settings.actionOrder[section] = full.map(id => set.has(id) ? moved[next++]! : id);
    });
  }

  setFavoriteOrder(ids: string[]): void {
    this.change(profile => { const kept = ids.filter(id => profile.favorites.includes(id)); profile.favorites = [...kept, ...profile.favorites.filter(id => !kept.includes(id))]; });
  }

  addRecent(id: string): void {
    this.change(profile => {
      if (!profile.settings.showRecentlyUsed) return;
      const old = profile.recentActions.find(item => item.id === id);
      profile.recentActions = [{ id, timestamp: Date.now(), count: (old?.count ?? 0) + 1 }, ...profile.recentActions.filter(item => item.id !== id)].slice(0, MAX_RECENT);
    });
  }

  resetRecent(): void { this.change(profile => { profile.recentActions = []; }); }
  resetSettings(): void { this.change(profile => { profile.settings = defaults().settings; profile.favorites = []; }); }
  resetAll(): void { this.change(profile => { const fresh = defaults(); profile.settings = fresh.settings; profile.favorites = fresh.favorites; profile.recentActions = fresh.recentActions; }); }

  /** A text copy of the settings for another browser, or a cloud whose environments can't share a cookie. */
  exportCode(): string { return `${EXPORT_PREFIX}${encodeShared(this.profile, false)}`; }

  importCode(code: string): boolean {
    const imported = decodeShared(code.trim().replace(/^LevelUp:/i, ''));
    if (!imported) return false;
    this.change(profile => { profile.settings = imported.settings; profile.favorites = imported.favorites; if (!imported.settings.showRecentlyUsed) profile.recentActions = []; });
    return true;
  }

  private change(mutate: (profile: StoredProfileV1) => void): void {
    // A newer copy adopted here is shown even when this change then turns out to change nothing.
    const adopted = this.adoptNewer();
    const before = JSON.stringify(this.profile);
    mutate(this.profile);
    if (JSON.stringify(this.profile) === before) { if (adopted) this.notify(); return; }
    this.profile.updatedAt = Math.max(Date.now(), Math.min(this.profile.updatedAt, Date.now()) + 1);
    this.persist();
    this.notify();
  }

  private adoptNewer(): boolean {
    const shared = readShared(), local = readLocal();
    const newest = [shared, local].filter((profile): profile is StoredProfileV1 => Boolean(profile)).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!newest || newest.updatedAt <= this.profile.updatedAt) return false;
    this.profile = newest === shared ? withRecent(newest, local && local.updatedAt >= this.profile.updatedAt ? local : this.profile) : newest; this.persistLocal();
    return true;
  }

  private persist(): void {
    if (newerShared()) { this.sharedFailed = true; this.persistLocal(); return; }
    // Recently Used stays in this environment: every site under the domain can read the cookie.
    writeCookie(SHARED_COOKIE, encodeShared(this.profile, false));
    this.sharedFailed = readShared()?.updatedAt !== this.profile.updatedAt;
    this.persistLocal();
  }

  private persistLocal(): void {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(this.profile)); this.memoryOnly = false; }
    catch { this.memoryOnly = true; }
  }

  private notify(): void { const snapshot = this.get(); this.listeners.forEach(listener => listener(snapshot)); }
}
