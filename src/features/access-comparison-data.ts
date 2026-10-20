import type { ActionDependencies, DynamicsContext } from '../core/types';
import { localizedLabel } from '../core/metadata-service';

export interface AccessUser { id: string; fullName: string; domainName: string; businessUnit: string; disabled: boolean; accessMode: string }
export interface AccessResult<T> { value?: T; error?: string; partial?: boolean }
export interface AccessRole { id: string; name: string; businessUnit: string; via: string; /** The team it comes through. */ teamId?: string }
export interface AccessTeam { id: string; name: string; businessUnit: string }
export interface FieldAccessRow { name: string; label: string; read: string; update: string; create: string }
export interface AccessProfile { id: string; name: string }
export interface UserAccess {
  user: AccessUser;
  rights: AccessResult<string[]>;
  roles: AccessResult<AccessRole[]>;
  teams: AccessResult<AccessTeam[]>;
  fieldProfiles: AccessResult<AccessProfile[]>;
  fields: AccessResult<FieldAccessRow[]>;
}

type Row = Record<string, unknown>;
type Collection = { value: Row[]; '@odata.nextLink'?: unknown };
const MAX_ROWS = 2_000;
const MAX_PAGES = 10;
const USER_SELECT = 'systemuserid,fullname,domainname,isdisabled,accessmode,_businessunitid_value';
const ROLE_SELECT = 'roleid,name,_parentrootroleid_value,_businessunitid_value';
const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const MODES = ['Read-Write', 'Administrative', 'Read', 'Support User', 'Non-interactive', 'Delegated Admin'];
const RIGHTS = new Set(['None', 'ReadAccess', 'WriteAccess', 'AppendAccess', 'AppendToAccess', 'CreateAccess', 'DeleteAccess', 'ShareAccess', 'AssignAccess']);

/** A record ID, or undefined (never throws): for links that are nice to have. */
function optionalGuid(value: unknown): string | undefined { try { return guid(value); } catch { return undefined; } }

function guid(value: unknown): string {
  const text = typeof value === 'string' ? value.replace(/^\{([^{}]+)\}$/, '$1') : '';
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(text)) throw new Error('A valid user or record ID is required.');
  return text.toLowerCase();
}
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-z_][a-z\d_]*$/i.test(value);
const literal = (value: string): string => `'${value.replace(/'/g, "''")}'`;
const xml = (value: string): string => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);
const businessUnit = (row: Row): string => text(row[`_businessunitid_value${FORMATTED}`]) || text(row[`businessunitid${FORMATTED}`]) || text(row._businessunitid_value) || text(row.businessunitid) || 'Not returned';

function cancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Access comparison cancelled.', 'AbortError');
}

async function read<T>(deps: ActionDependencies, path: string, signal: AbortSignal): Promise<T> {
  cancelled(signal);
  try {
    const value = await deps.api.request<T>(path, { method: 'GET', cache: 'no-store', signal, headers: { Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"' } });
    cancelled(signal);
    return value;
  } catch (error) { cancelled(signal); throw error; }
}

/** Only follow service-generated pagination inside this environment's Web API root. */
function nextPage(value: unknown, ctx: DynamicsContext): string {
  if (typeof value !== 'string' || !value) throw new Error('Dataverse returned an invalid continuation link.');
  const root = new URL(`${ctx.clientUrl.replace(/\/$/, '')}/api/data/v9.2/`);
  const url = new URL(value, root);
  if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname) || url.username || url.password || url.hash) throw new Error('Dataverse returned an unsafe continuation link.');
  return url.href;
}

async function collection(deps: ActionDependencies, ctx: DynamicsContext, path: string, signal: AbortSignal): Promise<AccessResult<Row[]>> {
  const rows: Row[] = [];
  const seen = new Set<string>();
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      if (seen.has(path)) throw new Error('Dataverse repeated a continuation link.');
      seen.add(path);
      const result = await read<Collection>(deps, path, signal);
      if (!result || !Array.isArray(result.value) || result.value.some(row => !row || typeof row !== 'object')) throw new Error('Dataverse did not return a valid collection.');
      const overflow = result.value.length > MAX_ROWS - rows.length;
      rows.push(...result.value.slice(0, MAX_ROWS - rows.length));
      if (!result['@odata.nextLink']) return { value: rows, ...(overflow ? { partial: true, error: `Results limited to ${MAX_ROWS.toLocaleString()} rows.` } : {}) };
      if (rows.length >= MAX_ROWS || page === MAX_PAGES - 1) return { value: rows, partial: true, error: `Results limited to ${MAX_ROWS.toLocaleString()} rows or ${MAX_PAGES} pages.` };
      path = nextPage(result['@odata.nextLink'], ctx);
    }
    return { value: rows };
  } catch (error) {
    cancelled(signal);
    return { ...(rows.length ? { value: rows, partial: true } : {}), error: message(error) };
  }
}

