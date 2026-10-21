import type { AvailabilityResult, DynamicObject, DynamicsContext } from './types';
import { formatDay, formatMoment, isDate } from './dates';

export const available = (): AvailabilityResult => ({ available: true });
export const connected = (ctx: DynamicsContext): AvailabilityResult => ctx.xrm ? available() : ({ available: false, reason: 'Available only on a supported Dynamics / Power Apps page.' });
export const formAvailable = (ctx: DynamicsContext): AvailabilityResult => ctx.isForm ? available() : ({ available: false, reason: 'Available only when a record form is open.' });
export const recordAvailable = (ctx: DynamicsContext): AvailabilityResult => ctx.isForm && ctx.entityId ? available() : ({ available: false, reason: 'Available only when a saved record form is open.' });

export function collectionItems<T = DynamicObject>(collection: DynamicObject | undefined): T[] {
  if (!collection) return [];
  try {
    const value = typeof collection.get === 'function' ? collection.get() : collection;
    // A copy: the host's own array must never be reordered or changed by a caller.
    if (Array.isArray(value)) return [...value] as T[];
    const items: T[] = [];
    collection.forEach?.((item: T) => items.push(item));
    return items;
  } catch { return []; }
}

export const attributes = (ctx: DynamicsContext) => collectionItems<DynamicObject>(ctx.form?.data?.entity?.attributes);
export const controls = (ctx: DynamicsContext) => collectionItems<DynamicObject>(ctx.form?.ui?.controls);
export const tabs = (ctx: DynamicsContext) => collectionItems<DynamicObject>(ctx.form?.ui?.tabs);

export function controlAttribute(control: DynamicObject): DynamicObject | undefined {
  try { return control.getAttribute?.() ?? undefined; } catch { return undefined; }
}

function esc(value: string): string {
  try { return CSS.escape(value); } catch { return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }
}

/** A control's field on the page (UCI: data-id="<control>-FieldSectionItemContainer"), by control name. */
export function fieldContainer(document: Document, name: string): HTMLElement | null {
  const safe = esc(name), quoted = name.replace(/"/g, '\\"');
  return document.querySelector<HTMLElement>(`[data-id="${quoted}-FieldSectionItemContainer"]`) ?? document.querySelector<HTMLElement>(`[data-id="${quoted}"]`) ??
    document.getElementById(name) ?? document.querySelector<HTMLElement>(`#${safe}_c`)?.parentElement ?? null;
}

/**
 * A control's label. The id match is anchored on the '-' before the name, so 'name' never matches the label of
 * firstname or cr123_tradingname, and header_name / header_process_name copies are only found by their own names.
 */
export function fieldLabel(document: Document, name: string): HTMLElement | null {
  const quoted = name.replace(/"/g, '\\"');
  const container = fieldContainer(document, name);
  return container?.querySelector<HTMLElement>(`label[id$="-${quoted}-field-label"],label[id="${quoted}-field-label"]`) ?? container?.querySelector<HTMLElement>('label') ??
    document.querySelector<HTMLElement>(`label[id$="-${quoted}-field-label"],label[id="${quoted}-field-label"]`) ?? document.getElementById(`${name}_c`)?.querySelector<HTMLElement>('label,span') ?? null;
}

export async function copyText(text: string): Promise<void> {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; } } catch { /* use legacy fallback */ }
  const area = document.createElement('textarea');
  area.value = text; area.style.position = 'fixed'; area.style.opacity = '0';
  document.body.append(area); area.select();
  const copied = document.execCommand('copy'); area.remove();
  if (!copied) throw new Error('Clipboard access was denied.');
}

export function openUrl(ctx: DynamicsContext, url: string): void {
  let target: Window | null = null;
  try { target = ctx.sourceWindow.open(url, '_blank'); } catch { /* use the supported shell fallback */ }
  if (target) { try { target.opener = null; } catch { /* the new tab may already be isolated */ } return; }
  if (typeof ctx.xrm?.Navigation?.openUrl === 'function') ctx.xrm.Navigation.openUrl(url);
  else throw new Error('Popup blocked. Allow popups for this site and try again.');
}

export function displayValue(attribute: DynamicObject): string {
  try {
    const value = attribute.getValue?.();
    if (value == null) return '';
    const type = attribute.getAttributeType?.();
    if (type === 'optionset' || type === 'boolean') return attribute.getText?.() ?? String(value);
    if (type === 'multiselectoptionset') { const text = attribute.getText?.(); return Array.isArray(text) ? text.join(', ') : text ?? String(value); }
    if (type === 'lookup' && Array.isArray(value)) return value.map(item => `${item.name ?? ''} (${String(item.id ?? '').replace(/[{}]/g, '')})`).join(', ');
    // In the user's time zone, as the form shows it, on a 12-hour clock (the raw value keeps the ISO time); date-only columns as dates.
    if (isDate(value)) return attribute.getFormat?.() === 'date' ? formatDay(value) : formatMoment(value, false);
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  } catch { return '[unavailable]'; }
}

export function labelText(attribute: DynamicObject, control?: DynamicObject): string {
  try { return control?.getLabel?.() ?? attribute.getName?.() ?? ''; } catch { return ''; }
}
