// Two-character codes that keep the shared settings cookie small (see storage-service.ts).
// APPEND-ONLY: a cookie written by an older build must keep meaning the same actions, so never
// reorder, remove or reuse an entry. Add new action IDs at the end; tests/settings-sync.test.ts
// fails when a registered action has no code.
export const ACTION_CODES: readonly string[] = [
  'record:entity-info', 'record:record-properties', 'form:show-logical-names', 'form:clear-logical-names', 'form:god-mode',
  'form:changed-fields', 'form:record-url', 'form:record-id', 'form:open-web-api', 'form:refresh-subgrids',
  'form:show-optionset-values', 'form:clone-record', 'form:refresh-autosave-off', 'form:all-fields', 'form:open-editor',
  'form:table-processes', 'form:enable-all-fields', 'form:show-hidden-fields', 'form:disable-field-requirement', 'form:show-field-value',
  'form:find-field', 'form:clear-notifications', 'form:refresh-ribbon', 'form:refresh-form', 'form:toggle-lookup-links',
  'form:maker-links', 'record:audit-history', 'record:access', 'record:compare-user-access', 'navigation:open-entity-editor',
  'navigation:crm-diagnostics', 'navigation:open-record-by-id', 'navigation:new-record', 'navigation:open-list', 'navigation:open-security',
  'navigation:open-system-jobs', 'navigation:open-solutions', 'navigation:open-processes', 'navigation:open-mailboxes', 'navigation:open-main',
  'navigation:open-advanced-find', 'navigation:open-mobile-client', 'navigation:open-solutions-history', 'navigation:pin-to-side-panel', 'navigation:open-classic-solution',
  'debugging:forms-monitor', 'debugging:ribbon-debugger', 'debugging:perf-center', 'debugging:disable-form-handlers', 'debugging:disable-business-rules',
  'debugging:disable-form-libraries', 'debugging:enable-dark-mode', 'debugging:clear-flags', 'debugging:access-checker', 'debugging:plugin-trace-logs',
  'tools:user-info', 'tools:execute-fetchxml', 'tools:switch-language', 'tools:clear-uci-cache'
];

const toCode = new Map(ACTION_CODES.map((id, index) => [id, index.toString(36).padStart(2, '0')]));
const toId = new Map([...toCode].map(([id, code]) => [code, id]));

// Older builds of this bookmarklet shortened some class names with a text replace over the whole bundle, which also renamed three
// action ids in saved favorites and order (form:show-logical-names became e.g. form:show-_z). Map them back.
const RENAMED: [RegExp, string][] = [
  [/^form:show-_?[A-Za-z]{1,2}$/, 'form:show-logical-names'],
  [/^form:clear-_?[A-Za-z]{1,2}$/, 'form:clear-logical-names'],
  [/^form:toggle-_?[A-Za-z]{1,2}s$/, 'form:toggle-lookup-links']
];
export function canonicalId(id: string): string { return toCode.has(id) ? id : RENAMED.find(([pattern]) => pattern.test(id))?.[1] ?? id; }

export function encodeIds(ids: readonly string[]): string { return ids.map(id => toCode.get(id) ?? '').join(''); }

/** True when the text holds a code this build doesn't know (written by a newer build). */
export function hasUnknownCodes(codes: string): boolean {
  for (let index = 0; index + 1 < codes.length; index += 2) if (!toId.has(codes.slice(index, index + 2))) return true;
  return false;
}

/** Unknown codes (written by a newer build) are skipped. */
export function decodeIds(codes: string): string[] {
  const ids: string[] = [];
  for (let index = 0; index + 1 < codes.length; index += 2) { const id = toId.get(codes.slice(index, index + 2)); if (id && !ids.includes(id)) ids.push(id); }
  return ids;
}

/**
 * The section's actions in the user's order. Actions the saved order doesn't know yet (added by a newer
 * build) keep their default place: right after the action that precedes them in the registry.
 */
export function mergeOrder(registered: readonly string[], saved: readonly string[] | undefined): string[] {
  if (!saved?.length) return [...registered];
  const known = new Set(registered);
  const order = saved.filter((id, index) => known.has(id) && saved.indexOf(id) === index);
  registered.forEach((id, index) => {
    if (order.includes(id)) return;
    const before = registered.slice(0, index).reverse().find(previous => order.includes(previous));
    order.splice(before === undefined ? 0 : order.indexOf(before) + 1, 0, id);
  });
  return order;
}
