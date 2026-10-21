import type { DialogButton, DialogOptions, DialogSize, InfoRow, PromptField, TableCell, ThemeMode, ToastKind, UiBridge, UiTable } from '../core/types';
import { copyText } from '../core/xrm-helpers';
import { CSS_TEXT } from './styles';

// Popups (dialogs, prompts, tables, toasts) in the Translator's Fluent 2 look. They live in one `.d365lu-layer` that
// carries the popup tokens and follows the Popups theme (settings.popupTheme, light by default); the sidebar has its own
// theme and design. While a dialog is open, messages show in its header instead of floating over it.

// Stroke icons from the Translator (src/ui/dom.ts), 20×20 viewBox.
const PATHS = {
  close: 'M5 5l10 10M15 5 5 15',
  open: 'M11 4h5v5M16 4l-7 7M14.5 11.5v3a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 14.5V7a1.5 1.5 0 0 1 1.5-1.5h3',
  search: 'M8.5 3.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10ZM12.2 12.2 16.5 16.5',
  copy: 'M7.5 6.5V4a.5.5 0 0 1 .5-.5h7.5a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5H13M4.5 6.5h8v10h-8Z',
  info: 'M10 3.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13ZM10 9v4.5M10 6.5v.2',
  okc: 'M10 3.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13ZM7 10.2l2 2 4-4.4',
  warn: 'M10 3.5 17 16H3L10 3.5ZM10 8.5v3.5M10 14v.2',
  error: 'M10 3.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13ZM7.5 7.5l5 5M12.5 7.5l-5 5'
} as const;

export function strokeIcon(name: keyof typeof PATHS, size = 16): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size)); svg.setAttribute('viewBox', '0 0 20 20'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.5'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', PATHS[name]); svg.append(path); return svg;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
}

const button = (label: string, kind: DialogButton['kind'] = 'plain'): HTMLButtonElement => {
  const element = el('button', `d365lu-btn${kind && kind !== 'plain' ? ` ${kind}` : ''}`, label); element.type = 'button'; return element;
};

