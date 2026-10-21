import type { ActionDependencies, DynamicsContext, DynamicObject } from '../core/types';
import { formatStoredDate, isDateText } from '../core/dates';
import type { DateColumn } from '../core/dates';
import { recordUrl } from '../core/url-service';
import { copyText } from '../core/xrm-helpers';

const MAX_PAGES = 10;
const SHOWN_ROWS = 500; // drawn on screen; Copy results always copies every row
const MAX_GET_URL = 32_000; // Dataverse refuses longer GET URLs; longer queries go through $batch
const RUN_TIMEOUT = 120_000; // Dataverse's own limit for one request is about 2 minutes
const MORE = '@Microsoft.Dynamics.CRM.morerecords', COOKIE = '@Microsoft.Dynamics.CRM.fetchxmlpagingcookie';
const FORMATTED = '@OData.Community.Display.V1.FormattedValue', LOOKUP = '@Microsoft.Dynamics.CRM.lookuplogicalname';

/** The last query typed in this tab, so reopening the runner (or a mis-click outside it) never loses it. */
let lastQuery = '';

function parse(xml: string): XMLDocument {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('FetchXML is malformed.');
  return document;
}

/**
 * Where each result column of a query comes from: { table, field } by the name the Web API gives it. A column
 * alias names it alone; a field of an aliased link-entity is `alias.field`; otherwise the field name. Columns of
 * all-attributes come back by field name ('' maps link-entity aliases to their tables for those).
 */
export function fetchColumns(xml: string): { columns: Map<string, { table: string; field: string }>; tables: Map<string, string> } {
  const document = parse(xml); const columns = new Map<string, { table: string; field: string }>(), tables = new Map<string, string>();
  const root = document.querySelector('fetch > entity')?.getAttribute('name')?.trim(); if (root) tables.set('', root);
  document.querySelectorAll('link-entity').forEach(link => { const alias = link.getAttribute('alias')?.trim(), name = link.getAttribute('name')?.trim(); if (alias && name) tables.set(alias, name); });
  document.querySelectorAll('attribute').forEach(attribute => {
    const owner = attribute.parentElement, field = attribute.getAttribute('name')?.trim(), table = owner?.getAttribute('name')?.trim(); if (!owner || !field || !table) return;
    const alias = attribute.getAttribute('alias')?.trim(), link = owner.localName === 'link-entity' ? owner.getAttribute('alias')?.trim() : '';
    const key = alias || (owner.localName === 'link-entity' ? (link ? `${link}.${field}` : '') : field); if (key) columns.set(key, { table, field });
  });
  return { columns, tables };
}

export function extractFetchEntity(xml: string): string {
  const entity = parse(xml).querySelector('fetch > entity')?.getAttribute('name')?.trim();
  if (!entity) throw new Error('FetchXML must contain a root entity name.');
  return entity;
}

/** Indentation between tags only adds URL length (each character can triple when encoded). */
export function compactFetchXml(xml: string): string { return xml.trim().replace(/>\s+</g, '><'); }

export function fetchXmlPath(entitySetName: string, xml: string): string { return `${entitySetName}?fetchXml=${encodeURIComponent(xml)}`; }

/**
 * Pages are fetched with FetchXML's own paging (Dataverse never sends @odata.nextLink for ?fetchXml=): the
 * response says morerecords and hands back a paging cookie for the next page. Only queries without top,
 * aggregate or an explicit page are paged automatically.
 */
export function nextPageXml(xml: string, response: DynamicObject, page: number): string | undefined {
  if (response[MORE] !== true) return undefined;
  const document = parse(xml); const fetch = document.documentElement;
  const cookieXml = typeof response[COOKIE] === 'string' ? response[COOKIE] as string : '';
  const cookie = cookieXml ? new DOMParser().parseFromString(cookieXml, 'application/xml').documentElement : undefined;
  const next = Number(cookie?.getAttribute('pagenumber')) || page + 1;
  fetch.setAttribute('page', String(next));
  const paging = cookie?.getAttribute('pagingcookie');
  if (paging) { let decoded = paging; try { decoded = decodeURIComponent(decodeURIComponent(paging)); } catch { /* use as given */ } fetch.setAttribute('paging-cookie', decoded); }
  return new XMLSerializer().serializeToString(document);
}

