import type { ActionDependencies, DynamicsContext } from '../core/types';
import { copyText } from '../core/xrm-helpers';
import { recordUrl } from '../core/url-service';
import { compareAccessUsers, getAccessUser, searchAccessUsers } from './access-comparison-data';
import type { AccessResult, AccessUser, UserAccess } from './access-comparison-data';

const cleanGuid = (value: unknown): string => String(value ?? '').replace(/[{}]/g, '').toLowerCase();
const isGuid = (value: string): boolean => /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] => {
  const item = document.createElement(tag); item.textContent = text; item.className = className; return item;
};
const button = (label: string, primary = false): HTMLButtonElement => {
  const item = element('button', label, `d365lu-btn${primary ? ' primary' : ''}`); item.type = 'button'; return item;
};

// Scoped to this dialog; the existing panel and other dialog styles are unchanged.

interface Row { label: string; detail?: string; values: [string, string]; different?: boolean; /** Opens the role, team or profile. */ href?: string; /** Chip text -> where it opens (e.g. "Via team Sales"). */ links?: Record<string, string> }
type Href = (id: string) => string | undefined;
interface Links { role: Href; team: Href; profile: Href; user: Href }
const NO_LINKS: Links = { role: () => undefined, team: () => undefined, profile: () => undefined, user: () => undefined };

/** Where each kind of record opens (a new tab). Roles and field-security profiles have no unified-interface form. */
function recordLinks(ctx: DynamicsContext): Links {
  const base = ctx.clientUrl.replace(/\/$/, ''), braced = (id: string) => encodeURIComponent(`{${id}}`), ok = (id: string) => isGuid(cleanGuid(id));
  return {
    role: id => ok(id) ? `${base}/biz/roles/edit.aspx?id=${braced(cleanGuid(id))}` : undefined, // the classic editor, with its privilege grid
    team: id => ok(id) ? recordUrl(ctx, 'team', cleanGuid(id)) : undefined,
    profile: id => ok(id) ? `${base}/main.aspx?etc=1200&pagetype=entityrecord&id=${braced(cleanGuid(id))}` : undefined, // classic form (type code 1200)
    user: id => ok(id) ? recordUrl(ctx, 'systemuser', cleanGuid(id)) : undefined
  };
}

/** Text that opens `href` in a new tab, or plain text without one. */
function linked(text: string, href: string | undefined, className = 'ac-link'): HTMLElement {
  if (!href) return element('span', text);
  const anchor = element('a', text, className); anchor.href = href; anchor.target = '_blank'; anchor.rel = 'noopener'; anchor.title = `Open ${text} in a new tab`; return anchor;
}
type Kind = 'rights' | 'membership' | 'info';
interface Section { title: string; about: string; kind: Kind; rows: Row[]; warnings?: string[]; collapsed?: boolean }

const RIGHTS: [string, string, string][] = [
  ['ReadAccess', 'Read', 'Open and view this record'], ['WriteAccess', 'Write', 'Edit and save it'], ['AppendAccess', 'Append', 'Attach other records to it (notes, activities)'],
  ['AppendToAccess', 'Append To', 'Be chosen in a lookup of another record'], ['DeleteAccess', 'Delete', 'Delete it'], ['ShareAccess', 'Share', 'Give other users access to it'], ['AssignAccess', 'Assign', 'Change its owner']
];
const NOT_ASSIGNED = 'Not assigned';

function warnings<T>(values: [AccessResult<T>, AccessResult<T>]): string[] {
  return values.flatMap((result, index) => [
    ...(result.error ? [`User ${index ? 'B' : 'A'}: ${result.error}`] : []),
    ...(result.partial ? [`User ${index ? 'B' : 'A'}: results are incomplete; missing entries are not proof of missing access.`] : [])
  ]);
}

