import type { ActionDefinition, DynamicsContext, DynamicObject } from '../core/types';
import { connected, openUrl } from '../core/xrm-helpers';
import { classicSolutionUrl, cleanGuid, recordUrl } from '../core/url-service';
import { adminCenterUrl, cloudFor } from '../core/cloud';
import { openWhenReady } from '../core/popup';

const def = (action: Omit<ActionDefinition, 'category' | 'availability'>): ActionDefinition => ({ ...action, category: 'navigation', availability: connected });

/** A table list of the current app, in a new tab (lists can't open as a dialog, and the current page stays). */
function listUrl(ctx: DynamicsContext, entity: string): string {
  const url = new URL(`${ctx.clientUrl}/main.aspx`); if (ctx.appId) url.searchParams.set('appid', ctx.appId);
  url.searchParams.set('pagetype', 'entitylist'); url.searchParams.set('etn', entity); return url.toString();
}

const openList = (entity: string, message: string) => (ctx: DynamicsContext) => { openUrl(ctx, listUrl(ctx, entity)); return { message }; };
const tableName = (value: string | undefined) => { const name = value?.trim().toLowerCase() ?? ''; if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error('Enter a table logical name, such as account.'); return name; };

export const NAVIGATION_ACTION_IDS = [
  'navigation:open-record-by-id','navigation:new-record','navigation:open-list','navigation:open-security','navigation:open-system-jobs','navigation:open-solutions','navigation:open-processes','navigation:open-mailboxes','navigation:open-main','navigation:open-advanced-find','navigation:open-mobile-client','navigation:open-solutions-history','navigation:pin-to-side-panel'
] as const;
export const CLASSIC_SOLUTION_ACTION_ID = 'navigation:open-classic-solution';

