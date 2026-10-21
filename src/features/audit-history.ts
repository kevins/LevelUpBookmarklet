import type { ActionDependencies, ActionResult, ColumnMetadata, DynamicsContext } from '../core/types';
import { localizedLabel } from '../core/metadata-service';
import { formatMoment, formatStoredDate, isDateText } from '../core/dates';
import type { DateColumn } from '../core/dates';
import { recordUrl } from '../core/url-service';

type Data = Record<string, unknown>;
type Summary = Data & { auditid: string };
type Change = { field: string; before: string; after: string };
type Entry = { summary: Summary; detail?: Data; error?: string; changes?: Change[] };
const formatted = '@OData.Community.Display.V1.FormattedValue';
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const data = (value: unknown): Data => value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {};
const text = (value: unknown): string => value === undefined ? 'Not set' : value === null ? 'Empty' : value === '' ? '""' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
const valueText = (row: Data, key: string, dates?: Map<string, DateColumn>): string => {
  const raw = text(row[key]), label = row[`${key}${formatted}`], column = dates?.get(fieldName(key));
  // Date columns: as the user reads them, without the raw UTC time. Before the columns' behaviours load, Dataverse's own
  // text. A text column that only looks like a date (no date metadata, no formatted value) is shown as stored.
  if (isDateText(row[key]) && column) return formatStoredDate(row[key], column) ?? raw;
  if (isDateText(row[key]) && typeof label === 'string' && label) return label;
  return typeof label === 'string' && label !== raw ? `${label} (${raw})` : raw;
};
const fieldName = (key: string): string => /^_(.+)_value$/.exec(key)?.[1] ?? key;
const message = (error: unknown): string => {
  const status = data(error).status;
  if (status === 403) return 'Access denied. Your role needs View Audit Summary and View Audit History privileges.';
  if (status === 401) return 'Your session expired. Sign in again, then reopen Audit History.';
  if (status === 429) return 'Dataverse is busy. Wait a moment, then retry.';
  return error instanceof Error ? error.message : String(error);
};
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, content = '', className = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag); node.textContent = content; node.className = className; return node;
};
const eventName = (summary: Summary): string => String(summary[`action${formatted}`] ?? ({ 1: 'Create', 2: 'Update', 3: 'Delete', 13: 'Assign', 14: 'Share', 33: 'Associate', 34: 'Disassociate', 48: 'Modify share', 49: 'Unshare' } as Record<string, string>)[String(summary.action)] ?? `Event ${summary.action ?? summary.operation ?? 'unknown'}`);
const userName = (summary: Summary, calling = false): string => String(summary[`${calling ? '_callinguserid_value' : '_userid_value'}${formatted}`] ?? summary[calling ? '_callinguserid_value' : '_userid_value'] ?? (calling ? '' : 'Unknown user'));

// The bound detail request is correlated by audit ID. RetrieveRecordChangeHistory
// omits AuditRecord in Web API responses, so it cannot safely provide who/when.
export function auditChanges(detail: Data, dates?: Map<string, DateColumn>): Change[] {
  if (String(detail['@odata.type'] ?? '').endsWith('AttributeAuditDetail') || 'OldValue' in detail || 'NewValue' in detail) {
    const old = data(detail.OldValue), current = data(detail.NewValue);
    const keys = [...new Set([...Object.keys(old), ...Object.keys(current)])].filter(key => !key.includes('@'));
    const rows = keys.map(key => ({ field: fieldName(key), before: valueText(old, key, dates), after: valueText(current, key, dates) }));
    const deleted = data(detail.DeletedAttributes);
    if (Number(deleted.Count) > 0) rows.push({ field: 'Deleted columns', before: text(deleted.Values ?? deleted.Keys), after: 'Column no longer exists' });
    if (Array.isArray(detail.InvalidNewValueAttributes) && detail.InvalidNewValueAttributes.length) rows.push({ field: 'Invalid attempted changes', before: 'Not applied', after: text(detail.InvalidNewValueAttributes) });
    return rows;
  }
  if ('OldPrivileges' in detail || 'NewPrivileges' in detail) return [
    { field: 'Shared access', before: text(detail.OldPrivileges), after: text(detail.NewPrivileges) },
    { field: 'Principal', before: '', after: text(detail.Principal) }
  ];
  if ('OldRolePrivileges' in detail || 'NewRolePrivileges' in detail) return [{ field: 'Role privileges', before: text(detail.OldRolePrivileges), after: text(detail.NewRolePrivileges) }];
  // Other details (for example a user's sign-in, UserAccessAuditDetail.AccessTime): their moments in the user's time zone.
  return Object.entries(detail).filter(([key]) => !key.startsWith('@') && key !== 'AuditRecord').map(([key, value]) => ({ field: key, before: '', after: (typeof value === 'string' && value.includes('T') ? formatStoredDate(value) : undefined) ?? text(value) }));
}

