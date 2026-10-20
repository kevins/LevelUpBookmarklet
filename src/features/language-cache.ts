import { runLanguage, runRefresh } from 'levelup-translator';
import type { ActionDependencies, DynamicsContext } from '../core/types';

// Switch Language and Clear UCI Cache run the Translator's own "Dynamics language" and "Dynamics refresh" bookmarklets
// (copied unchanged into src/vendor/translator): their language chooser, in-page note,
// unsaved-changes prompt, cache purge, coordination with a translator in another tab, and the reload.
// Nothing is added around them: no second progress UI, cache pass or navigation. They are not awaited: they report
// for themselves (a second click while one runs says "Already running"), and a wait can last minutes.
function detach(run: () => Promise<void>, deps: ActionDependencies): void {
  void run().catch(error => { if (deps.storage.get().settings.developerLogging) console.debug('[D365LU] translator tool', error); });
}

export function switchLanguage(_ctx: DynamicsContext, deps: ActionDependencies): void { detach(runLanguage, deps); }
export function clearUciCache(_ctx: DynamicsContext, deps: ActionDependencies): void { detach(runRefresh, deps); }
