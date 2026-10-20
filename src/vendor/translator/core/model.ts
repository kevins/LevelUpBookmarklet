// The data model shared by every part of the translator.
//
// A Slot is one translatable piece of text (for example the display name of a column,
// the label of a form tab or the title of a sitemap area). Its `labels` hold the value
// for each language exactly as it was on the server when it was loaded; pending edits
// live in the Store, never in the slot, so the original is always available for
// conflict checks and undo.

import { lcidName } from './lcid';

export type Lcid = number;
/** Label text per language. A missing key means "no label in that language". */
export type Labels = Record<number, string>;

export type Kind =
  // table metadata
  | 'entity' | 'attribute' | 'relationship' | 'option' | 'globaloptionset' | 'globaloption' | 'boolean' | 'state' | 'status'
  // record-based components (labels stored as localized columns or in XML)
  | 'view' | 'chart' | 'form' | 'tab' | 'section' | 'field' | 'navitem'
  | 'dashboard' | 'dtab' | 'dsection' | 'dfield'
  | 'app' | 'area' | 'group' | 'subarea'
  | 'bpf' | 'stage' | 'step'
  | 'ribbon' | 'command'
  // other localizable records
  | 'envvar' | 'customapi';

/** Which text of the component a slot holds. */
export type Prop = 'DisplayName' | 'DisplayCollectionName' | 'Description' | 'Label' | 'Name' | 'Title' | 'ToolTipTitle' | 'ToolTipDescription' | 'Alt' | 'Hint';

export interface Slot {
  /** Globally unique, stable across reloads: `${kind}|${component id}|${prop}`. */
  key: string;
  kind: Kind;
  prop: Prop;
  /** Logical name of the table the component belongs to ('' when none, e.g. global choices, sitemap). */
  entity: string;
  /** Identity of the component; slots with the same `comp` are edited together in one card. */
  comp: string;
  /**
   * Save group; changes with the same group are written in a single server operation
   * (one metadata PUT, one form XML update, one sitemap update...).
   */
  group: string;
  /** Component name in the user's language. */
  title: string;
  /** Breadcrumb from the outermost container, e.g. ["Account", "Account main form", "Summary"]. */
  path: string[];
  /** Secondary identifier shown in grey, e.g. the logical or schema name. */
  sub: string;
  /** Server values when loaded. */
  labels: Labels;
  /** Empty when editable, otherwise the reason it is read-only. */
  readOnly: string;
  /** True when the base language label must not be blank (most metadata labels). */
  baseRequired: boolean;
  /** Maximum length accepted by Dataverse; 0 when unknown. */
  max: number;
  /** Sort order inside the component type (document order on forms, option order in choices...). */
  order: number;
  /** Provider-private locator (ids, XML node ids, attribute types...). */
  ref: any;
}

export interface Language {
  lcid: Lcid;
  name: string;
  isBase: boolean;
}

/** One language of one slot that the user changed. */
export interface Change {
  slot: Slot;
  lcid: Lcid;
  /**
   * Value the user started from: the server text the edit was made on (the store's remembered base, Store.before),
   * not whatever a reload brought since. The writers compare it with a fresh read and report a conflict when they differ.
   */
  before: string;
  /** Value to write. */
  after: string;
}

export type Outcome = 'saved' | 'unchanged' | 'conflict' | 'error' | 'skipped';
export interface ChangeResult {
  change: Change;
  outcome: Outcome;
  /** For conflicts: the value now on the server. */
  server?: string;
  message?: string;
}

/** Components that must be published after a save. */
export class PublishSet {
  entities = new Set<string>();
  optionsets = new Set<string>();
  sitemaps = new Set<string>();
  dashboards = new Set<string>();
  appmodules = new Set<string>();
  ribbons = false;
  /**
   * Business process flows whose name was written (workflow id → its name, shown while it is updated). Not published:
   * Dataverse serves the app a compiled copy of a process that only an update of the process itself rebuilds
   *, so the saver updates each one after the publish. `empty` leaves
   * them out: it says whether PublishXml has anything to do.
   */
  processes = new Map<string, string>();
  get empty(): boolean {
    return !this.entities.size && !this.optionsets.size && !this.sitemaps.size && !this.dashboards.size && !this.appmodules.size && !this.ribbons;
  }
}

