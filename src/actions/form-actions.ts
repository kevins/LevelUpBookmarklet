import type { ActionDefinition, ActionDependencies, ColumnMetadata, DynamicObject, DynamicsContext, TableCell, UiTable } from '../core/types';
import { formatStoredDate, isDate } from '../core/dates';
import { localizedLabel } from '../core/metadata-service';
import { attributes, collectionItems, controlAttribute, controls, copyText, displayValue, fieldContainer, fieldLabel, formAvailable, labelText, recordAvailable, tabs } from '../core/xrm-helpers';
import { recordUrl } from '../core/url-service';
import { openWhenReady } from '../core/popup';

const def = (action: Omit<ActionDefinition, 'category'>): ActionDefinition => ({ ...action, category: 'form' });
const form = formAvailable;
const record = recordAvailable;
const BADGE = "cursor:pointer;border:1px solid #7b277a;border-radius:4px;padding:2px 8px;margin-top:2px;font-size:14px;font-family:'SegoeUI','Segoe UI','Helvetica Neue',Arial,sans-serif;font-weight:600;text-decoration:none;display:block;width:fit-content;transition:all .2s ease;box-shadow:0 1px 2px rgba(99,14,96,.2);line-height:1.2;text-align:left";

/** The Translator's page note: a pill at the top centre of the page (text kept as LevelUp had it). */
function copyNotice(document: Document, ok: boolean): void {
  document.querySelector('[data-d365lu-copy-notice]')?.remove();
  const note = document.createElement('div'); note.setAttribute('data-d365lu-copy-notice', ''); note.setAttribute('role', 'status'); note.textContent = ok ? '✓ Copied!' : '✗ Copy Failed';
  note.style.cssText = `position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:8px;padding:8px 16px;border-radius:6px;background:${ok ? '#242424' : '#c50f1f'};color:#fff;font:600 14px/20px "Segoe UI",system-ui,sans-serif;box-shadow:0 8px 16px rgba(0,0,0,.28);pointer-events:none`;
  document.body.append(note); setTimeout(() => note.remove(), 1500);
}

function marker(document: Document, name: string, copy: () => Promise<void>): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'levelup-logical-name'; span.textContent = name; span.title = 'Click to copy logical name to clipboard'; span.setAttribute('data-d365lu-logical-names', ''); span.dataset.name = name;
  span.style.cssText = BADGE;
  // Hover only lifts the badge; the resting style is restored exactly (no pressed colours left behind).
  span.addEventListener('mouseenter', () => { if (span.dataset.levelupBusy) return; span.style.borderColor = '#8e3d8b'; span.style.transform = 'translateY(-1px)'; span.style.boxShadow = '0 2px 6px rgba(99,14,96,.3)'; });
  span.addEventListener('mouseleave', () => { if (span.dataset.levelupBusy) return; span.style.cssText = BADGE; });
  span.addEventListener('click', async event => {
    event.preventDefault(); event.stopPropagation(); if (span.dataset.levelupBusy === '1') return; span.dataset.levelupBusy = '1';
    let ok = true; try { await copy(); } catch { ok = false; }
    copyNotice(document, ok);
    const color = ok ? '#107c10' : '#d83b01'; span.textContent = ok ? '✓ Copied!' : '✗ Failed';
    span.style.setProperty('background-color', color, 'important'); span.style.setProperty('border-color', color, 'important'); span.style.setProperty('color', '#fff', 'important'); span.style.setProperty('font-weight', 'bold', 'important'); span.style.transform = 'scale(1.1)';
    setTimeout(() => { span.textContent = name; span.style.cssText = BADGE; delete span.dataset.levelupBusy; }, 1500);
  });
  return span;
}

/** The control names showing an attribute: its own name plus header_/header_process_ copies. */
function controlNames(ctx: DynamicsContext): Map<string, string[]> {
  const names = new Map<string, string[]>();
  for (const control of controls(ctx)) { const attribute = controlAttribute(control)?.getName?.(); const name = control.getName?.(); if (attribute && name) names.set(attribute, [...(names.get(attribute) ?? []), name]); }
  return names;
}

/** Outline a field: separate properties, so another highlight (Find Field) restoring its own never removes this one. */
function highlight(target: HTMLElement, color: string, width: string): () => void {
  const before = { outline: target.style.getPropertyValue('outline'), background: target.style.getPropertyValue('background') };
  target.style.setProperty('outline', `${width} solid ${color}`); target.style.setProperty('background', 'rgba(165,122,244,.10)');
  return () => { for (const [property, value] of Object.entries(before)) { if (value) target.style.setProperty(property, value); else target.style.removeProperty(property); } if (!target.getAttribute('style')) target.removeAttribute('style'); };
}