// Keys, clipboard and pointer events inside a popup stay in Level Up: Dynamics' shortcuts (Ctrl+S, …) and its
// light-dismiss handlers would otherwise react to typing in a prompt or the FetchXML editor (Translator host pattern).
const ISOLATED = ['keydown', 'keyup', 'keypress', 'copy', 'cut', 'paste', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend', 'focusin', 'focusout'];

const TOAST_MS: Record<ToastKind, number> = { success: 2400, info: 2400, warning: 3500, error: 8000 };
const TOAST_ICON: Record<ToastKind, keyof typeof PATHS> = { success: 'okc', info: 'info', warning: 'warn', error: 'error' };
const MAX_TOASTS = 3;
type ToastItem = HTMLElement & { luTimers?: ReturnType<typeof setTimeout>[]; luArm?: () => void };

/** The dialog's content as a page of its own (New tab), with the same look, search, navigation and copy buttons. */
export function standaloneDialogHtml(title: string, modal: HTMLElement, theme: ThemeMode = 'light'): string {
  const content = modal.cloneNode(true) as HTMLElement; content.querySelector('.d365lu-modal-action')?.remove();
  // The new tab has its own window close; footer buttons and messages would be dead copies there.
  content.querySelector('.d365lu-modal-foot')?.remove(); content.querySelector('.d365lu-modal-status')?.remove();
  content.classList.remove('is-sm', 'is-md', 'is-wide', 'is-xl', 'is-full', 'd365lu-table-wide');
  content.querySelectorAll<HTMLElement>('tbody tr[data-searchable]').forEach(row => { row.style.removeProperty('display'); });
  content.querySelectorAll('.d365lu-table-search-clear').forEach(clear => clear.classList.add('hidden'));
  // Open column menus and the no-match line are rebuilt by the page's own table code.
  content.querySelectorAll('.d365lu-pop, .d365lu-no-match').forEach(node => node.remove());
  const dark = theme === 'dark';
  const css = `${CSS_TEXT.replace(':host{', ':root{')}html,body{margin:0;width:100%;height:100%;background:${dark ? '#1f1f1f' : '#f5f5f5'};font-family:"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}.d365lu-modal{margin:0;width:100%;height:100vh;max-width:none;max-height:none;border-radius:0;box-shadow:none}.d365lu-modal-head{position:sticky;top:0;z-index:100;background:var(--bg1)}.d365lu-modal-body{width:100%}`;
  const behavior = `document.querySelector('.d365lu-modal-close').onclick=function(){window.close()};document.querySelectorAll('.d365lu-table-nav-link').forEach(function(link){link.onclick=function(event){event.preventDefault();var target=document.querySelector(link.hash);if(target)target.scrollIntoView({behavior:'smooth',block:'start'})}});document.querySelectorAll('.d365lu-table-section').forEach(${wireTableTools.toString()});document.querySelectorAll('.d365lu-copy').forEach(function(button){button.onclick=function(){var v=button.dataset.d365luCopyValue,f=()=>prompt('Copy',v);navigator.clipboard?.writeText(v).catch(f)||f()}});`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} - Level Up</title><style>${css}</style></head><body><div class="d365lu-layer${dark ? ' dark' : ''}">${content.outerHTML}</div><script>${behavior}</script></body></html>`;
}

export class UiService implements UiBridge {
  /** Holds every popup and the toasts; carries the popup tokens and the theme. */
  readonly layer: HTMLElement;
  private currentClose?: () => void;
  private toasts: HTMLElement;
  /** The open dialog's message slot: while a dialog is open, messages show in its header instead of over it. */
  private status?: HTMLElement;
  private theme: ThemeMode = 'light';
  private opened = 0;
  /** Whether the user works with the keyboard (set by the panel); focus returns to the opener only then. */
  keyboardFocus: () => boolean = () => true;

  constructor(private root: ShadowRoot) {
    this.layer = el('div', 'd365lu-layer'); this.toasts = el('div', 'd365lu-toastbox'); this.toasts.setAttribute('aria-live', 'polite'); this.layer.append(this.toasts); this.root.append(this.layer);
  }

  /** Counts dialogs opened, so an action run can tell whether the user opened another one meanwhile. */
  get serial(): number { return this.opened; }
  get hasDialog(): boolean { return Boolean(this.currentClose); }

  setTheme(theme: ThemeMode): void { this.theme = theme; this.layer.classList.toggle('dark', theme === 'dark'); }
  /** Toasts sit left of the docked sidebar, or at the right edge when it floats or is hidden. */
  setDocked(docked: boolean): void { this.toasts.classList.toggle('is-undocked', !docked); }

  closeDialog(): boolean { if (!this.currentClose) return false; this.currentClose(); return true; }

  toast(message: string, kind: ToastKind = 'info'): void {
    // A message replaces the latest one of the same kind (rapid repeats never pile up); different kinds stack,
    // so an error stays readable when a success message follows it. With a dialog open, the message goes in the
    // dialog's header (one at a time), so it never covers the dialog's buttons.
    const slot = this.status?.isConnected ? this.status : undefined;
    const latest = (slot ?? this.toasts).lastElementChild as HTMLElement | null;
    // Focus never falls out of a dialog because its message changed or went away (Esc and Tab would stop working).
    const modal = slot?.closest<HTMLElement>('.d365lu-modal'); const keepFocus = () => { if (modal?.isConnected && !modal.contains(this.root.activeElement)) modal.focus({ preventScroll: true }); };
    const hadFocus = Boolean(slot?.contains(this.root.activeElement));
    const item = latest?.dataset.kind === kind && !latest.classList.contains('out') ? latest : el('div', 'd365lu-toast');
    item.className = `d365lu-toast ${kind}`; item.dataset.kind = kind; item.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    const icon = el('span', 'd365lu-toast-icon'); icon.append(strokeIcon(TOAST_ICON[kind], 16));
    const text = el('span', 'd365lu-toast-text', message); text.title = message;
    const dismiss = el('button', 'd365lu-toast-x'); dismiss.type = 'button'; dismiss.setAttribute('aria-label', 'Dismiss'); dismiss.append(strokeIcon('close', 14));
    if (slot) dismiss.tabIndex = -1; // a message in a dialog's header is not a stop in the dialog's Tab order
    item.replaceChildren(icon, text, dismiss);
    if (item !== latest) { if (slot) slot.replaceChildren(item); else { this.toasts.append(item); while (this.toasts.children.length > MAX_TOASTS) this.toasts.firstElementChild?.remove(); } }
    if (hadFocus) keepFocus();
    const state = item as ToastItem;
    const clear = () => { state.luTimers?.forEach(timer => clearTimeout(timer)); state.luTimers = []; };
    const remove = () => { clear(); const focused = item.contains(this.root.activeElement); item.remove(); if (focused) keepFocus(); };
    const arm = (ms: number) => { clear(); state.luTimers = [setTimeout(() => item.classList.add('out'), Math.max(0, ms - 150)), setTimeout(remove, ms)]; };
    dismiss.onpointerdown = event => event.preventDefault(); // dismissing a toast never takes focus from a dialog
    dismiss.onclick = remove; item.onpointerenter = () => { clear(); item.classList.remove('out'); }; item.onpointerleave = () => arm(TOAST_MS[kind]);
    state.luArm = () => { item.classList.remove('out'); arm(TOAST_MS[kind]); };
    if (slot || !this.layer.classList.contains('has-dialog')) arm(TOAST_MS[kind]);
  }

  /** Floating toasts are hidden while a dialog is open: their time doesn't run out unseen, it starts again after. */
  private pauseFloating(paused: boolean): void {
    this.toasts.querySelectorAll<ToastItem>('.d365lu-toast').forEach(item => { if (paused) { item.luTimers?.forEach(timer => clearTimeout(timer)); item.luTimers = []; } else item.luArm?.(); });
  }

  dialog(title: string, setup: (body: HTMLElement, footer: HTMLElement, close: () => void) => void | (() => void), options: DialogOptions = {}): void {
    this.closeDialog(); this.opened++;
    const opener = this.root.activeElement as HTMLElement | null; const openerKey = opener?.dataset.key;
    const layer = el('div', 'd365lu-modal-layer'); layer.setAttribute('role', 'presentation');
    const modal = el('section', `d365lu-modal is-${options.size ?? 'md'}${options.modalClass ? ` ${options.modalClass}` : ''}`); modal.tabIndex = -1; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', title);
    const titles = el('div', 'd365lu-modal-titles'); titles.append(el('h2', '', title));
    if (options.subtitle) { const sub = el('p', 'd365lu-modal-sub', options.subtitle); sub.id = `d365lu-dialog-${this.opened}-sub`; titles.append(sub); modal.setAttribute('aria-describedby', sub.id); }
    const actions = el('div', 'd365lu-modal-actions');
    const newTab = options.newTab ? el('button', 'd365lu-modal-action') : undefined; if (newTab) { newTab.type = 'button'; newTab.append(strokeIcon('open', 16), document.createTextNode('New tab')); newTab.title = 'Open in a new tab'; actions.append(newTab); }
    const closeButton = el('button', 'd365lu-modal-close'); closeButton.type = 'button'; closeButton.title = 'Close'; closeButton.setAttribute('aria-label', 'Close dialog'); closeButton.append(strokeIcon('close', 16)); actions.append(closeButton);
    const status = el('div', 'd365lu-modal-status'); status.setAttribute('aria-live', 'polite');
    const head = el('header', 'd365lu-modal-head'); head.append(titles, status, actions);
    const body = el('div', `d365lu-modal-body ${options.bodyClass ?? 'd365lu-dialog-pad'}`), footer = el('footer', 'd365lu-modal-foot');
    modal.append(head, body); if (options.footer !== false) modal.append(footer); layer.append(modal); this.layer.append(layer);
    ISOLATED.forEach(type => layer.addEventListener(type, event => event.stopPropagation()));

    let closed = false; const teardown: (void | (() => void))[] = [];
    const close = () => {
      if (closed) return; closed = true; layer.remove(); if (this.currentClose === close) this.currentClose = undefined;
      if (this.status === status) this.status = undefined; if (!this.currentClose) { this.layer.classList.remove('has-dialog'); this.pauseFloating(false); }
      try { teardown[0]?.(); } catch { /* a feature's teardown must not keep the dialog open */ }
      // Back to the control that opened it, or to its replacement when the panel was rebuilt meanwhile.
      const back = opener?.isConnected ? opener : openerKey ? [...this.root.querySelectorAll<HTMLElement>('[data-key]')].find(node => node.dataset.key === openerKey) : undefined;
      if (back && !this.currentClose && this.keyboardFocus()) back.focus({ preventScroll: true });
    };
    // Messages raised while this dialog is open (also from its setup) land in its header; toasts already floating
    // are hidden until it closes.
    this.currentClose = close; this.status = status; if (!this.layer.classList.contains('has-dialog')) { this.layer.classList.add('has-dialog'); this.pauseFloating(true); } closeButton.onclick = close;
    // Like the Translator: the backdrop closes only on a deliberate click (press and release on it, not right after
    // opening, not a double click), and never for dialogs holding typed input or loaded work.
    const born = performance.now(); let pressedOnBackdrop = false;
    layer.addEventListener('pointerdown', event => { if (event.target === layer) event.preventDefault(); /* focus stays in the dialog */ pressedOnBackdrop = event.target === layer && performance.now() - born > 300; });
    layer.addEventListener('click', event => { if (pressedOnBackdrop && event.target === layer && event.detail < 2 && options.dismissible !== false) close(); pressedOnBackdrop = false; });
    modal.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      else if (event.key === 'Tab') trapTab(event, modal, this.root);
    });
    teardown[0] = setup(body, footer, close);
    if (newTab) newTab.onclick = () => { const target = window.open('', '_blank'); if (!target) { this.toast('Pop-up blocked: allow pop-ups for this site to open a new tab.', 'warning'); return; } target.document.write(standaloneDialogHtml(title, modal, this.theme)); target.document.close(); target.opener = null; };
    setTimeout(() => {
      if (closed) return;
      // A field to type in gets focus. Otherwise keyboard users land on the main button; after a click the dialog
      // itself takes focus (Esc and Tab still work) so no button opens with a focus ring.
      const keys = this.keyboardFocus();
      const first = modal.querySelector<HTMLElement>('[data-af]') ?? body.querySelector<HTMLElement>('input:not([type=checkbox]):not([type=radio]):not(:disabled),textarea:not(:disabled),select:not(:disabled)') ?? (keys ? footer.querySelector<HTMLElement>('.d365lu-btn.primary:not(:disabled)') ?? footer.querySelector<HTMLElement>('.d365lu-btn:not(:disabled)') : null) ?? modal;
      first.focus({ preventScroll: true });
    });
  }

  prompt(title: string, fields: PromptField[], options: { ok?: string; subtitle?: string } = {}): Promise<Record<string, string> | null> {
    return new Promise(resolve => this.dialog(title, (body, footer, close) => {
      let settled = false; const settle = (value: Record<string, string> | null) => { if (!settled) { settled = true; resolve(value); } };
      const form = el('form', 'd365lu-dialog-pad'); form.noValidate = true; const inputs = new Map<string, HTMLInputElement | HTMLTextAreaElement>();
      for (const field of fields) {
        const row = el('div', 'd365lu-field'); const label = el('label', '', field.label); const input = field.multiline ? el('textarea', 'd365lu-input') : el('input', 'd365lu-input');
        input.value = field.value ?? ''; if (field.placeholder) input.placeholder = field.placeholder; if (field.multiline) (input as HTMLTextAreaElement).rows = 12; else (input as HTMLInputElement).spellcheck = false;
        label.htmlFor = `d365lu-${field.name}`; input.id = label.htmlFor; inputs.set(field.name, input); row.append(label, input); form.append(row);
      }
      // Enter in a single-line field submits; the hidden submit button lets the form do it natively.
      const submit = el('button'); submit.type = 'submit'; submit.hidden = true; form.append(submit);
      const ok = () => { const result: Record<string, string> = {}; inputs.forEach((input, name) => { result[name] = input.value; }); settle(result); close(); };
      form.onsubmit = event => { event.preventDefault(); ok(); };
      body.append(form);
      const cancel = button('Cancel'); cancel.onclick = () => { settle(null); close(); }; const confirm = button(options.ok ?? 'Continue', 'primary'); confirm.onclick = ok; footer.append(cancel, confirm);
      return () => settle(null);
    }, { size: fields.some(field => field.multiline) ? 'md' : 'sm', subtitle: options.subtitle, dismissible: false, bodyClass: 'd365lu-prompt-body' }));
  }

  confirm(title: string, message: string, options: { ok?: string; danger?: boolean } = {}): Promise<boolean> {
    return new Promise(resolve => this.dialog(title, (body, footer, close) => {
      let settled = false; const settle = (value: boolean) => { if (!settled) { settled = true; resolve(value); } };
      body.append(el('p', '', message)); const no = button('Cancel'); no.onclick = () => { settle(false); close(); }; const yes = button(options.ok ?? 'Continue', options.danger ? 'danger' : 'primary'); yes.onclick = () => { settle(true); close(); };
      if (options.danger) no.dataset.af = ''; // a destructive confirm starts on Cancel
      footer.append(no, yes);
      return () => settle(false);
    }, { size: 'sm' }));
  }

  details(title: string, sections: { title?: string; rows: InfoRow[] }[], buttons: DialogButton[] = [], options: { subtitle?: string; size?: DialogSize } = {}): void {
    this.dialog(title, (body, footer, close) => {
      for (const section of sections) {
        if (section.title) body.append(el('h3', 'd365lu-subhead', section.title));
        const list = el('dl', 'd365lu-details');
        for (const row of section.rows) {
          const dt = el('dt', '', row.label); const dd = el('dd'); const value = format(row.value);
          const text = el(row.href ? 'a' : 'span', `d365lu-detail-value${valueStyle(row.value, value)}`, value);
          if (row.href && text instanceof HTMLAnchorElement) { text.href = row.href; text.target = '_blank'; text.rel = 'noopener'; text.title = `Open ${row.label}`; }
          dd.append(text);
          if (row.copy && row.value != null && value !== '') {
            const copy = el('button', 'd365lu-copy'); copy.type = 'button'; copy.title = `Copy ${row.label}`; copy.append(strokeIcon('copy', 14), document.createTextNode('Copy'));
            copy.dataset.d365luCopyValue = value; copy.onclick = () => void copyText(value).then(() => this.toast(`${row.label} copied`, 'success'), error => this.toast(error instanceof Error ? error.message : String(error), 'error'));
            dd.append(copy);
          }
          list.append(dt, dd);
        }
        body.append(list);
      }
      const start = el('div', 'd365lu-foot-start'), group = el('div', 'd365lu-foot-end'); const end: HTMLButtonElement[] = [];
      const fail = (error: unknown) => this.toast(error instanceof Error ? error.message : String(error), 'error');
      for (const config of buttons) {
        const action = button(config.label, config.kind);
        action.onclick = () => { try { void Promise.resolve(config.onClick(close)).catch(fail); } catch (error) { fail(error); } };
        if (config.placement === 'start') start.append(action); else end.push(action);
      }
      // [utilities …] [secondary] [primary] [Close]; Close is the primary button when nothing else is.
      end.sort((a, b) => Number(a.classList.contains('primary')) - Number(b.classList.contains('primary')));
      const done = button('Close', end.some(item => item.classList.contains('primary')) ? 'plain' : 'primary'); done.onclick = close;
      group.append(...end, done); if (start.childElementCount) footer.append(start); footer.append(group);
    }, { size: options.size ?? 'wide', subtitle: options.subtitle });
  }

  table(title: string, columns: string[], rows: TableCell[][], searchable = false, options: { subtitle?: string; widths?: string[] } = {}): void {
    this.tableGroup(title, [{ title, headers: columns, rows, ...(options.widths ? { widths: options.widths } : {}) }], searchable, { subtitle: options.subtitle });
  }

  tableGroup(title: string, tables: UiTable[], searchable = false, options: { subtitle?: string } = {}): void {
    const dual = tables.length > 1;
    this.dialog(title, body => {
      const area = el('div', 'd365lu-table-area'); const sections = tables.map((table, index) => tableSection(table, index, searchable, this));
      area.append(...sections);
      if (dual) {
        const nav = el('nav', 'd365lu-table-nav'); nav.setAttribute('aria-label', 'Tables'); nav.append(el('div', 'd365lu-table-nav-title', 'Quick navigation')); const links = el('div', 'd365lu-table-nav-links');
        tables.forEach((table, index) => {
          const link = el('a', `d365lu-table-nav-link${index === 0 ? ' active' : ''}`); link.href = `#d365lu-table-${index}`; link.append(document.createTextNode(table.title), el('small', '', String(table.rows.length)));
          link.onclick = event => { event.preventDefault(); links.querySelectorAll('.active').forEach(node => node.classList.remove('active')); link.classList.add('active'); sections[index]?.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
          links.append(link);
        });
        nav.append(links); body.append(nav);
      }
      body.append(area);
    }, { size: dual ? 'full' : 'xl', subtitle: options.subtitle, modalClass: dual ? 'd365lu-table-wide' : undefined, bodyClass: dual ? 'd365lu-table-dialog dual-pane-layout' : 'd365lu-table-dialog', footer: false, newTab: true });
  }
}

