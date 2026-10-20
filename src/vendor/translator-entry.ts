// The Translator's two tools as functions, for Level Up's Switch Language and Clear UCI Cache buttons.
// Level Up imports them as 'levelup-translator' (src/translator.d.ts); the build and the tests map that name here,
// so this folder is type-checked with the Translator's own compiler settings (tsconfig.vendor.json).
export { run as runLanguage } from './translator/standalone/language';
export { run as runRefresh } from './translator/standalone/refresh';