/** One row per role/team/profile either user has; differences first. */
function membershipRows<T>(results: [AccessResult<T[]>, AccessResult<T[]>], key: (item: T) => string, label: (item: T) => string, describe: (item: T) => string, open: (item: T) => string | undefined = () => undefined, chip: (item: T) => string | undefined = () => undefined): Row[] {
  const keys = new Map<string, string>(), hrefs = new Map<string, string>(), links: Record<string, string> = {};
  results.forEach(result => result.value?.forEach(item => { keys.set(key(item), label(item)); const href = open(item); if (href && !hrefs.has(key(item))) hrefs.set(key(item), href); const target = chip(item); if (target) links[describe(item)] = target; }));
  const rows = [...keys].sort((a, b) => a[1].localeCompare(b[1])).map(([id, title]) => {
    const values = results.map(result => {
      if (!result.value) return 'Unavailable';
      const matches = result.value.filter(item => key(item) === id);
      return matches.length ? [...new Set(matches.map(describe))].sort().join('\n') : result.partial || result.error ? 'Not in available results' : NOT_ASSIGNED;
    }) as [string, string];
    const [name, ...rest] = title.split('\n');
    return { label: name ?? title, detail: rest.join(' ') || undefined, values, different: !results.some(result => result.error || result.partial || !result.value) && values[0] !== values[1], href: hrefs.get(id), links };
  });
  return [...rows.filter(row => row.different), ...rows.filter(row => !row.different)];
}

function comparisonSections(pair: [UserAccess, UserAccess], open: Links = NO_LINKS): Section[] {
  const users = pair.map(item => item.user), rights = pair.map(item => item.rights) as [UserAccess['rights'], UserAccess['rights']];
  const identity = (label: string, read: (user: AccessUser) => string, compare = true): Row => {
    const values = users.map(read) as [string, string]; return { label, values, different: compare && values[0] !== values[1] };
  };
  const roles = pair.map(item => item.roles) as [UserAccess['roles'], UserAccess['roles']], teams = pair.map(item => item.teams) as [UserAccess['teams'], UserAccess['teams']];
  const profiles = pair.map(item => item.fieldProfiles) as [UserAccess['fieldProfiles'], UserAccess['fieldProfiles']], fields = pair.map(item => item.fields) as [UserAccess['fields'], UserAccess['fields']];
  const how = (via: string) => via === 'Direct' ? 'Direct' : via.replace(/^Team: /, 'Via team ');
  return [
    { title: 'What they can do with this record', kind: 'rights', about: 'The access Dataverse grants each user on this record right now: from their security roles, teams, sharing and ownership.', warnings: warnings(rights), rows: RIGHTS.map(([right, label, detail]) => {
      const values = rights.map(result => result.error || !result.value ? 'Unavailable' : result.value.includes(right) ? 'Yes' : 'No') as [string, string];
      return { label, detail, values, different: !rights.some(result => result.error || !result.value) && values[0] !== values[1] };
    }) },
    { title: 'Security roles', kind: 'membership', about: 'Roles grant privileges. A user gets a role directly, or through a team they belong to.', warnings: warnings(roles), rows: membershipRows(roles, role => role.id, role => role.businessUnit ? `${role.name}\n${role.businessUnit}` : role.name, role => how(role.via), role => open.role(role.id), role => role.teamId ? open.team(role.teamId) : undefined) },
    { title: 'Teams', kind: 'membership', about: 'Team members get the team\'s roles and records shared with the team.', warnings: warnings(teams), rows: membershipRows(teams, team => team.id, team => team.businessUnit ? `${team.name}\n${team.businessUnit}` : team.name, () => 'Member', team => open.team(team.id)) },
    { title: 'Field-security profiles', kind: 'membership', collapsed: true, about: 'Profiles allow reading or changing secured columns, directly or through a team.', warnings: warnings(profiles), rows: membershipRows(profiles, profile => profile.id, profile => profile.name, () => 'Member', profile => open.profile(profile.id)) },
    { title: 'Secured columns', kind: 'membership', collapsed: true, about: 'What the profiles allow on each secured column of this table. System Administrators, masking and record rights can still change the final result.', warnings: warnings(fields), rows: membershipRows(fields, field => field.name, field => `${field.label || field.name}\n${field.name}`, field => `Read: ${field.read} · Update: ${field.update} · Create: ${field.create}`) },
    { title: 'User details', kind: 'info', collapsed: true, about: 'Who the two users are.', rows: [identity('Name', user => user.fullName, false), identity('User name', user => user.domainName || 'Not supplied', false), identity('Business unit', user => user.businessUnit || 'Not supplied'), identity('Status', user => user.disabled ? 'Disabled' : 'Enabled'), identity('Access mode', user => user.accessMode || 'Not supplied'), identity('User ID', user => user.id, false)] }
  ];
}