export function auditNextLink(next: unknown, clientUrl: string): string | undefined {
  if (next === undefined || next === null || next === '') return;
  if (typeof next !== 'string') throw new Error('Dataverse returned an invalid audit paging link.');
  const base = `${clientUrl.replace(/\/$/, '')}/api/data/v9.2/`, url = new URL(next, base), expected = new URL(`${base}audits`);
  if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.username || url.password || url.hash) throw new Error('Dataverse returned an unexpected audit paging destination.');
  // Absolute links stay byte-for-byte intact; a relative link needs the API base
  // resolved before DynamicsApi prefixes it. URL preserves its encoded cookie.
  return /^https?:\/\//i.test(next) ? next : url.href;
}

export async function auditHistory(ctx: DynamicsContext, deps: ActionDependencies): Promise<ActionResult | void> {
  const recordId = String(ctx.entityId ?? '').replace(/[{}]/g, ''), entity = String(ctx.entityName ?? '');
  if (!guid.test(recordId) || !/^[a-z_][a-z0-9_]*$/i.test(entity)) throw new Error('Open a saved record before viewing audit history.');
  let name = ''; try { const value: unknown = ctx.form?.data?.entity?.getPrimaryAttributeValue?.(); if (typeof value === 'string') name = value.trim(); } catch { /* the form is closing */ }
  const initial = `audits?$select=auditid,createdon,action,operation,_userid_value,_callinguserid_value,transactionid&$filter=${encodeURIComponent(`_objectid_value eq ${recordId} and objecttypecode eq '${entity}'`)}&$orderby=createdon desc,auditid desc`;
  deps.ui.dialog('Audit History', (body, footer, close) => {
    const progress = element('div', '', 'd365lu-progress'); progress.append(element('i')); progress.hidden = true;
    const controls = element('div', '', 'audit-controls');
    const search = element('input'), user = element('select'), action = element('select'), from = element('input'), to = element('input');
    search.placeholder = 'Field, value, user or event…'; search.maxLength = 500; search.type = 'search'; from.type = to.type = 'date';
    for (const [label, input] of [['Search loaded history', search], ['Changed by', user], ['Event', action], ['From date', from], ['To date', to]] as const) {
      const wrapper = element('label', label); input.className = 'd365lu-input'; input.setAttribute('aria-label', label); wrapper.append(input); controls.append(wrapper);
    }
    const status = element('p', '', 'audit-note'), note = element('p', '', 'audit-note'), error = element('p', '', 'audit-error'), results = element('div', '', 'audit-results'), pager = element('div', '', 'd365lu-inline');
    status.setAttribute('role', 'status'); error.setAttribute('role', 'alert');
    pager.className = 'd365lu-pager';
    const previous = element('button', 'Previous', 'd365lu-btn sm'), nextView = element('button', 'Next', 'd365lu-btn sm'), viewCount = element('span', '', 'audit-note'); previous.type = nextView.type = 'button'; pager.append(viewCount, previous, nextView);
    body.append(progress, controls, status, note, error, results, pager);
    const start = element('div', '', 'd365lu-foot-start'), end = element('div', '', 'd365lu-foot-end'); footer.append(start, end);
    const button = (label: string, click: () => void, where: HTMLElement = end) => { const node = element('button', label, 'd365lu-btn'); node.type = 'button'; node.onclick = click; where.append(node); return node; };
    let entries: Entry[] = [], next: string | undefined = initial, finished = false, closed = false, busy = false, offset = 0, runController: AbortController | undefined, renderTimer: ReturnType<typeof setTimeout> | undefined;
    let dates: Map<string, DateColumn> | undefined;
    let labels = new Map<string, string>(), schemaNames = new Map<string, string>(), notice = '', pageError = '', totalTimer: ReturnType<typeof setTimeout> | undefined, cardsSignature = '';
    const seenIds = new Set<string>(), seenPages = new Set<string>(), expanded = new Set<string>();
    const refresh = button('Refresh', () => { entries = []; next = initial; finished = false; offset = 0; seenIds.clear(); seenPages.clear(); expanded.clear(); void run(false); }, start);
    const stop = button('Stop', () => { notice = 'Stopped. Loaded results are kept; use Retry details or Load all available to continue.'; runController?.abort(); });
    const retry = button('Retry details', () => void run(false, true));
    const more = button('Load next 50', () => void run(false)), all = button('Load all available', () => void run(true));
    all.classList.add('primary');
    button('Close', close);

    // Parsed once per event: the list re-renders while details stream in.
    const changes = (entry: Entry) => entry.detail ? (entry.changes ??= auditChanges(entry.detail, dates)) : [];
    const changeText = (change: Change) => `${labels.get(change.field) ?? ''} ${schemaNames.get(change.field) ?? ''} ${change.field} ${change.before} ${change.after}`.toLocaleLowerCase().replace(/\s+/g, ' ');
    const when = (summary: Summary) => { const date = new Date(String(summary.createdon ?? '')); return Number.isNaN(date.getTime()) ? text(summary.createdon) : formatMoment(date); };
    const headerText = (entry: Entry) => `${when(entry.summary)} ${userName(entry.summary)} ${userName(entry.summary, true)} ${eventName(entry.summary)} ${entry.summary.auditid}`.toLocaleLowerCase().replace(/\s+/g, ' ');
    const options = (select: HTMLSelectElement, choices: [string, string][], empty: string) => {
      // Rebuilt only when the choices change, so an open dropdown isn't replaced under the pointer while loading.
      const signature = JSON.stringify([...new Map(choices)]); if (select.dataset.choices === signature) return; select.dataset.choices = signature;
      const chosen = select.value; select.replaceChildren(new Option(empty, ''));
      for (const [value, label] of [...new Map(choices)].sort((a, b) => a[1].localeCompare(b[1]))) select.append(new Option(label, value));
      select.value = [...select.options].some(option => option.value === chosen) ? chosen : '';
    };
    function render(): void {
      if (closed) return;
      options(user, entries.map(entry => [String(entry.summary._userid_value ?? ''), userName(entry.summary)]), 'All users');
      options(action, entries.map(entry => [String(entry.summary.action ?? ''), eventName(entry.summary)]), 'All events');
      const needle = search.value.trim().toLocaleLowerCase().replace(/\s+/g, ' '), start = from.value ? new Date(`${from.value}T00:00:00`).getTime() : -Infinity, end = to.value ? new Date(`${to.value}T23:59:59.999`).getTime() : Infinity;
      const filtered = entries.filter(entry => {
        const when = new Date(String(entry.summary.createdon ?? '')).getTime();
        return (!user.value || String(entry.summary._userid_value) === user.value) && (!action.value || String(entry.summary.action) === action.value) && (!from.value && !to.value || when >= start && when <= end) && (!needle || headerText(entry).includes(needle) || changes(entry).some(change => changeText(change).includes(needle)));
      });
      if (offset >= filtered.length) offset = Math.max(0, Math.floor((filtered.length - 1) / 20) * 20);
      const missing = entries.filter(entry => !entry.detail).length, failures = entries.filter(entry => entry.error).length;
      status.textContent = `${filtered.length} matching / ${entries.length} loaded events · ${entries.length - missing} details loaded${failures ? ` · ${failures} failed` : ''}${busy ? ' · Loading…' : ''}`;
      note.textContent = notice || (finished && !missing ? 'All available history loaded. Dataverse may truncate long values; unaudited or deleted history cannot be recovered.' : 'Search covers loaded details only. Load all available history to search older changes.');
      error.textContent = pageError;
      more.disabled = all.disabled = busy || !next; retry.disabled = busy || !missing; stop.disabled = !busy; refresh.disabled = busy;
      // A stopped detail page can be resumed even when there are no older pages.
      all.disabled = busy || (!next && !missing);
      more.hidden = !next && finished; all.hidden = finished && !missing;
      stop.hidden = !busy; retry.hidden = !missing;
      controls.hidden = finished && !entries.length;
      note.hidden = finished && !entries.length && !notice;
      pager.hidden = !filtered.length; progress.hidden = !busy;
      previous.disabled = offset === 0; nextView.disabled = offset + 20 >= filtered.length; viewCount.textContent = filtered.length ? `${offset + 1}–${Math.min(offset + 20, filtered.length)} of ${filtered.length} matching events` : '0 events';
      // The cards are rebuilt only when what they show changed (not on every streamed detail elsewhere in the list),
      // so a selection or a scroll position inside a card survives the loading.
      const visible = filtered.slice(offset, offset + 20);
      const signature = JSON.stringify([needle, labels.size, busy && !entries.length, finished, entries.length > 0, visible.map(entry => [entry.summary.auditid, Boolean(entry.detail), entry.error ?? '', expanded.has(entry.summary.auditid)])]);
      if (signature === cardsSignature) return; cardsSignature = signature;
      results.replaceChildren();
      for (const entry of visible) {
        const summary = entry.summary, card = element('section', '', `audit-card tone-${({ 1: 'ok', 2: 'brand', 3: 'bad' } as Record<string, string>)[String(entry.summary.action)] ?? 'other'}`), heading = element('div', '', 'audit-heading'), date = new Date(String(summary.createdon ?? ''));
        const time = element('time', when(summary)); if (!Number.isNaN(date.getTime())) time.dateTime = date.toISOString();
        const who = userName(summary), caller = userName(summary, true);
        const tone = ({ 1: ' ok', 2: ' brand', 3: ' bad' } as Record<string, string>)[String(summary.action)] ?? '';
        // Who made the change opens their user record (a new tab, so this history stays open).
        const person = (name: string, id: unknown): HTMLElement => {
          const userId = String(id ?? '').replace(/[{}]/g, ''); if (!guid.test(userId)) return element('span', name);
          const link = element('a', name, 'audit-user'); link.href = recordUrl(ctx, 'systemuser', userId); link.target = '_blank'; link.rel = 'noopener'; link.title = `Open ${name}'s user record`; return link;
        };
        const by = element('span'); by.append('by ', person(who, summary._userid_value)); if (caller && caller !== who) by.append(' · called by ', person(caller, summary._callinguserid_value));
        heading.append(element('strong', eventName(summary), `d365lu-chip${tone}`), time, by);
        heading.title = `Audit ID: ${summary.auditid}`; card.append(heading);
        const rows = changes(entry).filter(change => !needle || headerText(entry).includes(needle) || changeText(change).includes(needle));
        if (!entry.detail) card.append(element('p', entry.error ?? 'Details not loaded yet.', entry.error ? 'audit-error' : 'audit-note'));
        else if (!rows.length) card.append(element('p', 'No field-level values were returned for this event.', 'audit-note'));
        else {
          const table = element('table', '', 'audit-values'), head = table.createTHead().insertRow(), tbody = table.createTBody();
          for (const name of ['Field', 'Old value', 'New value']) head.append(element('th', name));
          for (const change of expanded.has(summary.auditid) ? rows : rows.slice(0, 20)) {
            const row = tbody.insertRow(), field = row.insertCell(), label = labels.get(change.field);
            field.append(element('strong', label || change.field));
            if (label && label !== change.field) field.append(element('div', change.field, 'audit-note'));
            for (const value of [change.before, change.after]) row.insertCell().append(element('pre', value));
          }
          card.append(table);
          if (rows.length > 20 && !expanded.has(summary.auditid)) { const show = element('button', `Show all ${rows.length} changes`, 'd365lu-btn'); show.type = 'button'; show.onclick = () => { expanded.add(summary.auditid); render(); }; card.append(show); }
        }
        results.append(card);
      }
      if (!filtered.length) results.append(element('p', busy && !entries.length ? 'Loading audit history…' : entries.length ? 'No matches in the loaded history.' : finished ? 'No audit history is available for this record. Auditing may not have been enabled or the history may have expired.' : 'No audit events loaded yet.', 'audit-note'));
    }
    const schedule = () => { if (!closed && !renderTimer) renderTimer = setTimeout(() => { renderTimer = undefined; render(); }, 60); };
    previous.onclick = () => { offset = Math.max(0, offset - 20); render(); }; nextView.onclick = () => { offset += 20; render(); };
    for (const input of [search, user, action, from, to]) input.oninput = () => { offset = 0; render(); };

    // The explicit abort race also releases the UI if a host/fetch shim ignores signal.
    const request = <T,>(path: string, signal: AbortSignal): Promise<T> => new Promise((resolve, reject) => {
      if (signal.aborted) { reject(new Error('Stopped')); return; }
      const abort = () => reject(new Error('Stopped')); signal.addEventListener('abort', abort, { once: true });
      void deps.api.request<T>(path, { signal, cache: 'no-store', headers: { Prefer: 'odata.include-annotations="*",odata.maxpagesize=50', 'If-None-Match': 'null', 'x-ms-sw-skipcache': '1' } }).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
    const details = async (items: Entry[], signal: AbortSignal): Promise<void> => {
      const queue = [...items];
      const lane = async () => {
        while (queue.length && !signal.aborted && !closed) {
          const entry = queue.shift()!; entry.error = undefined;
          try {
            const response = await request<{ AuditDetail?: unknown }>(`audits(${entry.summary.auditid})/Microsoft.Dynamics.CRM.RetrieveAuditDetails`, signal);
            if (signal.aborted || closed) return;
            if (!response.AuditDetail || typeof response.AuditDetail !== 'object' || Array.isArray(response.AuditDetail)) throw new Error('Dataverse returned no audit detail.');
            entry.detail = data(response.AuditDetail);
          } catch (reason) {
            if (signal.aborted || closed) return;
            entry.error = message(reason);
            // These are session/privilege failures, not individual bad events.
            // Stop the queue instead of issuing dozens of identical denied calls.
            if (data(reason).status === 401 || data(reason).status === 403) { pageError = entry.error; runController?.abort(); }
          }
          schedule();
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, queue.length) }, lane));
    };
    async function run(loadAll: boolean, retryOnly = false): Promise<void> {
      if (closed || busy) return;
      busy = true; notice = pageError = ''; runController = new AbortController(); const signal = runController.signal;
      totalTimer = setTimeout(() => { notice = 'Paused after 60 seconds. Loaded results are kept; continue when ready.'; runController?.abort(); }, 60000); render();
      try {
        const missing = entries.filter(entry => !entry.detail);
        if (missing.length && (loadAll || retryOnly)) await details(missing, signal);
        if (!retryOnly) {
          let pages = 0;
          while (next && !signal.aborted && !closed) {
            const path = next, canonical = new URL(path, `${ctx.clientUrl}/api/data/v9.2/`).href;
            if (seenPages.has(canonical)) throw new Error('Dataverse repeated a paging link. Refresh to restart safely.');
            const response = await request<{ value?: Summary[]; '@odata.nextLink'?: unknown }>(path, signal);
            if (signal.aborted || closed) return;
            if (!Array.isArray(response.value)) throw new Error('Dataverse returned an invalid audit page.');
            const following = auditNextLink(response['@odata.nextLink'], ctx.clientUrl), added: Entry[] = [];
            for (const summary of response.value) {
              if (!summary || typeof summary.auditid !== 'string' || !guid.test(summary.auditid)) throw new Error('Dataverse returned an invalid audit ID.');
              const id = summary.auditid.toLowerCase(); if (seenIds.has(id)) continue;
              seenIds.add(id); const entry = { summary }; entries.push(entry); added.push(entry);
            }
            seenPages.add(canonical); next = following; finished = !next; pages++; render();
            await details(added, signal);
            if (!loadAll || signal.aborted) break;
            if (pages >= 20 && next) { notice = 'Paused after 20 pages to keep the browser responsive. Use Load all available to continue.'; break; }
          }
        }
      } catch (reason) { if (!signal.aborted && !closed) pageError = message(reason); }
      finally { if (totalTimer) clearTimeout(totalTimer); totalTimer = undefined; busy = false; runController = undefined; render(); }
    }
    void deps.metadata.getColumns(entity).then((columns: ColumnMetadata[]) => {
      if (closed) return; labels = new Map(columns.map(column => [column.LogicalName, localizedLabel(column.DisplayName)])); schemaNames = new Map(columns.map(column => [column.LogicalName, column.SchemaName])); schedule();
    }).catch(() => { /* Logical names remain usable when metadata access is unavailable. */ });
    // Date columns' behaviours: old and new dates then show as the form shows them (moments in the user's time zone).
    if (typeof deps.metadata.getDateColumns === 'function') void deps.metadata.getDateColumns(entity).then(columns => {
      if (closed) return; dates = columns; entries.forEach(entry => { delete entry.changes; }); cardsSignature = ''; schedule();
    }).catch(() => { /* Dataverse's formatted text is used instead. */ });
    void run(false);
    return () => { closed = true; runController?.abort(); if (totalTimer) clearTimeout(totalTimer); if (renderTimer) clearTimeout(renderTimer); entries = []; };
  }, { size: 'xl', subtitle: name ? `${name} · ${entity}` : `${entity} · ${recordId.toLowerCase()}`, dismissible: false, bodyClass: 'd365lu-dialog-pad d365lu-audit' });
}