// System columns a new row can't take: keys, ownership, audit stamps, versions, process state, calculated companions.
const NOT_CLONED = /^(createdon|createdby|createdonbehalfby|modifiedon|modifiedby|modifiedonbehalfby|ownerid|owninguser|owningteam|owningbusinessunit|statecode|statuscode|versionnumber|exchangerate|processid|stageid|traversedpath|overriddencreatedon|importsequencenumber|timezoneruleversionnumber|utcconversiontimezonecode)$|_base$/;
const MAX_CLONE_PARAMETERS = 12_000; // characters: the new window's URL carries the values

export const FORM_ACTION_IDS = [
  'form:show-logical-names','form:clear-logical-names','form:god-mode','form:changed-fields','form:record-url','form:record-id','form:open-web-api','form:refresh-subgrids','form:show-optionset-values','form:clone-record','form:refresh-autosave-off','form:all-fields','form:open-editor','form:table-processes'
] as const;

export const formActions: ActionDefinition[] = [
  def({ id: FORM_ACTION_IDS[0], label: 'Logical Names', description: 'Show clickable logical names for form fields.', icon: 'tag', availability: form, execute: (ctx, deps) => {
    const active = deps.decorations.has('logical-names');
    deps.decorations.removeOwner('logical-names');
    if (active) return { message: 'Logical names cleared' };
    deps.decorations.removeOwner('field-editors');
    const doc = ctx.sourceWindow.document; const decorated = new Set<string>();
    const decorate = () => {
      const byAttribute = controlNames(ctx);
      for (const attribute of attributes(ctx)) {
        const name = attribute.getName?.(); if (!name) continue;
        // The label is left as it is: the badge is appended (and removed) as nodes of its own.
        for (const controlName of new Set([name, ...(byAttribute.get(name) ?? [])])) {
          const label = fieldLabel(doc, controlName);
          if (!label || label.querySelector('.levelup-logical-name')) continue;
          const lineBreak = doc.createElement('br'); const node = marker(doc, name, () => copyText(name)); label.append(lineBreak, node);
          deps.decorations.addNode('logical-names', lineBreak); deps.decorations.addNode('logical-names', node); decorated.add(name);
        }
      }
    };
    decorate(); deps.decorations.observe('logical-names', doc, decorate);
    return { message: `Logical names displayed on ${decorated.size} fields` };
  }}),
  def({ id: FORM_ACTION_IDS[1], label: 'Clear Names', description: 'Remove logical-name decorations.', icon: 'clear', availability: form, execute: (_ctx, deps) => { deps.decorations.removeOwner('logical-names'); return { message: 'Logical names cleared' }; }}),
  def({ id: FORM_ACTION_IDS[2], label: 'God Mode', description: 'Show, enable, clear notifications and relax requirements for form controls.', icon: 'magic', availability: form, execute: (ctx) => {
    // Each change in its own try: a control that can't be shown can still be enabled. A control notification blocks
    // saving the record, so they are cleared too (as the original LevelUp God Mode did). Counted only when it changed.
    let changed = 0; const attempt = (run: () => void) => { try { run(); } catch { /* not supported by this control */ } };
    for (const attribute of attributes(ctx)) attempt(() => { const level = attribute.getRequiredLevel?.(); if (typeof attribute.setRequiredLevel === 'function' && level && level !== 'none') { attribute.setRequiredLevel('none'); changed++; } });
    for (const control of controls(ctx)) {
      attempt(() => { if (typeof control.getVisible === 'function' && !control.getVisible()) { control.setVisible?.(true); changed++; } });
      attempt(() => { if (typeof control.getDisabled === 'function' && control.getDisabled()) { control.setDisabled?.(false); changed++; } });
      attempt(() => control.clearNotification?.());
    }
    for (const tab of tabs(ctx)) {
      attempt(() => { if (typeof tab.getVisible === 'function' && !tab.getVisible()) { tab.setVisible?.(true); changed++; } });
      for (const section of collectionItems<DynamicObject>(tab.sections)) attempt(() => { if (typeof section.getVisible === 'function' && !section.getVisible()) { section.setVisible?.(true); changed++; } });
    }
    return { message: `${changed} form elements unlocked` };
  }}),
  def({ id: FORM_ACTION_IDS[3], label: 'Changed Fields', description: 'Highlight dirty fields on the active form (click again to clear).', icon: 'change', availability: form, execute: (ctx, deps) => {
    deps.decorations.removeOwner('find-field');
    if (deps.decorations.has('changed-fields')) { deps.decorations.removeOwner('changed-fields'); return { message: 'Changed field highlights cleared', kind: 'info' }; }
    const dirty = attributes(ctx).filter(attribute => { try { return Boolean(attribute.getIsDirty?.()); } catch { return false; } }).map(attribute => String(attribute.getName?.() ?? '')).filter(Boolean);
    if (!dirty.length) return { message: 'No changed fields on this form', kind: 'info' };
    const doc = ctx.sourceWindow.document; const shown = new Map<HTMLElement, () => void>(); const byAttribute = controlNames(ctx); const record = recordKey(ctx);
    const stillDirty = (name: string) => { try { const attribute = attributes(ctx).find(item => item.getName?.() === name); return attribute ? Boolean(attribute.getIsDirty?.()) : true; } catch { return true; } };
    // Fields on another tab, in a collapsed section or only in the header aren't on the page yet: highlighted when they
    // appear. A saved field loses its highlight; another record (navigation while the panel is hidden) gets none.
    const decorate = () => {
      if (recordKey(ctx) !== record) { deps.decorations.removeOwner('changed-fields'); return; }
      for (const name of dirty) for (const controlName of new Set([name, ...(byAttribute.get(name) ?? [])])) {
        const target = fieldContainer(doc, controlName); if (!target) continue;
        const dirtyNow = stillDirty(name);
        if (!dirtyNow) { shown.get(target)?.(); shown.delete(target); continue; }
        if (shown.has(target)) continue;
        target.setAttribute('data-d365lu-changed-fields', ''); const undo = highlight(target, '#a57af4', '2px'); const remove = () => { undo(); target.removeAttribute('data-d365lu-changed-fields'); };
        shown.set(target, remove); deps.decorations.addRestore('changed-fields', () => { if (shown.get(target) === remove) { remove(); shown.delete(target); } });
      }
    };
    const saved = () => decorate(); try { ctx.form?.data?.entity?.addOnPostSave?.(saved); deps.decorations.addRestore('changed-fields', () => ctx.form?.data?.entity?.removeOnPostSave?.(saved)); } catch { /* older clients */ }
    decorate(); deps.decorations.observe('changed-fields', doc, decorate);
    const visible = dirty.filter(name => [name, ...(byAttribute.get(name) ?? [])].some(controlName => { const target = fieldContainer(doc, controlName); return Boolean(target && shown.has(target)); }));
    const hidden = dirty.filter(name => !visible.includes(name));
    return { message: `${dirty.length} changed field${dirty.length === 1 ? '' : 's'}: ${dirty.join(', ')}${hidden.length ? ` (${hidden.length} not on screen: ${hidden.join(', ')})` : ''}`, kind: 'success' };
  }}),
  def({ id: FORM_ACTION_IDS[4], label: 'Record URL', description: 'Copy the current record URL.', icon: 'link', availability: record, execute: async (ctx) => { await copyText(recordUrl(ctx)); return { message: 'Record URL copied' }; }}),
  def({ id: FORM_ACTION_IDS[5], label: 'Record ID', description: 'Copy the current record GUID without braces.', icon: 'id', availability: record, execute: async (ctx) => { await copyText(ctx.entityId!); return { message: 'Record ID copied' }; }}),
  def({ id: FORM_ACTION_IDS[6], label: 'Web API', description: 'Open the current row in the Dataverse Web API.', icon: 'globe', availability: record, newTab: true, execute: async (ctx, deps) => {
    await openWhenReady(ctx, deps.metadata.getTable(ctx.entityName!).then(metadata => `${ctx.clientUrl}/api/data/v9.2/${metadata.EntitySetName}(${ctx.entityId})`)); return { message: 'Web API record opened' };
  }}),
  def({ id: FORM_ACTION_IDS[7], label: 'Refresh Subgrids', description: 'Refresh all subgrids, editable grids, timelines and quick views.', icon: 'sync', availability: form, execute: (ctx) => {
    let count = 0;
    for (const control of controls(ctx)) { try { const type = String(control.getControlType?.() ?? ''); if (typeof control.refresh === 'function' && (type === 'subgrid' || type.startsWith('customsubgrid') || type === 'timelinewall' || type === 'quickform')) { control.refresh(); count++; } } catch { /* unsupported */ } }
    return { message: `${count} subgrids refreshed` };
  }}),
  def({ id: FORM_ACTION_IDS[8], label: 'OptionSet Values', description: 'View labels and numeric values for every choice column on the form.', icon: 'sliders', availability: form, execute: (ctx, deps) => {
    // Every choice and multi-select choice column once, with the column's full option list (a control may hide some).
    const tables: UiTable[] = []; const labels = new Map<string, string>();
    for (const control of controls(ctx)) { const name = controlAttribute(control)?.getName?.(); if (name && !labels.has(name)) { try { labels.set(name, String(control.getLabel?.() ?? '')); } catch { /* unlabeled */ } } }
    for (const attribute of attributes(ctx)) {
      const type = attribute.getAttributeType?.(); if (type !== 'optionset' && type !== 'multiselectoptionset') continue;
      const name = String(attribute.getName?.() ?? 'optionset'); let options: { text?: string; value?: number }[] = [];
      try { options = attribute.getOptions?.() ?? []; } catch { /* none */ }
      if (!options.length) { const control = controls(ctx).find(item => controlAttribute(item)?.getName?.() === name); try { options = control?.getOptions?.() ?? []; } catch { /* none */ } }
      const rows: TableCell[][] = options.map(option => [option.text || 'N/A', option.value == null || Number.isNaN(option.value) ? '-' : copyCell(option.value)]);
      tables.push({ title: name, description: `${labels.get(name) ? `${labels.get(name)} · ` : ''}${type === 'multiselectoptionset' ? 'multi-select · ' : ''}${rows.length} option(s) available`, headers: ['OptionSet Name', 'OptionSet Value'], rows });
    }
    // Choice controls whose column isn't in the form's attribute list (rare: some custom controls): their own options.
    for (const control of controls(ctx)) {
      const type = String(control.getControlType?.() ?? ''); if (type !== 'optionset' && type !== 'multiselectoptionset') continue;
      const name = String(controlAttribute(control)?.getName?.() ?? control.getName?.() ?? 'optionset'); if (tables.some(table => table.title === name)) continue;
      let options: { text?: string; value?: number }[] = []; try { options = control.getOptions?.() ?? []; } catch { /* none */ }
      const rows: TableCell[][] = options.map(option => [option.text || 'N/A', option.value == null || Number.isNaN(option.value) ? '-' : copyCell(option.value)]);
      tables.push({ title: name, description: `${rows.length} option(s) available`, headers: ['OptionSet Name', 'OptionSet Value'], rows });
    }
    if (!tables.length) return { message: 'No option set controls found on this form', kind: 'info' };
    deps.ui.tableGroup(`OptionSet Values (${tables.length} controls)`, tables, false, { subtitle: ctx.entityName });
    return { message: `Found ${tables.length} option set control(s)`, kind: 'info' };
  }}),
  def({ id: FORM_ACTION_IDS[9], label: 'Clone Record', description: 'Open an unsaved new row on this form, filled with the values that can be set on create.', icon: 'clone', availability: record, execute: async (ctx, deps) => cloneRecord(ctx, deps) }),
  def({ id: FORM_ACTION_IDS[10], label: 'Refresh Without Save', description: 'Discard changes, refresh, and block auto-save for this form session.', icon: 'refresh', availability: form, execute: async (ctx, deps) => {
    const dirty = Boolean(ctx.form?.data?.entity?.getIsDirty?.()); if (dirty && !await deps.ui.confirm('Refresh without saving?', 'Unsaved changes will be discarded.', { ok: 'Discard and refresh', danger: true })) return;
    deps.decorations.removeOwner('find-field'); deps.decorations.removeOwner('changed-fields'); await ctx.form?.data?.refresh?.(false);
    const handler = (event: DynamicObject) => { const args = event.getEventArgs?.(); if ([2,70].includes(args?.getSaveMode?.())) args.preventDefault?.(); };
    deps.cleanup.run(); ctx.form?.data?.entity?.addOnSave?.(handler); deps.cleanup.add(() => ctx.form?.data?.entity?.removeOnSave?.(handler)); return { message: 'Form refreshed; auto-save blocked for this session' };
  }}),
  def({ id: FORM_ACTION_IDS[11], label: 'Show All Fields', description: 'Show a searchable table of every field of the record, also those not on the form, with their values.', icon: 'table', availability: form, execute: showAllFields }),
  def({ id: FORM_ACTION_IDS[12], label: 'Open Form Editor', description: 'Open the current form in Power Apps Maker.', icon: 'edit', availability: form, newTab: true, execute: async (ctx, deps) => {
    if (!ctx.formId || !ctx.entityName) throw new Error('The current form ID could not be resolved.'); const solution = deps.solutions.get();
    await openWhenReady(ctx, solution.then(found => deps.maker.form(ctx.entityName!, ctx.formId!, found.solutionId))); return { message: `Form editor opened in ${(await solution).friendlyName}` };
  }}),
  def({ id: FORM_ACTION_IDS[13], label: 'Table Processes', description: 'View active workflows, rules, flows, actions, BPFs and custom APIs.', icon: 'tableProcess', availability: form, execute: async (ctx, deps) => tableProcesses(ctx, deps) })
];

