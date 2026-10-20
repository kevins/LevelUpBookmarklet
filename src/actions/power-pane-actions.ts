import type { ActionDefinition, DynamicObject } from '../core/types';
import { attributes, collectionItems, connected, controls, displayValue, fieldContainer, formAvailable, openUrl, tabs } from '../core/xrm-helpers';
import { chooseField, toggleFieldEditors, toggleLookupLinks } from '../features/field-tools';
import { diagnosticsUrl } from '../core/url-service';
import { DEFAULT_SOLUTION_ID } from '../core/solution-resolver';
import { openWhenReady } from '../core/popup';

const def = (action: Omit<ActionDefinition, 'category' | 'availability'> & { category?: ActionDefinition['category']; availability?: ActionDefinition['availability'] }): ActionDefinition => ({ ...action, category: action.category ?? 'form', availability: action.availability ?? formAvailable });

export const POWER_PANE_UNIQUE_IDS = [
  'form:enable-all-fields','form:show-hidden-fields','form:disable-field-requirement','form:show-field-value','form:find-field','form:clear-notifications','form:refresh-ribbon','form:refresh-form','form:toggle-lookup-links','navigation:open-entity-editor','navigation:crm-diagnostics'
] as const;

export const powerPaneActions: ActionDefinition[] = [
  def({ id: POWER_PANE_UNIQUE_IDS[0], label: 'Enable All Fields', description: 'Enable every supported form control.', icon: 'unlock', execute: ctx => { let count = 0; for (const control of controls(ctx)) { try { if (control.setDisabled && control.getDisabled?.()) { control.setDisabled(false); count++; } } catch { /* unsupported */ } } return { message: `${count} fields enabled` }; }}),
  def({ id: POWER_PANE_UNIQUE_IDS[1], label: 'Show Hidden Fields', description: 'Show hidden controls, sections and tabs.', icon: 'eye', execute: ctx => {
    let fields = 0, sections = 0, tabCount = 0; for (const control of controls(ctx)) { try { if (control.setVisible && !control.getVisible?.()) { control.setVisible(true); fields++; } } catch { /* unsupported */ } }
    for (const tab of tabs(ctx)) { try { if (!tab.getVisible?.()) { tab.setVisible?.(true); tabCount++; } for (const section of collectionItems<DynamicObject>(tab.sections)) if (!section.getVisible?.()) { section.setVisible?.(true); sections++; } } catch { /* unsupported */ } }
    return { message: `${fields} fields, ${sections} sections and ${tabCount} tabs shown` };
  }}),
  def({ id: POWER_PANE_UNIQUE_IDS[2], label: 'Disable Field Requirement', description: 'Make form attributes optional for this session.', icon: 'rule', execute: ctx => { let count = 0; for (const attribute of attributes(ctx)) { try { if (attribute.setRequiredLevel && attribute.getRequiredLevel?.() !== 'none') { attribute.setRequiredLevel('none'); count++; } } catch { /* unsupported */ } } return { message: `${count} requirements disabled` }; }}),
  def({ id: POWER_PANE_UNIQUE_IDS[3], label: 'Show Field Value', description: 'Inspect raw and formatted details for a selected field.', icon: 'fieldValue', execute: async (ctx, deps) => {
    const field = await chooseField(ctx, deps, 'Show Field Value'); if (!field) return; const attribute = field.attribute; const raw = attribute.getValue?.(); const type = attribute.getAttributeType?.(); const rows = [
      { label: 'Logical Name', value: field.name, copy: true }, { label: 'Display Label', value: field.label, copy: true }, { label: 'Field Type', value: type }, { label: 'Raw Value', value: raw, copy: true }, { label: 'Formatted Value', value: displayValue(attribute), copy: true }, { label: 'Dirty', value: Boolean(attribute.getIsDirty?.()) }, { label: 'Required Level', value: attribute.getRequiredLevel?.() }
    ];
    if (type === 'optionset') rows.splice(5, 0, { label: 'Choice Label', value: attribute.getText?.(), copy: true }); if (type === 'lookup' && Array.isArray(raw) && raw[0]) rows.splice(5, 0, { label: 'Lookup', value: `${raw[0].name} | ${String(raw[0].id).replace(/[{}]/g,'')} | ${raw[0].entityType}`, copy: true }); deps.ui.details(field.label, [{ rows }], [], { subtitle: `${field.name} · ${type ?? 'unknown type'}`, size: 'md' }); return { message: `${field.name} inspected`, kind: 'info' };
  }}),
  def({ id: POWER_PANE_UNIQUE_IDS[4], label: 'Find Field In Form', description: 'Find, reveal, focus and highlight a field.', icon: 'findField', execute: async (ctx, deps) => {
    const field = await chooseField(ctx, deps, 'Find Field In Form'); if (!field) return; const control = field.control; if (!control) throw new Error('The selected attribute has no form control.');
    try { const section = control.getParent?.(); section?.setVisible?.(true); const tab = section?.getParent?.(); tab?.setVisible?.(true); tab?.setDisplayState?.('expanded'); tab?.setFocus?.(); control.setVisible?.(true); control.setFocus?.(); } catch { /* best effort */ }
    deps.decorations.removeOwner('find-field'); const doc = ctx.sourceWindow.document; const controlName = String(control.getName?.() ?? field.name);
    // A field on another tab is drawn only after that tab opens: wait for it (up to 2 s) before highlighting.
    let target = fieldContainer(doc, controlName) ?? fieldContainer(doc, field.name);
    for (let waited = 0; !target && waited < 2000 && deps.isCurrent?.() !== false; waited += 100) { await new Promise(resolve => setTimeout(resolve, 100)); target = fieldContainer(doc, controlName) ?? fieldContainer(doc, field.name); }
    if (deps.isCurrent?.() === false) return;
    if (!target) return { message: `${field.label} (${field.name}) is focused but not visible on the page (hidden, or on a tab that couldn't open).`, kind: 'info' };
    const found = target, mine = '3px solid #a57af4', before = { outline: found.style.getPropertyValue('outline') };
    found.style.setProperty('outline', mine); found.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Put back what was there only while the outline is still ours (Changed Fields may have been cleared meanwhile).
    deps.decorations.addRestore('find-field', () => { if (found.style.getPropertyValue('outline') !== mine) return; if (before.outline) found.style.setProperty('outline', before.outline); else found.style.removeProperty('outline'); if (!found.getAttribute('style')) found.removeAttribute('style'); });
    const timer = window.setTimeout(() => deps.decorations.removeOwner('find-field'), 5000); deps.decorations.addRestore('find-field', () => window.clearTimeout(timer));
    return { message: `Focused ${field.label} (${field.name})` };
  }}),
  def({ id: POWER_PANE_UNIQUE_IDS[5], label: 'Clear All Notifications', description: 'Clear supported control notifications.', icon: 'bell', execute: ctx => {
    // clearNotification() without an id removes the notification shown now; a control can hold several, so repeat (bounded).
    // clearNotification() without an id clears the notification each control shows.
    let supported = 0; for (const control of controls(ctx)) { if (typeof control.clearNotification !== 'function') continue; supported++; try { control.clearNotification(); } catch { /* unsupported */ } }
    return { message: supported ? `Notifications cleared on the form's ${supported} fields` : 'No fields with notifications on this form', kind: supported ? 'success' : 'info' };
  }}),
  def({ id: POWER_PANE_UNIQUE_IDS[6], label: 'Refresh Ribbon', description: 'Refresh the active form ribbon.', icon: 'ribbon', execute: ctx => { const ui = ctx.form?.ui; if (typeof ui?.refreshRibbon !== 'function') throw new Error('Ribbon refresh is unavailable on this page.'); ui.refreshRibbon(true); return { message: 'Ribbon refresh requested' }; }}),
  def({ id: POWER_PANE_UNIQUE_IDS[7], label: 'Refresh Form', description: 'Refresh form data after confirming unsaved changes.', icon: 'formRefresh', execute: async (ctx, deps) => { if (ctx.form?.data?.entity?.getIsDirty?.() && !await deps.ui.confirm('Refresh form?', 'The form has unsaved changes. Refreshing discards them.', { ok: 'Refresh', danger: true })) return; deps.decorations.removeOwner('find-field'); deps.decorations.removeOwner('changed-fields'); await ctx.form?.data?.refresh?.(false); return { message: 'Form refreshed' }; }}),
  def({ id: POWER_PANE_UNIQUE_IDS[8], label: 'Toggle Lookup Links', description: 'Toggle open-record links beside lookup controls.', icon: 'lookup', execute: toggleLookupLinks }),
  def({ id: 'form:maker-links', label: 'Field Editors', description: 'Open exact classic field editors from form fields.', icon: 'maker', execute: toggleFieldEditors }),
  def({ id: POWER_PANE_UNIQUE_IDS[9], label: 'Entity Editor', description: 'Open the current table in the modern Default Solution editor.', icon: 'entityEditor', category: 'navigation', newTab: true, availability: ctx => ctx.xrm && ctx.entityName ? { available: true } : { available: false, reason: 'Available when a table page is open.' }, execute: async (ctx, deps) => { if (!ctx.entityName) throw new Error('Open a table page first.'); await openWhenReady(ctx, deps.metadata.getTable(ctx.entityName).then(table => deps.maker.table(table.MetadataId, DEFAULT_SOLUTION_ID))); return { message: 'Modern table editor opened in Default Solution' }; }}),
  def({ id: POWER_PANE_UNIQUE_IDS[10], label: 'CRM Diagnostics', description: 'Open the current organization diagnostics page.', icon: 'diagnostics', category: 'navigation', newTab: true, availability: connected, execute: ctx => { openUrl(ctx, diagnosticsUrl(ctx)); return { message: 'Diagnostics opened' }; }})
];
