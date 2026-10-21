export type ActionCategory = 'form' | 'navigation' | 'debugging' | 'tools';
export type ThemeMode = 'light' | 'dark';
export type ToastKind = 'success' | 'info' | 'warning' | 'error';

export interface DynamicObject {
  // Dynamics exposes a large runtime surface that varies by client version.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface DynamicsContext {
  sourceWindow: Window;
  xrm?: DynamicObject;
  form?: DynamicObject;
  global?: DynamicObject;
  clientUrl: string;
  environmentId?: string;
  organizationId?: string;
  organizationUniqueName?: string;
  entityName?: string;
  entityId?: string;
  formId?: string;
  appId?: string;
  pageType?: string;
  isForm: boolean;
}

export interface AvailabilityResult {
  available: boolean;
  reason?: string;
}

export interface ActionResult {
  message?: string;
  kind?: ToastKind;
}

export interface ActionDefinition {
  id: string;
  label: string;
  description: string;
  category: ActionCategory;
  icon: IconName;
  newTab?: boolean;
  availability: (ctx: DynamicsContext) => AvailabilityResult;
  execute: (ctx: DynamicsContext, deps: ActionDependencies) => Promise<ActionResult | void> | ActionResult | void;
}

export interface InfoRow {
  label: string;
  value: unknown;
  copy?: boolean;
  href?: string;
}

export type TableCell = string | number | boolean | null | undefined | HTMLElement;
export interface UiTable {
  title: string;
  description?: string;
  headers: string[];
  rows: TableCell[][];
}

export interface DialogButton {
  label: string;
  /** primary (main action, rightmost before Close), danger, subtle (quiet text button), caution (destructive outline), plain. */
  kind?: 'primary' | 'danger' | 'subtle' | 'caution' | 'plain';
  /** 'start' puts utility buttons (Copy …) at the left of the footer; default 'end'. */
  placement?: 'start' | 'end';
  onClick: (close: () => void) => void | Promise<void>;
}

/** Dialog widths: sm 440 (prompts, confirms), md 560 (default), wide 880 (details), xl 1200×880 (tools), full (big tables). */
export type DialogSize = 'sm' | 'md' | 'wide' | 'xl' | 'full';

export interface DialogOptions {
  size?: DialogSize;
  /** One quiet line under the title (e.g. "account · 1234…"). */
  subtitle?: string;
  /** false: a click on the backdrop doesn't close it (dialogs holding typed input or loaded work). Esc and × still do. */
  dismissible?: boolean;
  /** false: no footer bar. */
  footer?: boolean;
  /** Adds "New tab" to the header (opens the dialog's content as a standalone page). */
  newTab?: boolean;
  /** Body classes; default 'd365lu-dialog-pad' (padded column). */
  bodyClass?: string;
  modalClass?: string;
}

export interface PromptField { name: string; label: string; value?: string; multiline?: boolean; placeholder?: string }

export interface UiBridge {
  toast(message: string, kind?: ToastKind): void;
  /** Enter submits. Resolves null on Cancel/Esc. */
  prompt(title: string, fields: PromptField[], options?: { ok?: string; subtitle?: string }): Promise<Record<string, string> | null>;
  /** danger: the OK button is red and Cancel has focus. */
  confirm(title: string, message: string, options?: { ok?: string; danger?: boolean }): Promise<boolean>;
  details(title: string, sections: { title?: string; rows: InfoRow[] }[], buttons?: DialogButton[], options?: { subtitle?: string; size?: DialogSize }): void;
  table(title: string, columns: string[], rows: TableCell[][], searchable?: boolean, options?: { subtitle?: string }): void;
  tableGroup(title: string, tables: UiTable[], searchable?: boolean, options?: { subtitle?: string }): void;
  dialog(title: string, setup: (body: HTMLElement, footer: HTMLElement, close: () => void) => void | (() => void), options?: DialogOptions): void;
}