/** Dataverse column types by the names the form uses for them. */
const FORM_TYPE: Record<string, string> = { Boolean: 'boolean', Customer: 'lookup', DateTime: 'datetime', Decimal: 'decimal', Double: 'double', Integer: 'integer', BigInt: 'integer', Lookup: 'lookup', Memo: 'memo', Money: 'money', Owner: 'lookup', Picklist: 'optionset', State: 'optionset', Status: 'optionset', String: 'string', Uniqueidentifier: 'uniqueidentifier', PartyList: 'partylist' };
const FORMATTED_VALUE = '@OData.Community.Display.V1.FormattedValue', LOOKUP_TABLE = '@Microsoft.Dynamics.CRM.lookuplogicalname';
const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Activity party roles (participationtypemask) by the party-list column they fill. */
const PARTY_COLUMN: Record<number, string> = { 1: 'from', 2: 'to', 3: 'cc', 4: 'bcc', 5: 'requiredattendees', 6: 'optionalattendees', 7: 'organizer', 10: 'resources', 11: 'customers' };
const LONG_CELL = 500;

/** Long text (an email body, JSON) as a short preview with its length and a button that copies all of it. */
function longCell(text: string): TableCell {
  if (text.length <= LONG_CELL) return text;
  const cell = document.createElement('span'); cell.className = 'd365lu-copy-cell'; const preview = document.createElement('span');
  preview.textContent = `${text.slice(0, LONG_CELL)}… (${text.length.toLocaleString()} characters)`;
  const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'd365lu-copy'; copy.textContent = 'Copy'; copy.title = 'Copy the whole value';
  copy.dataset.d365luCopyValue = text; copy.dataset.d365luCopyLabel = 'Value'; cell.append(preview, copy); return cell;
}