// Actions that open a tab are `newTab`: they run inside the click, before any await, so Edge never blocks the tab.
export const navigationActions: ActionDefinition[] = [
  def({ id: NAVIGATION_ACTION_IDS[0], label: 'Open by ID', description: 'Open a row by table logical name and GUID.', icon: 'search', execute: async (ctx, deps) => {
    const values = await deps.ui.prompt('Open Record by ID', [{ name: 'entity', label: 'Table logical name', value: ctx.entityName, placeholder: 'account' }, { name: 'id', label: 'Record ID', placeholder: '00000000-0000-0000-0000-000000000000' }], { ok: 'Open' }); if (!values) return;
    const entity = tableName(values.entity); const id = cleanGuid(values.id?.trim() ?? ''); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Enter the record ID as a GUID.');
    // As a dialog over this page; the dialog is not awaited (its promise only settles when it is closed).
    if (typeof ctx.xrm?.Navigation?.navigateTo === 'function') { void Promise.resolve(ctx.xrm.Navigation.navigateTo({ pageType: 'entityrecord', entityName: entity, entityId: id }, { target: 2, position: 1, width: { value: 80, unit: '%' } })).catch((error: unknown) => deps.ui.toast(error instanceof Error ? error.message : String(error), 'error')); return; } // Dynamics' dialog shows it
    openUrl(ctx, recordUrl(ctx, entity, id));
    return { message: 'Record opened' };
  }}),
  def({ id: NAVIGATION_ACTION_IDS[1], label: 'New Record', description: 'Open a new row form for a table.', icon: 'add', execute: async (ctx, deps) => {
    const values = await deps.ui.prompt('New Record', [{ name: 'entity', label: 'Table logical name', value: ctx.entityName, placeholder: 'account' }], { ok: 'Open form' }); if (!values) return; const entity = tableName(values.entity);
    if (typeof ctx.xrm?.Navigation?.openForm !== 'function') throw new Error('Opening a new record form is unavailable on this page.');
    void Promise.resolve(ctx.xrm.Navigation.openForm({ entityName: entity, openInNewWindow: true })).catch((error: unknown) => deps.ui.toast(error instanceof Error ? error.message : String(error), 'error'));
    return { message: 'New record form opened' };
  }}),
  def({ id: NAVIGATION_ACTION_IDS[2], label: 'Open List', description: 'Open a table list page.', icon: 'list', execute: async (ctx, deps) => {
    const values = await deps.ui.prompt('Open List', [{ name: 'entity', label: 'Table logical name', value: ctx.entityName, placeholder: 'account' }], { ok: 'Open list' }); if (!values) return;
    openUrl(ctx, listUrl(ctx, tableName(values.entity))); return { message: 'Table list opened' };
  }}),
  def({ id: NAVIGATION_ACTION_IDS[3], label: 'Security', description: 'Open users and security for the current environment.', icon: 'shield', newTab: true, execute: (ctx) => {
    const org = ctx.organizationId; const env = ctx.environmentId; const { admin } = cloudFor(ctx.clientUrl);
    openUrl(ctx, env && org ? `${admin}/manage/environments/${encodeURIComponent(org)}/${encodeURIComponent(env)}/users` : adminCenterUrl(ctx.clientUrl, env)); return { message: 'Security administration opened' };
  }}),
  def({ id: NAVIGATION_ACTION_IDS[4], label: 'System Jobs', description: 'Open system jobs.', icon: 'briefcase', newTab: true, execute: openList('asyncoperation', 'System jobs opened') }),
  def({ id: NAVIGATION_ACTION_IDS[5], label: 'Solutions', description: 'Open solutions in Power Apps Maker.', icon: 'box', newTab: true, execute: async (ctx, deps) => { await openWhenReady(ctx, deps.maker.solutions()); return { message: 'Solutions opened' }; }}),
  def({ id: NAVIGATION_ACTION_IDS[6], label: 'Processes', description: 'Open the processes table.', icon: 'process', newTab: true, execute: openList('workflow', 'Processes opened') }),
  def({ id: NAVIGATION_ACTION_IDS[7], label: 'Mailboxes', description: 'Open the mailboxes table.', icon: 'mail', newTab: true, execute: openList('mailbox', 'Mailboxes opened') }),
  def({ id: NAVIGATION_ACTION_IDS[8], label: 'Home', description: 'Open the current model-driven app home.', icon: 'home', newTab: true, execute: (ctx) => { const url = new URL(`${ctx.clientUrl}/main.aspx`); if (ctx.appId) url.searchParams.set('appid', ctx.appId); openUrl(ctx, url.toString()); return { message: 'Home opened' }; }}),
  def({ id: NAVIGATION_ACTION_IDS[9], label: 'Advanced Find', description: 'Open Advanced Find.', icon: 'filter', newTab: true, execute: ctx => { openUrl(ctx, `${ctx.clientUrl}/main.aspx?pagetype=advancedfind`); return { message: 'Advanced Find opened' }; }}),
  // The legacy mobile client (/nga) was retired; the app itself is responsive, so this previews it at phone size.
  def({ id: NAVIGATION_ACTION_IDS[10], label: 'Mobile', description: 'Open this page in a phone-sized window to check the mobile layout.', icon: 'mobile', newTab: true, execute: (ctx) => {
    let target: Window | null = null; try { target = ctx.sourceWindow.open(ctx.sourceWindow.location.href, '_blank', 'popup,width=420,height=860'); } catch { /* reported below */ }
    if (!target) throw new Error('Pop-up blocked: allow pop-ups for this site and try again.'); try { target.opener = null; } catch { /* isolated */ }
    return { message: 'Mobile-size window opened' };
  }}),
  def({ id: NAVIGATION_ACTION_IDS[11], label: 'Solutions History', description: 'Open solution import history.', icon: 'history', newTab: true, execute: async (ctx, deps) => { await openWhenReady(ctx, deps.maker.solutionHistory()); return { message: 'Solutions history opened' }; }}),
  def({ id: NAVIGATION_ACTION_IDS[12], label: 'Pin to Side Panel', description: 'Pin the current row or list to a model-driven side pane.', icon: 'pin', execute: async (ctx) => {
    const panes = ctx.xrm?.App?.sidePanes; if (!panes?.createPane) throw new Error('This client does not expose the side pane API.');
    const input = ctx.xrm?.Utility?.getPageContext?.()?.input as DynamicObject; if (!input?.pageType) throw new Error('The current page cannot be pinned.');
    // The whole page input (view, dashboard, custom page, web resource), not just the table: the pane shows this page.
    const page = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ''));
    const pane = await panes.createPane({ canClose: true, title: ctx.entityName ?? String(input.name ?? 'Pinned page') });
    try { await pane.navigate(page); } catch (error) { try { pane.close?.(); } catch { /* already gone */ } throw error; }
    return { message: 'Current page pinned to side panel' };
  }}),
  def({ id: CLASSIC_SOLUTION_ACTION_ID, label: 'Classic Solution', description: 'Open the complete Entities and Fields tree in the classic Default Solution editor.', icon: 'solutionTree', newTab: true, execute: ctx => { openUrl(ctx, classicSolutionUrl(ctx)); return { message: 'Classic Default Solution opened' }; }})
];