export interface TableMetadata {
  MetadataId: string;
  LogicalName: string;
  SchemaName: string;
  EntitySetName: string;
  ObjectTypeCode?: number;
  PrimaryIdAttribute?: string;
  PrimaryNameAttribute?: string;
  DisplayName?: unknown;
  DisplayCollectionName?: unknown;
  OwnershipType?: string;
  IsCustomEntity?: boolean;
  IsActivity?: boolean;
  IsActivityParty?: boolean;
  IsAuditEnabled?: unknown;
  IsCustomizable?: unknown;
  IsManaged?: boolean;
  IntroducedVersion?: string;
  ChangeTrackingEnabled?: boolean;
  EntityColor?: string;
}

export interface ColumnMetadata {
  MetadataId: string;
  LogicalName: string;
  SchemaName: string;
  AttributeType?: string;
  DisplayName?: unknown;
  RequiredLevel?: unknown;
  IsValidForCreate?: boolean;
  IsValidForUpdate?: boolean;
  /** Set on companion columns (yominame, _base money, rollup state/date): they belong to another column. */
  AttributeOf?: string | null;
  IsLogical?: boolean;
  /** Protected by field-level security. */
  IsSecured?: boolean;
  IsValidForRead?: boolean;
  /** The specific kind where AttributeType is general, e.g. MultiSelectPicklistType, ImageType or FileType for 'Virtual'. */
  AttributeTypeName?: { Value?: string } | null;
}

export interface SolutionInfo {
  solutionId: string;
  friendlyName: string;
  usedDefaultSolution: boolean;
}

export interface RecentAction {
  id: string;
  timestamp: number;
  count: number;
}

export interface ProfileSettings {
  /** The sidebar with the buttons. */
  theme: ThemeMode;
  /** Dialogs, prompts and toasts. */
  popupTheme: ThemeMode;
  sections: Record<string, boolean>;
  actionOrder: Record<string, string[]>;
  layout: 'grid' | 'list';
  developerLogging: boolean;
  showRecentlyUsed: boolean;
}

export interface StoredProfileV1 {
  version: 1;
  /** When the profile last changed (ms); the newest copy wins across environments. 0 = never changed. */
  updatedAt: number;
  settings: ProfileSettings;
  favorites: string[];
  recentActions: RecentAction[];
}

export interface ActionDependencies {
  ui: UiBridge;
  api: import('./dynamics-api').DynamicsApi;
  metadata: import('./metadata-service').MetadataService;
  maker: import('./maker-url-factory').MakerUrlFactory;
  solutions: import('./solution-resolver').SolutionResolver;
  decorations: import('./decoration-manager').DecorationManager;
  storage: import('./storage-service').StorageService;
  context: import('./context-service').ContextService;
  cleanup: import('./cleanup-registry').CleanupRegistry;
  /** Aborted when the page navigates while this action runs (pass it to long work; deps.api already uses it). */
  signal: AbortSignal;
  /** False once the page navigated since this action started: don't decorate or open anything for the old page. */
  isCurrent: () => boolean;
}

export type IconName =
  | 'tag' | 'clear' | 'magic' | 'change' | 'link' | 'id' | 'globe' | 'refresh' | 'sync'
  | 'sliders' | 'clone' | 'table' | 'edit' | 'process' | 'search' | 'add' | 'list'
  | 'shield' | 'briefcase' | 'box' | 'mail' | 'home' | 'mobile' | 'history' | 'pin'
  | 'monitor' | 'bug' | 'speed' | 'ban' | 'rule' | 'code' | 'moon' | 'flag' | 'info' | 'record'
  | 'unlock' | 'eye' | 'bell' | 'ribbon' | 'lookup' | 'user' | 'fetch'
  | 'maker' | 'diagnostics' | 'access' | 'favorite' | 'delete' | 'expand' | 'grid'
  | 'download' | 'upload' | 'share' | 'settings' | 'light' | 'close' | 'more'
  | 'data' | 'filter' | 'findField' | 'solutionTree'
  | 'fieldValue' | 'entityEditor' | 'tableProcess' | 'formRefresh' | 'ruleOff' | 'language' | 'cache'
  | 'audit' | 'recordAccess' | 'trace' | 'compareAccess';