export function autoPages(xml: string): boolean {
  const fetch = parse(xml).documentElement;
  return !fetch.hasAttribute('top') && fetch.getAttribute('aggregate') !== 'true' && !fetch.hasAttribute('page');
}

/** One GET inside a POST $batch, for queries whose GET URL would be too long. */
async function batchGet(deps: ActionDependencies, ctx: DynamicsContext, path: string, signal: AbortSignal): Promise<DynamicObject> {
  const boundary = `batch_levelup_${Math.random().toString(36).slice(2)}`;
  const body = `--${boundary}\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\nGET ${ctx.clientUrl}/api/data/v9.2/${path} HTTP/1.1\r\nAccept: application/json\r\nPrefer: odata.include-annotations="*"\r\n\r\n--${boundary}--\r\n`;
  const text = await deps.api.request<string | DynamicObject>('$batch', { method: 'POST', body, signal, timeoutMs: RUN_TIMEOUT, headers: { 'Content-Type': `multipart/mixed;boundary=${boundary}`, Accept: 'multipart/mixed' } });
  const raw = typeof text === 'string' ? text : JSON.stringify(text);
  const status = Number(/HTTP\/1\.1 (\d{3})/.exec(raw)?.[1] ?? 0); const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  let data: DynamicObject = {}; try { data = JSON.parse(json) as DynamicObject; } catch { /* reported below */ }
  if (status < 200 || status >= 300) throw new Error(typeof data.error?.message === 'string' ? data.error.message : `Dataverse request failed (${status || 'batch'}).`);
  return data;
}

