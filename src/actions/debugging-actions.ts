import type { ActionDefinition, DynamicsContext } from '../core/types';
import { connected, openUrl } from '../core/xrm-helpers';
import { clearDebugFlags, setDebugFlag } from '../core/url-service';

const def = (action: Omit<ActionDefinition, 'category' | 'availability'>): ActionDefinition => ({ ...action, category: 'debugging', availability: connected });
const reloadWith = (name: string, value: string) => (ctx: DynamicsContext) => { const location = ctx.sourceWindow.location, next = setDebugFlag(location.href, name, value); if (next === location.href) return { message: 'This debug flag is already enabled', kind: 'info' as const }; location.assign(next); };

export const DEBUGGING_ACTION_IDS = ['debugging:forms-monitor','debugging:ribbon-debugger','debugging:perf-center','debugging:disable-form-handlers','debugging:disable-business-rules','debugging:disable-form-libraries','debugging:enable-dark-mode','debugging:clear-flags'] as const;
export const ACCESS_CHECKER_ACTION_ID = 'debugging:access-checker';

export const debuggingActions: ActionDefinition[] = [
  def({ id: DEBUGGING_ACTION_IDS[0], label: 'Forms Monitor', description: 'Reload with the form monitor enabled.', icon: 'monitor', execute: reloadWith('monitor','true') }),
  def({ id: DEBUGGING_ACTION_IDS[1], label: 'Command Checker', description: 'Reload with ribbon command debugging enabled.', icon: 'bug', execute: reloadWith('ribbondebug','true') }),
  def({ id: DEBUGGING_ACTION_IDS[2], label: 'Perf Center', description: 'Reload with the performance center enabled.', icon: 'speed', execute: reloadWith('perf','true') }),
  def({ id: DEBUGGING_ACTION_IDS[3], label: 'Disable Form Handlers', description: 'Reload with form handlers disabled.', icon: 'ban', execute: reloadWith('flags','DisableFormHandlers=true') }),
  def({ id: DEBUGGING_ACTION_IDS[4], label: 'Disable Business Rules', description: 'Reload with business-rule handlers disabled.', icon: 'ruleOff', execute: reloadWith('flags','DisableFormHandlers=businessrule') }),
  def({ id: DEBUGGING_ACTION_IDS[5], label: 'Disable Form Libraries', description: 'Reload with form libraries disabled.', icon: 'code', execute: reloadWith('flags','DisableFormLibraries=true') }),
  def({ id: DEBUGGING_ACTION_IDS[6], label: 'Enable Dark Mode', description: 'Reload Dynamics with its dark-mode flag.', icon: 'moon', execute: reloadWith('flags','themeOption=darkmode') }),
  def({ id: DEBUGGING_ACTION_IDS[7], label: 'Clear Flags', description: 'Remove only LevelUp-related debug flags and reload.', icon: 'flag', execute: ctx => { const location = ctx.sourceWindow.location, next = clearDebugFlags(location.href); if (next === location.href) return { message: 'No LevelUp debug flags were present', kind: 'info' }; location.assign(next); } }),
  def({ id: ACCESS_CHECKER_ACTION_ID, label: 'App Access Checker', description: 'Open the Microsoft app access checker for this environment.', icon: 'access', newTab: true, execute: ctx => { openUrl(ctx, `${ctx.clientUrl}/WebResources/msdyn_AppAccessChecker.html`); return { message: 'App access checker opened' }; } })
];
