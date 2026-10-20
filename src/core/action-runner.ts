import type { ActionDependencies, DynamicsContext, UiBridge } from './types';
import { ActionRegistry } from './action-registry';

type DialogUi = UiBridge & { readonly serial?: number; readonly hasDialog?: boolean };

/**
 * The UI an action run sees. A run that fetches first and opens its dialog afterwards must not replace a dialog the
 * user opened in the meantime, nor show the previous page's data after navigation: once the run is stale, its dialogs
 * are dropped (prompts answer null, confirms false). Toasts always show.
 */
type RunUi = UiBridge & { /** The dialog this run opened is still the open one. */ ownsOpenDialog(): boolean };

function scopedUi(ui: DialogUi, stale: () => boolean): RunUi {
  const start = ui.serial ?? 0; let own = start;
  const guard = <T>(fallback: T, open: () => T): T => { if (stale() || ((ui.serial ?? 0) !== own && ui.hasDialog !== false)) return fallback; const result = open(); own = ui.serial ?? 0; return result; };
  return {
    toast: (message, kind) => ui.toast(message, kind),
    prompt: (title, fields, options) => guard(Promise.resolve(null), () => ui.prompt(title, fields, options)),
    confirm: (title, message, options) => guard(Promise.resolve(false), () => ui.confirm(title, message, options)),
    details: (title, sections, buttons, options) => guard(undefined, () => ui.details(title, sections, buttons, options)),
    table: (title, columns, rows, searchable, options) => guard(undefined, () => ui.table(title, columns, rows, searchable, options)),
    tableGroup: (title, tables, searchable, options) => guard(undefined, () => ui.tableGroup(title, tables, searchable, options)),
    dialog: (title, setup, options) => guard(undefined, () => ui.dialog(title, setup, options)),
    ownsOpenDialog: () => ui.hasDialog === true && own !== start && (ui.serial ?? 0) === own
  };
}

export class ActionRunner {
  private running = new Set<string>();
  private generation = 0;
  private controllers = new Set<AbortController>();
  constructor(private registry: ActionRegistry, private deps: ActionDependencies) {}

  /** The page navigated (or the panel closed for good): runs still in flight drop their dialogs and abort their requests. */
  cancelAll(): void { this.generation++; this.controllers.forEach(controller => controller.abort()); this.controllers.clear(); }

  async run(id: string, immediate?: DynamicsContext): Promise<void> {
    const action = this.registry.get(id); if (!action) throw new Error(`Unknown action: ${id}`);
    if (this.running.has(id)) { this.deps.ui.toast(`${action.label} is still running…`, 'info'); return; }
    this.running.add(id);
    const generation = this.generation, controller = new AbortController(); this.controllers.add(controller);
    const isCurrent = () => generation === this.generation && !controller.signal.aborted;
    const api = typeof this.deps.api?.withSignal === 'function' ? this.deps.api.withSignal(controller.signal) : this.deps.api;
    const ui = scopedUi(this.deps.ui, () => !isCurrent());
    const deps: ActionDependencies = { ...this.deps, ui, api, signal: controller.signal, isCurrent };
    try {
      const ctx = immediate ?? await this.deps.context.resolve(); const availability = action.availability(ctx); if (!availability.available) { this.deps.ui.toast(availability.reason ?? 'This action is unavailable.', 'warning'); return; }
      const result = await action.execute(ctx, deps); this.deps.storage.addRecent(id);
      // The dialog this run opened already shows the result: only a warning or error is worth a message on top.
      const kind = result?.kind ?? 'success', quiet = ui.ownsOpenDialog() && (kind === 'success' || kind === 'info');
      if (result?.message && isCurrent() && !quiet) this.deps.ui.toast(result.message, kind);
    } catch (error) {
      if (!isCurrent()) return; // navigated away: its abort or late failure is not news
      const message = error instanceof Error ? error.message : String(error); this.deps.ui.toast(message, 'error');
      if (this.deps.storage.get().settings.developerLogging) console.debug('[D365LU]', id, error);
    } finally { this.running.delete(id); this.controllers.delete(controller); }
  }
}