/** Human names for kinds, singular and plural. */
export const KIND_NAMES: Record<Kind, [string, string]> = {
  entity: ['Table', 'Tables'],
  attribute: ['Column', 'Columns'],
  relationship: ['Relationship', 'Relationships'],
  option: ['Choice option', 'Choice options'],
  globaloptionset: ['Global choice', 'Global choices'],
  globaloption: ['Global choice option', 'Global choice options'],
  boolean: ['Yes/No option', 'Yes/No options'],
  state: ['Status option', 'Status options'],
  status: ['Status reason', 'Status reasons'],
  view: ['View', 'Views'],
  chart: ['Chart', 'Charts'],
  form: ['Form', 'Forms'],
  tab: ['Form tab', 'Form tabs'],
  section: ['Form section', 'Form sections'],
  field: ['Form field', 'Form fields'],
  navitem: ['Form navigation item', 'Form navigation items'],
  dashboard: ['Dashboard', 'Dashboards'],
  dtab: ['Dashboard tab', 'Dashboard tabs'],
  dsection: ['Dashboard section', 'Dashboard sections'],
  dfield: ['Dashboard component', 'Dashboard components'],
  app: ['App', 'Apps'],
  area: ['Sitemap area', 'Sitemap areas'],
  group: ['Sitemap group', 'Sitemap groups'],
  subarea: ['Sitemap subarea', 'Sitemap subareas'],
  bpf: ['Business process flow', 'Business process flows'],
  stage: ['Process stage', 'Process stages'],
  step: ['Process step', 'Process steps'],
  ribbon: ['Command button (classic)', 'Command buttons (classic)'],
  command: ['Command button', 'Command buttons'],
  envvar: ['Environment variable', 'Environment variables'],
  customapi: ['Custom API', 'Custom APIs'],
};

export const PROP_NAMES: Record<Prop, string> = {
  DisplayName: 'Display name',
  DisplayCollectionName: 'Plural name',
  Description: 'Description',
  Label: 'Label',
  Name: 'Name',
  Title: 'Title',
  ToolTipTitle: 'Tooltip title',
  ToolTipDescription: 'Tooltip description',
  Alt: 'Accessibility text',
  Hint: 'Hint',
};

export const slotKey = (kind: Kind, id: string, prop: Prop): string => `${kind}|${id}|${prop}`;

/**
 * Whether a non-base translation can be removed (saving '' or only whitespace removes it, so users of that
 * language see the base text again). Verified live: Dataverse merges these labels
 * per language, so a write can add or change a language but never delete one — metadata labels (MergeLabels
 * false keeps them; '' is stored and shown as a blank label), form tab/section and field (cell) labels (a
 * form update without the label, or with it empty, keeps it in any UI language; dashboard cells assumed the
 * same), and classic ribbon titles (solution and translation imports keep them). Everything else can: SetLocLabels ''
 * deletes, and navigation item and sitemap labels are removed with their element (findings 33, 38). With `l`, also
 * false for a process stage or step translation (stays).
 */
export const canClear = (s: Slot, l?: Lcid): boolean => !NO_CLEAR.has(s.kind) && !stays(s, l);
const NO_CLEAR = new Set<Kind>(['entity', 'attribute', 'relationship', 'option', 'globaloptionset', 'globaloption', 'boolean', 'state', 'status', 'tab', 'section', 'dtab', 'dsection', 'field', 'dfield', 'ribbon']);

/**
 * A process stage or step text the definition has no label for in `l`, filled from the names Dynamics keeps once
 * stored (`ref.stored`): what the page shows there, and what a save of it is
 * measured against.
 */
export const keeps = (s: Slot, l?: Lcid): boolean => l !== undefined && Array.isArray(s.ref?.stored) && s.ref.stored.includes(l);

/**
 * A process stage or step translation loaded in `l` (a non-base language: callers check the base text apart, it is
 * required), in the definition or only kept (keeps): once Dynamics has stored one, removing its StepLabel never
 * deletes it and the page goes on showing it. It can be replaced, not removed. Where none is
 * loaded there is nothing to remove: only spaces typed there change nothing, as for any removable label.
 */
export const stays = (s: Slot, l?: Lcid): boolean => l !== undefined && (s.kind === 'stage' || s.kind === 'step') && (s.labels[l] ?? '') !== '';

/**
 * A title that gets its base-language text before any other: an app designer's placeholder in the sitemap, loaded
 * without a title in any language. A title only in another language would
 * leave the base language's users, and every language without its own, on a text nobody chose.
 */
export const namesFirst = (s: Slot): boolean => s.ref?.placeholder === true && s.prop === 'Title';

/** Why a title in another language alone is refused where namesFirst() (saver, popup and writer). */
export const baseNameFirst = (base: Lcid): string =>
  `Name it in ${lcidName(base)} too: languages without a name of their own show the ${lcidName(base)} one.`;

/** Why an emptied translation of a component where canClear() is false is refused (saver and writers). */
export const CANT_CLEAR_TEXT = "Dataverse can't remove a translation from this component. Type the text instead, or undo this edit.";

/** CANT_CLEAR_TEXT, or for a stage or step translation (stays()) why that one can't be removed. */
export const cantClearText = (s: Slot, l?: Lcid): string =>
  stays(s, l) ? `Dynamics keeps a ${s.kind}'s translation once it is stored: type the text you want instead.` : CANT_CLEAR_TEXT;

/**
 * A blank value Dataverse refuses every time (the saver and every writer block it the same way): removing a
 * translation that can't be removed, or blanking a required base-language label. Retrying can't help.
 */
export const refusedBlank = ({ outcome, change: c }: ChangeResult, base: Lcid): boolean =>
  outcome === 'error' && !c.after.trim() && (c.lcid === base ? c.slot.baseRequired : !canClear(c.slot, c.lcid));
