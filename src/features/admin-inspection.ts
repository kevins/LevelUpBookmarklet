import type { ActionDependencies, DynamicsContext, InfoRow } from '../core/types';
import { DynamicsApiError } from '../core/dynamics-api';
import { recordUrl } from '../core/url-service';
import { openUrl } from '../core/xrm-helpers';

function guid(value: unknown): string {
  const text = typeof value === 'string' ? value.replace(/^\{([^{}]+)\}$/, '$1') : '';
  return /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(text) ? text : '';
}

const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-z_][a-z\d_]*$/i.test(value);

/** Inspect the signed-in user's effective row access; never grants or changes access. */
export async function recordAccess(ctx: DynamicsContext, deps: ActionDependencies): Promise<void> {
  const recordId = guid(ctx.entityId);
  if (!ctx.clientUrl || !ctx.isForm || !recordId || !identifier(ctx.entityName)) throw new Error('Open a saved record to inspect its access rights.');
  try {
    const settings = ctx.global?.userSettings;
    const userId = guid(settings?.userId) || guid((await deps.api.request<{ UserId: string }>('WhoAmI', { cache: 'no-store' })).UserId);
    if (!userId) throw new Error('The current user could not be identified.');
    const table = await deps.metadata.getTable(ctx.entityName);
    if (!identifier(table.EntitySetName)) throw new Error('The table entity set could not be resolved.');
    // This is a documented bound function, not a POST action. Parameter-alias JSON
    // avoids guessing plural table names and keeps its target separate from the URI.
    const target = encodeURIComponent(JSON.stringify({ '@odata.id': `${table.EntitySetName}(${recordId})` }));
    const result = await deps.api.request<{ AccessRights: string }>(`systemusers(${userId})/Microsoft.Dynamics.CRM.RetrievePrincipalAccess(Target=@p1)?@p1=${target}`, { cache: 'no-store' });
    if (typeof result?.AccessRights !== 'string' || !result.AccessRights.trim()) throw new Error('Dataverse did not return an access-rights result.');
    const rights = new Set(result.AccessRights.split(',').map(value => value.trim()));
    const rightsRows: InfoRow[] = [
      ['ReadAccess', 'Read'], ['WriteAccess', 'Write'], ['AppendAccess', 'Append'], ['AppendToAccess', 'Append To'],
      ['DeleteAccess', 'Delete'], ['ShareAccess', 'Share'], ['AssignAccess', 'Assign']
    ].map(([right, label]) => ({ label: label!, value: rights.has(right!) ? 'Yes' : 'No' }));
    deps.ui.details('Record Access', [
      { title: 'Current User and Record', rows: [
        { label: 'Current User', value: settings?.userName || userId, copy: true },
        { label: 'User ID', value: userId, copy: true }, { label: 'Table', value: ctx.entityName, copy: true },
        { label: 'Record ID', value: recordId, copy: true }, { label: 'Record URL', value: recordUrl(ctx), href: recordUrl(ctx), copy: true }
      ] },
      { title: 'Effective Record Rights', rows: [
        ...rightsRows, { label: 'Returned Rights', value: result.AccessRights, copy: true },
        { label: 'Scope', value: 'This checks this record only. Field security, create privileges, business rules, and plug-ins can impose additional restrictions.' }
      ] }
    ], [], { subtitle: `${ctx.entityName} · ${recordId}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if ((error instanceof DynamicsApiError && [401, 403].includes(error.status)) || /privilege|access.denied|permission/i.test(message)) {
      throw new Error(`Dataverse did not permit this access check. Ask an administrator to verify your access to this record and security information. ${message}`);
    }
    throw new Error(`Record access could not be checked: ${message}`);
  }
}

/** Open existing trace records; this does not enable tracing or change its settings. */
export function pluginTraceLogs(ctx: DynamicsContext): void {
  if (!ctx.clientUrl) throw new Error('A supported Dynamics context is required.');
  const url = new URL(`${ctx.clientUrl.replace(/\/$/, '')}/main.aspx`);
  if (!/^https?:$/.test(url.protocol)) throw new Error('A supported Dynamics URL is required.');
  url.searchParams.set('pagetype', 'entitylist');
  url.searchParams.set('etn', 'plugintracelog');
  // No app restriction: administrator tables need not be included in the current app.
  openUrl(ctx, url.toString());
}
