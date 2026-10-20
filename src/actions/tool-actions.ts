import type { ActionDefinition, DynamicObject, InfoRow } from '../core/types';
import { collectionItems, connected } from '../core/xrm-helpers';
import { openFetchXmlRunner } from '../features/fetchxml';
import { clearUciCache, switchLanguage } from '../features/language-cache';

const def = (action: Omit<ActionDefinition, 'category' | 'availability'>): ActionDefinition => ({ ...action, category: 'tools', availability: connected });

export const TOOL_ACTION_IDS = ['tools:user-info','tools:execute-fetchxml','tools:switch-language','tools:clear-uci-cache'] as const;

export const toolActions: ActionDefinition[] = [
  def({ id: TOOL_ACTION_IDS[0], label: 'User Info', description: 'Inspect the current user, roles, teams and client context.', icon: 'user', execute: async (ctx, deps) => {
    const settings = ctx.global?.userSettings ?? {}; const roles = collectionItems<DynamicObject>(settings.roles ?? settings.securityRoles).map(role => `${role.name ?? ''}${role.id ? ` (${String(role.id).replace(/[{}]/g,'')})` : ''}`).filter(Boolean); const userId = String(settings.userId ?? '').replace(/[{}]/g,'');
    const basic: InfoRow[] = [
      { label: 'User ID', value: userId, copy: true }, { label: 'User Name', value: settings.userName, copy: true }, { label: 'Language ID', value: settings.languageId }, { label: 'Security Roles', value: roles.join('\n') || (settings.securityRoles ?? []).join('\n'), copy: true },
      { label: 'Client URL', value: ctx.clientUrl, copy: true }, { label: 'Environment ID', value: ctx.environmentId, copy: true }, { label: 'Organization ID', value: ctx.organizationId, copy: true }, { label: 'Organization', value: ctx.organizationUniqueName },
      { label: 'Client Type', value: ctx.global?.client?.getClient?.() }, { label: 'Client State', value: ctx.global?.client?.getClientState?.() }, { label: 'App ID', value: ctx.appId, copy: true }, { label: 'Default Dashboard ID', value: settings.defaultDashboardId, copy: true }
    ];
    let directory: InfoRow[] = [];
    try {
      const user = await deps.api.get<DynamicObject>(`systemusers(${userId})?$select=fullname,domainname,internalemailaddress,_businessunitid_value&$expand=systemuserroles_association($select=name,roleid),teammembership_association($select=name,teamid)`, true);
      directory = [
        { label: 'Full Name', value: user.fullname }, { label: 'Domain Name', value: user.domainname, copy: true }, { label: 'Email', value: user.internalemailaddress, copy: true }, { label: 'Business Unit', value: user['_businessunitid_value@OData.Community.Display.V1.FormattedValue'] ?? user._businessunitid_value },
        { label: 'Role Names', value: (user.systemuserroles_association ?? []).map((role: DynamicObject) => `${role.name} (${role.roleid})`).join('\n') }, { label: 'Teams', value: (user.teammembership_association ?? []).map((team: DynamicObject) => `${team.name} (${team.teamid})`).join('\n') }
      ];
    } catch (error) { directory = [{ label: 'Directory Details', value: `Not permitted or unavailable: ${error instanceof Error ? error.message : String(error)}` }]; }
    deps.ui.details('User Info', [{ title: 'Current User', rows: basic }, { title: 'Dataverse Directory', rows: directory }], [], { subtitle: [settings.userName, ctx.organizationUniqueName].filter(Boolean).join(' · ') || undefined });
  }}),
  def({ id: TOOL_ACTION_IDS[1], label: 'Execute FetchXML', description: 'Run FetchXML through the modern Dataverse Web API.', icon: 'fetch', execute: (ctx, deps) => { openFetchXmlRunner(ctx, deps); return { message: 'FetchXML runner opened', kind: 'info' }; }}),
  def({ id: TOOL_ACTION_IDS[2], label: 'Switch Language', description: 'Change your Dynamics language and show the page in it right away. With more than two languages, pick one.', icon: 'language', execute: switchLanguage }),
  def({ id: TOOL_ACTION_IDS[3], label: 'Clear UCI Cache', description: 'Show the labels and language Dynamics has now: clear every cache that holds them and reload this page.', icon: 'cache', execute: clearUciCache })
];