/** A column's type as the form names it; multi-select, image and file columns by their specific kind. */
function columnType(column: ColumnMetadata | undefined, lookup = false): string {
  const kind = column?.AttributeTypeName?.Value;
  if (kind === 'MultiSelectPicklistType') return 'multiselectoptionset'; if (kind === 'ImageType') return 'image'; if (kind === 'FileType') return 'file';
  return column?.AttributeType ? FORM_TYPE[column.AttributeType] ?? column.AttributeType.toLowerCase() : lookup ? 'lookup' : '';
}

/**
 * Every field of the record. The form's fields come from the form: their current, possibly unsaved, values, and
 * whether they are dirty, required, visible or locked. The record's other columns come from its saved copy in
 * Dataverse, so a column that is on no form shows too; party lists from the activity's parties; on a new record,
 * the table's other columns without values.
 */
async function showAllFields(ctx: DynamicsContext, deps: ActionDependencies) {
  const byName = new Map<string, DynamicObject>(); for (const control of controls(ctx)) { const name = controlAttribute(control)?.getName?.(); if (name && !byName.has(name)) byName.set(name, control); }
  const read = <T,>(get: () => T): T | '' => { try { return get() ?? ''; } catch { return ''; } };
  const rows: TableCell[][] = []; const onForm = new Set<string>();
  for (const attribute of attributes(ctx)) {
    const name = attribute.getName?.() ?? ''; const control = byName.get(name); const raw = read(() => attribute.getValue?.()); onForm.add(name);
    rows.push([labelText(attribute, control), name, read(() => attribute.getAttributeType?.()), longCell(raw === '' || raw == null ? '' : isDate(raw) ? (Number.isNaN(raw.getTime()) ? String(raw) : raw.toISOString()) : typeof raw === 'object' ? JSON.stringify(raw) : String(raw)), longCell(displayValue(attribute)), true, Boolean(read(() => attribute.getIsDirty?.())), read(() => attribute.getRequiredLevel?.()), control ? read(() => control.getVisible?.()) : '', control ? read(() => control.getDisabled?.()) : '']);
  }
  // The record behind the listed fields: the form's own (a quick create shown over a record is another record).
  const formEntity = ctx.form?.data?.entity;
  const entity = String(read(() => formEntity?.getEntityName?.()) || ctx.entityName || '');
  const id = String(read(() => formEntity?.getId?.()) || ctx.entityId || '').replace(/[{}]/g, ''); const saved = RECORD_ID.test(id);
  const formCount = rows.length; const others: TableCell[][] = []; let problem = '';
  if (entity) {
    try {
      const [table, columns, dates] = await Promise.all([
        deps.metadata.getTable(entity), deps.metadata.getColumns(entity).catch(() => [] as ColumnMetadata[]),
        typeof deps.metadata.getDateColumns === 'function' ? deps.metadata.getDateColumns(entity).catch(() => undefined) : Promise.resolve(undefined)
      ]);
      const metadata = new Map(columns.map(column => [column.LogicalName, column])); const listed = new Set<string>();
      const add = (name: string, column: ColumnMetadata | undefined, type: string, raw: string, shown: string) => {
        listed.add(name); const secured = column?.IsSecured === true;
        others.push([localizedLabel(column?.DisplayName) || name, name, secured ? `${type} · secured` : type, longCell(raw), longCell(shown || (secured && !raw ? '(field-secured: empty, or hidden from you)' : '')), false, '', '', '', '']);
      };
      let parties: DynamicObject[] | undefined;
      if (saved) {
        const record = await deps.api.get<DynamicObject>(`${table.EntitySetName}(${id})`, true); // every column the user may read
        for (const key of Object.keys(record)) {
          if (key.includes('@')) continue;
          const name = /^_(.+)_value$/.exec(key)?.[1] ?? key; if (onForm.has(name)) continue;
          const column = metadata.get(name), value: unknown = record[key], formatted = record[`${key}${FORMATTED_VALUE}`], target = record[`${key}${LOOKUP_TABLE}`], date = dates?.get(name);
          const raw = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
          // As the form would show it: dates in the user's time zone, lookups as name (table: id), choices and money by their text.
          const shown = value == null ? '' : date ? formatStoredDate(value, date) ?? raw : key !== name ? `${typeof formatted === 'string' ? formatted : ''} (${typeof target === 'string' ? `${target}: ` : ''}${raw})`.trim() : typeof formatted === 'string' ? formatted : raw;
          add(name, column, columnType(column, key !== name), raw, shown);
        }
        // Party lists (from, to, attendees…) aren't columns of the record in the Web API: they come from its activity parties.
        if (table.IsActivity && columns.some(column => column.AttributeType === 'PartyList' && !onForm.has(column.LogicalName)))
          parties = (await deps.api.get<{ value?: DynamicObject[] }>(`activityparties?$select=participationtypemask,addressused,_partyid_value&$filter=_activityid_value eq ${id}`, true).catch(() => undefined))?.value;
      }
      // Columns the record data doesn't carry (party lists, images), and on a new record every other column, empty.
      for (const column of columns) {
        const name = column.LogicalName; if (onForm.has(name) || listed.has(name) || column.AttributeOf || column.IsValidForRead === false) continue;
        const type = columnType(column); let raw = '', note = '';
        if (type === 'partylist' && parties) raw = parties.filter(party => PARTY_COLUMN[Number(party.participationtypemask)] === name).map(party => String(party[`_partyid_value${FORMATTED_VALUE}`] ?? party.addressused ?? party._partyid_value ?? '')).filter(Boolean).join('; ');
        else if (saved) note = type === 'partylist' ? '(participants could not be read)' : type === 'image' ? '(image: not part of the record data)' : '(not returned by the Web API)';
        add(name, column, type, raw, raw || note);
      }
    } catch (error) { problem = error instanceof Error ? error.message : String(error); }
  }
  others.sort((a, b) => String(a[0]).localeCompare(String(b[0]))); rows.push(...others);
  const where = `${entity}${saved ? ` · ${id}` : id ? '' : ' · new record'}`;
  const subtitle = problem ? `${where} · ${formCount} on the form` : saved ? `${where} · ${formCount} on the form, ${others.length} more on the record` : `${where} · ${formCount} on the form, ${others.length} more columns (no values until it is saved)`;
  deps.ui.table(`All Fields (${rows.length})`, ['Label', 'Logical Name', 'Type', 'Raw Value', 'Formatted Value', 'On Form?', 'Dirty?', 'Required?', 'Visible?', 'Disabled?'], rows, true, { subtitle });
  return problem ? { message: `Only the form's fields are shown: the record's other fields could not be read (${problem})`, kind: 'warning' as const } : { message: `${rows.length} fields displayed`, kind: 'info' as const };
}

