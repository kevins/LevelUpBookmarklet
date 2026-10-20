import type { ActionDefinition } from './types';
import { formActions } from '../actions/form-actions';
import { navigationActions } from '../actions/navigation-actions';
import { debuggingActions } from '../actions/debugging-actions';
import { powerPaneActions } from '../actions/power-pane-actions';
import { recordActions } from '../actions/record-actions';
import { toolActions } from '../actions/tool-actions';
import { adminActions } from '../actions/admin-actions';

export class ActionRegistry {
  private actions = new Map<string, ActionDefinition>();

  constructor(definitions: ActionDefinition[] = [...recordActions, ...formActions, ...powerPaneActions, ...navigationActions, ...debuggingActions, ...toolActions, ...adminActions]) {
    for (const action of definitions) {
      if (this.actions.has(action.id)) throw new Error(`Duplicate action ID: ${action.id}`);
      this.actions.set(action.id, action);
    }
  }

  all(): ActionDefinition[] { return [...this.actions.values()]; }
  get(id: string): ActionDefinition | undefined { return this.actions.get(id); }
  ids(): string[] { return [...this.actions.keys()]; }
  category(category: ActionDefinition['category']): ActionDefinition[] { return this.all().filter(action => action.category === category); }
}
