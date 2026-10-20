// "Dynamics refresh" bookmarklet, for use without the translator:
// one click shows the labels and the language Dynamics has now. For after a publish, or after the language was
// changed in Personal options (or with any other switcher), when UCI keeps showing the old ones for minutes. It runs
// the translator's refresh (ui/refresh.ts): every client cache that holds labels or the language, the service
// worker's and the state worker's copies included, then the same page again without its warm boot (common.ts
// reload: never in the middle of a translator's temporary language switch, nor while one whose answer was lost may
// still run, nor while one that never finished left the user in its language).

import { showNote } from '../ui/refresh';
import { begin, end, idsOf, mayLeave, reload, xrmOf } from './common';

export const run = async (): Promise<void> => {
  if (!begin('Dynamics refresh')) return;
  const xrm = xrmOf();
  if (!mayLeave(xrm)) return end();
  await reload(idsOf(xrm), showNote('Refreshing Dynamics…'));
};