function mapResult<T>(result: AccessResult<Row[]>, convert: (row: Row) => T): AccessResult<T[]> {
  if (!result.value) return { error: result.error, partial: result.partial };
  const value: T[] = [];
  const errors = result.error ? [result.error] : [];
  for (const row of result.value) {
    try { value.push(convert(row)); } catch (error) { errors.push(message(error)); }
  }
  return { value, ...(result.partial ? { partial: true } : {}), ...(errors.length ? { error: [...new Set(errors)].join(' '), partial: true } : {}) };
}

function user(row: Row): AccessUser {
  return {
    id: guid(row.systemuserid), fullName: text(row.fullname) || '(Unnamed user)', domainName: text(row.domainname),
    businessUnit: businessUnit(row), disabled: row.isdisabled === true,
    accessMode: text(row[`accessmode${FORMATTED}`]) || MODES[Number(row.accessmode)] || 'Not returned'
  };
}

export async function searchAccessUsers(deps: ActionDependencies, term: string, signal: AbortSignal): Promise<{ users: AccessUser[]; more: boolean }> {
  const value = term.trim();
  if (value.length < 2) return { users: [], more: false };
  if (value.length > 200) throw new Error('Search must be 200 characters or fewer.');
  const filter = encodeURIComponent(`contains(fullname,${literal(value)}) or contains(domainname,${literal(value)})`);
  const result = await read<Collection>(deps, `systemusers?$select=${USER_SELECT}&$filter=${filter}&$orderby=fullname,systemuserid&$top=26`, signal);
  if (!result || !Array.isArray(result.value)) throw new Error('Dataverse did not return a user list.');
  return { users: result.value.slice(0, 25).map(user), more: result.value.length > 25 || Boolean(result['@odata.nextLink']) };
}

export async function getAccessUser(deps: ActionDependencies, id: string, signal: AbortSignal): Promise<AccessUser> {
  return user(await read<Row>(deps, `systemusers(${guid(id)})?$select=${USER_SELECT}`, signal));
}

function merged<T>(left: AccessResult<T[]>, right: AccessResult<T[]>, key: (value: T) => string): AccessResult<T[]> {
  const errors = [left.error, right.error].filter(Boolean);
  const values = left.value || right.value ? [...new Map([...(left.value ?? []), ...(right.value ?? [])].map(value => [key(value), value])).values()] : undefined;
  return { ...(values ? { value: values } : {}), ...(errors.length ? { error: errors.join(' '), ...(values ? { partial: true } : {}) } : {}), ...(left.partial || right.partial ? { partial: true } : {}) };
}

/** Documented N:N links: teamroles/teamprofiles -> team -> teammembership. */
function fromTeams(entity: 'role' | 'fieldsecurityprofile', userId: string): string {
  const role = entity === 'role';
  const attributes = role ? '<attribute name="roleid"/><attribute name="name"/><attribute name="parentrootroleid"/><attribute name="businessunitid"/>' : '<attribute name="fieldsecurityprofileid"/><attribute name="name"/>';
  const link = role ? 'teamroles' : 'teamprofiles';
  const foreign = role ? 'roleid' : 'fieldsecurityprofileid';
  return `<fetch top="${MAX_ROWS}"><entity name="${entity}">${attributes}<link-entity name="${link}" from="${foreign}" to="${foreign}" intersect="true"><link-entity name="team" from="teamid" to="teamid" alias="access_team"><attribute name="name"/><attribute name="teamid"/><link-entity name="teammembership" from="teamid" to="teamid" intersect="true"><filter><condition attribute="systemuserid" operator="eq" value="${xml(userId)}"/></filter></link-entity></link-entity></link-entity></entity></fetch>`;
}

