import type { DynamicsApi } from './dynamics-api';
import type { DynamicsContext } from './types';

const clean = (value: unknown) => String(value ?? '').replace(/[{}]/g, '');

/**
 * The Power Platform environment id, resolved once per environment: from the page's organization settings, or by
 * asking Dataverse (RetrieveCurrentOrganization) when the page doesn't carry it. A failed lookup is retried next time.
 */
export function createEnvironmentResolver(api: DynamicsApi, context: () => Promise<DynamicsContext>) {
  const known = new Map<string, string>(); const pending = new Map<string, Promise<string>>();
  const lookup = async (clientUrl: string): Promise<string> => {
    const result = await api.get<Record<string, unknown>>("RetrieveCurrentOrganization(AccessType=@p1)?@p1=Microsoft.Dynamics.CRM.EndpointAccessType'Default'");
    const detail = result.Detail as Record<string, unknown> | undefined; const id = clean(result.EnvironmentId ?? detail?.EnvironmentId);
    if (!id) throw new Error('The Power Platform Environment ID could not be resolved.');
    known.set(clientUrl, id); return id;
  };
  return {
    async environmentId(): Promise<string> {
      const ctx = await context(); if (ctx.environmentId) { known.set(ctx.clientUrl, ctx.environmentId); return ctx.environmentId; }
      const cached = known.get(ctx.clientUrl); if (cached) return cached;
      let request = pending.get(ctx.clientUrl);
      if (!request) { request = lookup(ctx.clientUrl).catch(() => { throw new Error('The Power Platform Environment ID could not be resolved.'); }).finally(() => pending.delete(ctx.clientUrl)); pending.set(ctx.clientUrl, request); }
      return request;
    },
    /** Already known for this page, without waiting (links built inside a click). */
    peek(ctx: DynamicsContext): string | undefined { return ctx.environmentId || known.get(ctx.clientUrl); }
  };
}