export function openFetchXmlRunner(ctx: DynamicsContext, deps: ActionDependencies): void {
  deps.ui.dialog('Execute FetchXML', (body, footer) => {
    const editor = document.createElement('textarea'); editor.className = 'd365lu-input d365lu-code'; editor.rows = 12; editor.spellcheck = false; editor.value = lastQuery; editor.placeholder = '<fetch>\n  <entity name="account">\n    <attribute name="name" />\n  </entity>\n</fetch>';
    editor.setAttribute('aria-label', 'FetchXML'); editor.oninput = () => { lastQuery = editor.value; };
    const bar = document.createElement('div'); bar.className = 'd365lu-inline';
    const views = document.createElement('div'); views.className = 'd365lu-seg'; views.setAttribute('role', 'group'); views.setAttribute('aria-label', 'Result view');
    const count = document.createElement('span'); count.className = 'd365lu-quiet'; count.textContent = 'No results';
    const progress = document.createElement('div'); progress.className = 'd365lu-progress'; progress.append(document.createElement('i')); progress.hidden = true;
    const error = document.createElement('div'); error.className = 'd365lu-error'; error.setAttribute('role', 'alert');
    const result = document.createElement('pre'); result.className = 'd365lu-result';
    const table = document.createElement('div'); table.className = 'd365lu-result'; table.hidden = true;
    let rows: DynamicObject[] = [], view: 'json' | 'table' = 'json', closed = false, generation = 0, controller: AbortController | undefined;

    const renderJson = () => {
      const shown = rows.slice(0, SHOWN_ROWS);
      result.textContent = rows.length ? `${JSON.stringify(shown, null, 2)}${rows.length > SHOWN_ROWS ? `\n\n… ${rows.length - SHOWN_ROWS} more rows. Copy results copies all ${rows.length}.` : ''}` : '';
    };
    const renderTable = () => {
      table.replaceChildren(); if (!rows.length) { table.textContent = 'No rows returned.'; return; }
      // Columns without annotations; lookups (_x_value) show the record name, linked, and choices/dates their formatted text.
      const columns = [...new Set(rows.flatMap(row => Object.keys(row).filter(key => !key.includes('@'))))];
      const element = document.createElement('table'); element.className = 'd365lu-table'; const head = element.createTHead().insertRow();
      columns.forEach(column => { const th = document.createElement('th'); const [alias, name] = column.includes('.') ? column.split(/\.(.*)/) : ['', column]; const shown = /^_(.+)_value$/.exec(name ?? '')?.[1] ?? name ?? column; th.textContent = alias ? `${alias} · ${shown}` : shown; th.title = column; head.append(th); });
      const tbody = element.createTBody();
      rows.slice(0, SHOWN_ROWS).forEach(row => { const tr = tbody.insertRow(); columns.forEach(column => {
        const td = tr.insertCell(); const value = row[column]; const target = row[`${column}${LOOKUP}`];
        const date = dates.get(column); const asDate = date ? formatStoredDate(value, date) : undefined;
        const shown = asDate ?? row[`${column}${FORMATTED}`] ?? value;
        const text = shown == null ? '' : typeof shown === 'object' ? JSON.stringify(shown) : String(shown);
        if (typeof target === 'string' && typeof value === 'string') { try { const link = document.createElement('a'); link.href = recordUrl(ctx, target, value); link.target = '_blank'; link.rel = 'noopener'; link.textContent = text; link.title = `${target} ${value}`; td.append(link); return; } catch { /* plain text below */ } }
        td.textContent = text; if (shown !== value && value != null && !asDate && !isDateText(value)) td.title = String(value); // dates: no UTC tooltip
      }); });
      table.append(element);
      if (rows.length > SHOWN_ROWS) { const note = document.createElement('p'); note.className = 'd365lu-quiet'; note.textContent = `Showing the first ${SHOWN_ROWS} of ${rows.length} rows. Copy results copies all of them.`; table.append(note); }
    };
    const show = (next: 'json' | 'table') => {
      view = next; result.hidden = next !== 'json'; table.hidden = next !== 'table';
      views.querySelectorAll('button').forEach(button => { const on = button.dataset.view === next; button.classList.toggle('primary', on); button.setAttribute('aria-pressed', String(on)); });
      if (next === 'json') renderJson(); else renderTable();
    };
    for (const [key, label] of [['json', 'JSON'], ['table', 'Table']] as const) { const button = document.createElement('button'); button.type = 'button'; button.dataset.view = key; button.textContent = label; button.onclick = () => show(key); views.append(button); }

    const run = document.createElement('button'); run.type = 'button'; run.className = 'd365lu-btn primary'; run.textContent = 'Run';
    const setBusy = (busy: boolean) => { run.disabled = busy; if (busy) run.setAttribute('aria-busy', 'true'); else run.removeAttribute('aria-busy'); progress.hidden = !busy; run.replaceChildren(); if (busy) { const spin = document.createElement('span'); spin.className = 'd365lu-spin'; run.append(spin, document.createTextNode('Running…')); } else run.textContent = 'Run'; };
    // Each result column's date behaviour (from its table's metadata), so dates show in the user's time zone.
    let dates = new Map<string, DateColumn>();
    const dateColumns = async (xml: string): Promise<Map<string, DateColumn>> => {
      if (typeof deps.metadata.getDateColumns !== 'function') return new Map();
      const { columns, tables } = fetchColumns(xml); const names = [...new Set([...columns.values()].map(column => column.table).concat([...tables.values()]))];
      const loaded = new Map(await Promise.all(names.map(async table => [table, await deps.metadata.getDateColumns(table).catch(() => undefined)] as const)));
      const result = new Map<string, DateColumn>();
      for (const [key, { table, field }] of columns) { const date = loaded.get(table)?.get(field); if (date) result.set(key, date); }
      // all-attributes: columns come back by field name, or alias.field in an aliased link-entity
      for (const [alias, table] of tables) loaded.get(table)?.forEach((date, field) => { const key = alias ? `${alias}.${field}` : field; if (!result.has(key) && !columns.has(key)) result.set(key, date); });
      return result;
    };
    const execute = async () => {
      if (run.disabled) return;
      const request = ++generation; const stale = () => closed || request !== generation;
      controller?.abort(); const abort = controller = new AbortController();
      error.textContent = ''; setBusy(true);
      try {
        let xml = compactFetchXml(editor.value); const entity = extractFetchEntity(xml); const paging = autoPages(xml);
        const datesLoading = dateColumns(xml).catch(() => new Map<string, DateColumn>()); // alongside the query; paging keeps the same tables
        const metadata = await deps.metadata.getTable(entity); if (stale()) return;
        const page = async (query: string): Promise<DynamicObject> => {
          const path = fetchXmlPath(metadata.EntitySetName, query);
          if (`${ctx.clientUrl}/api/data/v9.2/${path}`.length > MAX_GET_URL) return batchGet(deps, ctx, path, abort.signal);
          return deps.api.get<DynamicObject>(path, true, { signal: abort.signal, timeoutMs: RUN_TIMEOUT });
        };
        let response = await page(xml); if (stale()) return; rows = [...(response.value ?? [])]; let pages = 1;
        while (paging && pages < MAX_PAGES && !stale()) { const next = nextPageXml(xml, response, pages); if (!next) break; xml = next; response = await page(xml); if (stale()) return; rows.push(...(response.value ?? [])); pages++; }
        const partial = response[MORE] === true;
        const loadedDates = await datesLoading; if (stale()) return; dates = loadedDates;
        show(view);
        count.textContent = `${rows.length} result${rows.length === 1 ? '' : 's'}${pages > 1 ? ` across ${pages} pages` : ''}${partial ? (paging ? ` · Partial results: more rows are available; stopped at the ${MAX_PAGES}-page limit.` : ' · More rows are available (this query sets its own page, top or count).') : ''}`;
        deps.ui.toast(`FetchXML returned ${rows.length} rows${partial ? `; partial results${paging ? ` at the ${MAX_PAGES}-page limit` : ''}. Narrow your query to retrieve the remaining rows.` : ''}`, partial ? 'warning' : 'success');
      } catch (reason) {
        if (stale()) return; error.textContent = reason instanceof Error ? reason.message : String(reason); rows = []; result.textContent = ''; table.replaceChildren(); count.textContent = 'Request failed';
      } finally { if (!stale()) setBusy(false); }
    };
    run.onclick = () => void execute();
    editor.onkeydown = event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void execute(); } };
    const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'd365lu-btn'; clear.textContent = 'Clear';
    clear.onclick = () => { generation++; controller?.abort(); rows = []; editor.value = ''; lastQuery = ''; result.textContent = ''; table.replaceChildren(); error.textContent = ''; count.textContent = 'No results'; setBusy(false); editor.focus(); };
    const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'd365lu-btn'; copy.textContent = 'Copy results';
    copy.onclick = () => { if (!rows.length) { deps.ui.toast('Run a query first.', 'info'); return; } void copyText(JSON.stringify(rows, null, 2)).then(() => deps.ui.toast(`${rows.length} rows copied`, 'success'), reason => deps.ui.toast(String(reason), 'error')); };
    bar.append(views, count); show('json');
    const start = document.createElement('div'); start.className = 'd365lu-foot-start'; start.append(clear);
    body.append(editor, progress, bar, error, result, table); const end = document.createElement('div'); end.className = 'd365lu-foot-end'; end.append(copy, run); footer.append(start, end);
    return () => { closed = true; controller?.abort(); };
  }, { size: 'xl', subtitle: `Runs through the Dataverse Web API · up to ${MAX_PAGES} pages · Ctrl+Enter runs`, dismissible: false });
}
