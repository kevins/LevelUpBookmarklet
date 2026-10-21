import type { ColumnMetadata, DynamicsContext, TableMetadata } from './types';
import type { DateBehavior, DateColumn } from './dates';
import { DynamicsApi } from './dynamics-api';

const TABLE_SELECT = 'MetadataId,LogicalName,SchemaName,EntitySetName,ObjectTypeCode,PrimaryIdAttribute,PrimaryNameAttribute,DisplayName,DisplayCollectionName,OwnershipType,IsCustomEntity,IsActivity,IsActivityParty,IsAuditEnabled,IsCustomizable,IsManaged,IntroducedVersion,ChangeTrackingEnabled,EntityColor';
const COLUMN_SELECT = 'MetadataId,LogicalName,SchemaName,AttributeType,DisplayName,RequiredLevel,IsValidForCreate,IsValidForUpdate,IsValidForRead,AttributeOf,IsLogical,IsSecured,AttributeTypeName';
const literal = (value: string) => value.replace(/'/g, "''");

export function localizedLabel(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const label = value as Record<string, unknown>;
  const user = label.UserLocalizedLabel as Record<string, unknown> | undefined;
  if (typeof user?.Label === 'string') return user.Label;
  const list = label.LocalizedLabels as Record<string, unknown>[] | undefined;
  return typeof list?.[0]?.Label === 'string' ? String(list[0].Label) : '';
}

export class MetadataService {
  // Settled results, and requests still in flight: several tools asking for the same table at once share one request.
  private tables = new Map<string, Promise<TableMetadata>>();
  private columns = new Map<string, Promise<ColumnMetadata[]>>();
  private dates = new Map<string, Promise<Map<string, DateColumn>>>();
  private currentEnvironment = '';

  constructor(private api: DynamicsApi, private context: () => Promise<DynamicsContext>) {}

  private async key(entity: string): Promise<string> {
    const ctx = await this.context();
    const environment = ctx.clientUrl.toLowerCase();
    if (this.currentEnvironment && this.currentEnvironment !== environment) this.clear();
    this.currentEnvironment = environment;
    return `${environment}|${entity.toLowerCase()}`;
  }

  /** The cached promise, or a new request; a failed request is forgotten so the next call tries again. */
  private once<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
    const cached = cache.get(key); if (cached) return cached;
    const pending = load(); cache.set(key, pending); pending.catch(() => { if (cache.get(key) === pending) cache.delete(key); });
    return pending;
  }

  async getTable(entity: string): Promise<TableMetadata> {
    return this.once(this.tables, await this.key(entity), () => this.api.get<TableMetadata>(`EntityDefinitions(LogicalName='${literal(entity)}')?$select=${TABLE_SELECT}`));
  }

  async getColumns(entity: string): Promise<ColumnMetadata[]> {
    return this.once(this.columns, await this.key(entity), async () => (await this.api.get<{ value: ColumnMetadata[] }>(`EntityDefinitions(LogicalName='${literal(entity)}')/Attributes?$select=${COLUMN_SELECT}`)).value ?? []);
  }

  /** Each date column's behaviour (User Local, Date Only, Time-Zone Independent), so dates show as the form shows them. */
  async getDateColumns(entity: string): Promise<Map<string, DateColumn>> {
    return this.once(this.dates, await this.key(entity), async () => {
      const rows = (await this.api.get<{ value: { LogicalName: string; DateTimeBehavior?: { Value?: string } | null; Format?: string | null }[] }>(`EntityDefinitions(LogicalName='${literal(entity)}')/Attributes/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata?$select=LogicalName,DateTimeBehavior,Format`)).value ?? [];
      const behavior = (value: unknown): DateBehavior => value === 'DateOnly' || value === 'TimeZoneIndependent' ? value : 'UserLocal';
      return new Map(rows.map(row => [row.LogicalName, { behavior: behavior(row.DateTimeBehavior?.Value), dateOnly: row.Format === 'DateOnly' }]));
    });
  }

  clear(): void { this.tables.clear(); this.columns.clear(); this.dates.clear(); }
}
