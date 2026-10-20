// "Dynamics language" bookmarklet, for use without the translator:
// one click changes the signed-in user's Dynamics language and shows the page in it at once. In an environment with
// two languages it switches to the one the page is not showing; with more, a small chooser lists them. The language
// is set as Personal options sets it (core/uilang.ts), then the page is refreshed like "Dynamics refresh" does
// (ui/refresh.ts): without that, UCI keeps the old language's labels for minutes.
// The page's own language decides "the other one", not the server's: after a switch elsewhere the page still shows
// the old language (`<html lang>`, core/uilang shownLanguage), and the click is meant to leave what is on screen.
// The change keeps to the translator's language lock and switch window and drops its repair marker (core/uilang
// adoptUiLanguage), so a translator in this or another tab never puts the old language back; a lock still held after
// the wait changes nothing and says so (LockBusy).

import { lcidName } from '../core/lcid';
import { adoptUiLanguage, fetchApi, NotConfirmed, readUiLanguage, shownLanguage } from '../core/uilang';
import { shadowBox, showNote } from '../ui/refresh';
import { begin, end, errText, guid, idsOf, mayLeave, reload, xrmOf } from './common';

/** The provisioned languages as buttons, the page's own marked; resolves with the one clicked, null on Cancel or Esc. */
function choose(langs: number[], shown: number): Promise<number | null> {
  return new Promise((resolve) => {
    const { host, root } = shadowBox(
      'dxt-language',
      '.bg{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.2)}' +
        '.card{position:fixed;top:12vh;left:50%;transform:translateX(-50%);z-index:2147483647;width:min(320px,calc(100vw - 32px));max-height:70vh;overflow:auto;box-sizing:border-box;padding:16px;border-radius:8px;' +
        'background:#fff;color:#242424;font:14px/20px "Segoe UI",system-ui,sans-serif;box-shadow:0 16px 32px rgba(0,0,0,.24)}' +
        'h1{font-size:16px;line-height:22px;font-weight:600;margin:0 0 12px}button{all:unset;box-sizing:border-box;display:flex;justify-content:space-between;gap:12px;width:100%;padding:8px 12px;border-radius:4px;cursor:pointer}' +
        'button:hover,button:focus-visible{background:#f0f0f0}button:focus-visible{outline:2px solid #0f6cbd}small{color:#616161}.x{margin-top:8px;justify-content:center;border:1px solid #d1d1d1}' +
        '@media (prefers-color-scheme:dark){.card{background:#292929;color:#fff}button:hover,button:focus-visible{background:#3d3d3d}small{color:#adadad}.x{border-color:#666}}',
    );
    const el = (tag: string, cls = '', text = '') => Object.assign(document.createElement(tag), { className: cls, textContent: text });
    const bg = el('div', 'bg');
    const card = el('div', 'card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', 'Show Dynamics in');
    const list = el('div');
    const cancel = el('button', 'x', 'Cancel');
    card.append(el('h1', '', 'Show Dynamics in'), list, cancel);
    root.append(bg, card);
    const done = (v: number | null) => {
      removeEventListener('keydown', key, true);
      host.remove();
      resolve(v);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      done(null);
    };
    for (const l of [...langs].sort((a, b) => lcidName(a).localeCompare(lcidName(b)))) {
      const b = el('button');
      b.append(lcidName(l));
      // The page's language can be chosen too: the page may show an older language than Dynamics has now, so it is set
      // as the user's language like any other, and the page refreshes in it.
      if (l === shown) b.append(el('small', '', 'shown now'));
      b.onclick = () => done(l);
      list.append(b);
    }
    bg.onclick = cancel.onclick = () => done(null);
    addEventListener('keydown', key, true);
    (list.firstElementChild as HTMLElement | null)?.focus();
  });
}

export const run = async (): Promise<void> => {
  if (!begin('Dynamics language')) return;
  let note = showNote('Reading your languages…');
  let sent = false;
  let ids = { org: '', user: '' };
  let busy = '';
  try {
    const xrm = xrmOf();
    let gc: any = null;
    try {
      gc = xrm?.Utility?.getGlobalContext?.();
    } catch {
      gc = null;
    }
    const api = fetchApi(String(gc?.getClientUrl?.() || location.origin));
    const page = idsOf(xrm);
    // WhoAmI names the org as the translator keys its lock and marker (and the user, when the page context can't).
    const whoP = api.get('WhoAmI()', {});
    const user = page.user || guid((await whoP)?.UserId);
    const [who, prov, saved] = await Promise.all([whoP.catch(() => null), api.get('RetrieveProvisionedLanguages()', {}), readUiLanguage(api, user)]);
    ids = { org: guid(who?.OrganizationId) || page.org, user };
    const langs: number[] = (prov?.RetrieveProvisionedLanguages || []).map(Number).filter((l: number) => l > 0);
    const shown = shownLanguage(langs, Number(gc?.userSettings?.languageId) || saved);
    note.remove();
    if (langs.length < 2) {
      alert(`Only ${lcidName(langs[0] || saved)} is installed in this environment.`);
      return end();
    }
    const to = langs.length === 2 ? (langs.find((l) => l !== shown) ?? langs[0]) : await choose(langs, shown);
    if (!to || !mayLeave(xrm)) return end();
    note = showNote(`Switching Dynamics to ${lcidName(to)}…`);
    busy = `Dynamics is now in ${lcidName(to)}, but the page was not refreshed: the translator has your language switched for a moment in this or another tab. Refresh the page once it has finished (Dynamics refresh, or the translator's Refresh page).`;
    sent = true;
    try {
      await adoptUiLanguage(api, ids.org, user, to);
    } catch (e) {
      // Sent but not read back: the refresh shows whatever language Dataverse has.
      if (!(e instanceof NotConfirmed)) {
        sent = false;
        throw e;
      }
    }
    note.set('Refreshing Dynamics…');
    await reload(ids, note, { busy });
  } catch (e) {
    if (sent) return void reload(ids, note, { busy });
    note.remove();
    alert(`Your Dynamics language could not be changed: ${errText(e)}`);
    end();
  }
};
