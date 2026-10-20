import type { ActionDependencies, DynamicObject, DynamicsContext } from '../core/types';
import { attributes, controlAttribute, controls, fieldContainer, fieldLabel, labelText, openUrl } from '../core/xrm-helpers';
import { classicFieldEditorUrl, recordUrl } from '../core/url-service';

export interface FieldChoice { attribute: DynamicObject; control?: DynamicObject; name: string; label: string; }

export function formFields(ctx: DynamicsContext): FieldChoice[] {
  const byName = new Map(controls(ctx).reverse().map(control => [controlAttribute(control)?.getName?.(), control]));
  return attributes(ctx).map(attribute => {
    const name = String(attribute.getName?.() ?? '');
    const control = byName.get(name);
    return { attribute, control, name, label: labelText(attribute, control) || name };
  }).filter(field => field.name).sort((a, b) => a.label.localeCompare(b.label));
}

export function chooseField(ctx: DynamicsContext, deps: ActionDependencies, title: string): Promise<FieldChoice | null> {
  const fields = formFields(ctx);
  return new Promise(resolve => {
  let settled = false, opened = false; const settle = (value: FieldChoice | null) => { if (!settled) { settled = true; resolve(value); } };
  deps.ui.dialog(title, (body, footer, close) => {
    opened = true;
    const input = document.createElement('input'); input.className = 'd365lu-input'; input.type = 'search'; input.placeholder = 'Search logical name or label'; input.setAttribute('aria-label', 'Search fields');
    const list = document.createElement('select'); list.className = 'd365lu-select'; list.size = 12; list.setAttribute('aria-label', 'Fields');
    const draw = () => {
      const term = input.value.trim().toLowerCase(); list.replaceChildren();
      for (const field of fields.filter(item => !term || `${item.name} ${item.label}`.toLowerCase().includes(term))) { const option = document.createElement('option'); option.value = field.name; option.textContent = `${field.label} — ${field.name}`; list.append(option); }
      if (list.options.length) list.selectedIndex = 0;
    };
    input.addEventListener('input', draw); body.append(input, list); draw(); input.focus();
    const cancel = document.createElement('button'); cancel.className = 'd365lu-btn'; cancel.textContent = 'Cancel'; cancel.onclick = () => { settle(null); close(); };
    const choose = document.createElement('button'); choose.className = 'd365lu-btn primary'; choose.textContent = 'Choose'; choose.onclick = () => { const field = fields.find(item => item.name === list.value) ?? null; settle(field); close(); };
    list.addEventListener('dblclick', () => choose.click()); footer.append(cancel, choose);
    // Type to filter, arrows move through the list, Enter chooses: no mouse needed.
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const next = list.selectedIndex + (event.key === 'ArrowDown' ? 1 : -1); if (next >= 0 && next < list.options.length) list.selectedIndex = next; }
      else if (event.key === 'Enter') { event.preventDefault(); if (list.value) choose.click(); }
    });
    list.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); choose.click(); } });
    return () => settle(null);
  }, { size: 'md', subtitle: `${fields.length} fields on this form` });
  // The dialog wasn't shown (the page moved on, or another dialog opened meanwhile): nothing was chosen.
  if (!opened) settle(null);
  });
}

