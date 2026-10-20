import type { ActionDefinition, DynamicObject, InfoRow } from '../core/types';
import { available, openUrl, recordAvailable } from '../core/xrm-helpers';
import { localizedLabel } from '../core/metadata-service';
import { recordUrl } from '../core/url-service';
import { openWhenReady } from '../core/popup';

const def = (action: Omit<ActionDefinition, 'category'>): ActionDefinition => ({ ...action, category: 'form' });
const yesNo = (value: unknown) => value == null ? '' : (typeof value === 'object' && value ? (value as Record<string, unknown>).Value ?? value : value) ? 'Yes' : 'No';

export const RECORD_ACTION_IDS = ['record:entity-info','record:record-properties'] as const;

export const recordActions: ActionDefinition[] = [
  def({ id: RECORD_ACTION_IDS[0], label: 'Entity Info', description: 'Inspect detailed metadata for the current table.', icon: 'info', availability: ctx => ctx.xrm && ctx.entityName ? available() : ({ available: false, reason: 'Available when Dynamics table context can be identified.' }), execute: async (ctx, deps) => {
    const table = await deps.metadata.getTable(ctx.entityName!); const solution = await deps.solutions.get();
    const rows: InfoRow[] = [
      { label: 'Display Name', value: localizedLabel(table.DisplayName), copy: true }, { label: 'Plural Display Name', value: localizedLabel(table.DisplayCollectionName), copy: true },
      { label: 'Logical Name', value: table.LogicalName, copy: true }, { label: 'Schema Name', value: table.SchemaName, copy: true }, { label: 'Entity Set Name', value: table.EntitySetName, copy: true },
      { label: 'Metadata ID', value: table.MetadataId, copy: true }, { label: 'Object Type Code', value: table.ObjectTypeCode }, { label: 'Primary ID Attribute', value: table.PrimaryIdAttribute, copy: true }, { label: 'Primary Name Attribute', value: table.PrimaryNameAttribute, copy: true },
      { label: 'Ownership Type', value: table.OwnershipType }, { label: 'Custom Table', value: yesNo(table.IsCustomEntity) }, { label: 'Activity', value: yesNo(table.IsActivity) }, { label: 'Activity Party', value: yesNo(table.IsActivityParty) },
      { label: 'Audit Enabled', value: yesNo(table.IsAuditEnabled) }, { label: 'Customizable', value: yesNo(table.IsCustomizable) }, { label: 'Managed', value: yesNo(table.IsManaged) }, { label: 'Introduced Version', value: table.IntroducedVersion }, { label: 'Change Tracking', value: yesNo(table.ChangeTrackingEnabled) }, { label: 'Table Color', value: table.EntityColor }
    ];
    const contextRows: InfoRow[] = [
      { label: 'Organization URL', value: ctx.clientUrl, copy: true }, { label: 'Environment ID', value: ctx.environmentId, copy: true }, { label: 'Organization ID', value: ctx.organizationId, copy: true },
      { label: 'Form ID', value: ctx.formId, copy: true }, { label: 'App ID', value: ctx.appId, copy: true }, { label: 'Record ID', value: ctx.entityId, copy: true }
    ];
    deps.ui.details('Entity Info', [{ title: 'Table Metadata', rows }, { title: 'Current Context', rows: contextRows }], [
      { label: 'Open Table in Maker', kind: 'primary', onClick: () => openWhenReady(ctx, deps.maker.table(table.MetadataId, solution.solutionId)) },
      { label: 'Open Columns in Maker', onClick: () => openWhenReady(ctx, deps.maker.tableColumns(table.MetadataId, solution.solutionId)) }
    ], { subtitle: `${table.LogicalName} · ${table.EntitySetName}` }); // every value has its own Copy button; the dialog is the result
  }}),
  def({ id: RECORD_ACTION_IDS[1], label: 'Record Properties', description: 'Inspect current-row system properties and raw Web API data.', icon: 'record', availability: recordAvailable, execute: async (ctx, deps) => {
    const table = await deps.metadata.getTable(ctx.entityName!); const apiUrl = `${ctx.clientUrl}/api/data/v9.2/${table.EntitySetName}(${ctx.entityId})`; const row = await deps.api.get<DynamicObject>(`${table.EntitySetName}(${ctx.entityId})`, true); const formatted = (name: string) => row[`${name}@OData.Community.Display.V1.FormattedValue`];
    const lookupRow = (label: string, name: string): InfoRow => {
      const key = `_${name}_value`; const id = String(row[key] ?? '').replace(/[{}]/g, ''); const entity = String(row[`${key}@Microsoft.Dynamics.CRM.lookuplogicalname`] ?? '');
      return { label, value: formatted(key) ?? id, ...(id && entity ? { href: recordUrl(ctx, entity, id) } : {}) };
    };
    const rows: InfoRow[] = [
      { label: 'Record ID', value: ctx.entityId, copy: true }, { label: 'Table Logical Name', value: table.LogicalName, copy: true }, { label: 'Table Display Name', value: localizedLabel(table.DisplayName) }, { label: 'Primary Name', value: table.PrimaryNameAttribute ? row[table.PrimaryNameAttribute] : '' },
      { label: 'Record URL', value: recordUrl(ctx), copy: true }, { label: 'Web API URL', value: apiUrl, copy: true }, { label: 'State', value: `${row.statecode ?? ''} ${formatted('statecode') ?? ''}`.trim() }, { label: 'Status', value: `${row.statuscode ?? ''} ${formatted('statuscode') ?? ''}`.trim() },
      { label: 'Created On', value: row.createdon }, lookupRow('Created By', 'createdby'), { label: 'Modified On', value: row.modifiedon }, lookupRow('Modified By', 'modifiedby'), lookupRow('Owner', 'ownerid'),
      lookupRow('Owning Business Unit', 'owningbusinessunit'), lookupRow('Owning User', 'owninguser'), lookupRow('Owning Team', 'owningteam'), { label: 'Version', value: row.versionnumber ?? row['@odata.etag'] },
      { label: 'Form ID', value: ctx.formId }, { label: 'App ID', value: ctx.appId }, { label: 'Raw Web API Payload', value: JSON.stringify(row, null, 2), copy: true }
    ];
    deps.ui.details('Record Properties', [{ rows }], [
      { label: 'Open Web API', kind: 'primary', onClick: () => openUrl(ctx, apiUrl) }, { label: 'Open Record', onClick: () => openUrl(ctx, recordUrl(ctx)) },
      { label: 'Legacy Properties', onClick: () => openUrl(ctx, `${ctx.clientUrl}/_forms/properties/properties.aspx?dType=1&id=${encodeURIComponent(ctx.entityId!)}&objTypeCode=${encodeURIComponent(String(table.ObjectTypeCode ?? ''))}`) }
    ], { subtitle: `${table.LogicalName} · ${ctx.entityId}` });
  }})
];