async function cloneRecord(ctx: DynamicsContext, deps: ActionDependencies) {
  if (typeof ctx.xrm?.Navigation?.openForm !== 'function') throw new Error('Opening a new record form is unavailable on this page.');
  const entity = ctx.entityName!; const metadata = await deps.metadata.getTable(entity);
  // Column metadata says what a new row accepts; without it (no privilege) the fixed system list still applies.
  let columns = new Map<string, ColumnMetadata>(); try { columns = new Map((await deps.metadata.getColumns(entity)).map(column => [column.LogicalName, column])); } catch { /* fixed list only */ }
  const params: Record<string, string> = {}; const skipped: string[] = []; const long: string[] = []; const secured: string[] = [];
  for (const attribute of attributes(ctx)) {
    const name = attribute.getName?.(); let value: unknown; try { value = attribute.getValue?.(); } catch { continue; }
    if (!name || value == null || value === '' || name === metadata.PrimaryIdAttribute || NOT_CLONED.test(name)) continue;
    const column = columns.get(name); const type = attribute.getAttributeType?.();
    if (column && (column.IsValidForCreate === false || column.AttributeOf)) continue;
    // The values travel in the new window's address and so end up in browser history: field-secured values stay out.
    if (column?.IsSecured) { secured.push(name); continue; }
    // Party lists and the regarding lookup can't be passed to a new form.
    if (type === 'uniqueidentifier' || column?.AttributeType === 'PartyList' || name === 'regardingobjectid') { skipped.push(name); continue; }
    if (type === 'lookup' && Array.isArray(value)) {
      if (value.length !== 1 || !value[0]?.id) { skipped.push(name); continue; } // party lists hold several parties
      // Id, name and table: the table is needed for customer, owner and multi-table lookups, and accepted for all.
      params[name] = String(value[0].id).replace(/[{}]/g, ''); params[`${name}name`] = String(value[0].name ?? ''); params[`${name}type`] = String(value[0].entityType ?? '');
    } else if (type === 'multiselectoptionset' && Array.isArray(value)) params[name] = `[${value.join(',')}]`;
    else params[name] = isDate(value) ? value.toISOString() : String(value);
    if (type === 'memo' || String(params[name]).length > 500) long.push(name);
  }
  // The values travel in the new window's address: drop the longest text first when it gets too long.
  while (JSON.stringify(params).length > MAX_CLONE_PARAMETERS && long.length) { const name = long.sort((a, b) => String(params[a]).length - String(params[b]).length).pop()!; delete params[name]; skipped.push(name); }
  const options: DynamicObject = { entityName: entity, openInNewWindow: true }; if (ctx.formId) options.formId = ctx.formId;
  void Promise.resolve(ctx.xrm.Navigation.openForm(options, params)).catch((error: unknown) => deps.ui.toast(error instanceof Error ? error.message : String(error), 'error'));
  return { message: `Unsaved clone opened in a new window${skipped.length ? `; not copied: ${skipped.join(', ')}` : ''}${secured.length ? `; field-secured, not copied: ${secured.join(', ')}` : ''}`, kind: skipped.length || secured.length ? 'warning' as const : 'success' as const };
}