export async function toggleFieldEditors(ctx: DynamicsContext, deps: ActionDependencies) {
  const owner = 'field-editors';
  if (deps.decorations.has(owner)) { deps.decorations.removeOwner(owner); return { message: 'Field Editors disabled' }; }
  if (!ctx.entityName) throw new Error('The current table could not be resolved.');
  const [table, columns] = await Promise.all([deps.metadata.getTable(ctx.entityName), deps.metadata.getColumns(ctx.entityName)]);
  // The page may have moved on while metadata loaded: never decorate (or watch) the next record with this table's.
  if (deps.isCurrent?.() === false) return;
  const byName = new Map(columns.map(column => [column.LogicalName, column])); let count = 0;
  const doc = ctx.sourceWindow.document;
  const decorate = () => {
    for (const field of formFields(ctx)) {
      const column = byName.get(field.name); const label = fieldLabel(doc, field.name); if (!column?.MetadataId || !label || label.querySelector(`[data-d365lu-field-editor="${field.name}"]`)) continue;
      const button = doc.createElement('button'); button.type = 'button'; button.textContent = field.name; button.title = `Open ${field.name} in the classic field editor`; button.setAttribute('data-d365lu-field-editor', field.name);
      button.style.cssText = "cursor:pointer;border:1px solid #0f6cbd;border-radius:4px;padding:2px 8px;margin-top:2px;font-size:14px;font-family:'SegoeUI','Segoe UI','Helvetica Neue',Arial,sans-serif;font-weight:600;text-decoration:none;display:block;width:fit-content;transition:all .2s ease;box-shadow:0 1px 2px rgba(15,108,189,.2);line-height:1.2;text-align:left;color:#0f6cbd;background:transparent";
      button.onmouseenter = () => { button.style.borderColor = '#115ea3'; button.style.transform = 'translateY(-1px)'; button.style.boxShadow = '0 2px 6px rgba(15,108,189,.3)'; }; button.onmouseleave = () => { button.style.borderColor = '#0f6cbd'; button.style.transform = 'translateY(0)'; button.style.boxShadow = '0 1px 2px rgba(15,108,189,.2)'; };
      button.onclick = event => { event.preventDefault(); event.stopPropagation(); try { openUrl(ctx, classicFieldEditorUrl(ctx, table.MetadataId, column.MetadataId)); } catch (error) { deps.ui.toast(error instanceof Error ? error.message : String(error), 'error'); } };
      const lineBreak = doc.createElement('br'); label.append(lineBreak, button); deps.decorations.addNode(owner, lineBreak); deps.decorations.addNode(owner, button); count++;
    }
  };
  deps.decorations.removeOwner('logical-names'); decorate(); deps.decorations.observe(owner, doc, decorate); return { message: `Field Editors enabled on ${count} fields` };
}

export function toggleLookupLinks(ctx: DynamicsContext, deps: ActionDependencies) {
  const owner = 'lookup-links'; if (deps.decorations.has(owner)) { deps.decorations.removeOwner(owner); return { message: 'Lookup links removed' }; }
  let count = 0; const doc = ctx.sourceWindow.document; const watched = new Set<string>();
  const decorate = () => { for (const control of controls(ctx)) {
    if (control.getControlType?.() !== 'lookup') continue; const name = control.getName?.(); const container = name && fieldContainer(doc, name); if (!name || !container) continue;
    let link = container.querySelector(`[data-d365lu-lookup-link="${name}"]`) as HTMLButtonElement | null; const attribute = controlAttribute(control);
    if (!link) { link = doc.createElement('button'); link.type = 'button'; link.textContent = '↗'; link.title = 'Open lookup record in a new tab'; link.setAttribute('data-d365lu-lookup-link', name);
      Object.assign(link.style, { marginLeft: '5px', border: '0', background: 'transparent', color: '#7c4dce', cursor: 'pointer', fontSize: '16px' });
      link.onclick = (event: MouseEvent) => { event.preventDefault(); const value = attribute?.getValue?.(); const target = Array.isArray(value) ? value[0] : undefined; if (target?.id && target?.entityType) { try { openUrl(ctx, recordUrl(ctx, String(target.entityType), String(target.id))); } catch (error) { deps.ui.toast(error instanceof Error ? error.message : String(error), 'error'); } } };
      container.append(link); deps.decorations.addNode(owner, link); count++;
    }
    const value = attribute?.getValue?.(); link.disabled = !Array.isArray(value) || !value[0]; link.style.opacity = link.disabled ? '.35' : '1';
    if (!watched.has(name)) { watched.add(name); attribute?.addOnChange?.(decorate); deps.decorations.addRestore(owner, () => attribute?.removeOnChange?.(decorate)); }
  }};
  decorate(); deps.decorations.observe(owner, doc, decorate);
  return { message: `Lookup links added to ${count} controls` };
}
