import type { DynamicsContext } from './types';
import { DEFAULT_SOLUTION_ID } from './solution-resolver';

export const cleanGuid = (value: string) => value.replace(/[{}]/g, '');

export function recordUrl(ctx: DynamicsContext, entity = ctx.entityName, id = ctx.entityId): string {
  if (!ctx.clientUrl || !entity || !id) throw new Error('A saved record is required.');
  const url = new URL(`${ctx.clientUrl}/main.aspx`);
  if (ctx.appId) url.searchParams.set('appid', ctx.appId);
  url.searchParams.set('pagetype', 'entityrecord');
  url.searchParams.set('etn', entity);
  url.searchParams.set('id', cleanGuid(id));
  return url.toString();
}

export function diagnosticsUrl(ctx: DynamicsContext): string { return `${ctx.clientUrl}/tools/diagnostics/diag.aspx`; }

const braced = (value: string): string => `{${cleanGuid(value)}}`;

export function classicSolutionUrl(ctx: DynamicsContext, objectTypeCode?: number): string {
  if (!ctx.clientUrl) throw new Error('A supported Dynamics context is required.');
  const url = new URL(`${ctx.clientUrl}/tools/solution/edit.aspx`); url.searchParams.set('id', braced(DEFAULT_SOLUTION_ID));
  if (objectTypeCode != null) { url.searchParams.set('def_category', '9801'); url.searchParams.set('def_type', String(objectTypeCode)); }
  return url.toString();
}

export function classicFieldEditorUrl(ctx: DynamicsContext, entityMetadataId: string, attributeMetadataId: string): string {
  if (!ctx.clientUrl) throw new Error('A supported Dynamics context is required.');
  const url = new URL(`${ctx.clientUrl}/tools/systemcustomization/attributes/manageAttribute.aspx`);
  url.searchParams.set('appSolutionId', braced(DEFAULT_SOLUTION_ID)); url.searchParams.set('attributeId', braced(attributeMetadataId)); url.searchParams.set('entityId', braced(entityMetadataId)); return url.toString();
}

export function setDebugFlag(current: string, name: string, value: string): string {
  return rewriteParameter(current, name, previous => {
    if (name.toLowerCase() !== 'flags') return previous.length === 1 && previous[0] === value ? undefined : [value];
    const entries = previous.flatMap(item => item.split(',')), requested = value.split(','), key = (entry: string) => entry.split('=')[0]!.trim().toLowerCase();
    if (requested.every(entry => { const matches = entries.filter(item => key(item) === key(entry)); return matches.length === 1 && matches[0]!.slice(matches[0]!.indexOf('=') + 1).trim() === entry.slice(entry.indexOf('=') + 1).trim(); })) return;
    // A handler flag is a single setting: choosing business rules replaces true,
    // not a second flags parameter that the Dynamics parser can ignore.
    return [[...entries.filter(entry => !requested.some(item => key(item) === key(entry))), ...requested].join(',')];
  });
}

const OWN_FLAGS = new Set(['disableformhandlers=true', 'disableformhandlers=businessrule', 'disableformlibraries=true', 'themeoption=darkmode']);
export function clearDebugFlags(current: string): string {
  let next = rewriteParameter(current, 'flags', previous => {
    const entries = previous.flatMap(value => value.split(',')), remaining = entries.filter(value => !OWN_FLAGS.has(value.trim().toLowerCase()));
    return remaining.length === entries.length ? undefined : remaining.some(Boolean) ? [remaining.join(',')] : [];
  });
  for (const key of ['monitor', 'ribbondebug', 'perf']) next = rewriteParameter(next, key, previous => {
    const remaining = previous.filter(value => value.toLowerCase() !== 'true'); return remaining.length === previous.length ? undefined : remaining;
  });
  return next;
}

// Edit only the relevant parameter; URLSearchParams would also rewrite record
// routing, plus signs and percent-encoding in every unrelated parameter.
function rewriteParameter(current: string, name: string, update: (previous: string[]) => string[] | undefined): string {
  const hashAt = current.indexOf('#'), hash = hashAt < 0 ? '' : current.slice(hashAt), beforeHash = hashAt < 0 ? current : current.slice(0, hashAt), queryAt = beforeHash.indexOf('?');
  const base = queryAt < 0 ? beforeHash : beforeHash.slice(0, queryAt), query = queryAt < 0 ? '' : beforeHash.slice(queryAt + 1);
  const decode = (value: string) => { try { return decodeURIComponent(value.replace(/\+/g, ' ')); } catch { return value; } };
  const parts: string[] = [], previous: string[] = []; let at = -1;
  for (const part of query ? query.split('&') : []) {
    const equals = part.indexOf('=');
    if (decode(equals < 0 ? part : part.slice(0, equals)).toLowerCase() !== name.toLowerCase()) parts.push(part);
    else { if (at < 0) at = parts.push('') - 1; previous.push(decode(equals < 0 ? '' : part.slice(equals + 1))); }
  }
  const next = update(previous); if (!next) return current;
  const replacement = next.map(value => `${encodeURIComponent(name)}=${name.toLowerCase() === 'flags' ? value.split(',').map(entry => encodeURIComponent(entry).replace(/%3D/gi, '=')).join(',') : encodeURIComponent(value)}`);
  if (at < 0) parts.push(...replacement); else parts.splice(at, 1, ...replacement);
  return `${base}${parts.length ? `?${parts.join('&')}` : ''}${hash}`;
}