async function tableProcesses(ctx: DynamicsContext, deps: ActionDependencies) {
  const entity = ctx.entityName!; const solution = await deps.solutions.get(); const quoted = entity.replace(/'/g, "''");
  // Definitions only (type 1): an activated process also has an activation row (type 2) that would list it twice.
  const [workflows, apis] = await Promise.all([
    deps.api.get<{ value: DynamicObject[] }>(`workflows?$select=workflowid,name,description,category,type,mode,scope,statecode,statuscode,_ownerid_value&$filter=primaryentity eq '${quoted}' and statecode eq 1 and type eq 1&$orderby=name asc`, true),
    deps.api.get<{ value: DynamicObject[] }>(`customapis?$select=customapiid,uniquename,displayname,description,bindingtype,_ownerid_value&$filter=bindingtype eq 1 and boundentitylogicalname eq '${quoted}'&$orderby=uniquename asc`, true)
  ]);
  const all = workflows.value ?? [], custom = apis.value ?? [], headers = ['Name','Description','Status','Owner'];
  const formatted = (item: DynamicObject, name: string) => String(item[`${name}@OData.Community.Display.V1.FormattedValue`] ?? '');
  const groups: [string, (item: DynamicObject) => boolean, 'classic'|'flow'|'rule'][] = [
    ['Realtime Workflows',w => +w['category'] === 0 && +w.mode === 1,'classic'], ['Background Workflows',w => +w['category'] === 0 && +w.mode === 0,'classic'], ['Flows',w => +w['category'] === 5,'flow'], ['Business Rules',w => +w['category'] === 2,'rule'], ['Business Process Flows',w => +w['category'] === 4,'classic'], ['Actions',w => +w['category'] === 3,'classic']
  ];
  // The flows' maker base is resolved once; without an environment id, flows are listed as plain names.
  const flowBase = all.some(item => +item['category'] === 5) ? await deps.maker.flowBase(solution.solutionId).catch(() => undefined) : undefined;
  const tables: UiTable[] = groups.map(([title, match, kind]) => {
    const items = all.filter(match);
    const rows: TableCell[][] = items.map(item => {
      const id = String(item.workflowid);
      const url = kind === 'flow' ? (flowBase ? `${flowBase}/${encodeURIComponent(id)}/details` : '') : kind === 'rule' ? `${ctx.clientUrl}/tools/systemcustomization/businessrules/businessRulesDesigner.aspx?BRlaunchpoint=BRGrid&appSolutionId=%7B${solution.solutionId}%7D&id=%7B${id}%7D` : `${ctx.clientUrl}/sfa/workflow/edit.aspx?appSolutionId=%7b${solution.solutionId}%7d&id=%7b${id}%7d`;
      const status = title === 'Business Rules' ? `${formatted(item,'statecode')} (${formatted(item,'scope')})` : title.endsWith('Workflows') ? formatted(item,'statecode') : formatted(item,'statuscode');
      const name = String(item.name || 'N/A');
      return [url ? linkCell(url, name) : name, item['description'] || 'No description', status, formatted(item,'_ownerid_value') || 'N/A'];
    });
    return { title, description: `${items.length} ${title.toLowerCase()} found`, headers, rows };
  });
  const appId = ctx.appId ?? (await Promise.resolve(ctx.global?.getCurrentAppProperties?.()).catch(() => undefined))?.appId;
  tables.push({ title: 'Custom APIs', description: `${custom.length} custom apis found`, headers, rows: custom.map(item => [linkCell(recordUrl({ ...ctx, appId: appId ? String(appId).replace(/[{}]/g, '') : undefined }, 'customapi', String(item.customapiid)), String(item.uniquename || item.displayname || 'N/A')), item['description'] || 'No description', `Active (${+item.bindingtype === 1 ? 'Entity' : 'Global'})`, formatted(item,'_ownerid_value') || 'N/A']) });
  const total = tables.reduce((count, table) => count + table.rows.length, 0);
  if (!total) return { message: `No workflows, business rules, flows, BPFs, actions, or custom APIs were found for ${entity}.`, kind: 'info' as const };
  deps.ui.tableGroup(`Table Processes for ${entity} (${total} total)`, tables, true, { subtitle: `${solution.friendlyName} · links open in ${flowBase ? 'Power Apps and Power Automate' : 'Power Apps'}` });
  return { message: `Found ${total} processes across ${tables.length} categories for ${entity}. Click any process name to open in Power Apps maker portal (${solution.friendlyName}).`, kind: 'info' as const };
}

/** The record a form shows, to tell whether the page moved on to another one. */
function recordKey(ctx: DynamicsContext): string { try { const entity = ctx.form?.data?.entity; return `${entity?.getEntityName?.() ?? ''}|${entity?.getId?.() ?? ''}`; } catch { return ''; } }

function linkCell(url: string, label: string): HTMLElement { const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener'; link.textContent = label; return link; }
function copyCell(value: number): HTMLElement { const cell = document.createElement('span'); cell.className = 'd365lu-copy-cell'; const text = document.createElement('span'); text.textContent = String(value); const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'd365lu-copy'; copy.textContent = 'Copy'; copy.title = 'Copy OptionSet Value'; copy.dataset.d365luCopyValue = String(value); cell.append(text, copy); return cell; }