/** "Contoso · account" when the form has a name, else "account · <id>". */
function recordLabel(ctx: DynamicsContext): string {
  let name = ''; try { const value: unknown = ctx.form?.data?.entity?.getPrimaryAttributeValue?.(); if (typeof value === 'string') name = value.trim(); } catch { /* the form is closing */ }
  return name ? `${name} · ${ctx.entityName}` : `${ctx.entityName} · ${cleanGuid(ctx.entityId)}`;
}

/**
 * What the two people are called in sentences: their first names ("Jordan" from "Rivera, Jordan" or "Jordan Rivera"),
 * or their full names when the first names are the same or can't be told.
 */
export function shortNames(a: string, b: string): [string, string] {
  const first = (name: string) => { const given = name.includes(',') ? name.slice(name.indexOf(',') + 1) : name; return given.trim().split(/\s+/).find(part => /[\p{L}\p{N}]/u.test(part))?.replace(/[,;:.]+$/, '') ?? ''; };
  const [x, y] = [first(a), first(b)];
  return x && y && x.toLocaleLowerCase() !== y.toLocaleLowerCase() ? [x, y] : [a.trim() || a, b.trim() || b];
}

const join = (items: string[]): string => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/** One or two plain sentences: what each user can do here, and what differs. */
function summary(pair: [UserAccess, UserAccess], sections: Section[]): { headline: string; facts: string[] } {
  const names = shortNames(pair[0].user.fullName, pair[1].user.fullName);
  const rights = sections[0]!.rows; const can = (index: 0 | 1) => rights.filter(row => row.values[index] === 'Yes').map(row => row.label.toLowerCase());
  const unavailable = rights.some(row => row.values.includes('Unavailable'));
  const sentence = (index: 0 | 1) => { const list = can(index); return list.length === RIGHTS.length ? `${names[index]} has full access` : list.length ? `${names[index]} can ${join(list)}` : `${names[index]} has no access`; };
  const headline = unavailable ? 'Record access could not be read for both users; see the warnings below.' : `${sentence(0)}. ${sentence(1)}.`;
  const facts: string[] = [];
  const differing = rights.filter(row => row.different).map(row => row.label);
  facts.push(differing.length ? `They differ on ${join(differing)}.` : unavailable ? '' : 'They have the same access to this record.');
  for (const [index, noun] of [[1, 'role'], [2, 'team']] as const) {
    const rows = sections[index]!.rows; const only = (side: 0 | 1) => rows.filter(row => row.values[side] !== NOT_ASSIGNED && row.values[side === 0 ? 1 : 0] === NOT_ASSIGNED).length;
    const a = only(0), b = only(1); if (a || b) facts.push([a ? `${a} ${noun}${a === 1 ? '' : 's'} only ${names[0]} has` : '', b ? `${b} ${noun}${b === 1 ? '' : 's'} only ${names[1]} has` : ''].filter(Boolean).join(', ') + '.');
  }
  return { headline, facts: facts.filter(Boolean) };
}

