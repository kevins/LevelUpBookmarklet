// The Translator's "Dynamics language" and "Dynamics refresh" tools (src/vendor/translator-entry.ts).
declare module 'levelup-translator' {
  /** Changes the signed-in user's Dynamics language (picker when more than two) and reloads the page in it. */
  export function runLanguage(): Promise<void>;
  /** Clears every Dynamics cache that holds labels or the language, then reloads the page without its warm start. */
  export function runRefresh(): Promise<void>;
}
