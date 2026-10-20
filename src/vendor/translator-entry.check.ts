// Fails tsconfig.vendor.json's check when src/translator.d.ts no longer matches the real functions.
import type * as declared from 'levelup-translator';
import * as real from './translator-entry';

const forward: typeof declared = real;
const back: typeof real = forward;
void back;