async function fetchRows(deps: ActionDependencies, ctx: DynamicsContext, entitySet: string, fetch: string, signal: AbortSignal): Promise<AccessResult<Row[]>> {
  const result = await collection(deps, ctx, `${entitySet}?fetchXml=${encodeURIComponent(fetch)}`, signal);
  if (result.value && result.value.length >= MAX_ROWS) return { ...result, partial: true, error: result.error || `Results limited to ${MAX_ROWS.toLocaleString()} rows.` };
  return result;
}

async function memberships(ctx: DynamicsContext, deps: ActionDependencies, selected: AccessUser, signal: AbortSignal) {
  const id = guid(selected.id);
  const base = `systemusers(${id})`;
  const [directRoles, teamRoles, teams, directProfiles, teamProfiles] = await Promise.all([
    collection(deps, ctx, `${base}/systemuserroles_association?$select=${ROLE_SELECT}`, signal),
    fetchRows(deps, ctx, 'roles', fromTeams('role', id), signal),
    collection(deps, ctx, `${base}/teammembership_association?$select=teamid,name,_businessunitid_value`, signal),
    collection(deps, ctx, `${base}/systemuserprofiles_association?$select=fieldsecurityprofileid,name`, signal),
    fetchRows(deps, ctx, 'fieldsecurityprofiles', fromTeams('fieldsecurityprofile', id), signal)
  ]);
  const role = (row: Row, via: string, teamId?: string): AccessRole => ({ id: guid(row._parentrootroleid_value || row.parentrootroleid || row.roleid), name: text(row.name) || '(Unnamed role)', businessUnit: businessUnit(row), via, ...(teamId ? { teamId } : {}) });
  const profile = (row: Row): AccessProfile => ({ id: guid(row.fieldsecurityprofileid), name: text(row.name) || '(Unnamed profile)' });
  return {
    roles: merged(mapResult(directRoles, row => role(row, 'Direct')), mapResult(teamRoles, row => role(row, `Team: ${text(row['access_team.name']) || '(Unnamed team)'}`, optionalGuid(row['access_team.teamid']))), row => `${row.id}|${row.businessUnit}|${row.via}`),
    teams: mapResult(teams, row => ({ id: guid(row.teamid), name: text(row.name) || '(Unnamed team)', businessUnit: businessUnit(row) })),
    fieldProfiles: merged(mapResult(directProfiles, profile), mapResult(teamProfiles, profile), row => row.id)
  };
}

async function rowRights(ctx: DynamicsContext, deps: ActionDependencies, selected: AccessUser, entitySet: string, signal: AbortSignal): Promise<AccessResult<string[]>> {
  try {
    const target = encodeURIComponent(JSON.stringify({ '@odata.id': `${entitySet}(${guid(ctx.entityId)})` }));
    const result = await read<{ AccessRights: string }>(deps, `systemusers(${guid(selected.id)})/Microsoft.Dynamics.CRM.RetrievePrincipalAccess(Target=@p1)?@p1=${target}`, signal);
    if (typeof result?.AccessRights !== 'string' || !result.AccessRights.trim()) throw new Error('Dataverse did not return a record-access result.');
    const values = result.AccessRights.split(',').map(value => value.trim());
    if (values.some(value => !RIGHTS.has(value))) throw new Error('Dataverse returned an unrecognized record-access result.');
    return { value: values.filter(value => value !== 'None') };
  } catch (error) { cancelled(signal); return { error: message(error) }; }
}

