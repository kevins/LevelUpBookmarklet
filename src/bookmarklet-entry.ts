import { LevelUpBookmarklet } from './app';
import { BUILD_ID } from './version';

type Running = { buildId?: string; toggle(): void; destroy(): void };
type RuntimeWindow = Window & { __D365_LEVELUP_BOOKMARKLET__?: LevelUpBookmarklet | Running; __LU__?: Running };

/** Older builds of this bookmarklet renamed the global and the host element while minifying (__LU__, #lu-host). */
function removeOldBuild(runtimeWindow: RuntimeWindow): boolean {
  const old = runtimeWindow.__LU__; const host = runtimeWindow.document.getElementById('lu-host');
  if (old) { try { old.destroy(); } catch { /* replaced below */ } delete runtimeWindow.__LU__; }
  host?.remove();
  return Boolean(old || host);
}

export function boot(runtimeWindow = window as RuntimeWindow): LevelUpBookmarklet {
  const replacedOld = removeOldBuild(runtimeWindow);
  // Every click evaluates the bundle again (a new LevelUpBookmarklet class), so a running panel is recognised by its
  // build id: the same build toggles, anything else (an older favorite, a broken panel) is replaced.
  const existing = runtimeWindow.__D365_LEVELUP_BOOKMARKLET__;
  if (existing && existing.buildId === BUILD_ID && typeof existing.toggle === 'function') {
    // An old panel was just taken away: show this one rather than toggling it hidden.
    const current = existing as LevelUpBookmarklet; if (replacedOld) current.show(); else current.toggle(); return current;
  }
  if (existing) { try { existing.destroy(); } catch { /* a broken older panel must not block the new one */ } runtimeWindow.__D365_LEVELUP_BOOKMARKLET__ = undefined; }
  runtimeWindow.document.getElementById('d365-levelup-bookmarklet-host')?.remove();
  const created = new LevelUpBookmarklet();
  runtimeWindow.__D365_LEVELUP_BOOKMARKLET__ = created;
  return created;
}

boot();