const ICONS: Record<string, string> = { yes: 'M4.5 10.5 8 14l7.5-8', no: 'M5 5l10 10M15 5 5 15', warn: 'M10 3.5 17 16H3L10 3.5ZM10 8.5v3.5M10 14v.2' };
function icon(name: keyof typeof ICONS): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 20 20'); svg.setAttribute('width', '14'); svg.setAttribute('height', '14'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', ICONS[name]!); svg.append(path); return svg;
}

/** A cell as chips: green yes/assigned (one per way it's assigned), quiet grey no/not assigned, amber when unknown. */
function valueCell(kind: Kind, value: string, links: Record<string, string> = {}): HTMLTableCellElement {
  const td = document.createElement('td');
  if (kind === 'info') { td.textContent = value; return td; }
  const unknown = value === 'Unavailable' || value === 'Not in available results';
  const positive = kind === 'rights' ? value === 'Yes' : value !== NOT_ASSIGNED && !unknown;
  const stack = document.createElement('div'); stack.className = 'ac-values';
  for (const part of value.split('\n').filter(Boolean)) {
    const href = positive ? links[part] : undefined, chip = href ? linked('', href, '') : document.createElement('span'); chip.className = `ac-value ${unknown ? 'unknown' : positive ? 'yes' : 'no'}`;
    const text = document.createElement('span'); text.textContent = part; chip.append(icon(unknown ? 'warn' : positive ? 'yes' : 'no'), text); if (href) chip.title = `Open ${part.replace(/^Via team /, '')} in a new tab`; stack.append(chip);
  }
  td.append(stack); return td;
}


/** Name in bold over its details, for a picked user or a search result. */
/** `href`: the chosen user's name opens their user record (search results stay buttons that choose). */
function person(target: HTMLElement, user: AccessUser, mark = false, href?: string): void {
  const name = element('strong'), meta = element('span', [user.domainName || user.id, user.businessUnit].filter(Boolean).join(' · '));
  name.append(linked(user.fullName, href)); if (user.disabled) name.append(' · Disabled');
  target.replaceChildren(...(mark ? [icon('yes')] : []), name, meta);
}