/** Tab stays inside the dialog: only visible, enabled controls count (a hidden search-clear button must not end the loop). */
function trapTab(event: KeyboardEvent, modal: HTMLElement, root: ShadowRoot): void {
  const items = [...modal.querySelectorAll<HTMLElement>('button,input,textarea,select,a[href],[tabindex]:not([tabindex="-1"])')].filter(item => item.tabIndex >= 0 && !item.hasAttribute('disabled') && !item.closest('[hidden]') && item.getClientRects().length > 0);
  if (!items.length) { event.preventDefault(); return; }
  const first = items[0]!, last = items.at(-1)!, active = root.activeElement as HTMLElement | null;
  if (!active || !items.includes(active)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
  else if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
}

function tableSection(config: UiTable, index: number, searchable: boolean, ui: UiService): HTMLElement {
  const section = el('section', 'd365lu-table-section'); section.id = `d365lu-table-${index}`;
  const header = el('header', 'd365lu-table-header'); header.append(el('h3', 'd365lu-table-title', config.title), el('span', 'd365lu-count', String(config.rows.length)));
  if (config.rows.length > 1) { const clearAll = button('Clear filters', 'subtle'); clearAll.classList.add('d365lu-clear-filters'); clearAll.hidden = true; header.append(clearAll); }
  if (config.description) header.append(el('p', 'd365lu-table-description', config.description));
  section.append(header);
  const table = el('table', 'd365lu-table'); const headRow = el('tr'); const thead = el('thead'); thead.append(headRow); const tbody = el('tbody');
  // Columns people can resize (a <col> each, starting widths from the caller, and a handle on each heading's edge) and,
  // as in Excel, a menu on each heading to sort the rows and filter them by the column's values.
  const menus = config.rows.length > 1;
  const colgroup = el('colgroup'); config.headers.forEach((value, index) => {
    const col = el('col'); const width = config.widths?.[index]; if (width) { col.style.width = width; col.dataset.w = width; } colgroup.append(col);
    const th = el('th'); th.setAttribute('aria-label', value); // the heading's name: not its menu button's state or its resize handle
    if (menus) { const head = el('button', 'd365lu-hb'); head.type = 'button'; head.dataset.col = String(index); head.setAttribute('aria-haspopup', 'dialog'); head.setAttribute('aria-expanded', 'false'); head.title = `Sort and filter ${value.toLowerCase()}`; head.append(el('span', 'l', value), el('span', 'ind')); th.className = 'd365lu-th-menu'; th.append(head); }
    else th.textContent = value;
    const handle = el('span', 'd365lu-col-resize'); handle.tabIndex = 0; handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'vertical'); handle.setAttribute('aria-label', `Resize ${value} (drag, or Left and Right arrow keys)`); handle.setAttribute('aria-valuemin', '56'); handle.setAttribute('aria-valuemax', '2000'); handle.title = 'Drag to resize. Double-click to fit the contents.'; th.append(handle); headRow.append(th);
  });
  // A narrow dialog scrolls sideways instead of squeezing columns until they can't be read: a column set in px keeps it, any other needs 140px.
  const floor = config.headers.reduce((sum, _value, index) => { const width = config.widths?.[index] ?? ''; return sum + (width.endsWith('px') ? parseFloat(width) : 140); }, 0);
  table.style.minWidth = `${floor}px`; table.dataset.min = String(floor); section.style.minWidth = `${floor + 2}px`;
  const valueColumn = config.headers.length === 2;
  if (config.rows.length) for (const [rowIndex, row] of config.rows.entries()) {
    const tr = el('tr'); tr.dataset.searchable = row.map(searchText).join(' ').toLowerCase(); tr.dataset.i = String(rowIndex);
    row.forEach((value, cellIndex) => { const td = el('td', valueColumn && cellIndex === row.length - 1 ? 'value-cell' : ''); if (value instanceof HTMLElement) td.append(value); else td.textContent = format(value); tr.append(td); });
    tbody.append(tr);
  } else { const tr = el('tr', 'empty-row'); const td = el('td', '', 'No data available'); td.colSpan = config.headers.length; tr.append(td); tbody.append(tr); }
  table.append(colgroup, thead, tbody);
  if (searchable) {
    const label = el('label', 'd365lu-table-search'); const icon = el('span'); icon.append(strokeIcon('search', 16)); const input = el('input', 'd365lu-table-search-input'); input.type = 'search'; input.placeholder = 'Search…'; input.setAttribute('aria-label', `Search ${config.title}`);
    const clear = el('button', 'd365lu-table-search-clear hidden'); clear.type = 'button'; clear.setAttribute('aria-label', 'Clear search'); clear.append(strokeIcon('close', 14));
    label.append(icon, input, clear); section.append(label);
  }
  section.append(table); wireTableTools(section);
  section.querySelectorAll<HTMLButtonElement>('.d365lu-copy[data-d365lu-copy-value]').forEach(copy => { copy.onclick = () => void copyText(copy.dataset.d365luCopyValue ?? '').then(() => ui.toast(`${copy.dataset.d365luCopyLabel ?? 'OptionSet Value'} copied`, 'success'), error => ui.toast(String(error), 'error')); });
  return section;
}