/** These are profile grants only, not an effective field-security verdict. */
async function fieldGrants(ctx: DynamicsContext, deps: ActionDependencies, profiles: AccessResult<AccessProfile[]>, columns: AccessResult<Row[]>, objectTypeCode: number | undefined, signal: AbortSignal): Promise<AccessResult<FieldAccessRow[]>> {
  if (!columns.value) return { error: columns.error || 'Secured columns could not be loaded.' };
  if (columns.value.some(column => !identifier(column.LogicalName))) return { error: 'Dataverse returned invalid secured-column metadata.' };
  if (!columns.value.length && !columns.error && !columns.partial) return { value: [] };
  if (!profiles.value) return { error: profiles.error || 'Field-security profile memberships could not be loaded.' };
  // Keep this GET comfortably below Dataverse's URL limit. Larger memberships
  // remain explicit partial evidence rather than an unbounded set of requests.
  const ids = profiles.value.slice(0, 100).map(value => value.id);
  // EntityName columns are stored as integer table type codes in FetchXML.
  // Resolve the code from metadata; logical names fail this particular filter.
  if (ids.length && (typeof objectTypeCode !== 'number' || !Number.isInteger(objectTypeCode) || objectTypeCode <= 0 || objectTypeCode > 2_147_483_647)) return { error: 'The table type code was not returned by metadata; field-profile grants could not be checked.' };
  const permissions: AccessResult<Row[]> = ids.length ? await fetchRows(deps, ctx, 'fieldpermissions', `<fetch top="${MAX_ROWS}"><entity name="fieldpermission"><attribute name="attributelogicalname"/><attribute name="canread"/><attribute name="canupdate"/><attribute name="cancreate"/><filter><condition attribute="entityname" operator="eq" value="${objectTypeCode}"/><condition attribute="fieldsecurityprofileid" operator="in">${ids.map(id => `<value>${xml(id)}</value>`).join('')}</condition></filter></entity></fetch>`, signal) : { value: [] };
  const omitted = profiles.value.length > ids.length;
  const incomplete = Boolean(omitted || profiles.error || profiles.partial || permissions.error || permissions.partial || columns.error || columns.partial);
  const permissionMap = new Map<string, Row[]>();
  for (const row of permissions.value ?? []) {
    const name = text(row.attributelogicalname);
    permissionMap.set(name, [...(permissionMap.get(name) ?? []), row]);
  }
  const grant = (rows: Row[], property: string): string => rows.some(row => row[property] === 4) ? 'Profile grant' : incomplete || rows.some(row => row[property] !== 0) ? 'Unknown' : 'No profile grant';
  const value = columns.value.map(column => {
    const name = text(column.LogicalName);
    const rows = permissionMap.get(name) ?? [];
    return { name, label: localizedLabel(column.DisplayName) || name, read: grant(rows, 'canread'), update: grant(rows, 'canupdate'), create: grant(rows, 'cancreate') };
  }).sort((a, b) => a.label.localeCompare(b.label));
  return { value, ...(incomplete ? { partial: true, error: [profiles.error, columns.error, permissions.error, omitted ? 'Field grants limited to the first 100 profiles.' : ''].filter(Boolean).join(' ') || 'Some field-security information is incomplete.' } : {}) };
}

export async function compareAccessUsers(ctx: DynamicsContext, deps: ActionDependencies, left: AccessUser, right: AccessUser, signal: AbortSignal): Promise<[UserAccess, UserAccess]> {
  cancelled(signal);
  guid(left.id); guid(right.id); guid(ctx.entityId);
  if (!ctx.isForm || !identifier(ctx.entityName)) throw new Error('Open a saved record to compare access.');
  const table = await deps.metadata.getTable(ctx.entityName);
  cancelled(signal);
  if (!identifier(table.EntitySetName)) throw new Error('The table entity set could not be resolved.');
  const columns = collection(deps, ctx, `EntityDefinitions(LogicalName='${ctx.entityName}')/Attributes?$select=LogicalName,DisplayName&$filter=IsSecured%20eq%20true`, signal);
  const inspect = async (selected: AccessUser): Promise<UserAccess> => {
    const [members, rights, securedColumns] = await Promise.all([memberships(ctx, deps, selected, signal), rowRights(ctx, deps, selected, table.EntitySetName, signal), columns]);
    const fields = await fieldGrants(ctx, deps, members.fieldProfiles, securedColumns, table.ObjectTypeCode, signal);
    cancelled(signal);
    return { user: selected, rights, ...members, fields };
  };
  return Promise.all([inspect(left), inspect(right)]);
}