/** A read-only comparison. All async work belongs to this dialog instance. */
export function compareUserAccess(ctx: DynamicsContext, deps: ActionDependencies): void {
  if (!ctx.isForm || !ctx.clientUrl || !isGuid(cleanGuid(ctx.entityId)) || !/^[a-z_][a-z\d_]*$/i.test(ctx.entityName ?? '')) throw new Error('Open a saved record to compare user access.');
  deps.ui.dialog('Compare User Access', (body, footer, close) => {
    body.append(element('p', 'Pick two people to see what each can do with this record, and why: their security roles and teams. Nothing is changed.', 'ac-intro'));
    const pickers = element('div', '', 'ac-pickers'), status = element('p', 'Choose a second user to begin.', 'ac-note'); status.setAttribute('role', 'status');
    const controls = element('div', '', 'ac-controls'), filter = element('input', '', 'd365lu-input'); filter.type = 'search'; filter.placeholder = 'Filter comparison…'; filter.setAttribute('aria-label', 'Filter comparison'); filter.disabled = true;
    const diffLabel = element('label', '', 'd365lu-check'), differences = element('input'); differences.type = 'checkbox'; differences.disabled = true; diffLabel.append(differences, document.createTextNode('Differences only')); controls.append(filter, diffLabel); controls.hidden = true;
    const results = element('div'); results.setAttribute('aria-label', 'Access comparison results');
    body.append(pickers, status, controls, results);
    const compare = button('Compare access', true), stop = button('Stop'), copy = button('Copy report'), done = button('Close');
    const start = element('div', '', 'd365lu-foot-start'); start.append(copy);
    const end = element('div', '', 'd365lu-foot-end'); end.append(stop, compare, done);
    compare.disabled = copy.disabled = true; stop.hidden = true; done.onclick = close; footer.append(start, end);
    let closed = false, generation = 0, pending: AbortController | undefined, deadline: ReturnType<typeof setTimeout> | undefined, snapshot: [UserAccess, UserAccess] | undefined;
    const selected: [AccessUser | undefined, AccessUser | undefined] = [undefined, undefined];
    const controllers = new Set<AbortController>(), timers = new Set<ReturnType<typeof setTimeout>>();
    const setStatus = (text: string, error = false) => { status.textContent = text; status.classList.toggle('ac-error', error); };
    const updateCompare = () => { compare.disabled = Boolean(pending) || !selected[0] || !selected[1] || selected[0].id === selected[1].id; };
    const resetResults = () => { snapshot = undefined; results.replaceChildren(); filter.disabled = differences.disabled = copy.disabled = true; controls.hidden = true; };
    const cancel = (text?: string) => {
      generation++; pending?.abort(); pending = undefined; clearTimeout(deadline); deadline = undefined; stop.hidden = true; compare.textContent = 'Compare access'; compare.removeAttribute('aria-busy'); updateCompare(); if (text) setStatus(text);
    };
    const changed = () => { cancel(); resetResults(); setStatus(selected[0] && selected[1] && selected[0].id === selected[1].id ? 'Choose two different users.' : 'Choose users, then compare their access.'); updateCompare(); };
    const draw = () => {
      if (!snapshot || closed) return;
      results.replaceChildren(); const needle = filter.value.trim().toLowerCase(); let shown = 0;
      const names = snapshot.map(item => item.user.fullName) as [string, string]; const open = recordLinks(ctx); const groups = comparisonSections(snapshot, open);
      const { headline, facts } = summary(snapshot, groups);
      const card = element('div', '', 'ac-summary'); card.append(element('p', headline, 'ac-headline')); for (const fact of facts) card.append(element('p', fact, 'ac-fact'));
      results.append(card);
      for (const group of groups) {
        const rows = group.rows.filter(row => (!differences.checked || row.different) && (!needle || `${row.label} ${row.detail ?? ''} ${row.values.join(' ')}`.toLowerCase().includes(needle)));
        if (!rows.length && needle && !group.warnings?.length) continue;
        const section = element('section'); const filtering = Boolean(needle || differences.checked);
        // Advanced sections start folded unless they hold a difference or the list is being filtered.
        const fold = group.collapsed && !filtering && !group.rows.some(row => row.different) ? element('details') : undefined;
        const heading = element('h3', group.title); const counts = group.rows.filter(row => row.different).length;
        if (fold) { const summaryRow = element('summary'); summaryRow.append(heading); if (group.rows.length) summaryRow.append(element('span', String(group.rows.length), 'd365lu-count')); fold.append(summaryRow); section.append(fold); }
        else { const head = element('div', '', 'ac-head'); head.append(heading); if (counts && group.kind !== 'info') head.append(element('span', `${counts} different`, 'd365lu-chip brand')); section.append(head); }
        const container = fold ?? section;
        container.append(element('p', group.about, 'ac-about'));
        if (group.warnings?.length) container.append(element('div', group.warnings.join('\n'), 'ac-warning'));
        if (!rows.length) container.append(element('div', differences.checked ? 'No confirmed differences in this section.' : needle ? 'No matching rows.' : 'No entries returned.', 'ac-empty'));
        else {
          const wrap = element('div', '', 'ac-table-wrap'), table = element('table'), head = element('thead'), header = element('tr'), tbody = element('tbody');
          const first = element('th', group.kind === 'rights' ? 'Permission' : group.kind === 'info' ? '' : group.title.replace(/s$/, '')); first.scope = 'col'; header.append(first);
          snapshot.forEach((item, index) => { const th = element('th'); th.scope = 'col'; th.append(linked(names[index]!, open.user(item.user.id))); header.append(th); }); // each name opens that user
          head.append(header);
          for (const row of rows) {
            const tr = element('tr', '', row.different ? 'ac-different' : ''); const th = element('th'); th.scope = 'row'; th.append(linked(row.label, row.href));
            if (row.detail) th.append(element('small', row.detail, 'ac-detail'));
            tr.append(th, ...row.values.map(value => valueCell(group.kind, value, row.links))); tbody.append(tr);
          }
          shown += rows.length; table.append(head, tbody); wrap.append(table); container.append(wrap);
        }
        results.append(section);
      }
      results.dataset.visibleRows = String(shown);
    };
    filter.oninput = draw; differences.onchange = draw;

    const makePicker = (index: 0 | 1) => {
      const letter = index ? 'B' : 'A', card = element('div', '', 'ac-card'), heading = element('h3', `User ${letter}`), label = element('label', 'Search name or user name'), row = element('div', '', 'ac-search'), input = element('input', '', 'd365lu-input');
      input.type = 'search'; input.placeholder = 'Type at least 2 characters'; input.setAttribute('aria-label', `Search User ${letter}`); input.autocomplete = 'off';
      const search = button('Search'), list = element('div', '', 'ac-results'), summary = element('div', index ? 'No user selected.' : 'Loading current user…', 'ac-selected'), note = element('p', '', 'ac-note');
      list.setAttribute('aria-label', `User ${letter} search results`); note.setAttribute('role', 'status'); label.append(row); row.append(input, search); card.append(heading, label, summary, note, list); pickers.append(card);
      let sequence = 0, touched = false, request: AbortController | undefined, debounce: ReturnType<typeof setTimeout> | undefined;
      const select = (user: AccessUser) => { sequence++; request?.abort(); selected[index] = user; input.value = user.fullName; person(summary, user, true, recordLinks(ctx).user(user.id)); summary.classList.add('is-set'); list.replaceChildren(); note.textContent = ''; changed(); };
      const invalidate = () => { touched = true; sequence++; request?.abort(); clearTimeout(debounce); timers.delete(debounce!); list.replaceChildren(); selected[index] = undefined; summary.textContent = 'No user selected.'; summary.classList.remove('is-set'); changed(); };
      const searchNow = async () => {
        clearTimeout(debounce); timers.delete(debounce!); request?.abort(); const current = ++sequence, term = input.value.trim(); list.replaceChildren();
        if (term.length < 2) { note.textContent = 'Enter at least 2 characters.'; return; }
        request = new AbortController(); const controller = request; controllers.add(controller); note.textContent = 'Searching…';
        const timeout = setTimeout(() => { if (!closed && current === sequence) { controller.abort(); note.textContent = 'User search timed out. Refine the name and try again.'; } }, 15000); timers.add(timeout);
        try {
          const found = await searchAccessUsers(deps, term, controller.signal); if (closed || current !== sequence || controller.signal.aborted) return;
          note.textContent = found.more ? 'More users match. Refine the search.' : found.users.length ? 'Pick one:' : 'No matching users.';
          for (const user of found.users) { const item = element('button', '', 'ac-result'); person(item, user); item.type = 'button'; item.setAttribute('aria-label', `Select ${user.fullName} for User ${letter}`); item.onclick = () => select(user); list.append(item); }
        } catch (error) { if (!closed && current === sequence && !controller.signal.aborted) note.textContent = `Users could not be searched: ${message(error)}`; }
        finally { clearTimeout(timeout); timers.delete(timeout); controllers.delete(controller); }
      };
      input.oninput = () => { invalidate(); note.textContent = ''; debounce = setTimeout(() => { timers.delete(debounce!); void searchNow(); }, 300); timers.add(debounce); };
      input.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); void searchNow(); } };
      search.onclick = () => { invalidate(); void searchNow(); };
      return { select, note, wasEdited: () => touched };
    };
    const left = makePicker(0); makePicker(1);
    const initial = new AbortController(); controllers.add(initial);
    const initialTimeout = setTimeout(() => { initial.abort(); if (!closed && !left.wasEdited() && !selected[0]) left.note.textContent = 'Current user lookup timed out. Search for User A instead.'; }, 15000); timers.add(initialTimeout);
    void (async () => {
      try {
        let id = cleanGuid(ctx.global?.userSettings?.userId);
        if (!isGuid(id)) id = cleanGuid((await deps.api.request<{ UserId: string }>('WhoAmI()', { cache: 'no-store', signal: initial.signal })).UserId);
        const user = await getAccessUser(deps, id, initial.signal); if (!closed && !initial.signal.aborted && !selected[0] && !left.wasEdited()) left.select(user);
      } catch (error) { if (!closed && !initial.signal.aborted && !left.wasEdited()) left.note.textContent = `Current user could not be loaded. Search instead. ${message(error)}`; }
      finally { clearTimeout(initialTimeout); timers.delete(initialTimeout); controllers.delete(initial); }
    })();

    compare.onclick = () => {
      if (!selected[0] || !selected[1] || pending || closed || selected[0].id === selected[1].id) return;
      const pair: [AccessUser, AccessUser] = [selected[0], selected[1]]; const current = ++generation, controller = new AbortController(); pending = controller; controllers.add(controller); resetResults(); updateCompare(); compare.textContent = 'Comparing…'; compare.setAttribute('aria-busy', 'true'); stop.hidden = false; setStatus('Reading record rights and security assignments…');
      deadline = setTimeout(() => { if (!closed && current === generation) { cancel(); setStatus('Comparison timed out. You can retry.', true); } }, 30000);
      void compareAccessUsers(ctx, deps, ...pair, controller.signal).then(result => {
        if (closed || controller.signal.aborted || current !== generation) return;
        snapshot = result; filter.disabled = differences.disabled = copy.disabled = false; controls.hidden = false;
        const failed = result.some(item => [item.rights, item.roles, item.teams, item.fieldProfiles, item.fields].some(section => section.error || section.partial));
        setStatus(failed ? 'Comparison loaded with unavailable or incomplete sections. See the warnings below.' : 'Comparison loaded. Highlighted rows are different for the two users.'); draw();
      }).catch(error => { if (!closed && !controller.signal.aborted && current === generation) setStatus(`Comparison could not be completed: ${message(error)}`, true); }).finally(() => {
        controllers.delete(controller); if (!closed && current === generation) { pending = undefined; clearTimeout(deadline); deadline = undefined; stop.hidden = true; compare.textContent = 'Compare access'; compare.removeAttribute('aria-busy'); updateCompare(); }
      });
    };
    stop.onclick = () => cancel('Comparison stopped. You can retry.');
    copy.onclick = () => {
      if (!snapshot) return;
      const groups = comparisonSections(snapshot); const { headline, facts } = summary(snapshot, groups);
      const text = [`Compare User Access — ${ctx.entityName} (${cleanGuid(ctx.entityId)})`, `User A: ${snapshot[0].user.fullName} (${snapshot[0].user.id})`, `User B: ${snapshot[1].user.fullName} (${snapshot[1].user.id})`, '', headline, ...facts, ...groups.flatMap(group => [`\n${group.title}`, ...(group.warnings ?? []), ...group.rows.map(row => `${row.label}${row.detail ? ` (${row.detail})` : ''}${row.different ? ' [different]' : ''}\n  A: ${row.values[0].replaceAll('\n', '; ')}\n  B: ${row.values[1].replaceAll('\n', '; ')}`)])].join('\n');
      void copyText(text).then(() => { if (!closed) deps.ui.toast('Access comparison copied.', 'success'); }, error => { if (!closed) deps.ui.toast(message(error), 'error'); });
    };
    return () => { closed = true; cancel(); controllers.forEach(controller => controller.abort()); controllers.clear(); timers.forEach(timer => clearTimeout(timer)); timers.clear(); };
  }, { size: 'xl', subtitle: recordLabel(ctx), dismissible: false, bodyClass: 'd365lu-dialog-pad d365lu-access' });
}