/**
 * Search, column menus (sort and filter, as in Excel and the Unmanaged Layer Scanner) and resizable columns for one
 * table section. It only uses the DOM and globals (no outer names), because the New tab page runs this same function
 * from its source text.
 */
export function wireTableTools(section: HTMLElement): void {
  const table = section.querySelector('table'), body = table && table.tBodies[0]; if (!table || !body) return;
  const doc = section.ownerDocument, frameOf = () => (section.closest('.d365lu-modal') || doc.body) as HTMLElement; // looked up when needed: the section is wired before it joins its dialog
  const rows = Array.prototype.slice.call(body.querySelectorAll('tr[data-searchable]')) as HTMLTableRowElement[];
  rows.forEach((row, index) => { if (row.dataset.i == null) row.dataset.i = String(index); });
  rows.sort((a, b) => Number(a.dataset.i) - Number(b.dataset.i)); // a New tab copy of a sorted table starts in the first order, like its filters
  const heads = Array.prototype.slice.call(table.querySelectorAll('thead tr:first-child th')) as HTMLElement[], cols = Array.prototype.slice.call(table.querySelectorAll('col')) as HTMLElement[];
  const buttons = Array.prototype.slice.call(table.querySelectorAll('.d365lu-hb')) as HTMLButtonElement[];
  // A cell's value is its text without its buttons (a long value's Copy), on one line.
  const text = (node: Node): string => { let out = ''; node.childNodes.forEach(child => { out += child.nodeType === 3 ? child.nodeValue || '' : child.nodeType === 1 && (child as Element).tagName !== 'BUTTON' ? text(child) : ''; }); return out; };
  const value = (cell: HTMLElement) => { const copy = cell.querySelector('.d365lu-copy[data-d365lu-copy-value]') as HTMLElement | null; return (copy ? copy.getAttribute('data-d365lu-copy-value') || '' : text(cell)).replace(/\s+/g, ' ').trim(); };
  const values = rows.map(row => Array.prototype.map.call(row.cells, value) as string[]);
  const label = (value: string) => value || '(Blanks)';
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  // Numbers sort as numbers (decimals, negatives, currency signs, group separators), before text, as in Excel.
  const number = (text: string) => { const match = /^([-+]?)[^\d\s.,+-]{0,4}\s?([-+]?)((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)\s?[^\d\s]{0,4}$/.exec(text); return match ? (match[1] === '-' || match[2] === '-' ? -1 : 1) * parseFloat(match[3]!.replace(/,/g, '')) : NaN; };
  const compare = (x: string, y: string, a = number(x), b = number(y)) => Number(isNaN(a)) - Number(isNaN(b)) || (isNaN(a) ? collator.compare(x, y) : a - b);
  const numbers = values.map(own => own.map(number));
  const ICONS: Record<string, string> = { up: 'M10 16V4.5M5.5 9 10 4.5 14.5 9', down: 'M10 4v11.5M5.5 11 10 15.5 14.5 11', filter: 'M3.5 4.5h13l-5 6.2v4.3l-3 1.5v-5.8l-5-6.2Z', chevron: 'M6 8l4 4 4-4', check: 'M4.5 10.5 8 14l7.5-8', fit: 'M4.5 4.5h11v11h-11Z', reset: 'M15.5 8A6 6 0 1 0 16 11.5M15.5 3.5V8H11', search: 'M8.5 3.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10ZM12.2 12.2 16.5 16.5' };
  const svg = (name: string, size: number) => `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
  const search = section.querySelector('.d365lu-table-search-input') as HTMLInputElement | null, clear = section.querySelector('.d365lu-table-search-clear') as HTMLElement | null;
  const count = section.querySelector('.d365lu-table-header .d365lu-count'), clearAll = section.querySelector('.d365lu-clear-filters') as HTMLButtonElement | null;
  // filters: column -> the values shown; sortBy: the sorted column and direction (none: the order the rows came in).
  const filters: Record<number, Set<string>> = {}; let sortBy: { col: number; dir: number } | null = null; let timer: ReturnType<typeof setTimeout> | undefined;
  const needle = () => (search ? search.value.toLowerCase().trim() : '');
  const passes = (index: number, skip: number) => { for (const key in filters) { const col = Number(key); if (col !== skip && !filters[col]!.has(values[index]![col] || '')) return false; } return true; };
  const found = (index: number, query: string) => !query || (rows[index]!.dataset.searchable || '').indexOf(query) >= 0;
  // When the search and filters leave no row: say so, with a way out.
  let none = body.querySelector('.d365lu-no-match') as HTMLTableRowElement | null;
  if (!none && rows.length) {
    none = doc.createElement('tr'); none.className = 'empty-row d365lu-no-match'; none.hidden = true; const cell = doc.createElement('td'); cell.colSpan = heads.length || 1;
    const reset = doc.createElement('button'); reset.type = 'button'; reset.className = 'd365lu-btn'; reset.textContent = 'Clear search and filters';
    cell.append(doc.createTextNode('No rows match the search or filters. '), reset); none.append(cell); body.append(none);
  }
  const placeRows = () => {
    const order = rows.map((_row, index) => index);
    if (sortBy) { const col = sortBy.col, dir = sortBy.dir; order.sort((a, b) => { const x = values[a]![col] || '', y = values[b]![col] || ''; return Number(!x) - Number(!y) || dir * compare(x, y, numbers[a]![col], numbers[b]![col]) || a - b; }); } // blanks last, as in Excel
    const fragment = doc.createDocumentFragment(); order.forEach(index => fragment.append(rows[index]!)); body.insertBefore(fragment, none && none.parentNode === body ? none : null);
  };
  let pop: HTMLElement | null = null, popCol = -1, popButton: HTMLElement | null = null, popShown: [string, number][] = [];
  const draw = () => {
    const query = needle(); let shown = 0;
    rows.forEach((row, index) => { const match = found(index, query) && passes(index, -1); row.style.display = match ? '' : 'none'; if (match) shown++; });
    const filtered = Object.keys(filters).length;
    if (none) none.hidden = shown > 0;
    if (clear) clear.classList.toggle('hidden', !(search && search.value));
    if (count) count.textContent = shown === rows.length ? String(rows.length) : `${shown} of ${rows.length}`;
    if (clearAll) { clearAll.hidden = !filtered; clearAll.textContent = `Clear filters (${filtered})`; }
    buttons.forEach(head => {
      const col = Number(head.dataset.col), dir = sortBy && sortBy.col === col ? sortBy.dir : 0, own = !!filters[col], ind = head.querySelector('.ind'), name = (head.querySelector('.l') || head).textContent || '';
      if (ind) ind.innerHTML = (dir ? `<span class="on">${svg(dir > 0 ? 'up' : 'down', 14)}</span>` : '') + (own ? `<span class="on">${svg('filter', 14)}</span>` : '') + svg('chevron', 12);
      head.setAttribute('aria-label', name + (own ? ' (filtered)' : '')); const th = head.closest('th'); if (th) th.setAttribute('aria-sort', dir > 0 ? 'ascending' : dir < 0 ? 'descending' : 'none');
    });
    placePop();
  };
  const later = () => { if (clear && search) clear.classList.toggle('hidden', !search.value); if (timer) clearTimeout(timer); if (rows.length > 300) timer = setTimeout(draw, 150); else draw(); };
  // Every value of a column (a filter is kept against these), and the values with how many rows have each among the
  // rows the other filters and the search leave.
  const allValues = (col: number) => { const out = new Set<string>(); values.forEach(own => out.add(own[col] || '')); const own = filters[col]; if (own) own.forEach(value => out.add(value)); return out; };
  const columnValues = (col: number) => {
    const query = needle(), counts = new Map<string, number>();
    rows.forEach((_row, index) => { if (found(index, query) && passes(index, col)) { const value = values[index]![col] || ''; counts.set(value, (counts.get(value) || 0) + 1); } });
    const own = filters[col]; if (own) own.forEach(value => { if (!counts.has(value)) counts.set(value, 0); });
    return Array.from(counts).sort((a, b) => Number(!a[0]) - Number(!b[0]) || compare(a[0], b[0]));
  };
  // A filter that keeps every value is no filter.
  const setFilter = (col: number, set: Set<string> | null) => { const keep = set && !Array.from(allValues(col)).every(value => set.has(value)) ? set : null; if (keep) filters[col] = keep; else delete filters[col]; draw(); };
  const currentSet = (col: number) => new Set(filters[col] || allValues(col));
  const clearFilters = () => { Object.keys(filters).forEach(key => { delete filters[Number(key)]; }); closePop(); draw(); };
  if (clearAll) clearAll.onclick = () => { clearFilters(); const next = search || buttons[0]; if (next) next.focus(); };
  if (none) { const reset = none.querySelector('button'); if (reset) reset.onclick = () => { if (search) search.value = ''; clearFilters(); const next = search || buttons[0]; if (next) next.focus(); }; }
  // Esc in the search box clears it instead of closing the dialog.
  if (search) { search.oninput = later; search.onkeydown = event => { if (event.key === 'Escape' && search.value) { event.preventDefault(); event.stopPropagation(); search.value = ''; draw(); } }; }
  if (clear && search) clear.onclick = () => { search.value = ''; draw(); search.focus(); };

  // Column widths: a drag on a heading's right edge (or Left and Right on it); a double-click on the edge, or Fit to
  // contents in the column's menu, makes the column as wide as its longest value shown; Reset column widths puts them
  // back. The first change fixes every column at its current width but one (the last without a set width), which takes
  // the room the others leave, at least 140px, until its own edge is dragged; wider columns make the dialog scroll sideways.
  const firstWidths = cols.map(col => col.dataset.w || ''), firstMin = table.dataset.min ? `${table.dataset.min}px` : '';
  let free = cols.length - 1; for (let index = cols.length - 1; index >= 0; index--) if (!/px$/.test(firstWidths[index] || '')) { free = index; break; }
  // hold: while dragging in a table scrolled sideways, it keeps the width it had (so it does not slide under the pointer).
  const fill = (hold: number) => {
    const open = cols.some(col => !col.style.width), fixed = cols.reduce((sum, col) => sum + (parseFloat(col.style.width) || 0), 0), min = fixed + (open ? 140 : 0);
    table.style.width = open ? '' : `${fixed}px`; table.style.minWidth = `${min}px`; section.style.minWidth = `${Math.max(min + 2, hold)}px`;
  };
  const fix = () => { if (table.dataset.sized) return; const widths = heads.map(head => head.getBoundingClientRect().width); widths.forEach((width, index) => { if (cols[index]) cols[index]!.style.width = index === free ? '' : `${Math.round(width)}px`; }); table.dataset.sized = '1'; fill(0); };
  const size = (index: number, width: number, hold = 0) => {
    const col = cols[index]; if (!col) return; const px = Math.max(56, Math.min(2000, Math.round(width))); col.style.width = `${px}px`; announce(index, px); fill(hold);
  };
  // The handle tells screen readers the width it sets.
  const announce = (index: number, px: number) => { const handle = heads[index] && heads[index]!.querySelector('.d365lu-col-resize'); if (handle) { handle.setAttribute('aria-valuenow', String(px)); handle.setAttribute('aria-valuetext', `${px} pixels`); } };
  const resetWidths = () => { cols.forEach((col, index) => { col.style.width = firstWidths[index] || ''; }); table.style.width = ''; table.style.minWidth = firstMin; section.style.minWidth = firstMin ? `${parseFloat(firstMin) + 2}px` : ''; delete table.dataset.sized; };
  const textWidth = (node: Node) => { const range = doc.createRange(); range.selectNodeContents(node); return typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect().width : 0; };
  const fit = (index: number) => {
    const head = heads[index]; if (!head) return; fix(); table.classList.add('d365lu-measuring'); // measured on one line
    const name = head.querySelector('.l'), ind = head.querySelector('.ind');
    let width = (name ? textWidth(name) + (ind ? ind.getBoundingClientRect().width : 0) + 4 + 16 + 8 : textWidth(head) + 28) + 10;
    let measured = 0; rows.forEach(row => { if (measured < 2000 && row.style.display !== 'none' && row.cells[index]) { measured++; width = Math.max(width, textWidth(row.cells[index]!) + 30); } });
    table.classList.remove('d365lu-measuring'); size(index, Math.min(900, Math.ceil(width)));
  };
  heads.forEach((head, index) => {
    const handle = head.querySelector('.d365lu-col-resize') as HTMLElement | null; if (!handle) return;
    handle.onpointerdown = event => {
      if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); closePop();
      const start = event.clientX, scroller = section.closest('.d365lu-table-area'), hold = section.offsetWidth; let width = 0, moved = false;
      try { handle.setPointerCapture(event.pointerId); } catch { /* the move still works while over the handle */ }
      section.classList.add('d365lu-resizing');
      handle.onpointermove = move => {
        if (!moved) { if (Math.abs(move.clientX - start) < 3) return; moved = true; fix(); width = parseFloat(cols[index] ? cols[index]!.style.width : '') || head.getBoundingClientRect().width; } // a click is not a resize
        size(index, width + move.clientX - start, scroller && scroller.scrollLeft > 0 ? hold : 0);
      };
      handle.onpointerup = handle.onpointercancel = handle.onlostpointercapture = () => { handle.onpointermove = null; handle.onpointerup = handle.onpointercancel = handle.onlostpointercapture = null; section.classList.remove('d365lu-resizing'); if (moved) fill(0); };
    };
    handle.onclick = event => event.stopPropagation();
    handle.onfocus = () => announce(index, Math.round(head.getBoundingClientRect().width));
    handle.ondblclick = event => { event.preventDefault(); event.stopPropagation(); fit(index); };
    handle.onkeydown = event => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; event.preventDefault(); fix(); size(index, (parseFloat(cols[index] ? cols[index]!.style.width : '') || head.getBoundingClientRect().width) + (event.key === 'ArrowRight' ? 16 : -16)); };
  });

  // The column menu: under its heading (or above it when there is more room there), inside the dialog.
  const MAX_LISTED = 300; // values listed at once; a search finds the others
  function placePop(): void {
    if (!pop || pop.hidden || !popButton) return;
    const frame = pop.parentElement || frameOf(), box = frame.getBoundingClientRect(), anchor = popButton.getBoundingClientRect(), top = box.top + frame.clientTop, left = box.left + frame.clientLeft;
    const scroller = section.closest('.d365lu-table-area'), view = scroller && scroller.getBoundingClientRect();
    if (view && (anchor.bottom < view.top || anchor.top > view.bottom || anchor.right < view.left || anchor.left > view.right)) { closePop(); return; } // its heading scrolled away
    const below = box.bottom - anchor.bottom - 12, above = anchor.top - box.top - 12, up = below < 300 && above > below;
    pop.style.left = `${Math.max(8, Math.min(anchor.left - left, frame.clientWidth - pop.offsetWidth - 8))}px`;
    pop.style.maxHeight = `${Math.max(Math.min(160, frame.clientHeight - 16), Math.min(520, up ? above : below))}px`;
    if (up) { pop.style.top = 'auto'; pop.style.bottom = `${top + frame.clientHeight - anchor.top + 4}px`; } else { pop.style.bottom = 'auto'; pop.style.top = `${anchor.bottom - top + 4}px`; }
  }
  function closePop(focus?: boolean): void {
    if (!pop || pop.hidden) return;
    const active = (pop.getRootNode() as Document | ShadowRoot).activeElement, inside = !!active && pop.contains(active); // focus must not fall out of the dialog
    pop.hidden = true; const head = popButton; popCol = -1; popButton = null;
    if (head) { head.setAttribute('aria-expanded', 'false'); if ((focus || inside) && head.isConnected) head.focus({ preventScroll: !focus }); }
  }
  const part = (selector: string) => pop!.querySelector(selector) as HTMLElement;
  const syncAll = () => {
    const own = filters[popCol], all = part('.pv-all input') as HTMLInputElement | null; (part('[data-act="clear"]') as HTMLButtonElement).disabled = !own;
    if (!all) return; const ticked = popShown.filter(([value]) => !own || own.has(value)).length;
    all.checked = ticked === popShown.length; all.indeterminate = ticked > 0 && ticked < popShown.length;
  };
  const renderPop = () => {
    const input = part('input[type="search"]') as HTMLInputElement, list = part('.pop-list'), query = input.value.trim().toLowerCase(), own = filters[popCol];
    part('[data-act="reset"]').hidden = !table.dataset.sized;
    popShown = columnValues(popCol).filter(([value]) => !query || label(value).toLowerCase().indexOf(query) >= 0);
    Array.prototype.forEach.call(pop!.querySelectorAll('[data-sort]'), (item: HTMLElement) => { const mark = item.querySelector('.ck'); if (mark) mark.innerHTML = sortBy && sortBy.col === popCol && sortBy.dir === Number(item.dataset.sort) ? svg('check', 16) : ''; });
    list.textContent = '';
    const line = (className: string, name: string, extra?: string) => {
      const row = doc.createElement('label'); row.className = className; const box = doc.createElement('input'); box.type = 'checkbox'; const value = doc.createElement('span'); value.className = 'v'; value.textContent = name; value.title = name; row.append(box, value);
      if (extra != null) { const tally = doc.createElement('span'); tally.className = 'n'; tally.textContent = extra; row.append(tally); }
      list.append(row); return box;
    };
    const note = (message: string) => { const div = doc.createElement('div'); div.className = 'pop-more'; div.textContent = message; list.append(div); };
    if (popShown.length) line('pv pv-all', query ? 'Select all search results' : 'Select all'); else note('No values match the search.');
    popShown.slice(0, MAX_LISTED).forEach(([value, number], index) => { const box = line('pv', label(value), number.toLocaleString()); box.dataset.i = String(index); box.checked = !own || own.has(value); });
    if (popShown.length > MAX_LISTED) note(`${(popShown.length - MAX_LISTED).toLocaleString()} more values. Search to find them.`);
    syncAll();
  };
  const buildPop = () => {
    const menu = doc.createElement('div'); menu.className = 'd365lu-pop'; menu.setAttribute('role', 'dialog'); menu.hidden = true; menu.tabIndex = -1; // a press on a value's name focuses the menu, not the dialog
    const item = (attrs: string, icon: string, name: string) => `<button type="button" class="mi" ${attrs}><span class="ck"></span><span class="si">${svg(icon, 16)}</span>${name}</button>`;
    menu.innerHTML = item('data-sort="1"', 'up', 'Sort A to Z') + item('data-sort="-1"', 'down', 'Sort Z to A') + item('data-act="fit"', 'fit', 'Fit to contents') + item('data-act="reset" hidden', 'reset', 'Reset column widths')
      + `<div class="sep"></div><label class="d365lu-table-search">${svg('search', 16)}<input type="search" class="d365lu-table-search-input" autocomplete="off"></label><div class="pop-list"></div>`
      + '<div class="pop-foot"><button type="button" class="d365lu-btn subtle" data-act="clear">Clear filter</button><span class="spacer"></span><button type="button" class="d365lu-btn primary" data-act="done">Done</button></div>';
    const frame = frameOf(); frame.append(menu); pop = menu;
    const input = part('input[type="search"]') as HTMLInputElement, list = part('.pop-list');
    list.onchange = event => {
      const box = event.target as HTMLInputElement, col = popCol; if (col < 0) return;
      if (box.closest('.pv-all')) { const set = currentSet(col); popShown.forEach(([value]) => { if (box.checked) set.add(value); else set.delete(value); }); setFilter(col, set); Array.prototype.forEach.call(list.querySelectorAll('input[data-i]'), (other: HTMLInputElement) => { other.checked = box.checked; }); }
      else if (box.dataset.i != null && popShown[Number(box.dataset.i)]) { const value = popShown[Number(box.dataset.i)]![0], set = currentSet(col); if (box.checked) set.add(value); else set.delete(value); setFilter(col, set); }
      syncAll();
    };
    input.oninput = renderPop;
    input.onkeydown = event => { // Enter: only the values found that are ticked, as in Excel
      if (event.key !== 'Enter' || popCol < 0) return; event.preventDefault();
      const own = filters[popCol], keep = popShown.filter(([value]) => !own || own.has(value)).map(([value]) => value);
      if (input.value.trim() && keep.length) { setFilter(popCol, new Set(keep)); closePop(true); }
    };
    menu.onclick = event => {
      const target = (event.target as HTMLElement).closest('button'); if (!target || popCol < 0) return; const col = popCol;
      if (target.dataset.sort) { const dir = Number(target.dataset.sort); sortBy = sortBy && sortBy.col === col && sortBy.dir === dir ? null : { col, dir }; placeRows(); closePop(true); draw(); } // the same again: back to the first order
      else if (target.dataset.act === 'fit') { closePop(true); fit(col); }
      else if (target.dataset.act === 'reset') { resetWidths(); closePop(true); }
      else if (target.dataset.act === 'clear') { setFilter(col, null); renderPop(); input.focus(); } // the button is now disabled: focus stays in the menu
      else if (target.dataset.act === 'done') closePop(true);
    };
    menu.addEventListener('focusout', event => { const to = event.relatedTarget as Node | null; if (to && !menu.contains(to) && to !== popButton) closePop(); });
    // Tab past its first or last control goes back to its heading (not to the far end of the dialog).
    menu.onkeydown = event => {
      if (event.key !== 'Tab') return; const active = (menu.getRootNode() as Document | ShadowRoot).activeElement;
      const items = Array.prototype.filter.call(menu.querySelectorAll('button,input'), (item: HTMLButtonElement) => !item.disabled && !item.closest('[hidden]')) as HTMLElement[];
      if (!items.length || (event.shiftKey ? active === items[0] || active === menu : active === items[items.length - 1])) { event.preventDefault(); event.stopPropagation(); closePop(true); }
    };
    // Esc anywhere in the dialog clears the menu's search when it has text, else closes the menu (the dialog stays); a
    // press anywhere else in the dialog closes it; scrolling or resizing keeps it under its heading.
    frame.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !pop || pop.hidden) return; event.preventDefault(); event.stopPropagation();
      if (event.target === input && input.value) { input.value = ''; renderPop(); } else closePop(true);
    }, true);
    frame.addEventListener('pointerdown', event => { const target = event.target as Node; if (pop && !pop.hidden && !pop.contains(target) && !(popButton && popButton.contains(target))) closePop(); });
    const scroller = section.closest('.d365lu-table-area'); if (scroller) scroller.addEventListener('scroll', placePop, { passive: true });
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => placePop()).observe(frame);
  };
  const openPop = (col: number, head: HTMLElement) => {
    if (pop && !pop.hidden && popCol === col) { closePop(true); return; }
    closePop(); if (!pop) buildPop();
    popCol = col; popButton = head;
    const what = ((head.querySelector('.l') || head).textContent || '').toLowerCase(), input = part('input[type="search"]') as HTMLInputElement;
    pop!.setAttribute('aria-label', `Sort and filter ${what}`); input.value = ''; input.placeholder = `Search ${what}`; input.setAttribute('aria-label', `Search ${what}`);
    renderPop(); pop!.hidden = false; head.setAttribute('aria-expanded', 'true'); placePop();
    setTimeout(() => { if (popCol === col) input.focus(); }, 0);
  };
  buttons.forEach(head => { head.setAttribute('aria-expanded', 'false'); head.onclick = () => openPop(Number(head.dataset.col), head); });
  if (rows.some((row, index) => row.parentNode !== body || body.rows[index] !== row)) placeRows();
  draw();
}

function format(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Object.prototype.toString.call(value) === '[object Date]') { const date = value as Date; return Number.isNaN(date.getTime()) ? String(date) : date.toISOString(); }
  if (typeof value === 'object') { try { return JSON.stringify(value, null, 2); } catch { return String(value); } }
  return String(value);
}

const GUID = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;
/** JSON and long multi-line values get a scrolling code box; ids a monospace face. */
function valueStyle(raw: unknown, text: string): string {
  if ((raw && typeof raw === 'object') || text.split('\n').length > 3 || (/^[[{]/.test(text.trim()) && text.length > 80)) return ' is-code';
  return GUID.test(text.trim()) ? ' is-mono' : '';
}

/** What the search finds in a cell: a long value's whole text (its Copy button holds it), never the button's label. */
function searchText(value: TableCell): string {
  if (!(value instanceof HTMLElement)) return format(value);
  const copy = value.querySelector<HTMLElement>('.d365lu-copy[data-d365lu-copy-value]') ?? (value.matches('.d365lu-copy[data-d365lu-copy-value]') ? value : null); if (copy) return copy.dataset.d365luCopyValue ?? '';
  const clone = value.cloneNode(true) as HTMLElement; clone.querySelectorAll('button').forEach(node => node.remove()); return clone.textContent ?? '';
}
function escapeHtml(value: string): string { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }
