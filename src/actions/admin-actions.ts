import type { ActionDefinition } from '../core/types';
import { connected, recordAvailable } from '../core/xrm-helpers';
import { auditHistory } from '../features/audit-history';
import { pluginTraceLogs, recordAccess } from '../features/admin-inspection';
import { compareUserAccess } from '../features/compare-user-access';

export const ADMIN_ACTION_IDS = ['record:audit-history', 'record:access', 'debugging:plugin-trace-logs', 'record:compare-user-access'] as const;

// These tools inspect existing data only. None enables auditing/tracing or changes access.
export const adminActions: ActionDefinition[] = [
  { id: ADMIN_ACTION_IDS[0], label: 'Audit History', description: 'Search record history with who, when, and old/new field values.', category: 'form', icon: 'audit', availability: recordAvailable, execute: auditHistory },
  { id: ADMIN_ACTION_IDS[1], label: 'Record Access', description: 'Inspect your effective permissions on the current record.', category: 'form', icon: 'recordAccess', availability: recordAvailable, execute: recordAccess },
  { id: ADMIN_ACTION_IDS[2], label: 'Plugin Trace Logs', description: 'Open existing plug-in execution traces without enabling logging.', category: 'debugging', icon: 'trace', newTab: true, availability: connected, execute: pluginTraceLogs },
  { id: ADMIN_ACTION_IDS[3], label: 'Compare User Access', description: 'Compare two users’ record rights, role assignments, teams and field-security profile grants.', category: 'form', icon: 'compareAccess', availability: recordAvailable, execute: compareUserAccess }
];
