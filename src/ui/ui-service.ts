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
  const dark = theme === 'dark';
  const css = `${CSS_TEXT.replace(':host{', ':root{')}html,body{margin:0;width:100%;height:100%;background:${dark ? '#1f1f1f' : '#f5f5f5'};font-family:"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}.d365lu-modal{margin:0;width:100%;height:100vh;max-width:none;max-height:none;border-radius:0;box-shadow:none}.d365lu-modal-head{position:sticky;top:0;z-index:100;background:var(--bg1)}.d365lu-modal-body{width:100%}`;
  const behavior = `document.querySelector('.d365lu-modal-close').onclick=function(){window.close()};document.querySelectorAll('.d365lu-table-nav-link').forEach(function(link){link.onclick=function(event){event.preventDefault();var target=document.querySelector(link.hash);if(target)target.scrollIntoView({behavior:'smooth',block:'start'})}});document.querySelectorAll('.d365lu-table-search-input').forEach(function(input){var section=input.closest('.d365lu-table-section'),rows=Array.from(section.querySelectorAll('tbody tr[data-searchable]')),clear=section.querySelector('.d365lu-table-search-clear');function draw(){var needle=input.value.toLowerCase().trim();rows.forEach(function(row){row.style.display=!needle||row.dataset.searchable.includes(needle)?'':'none'});clear.classList.toggle('hidden',!input.value)}input.oninput=draw;clear.onclick=function(){input.value='';draw();input.focus()}});document.querySelectorAll('.d365lu-copy').forEach(function(button){button.onclick=function(){var v=button.dataset.d365luCopyValue,f=()=>prompt('Copy',v);navigator.clipboard?.writeText(v).catch(f)||f()}});`;
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

  table(title: string, columns: string[], rows: TableCell[][], searchable = false, options: { subtitle?: string } = {}): void {
    this.tableGroup(title, [{ title, headers: columns, rows }], searchable, options);
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
  if (config.description) header.append(el('p', 'd365lu-table-description', config.description));
  section.append(header);
  const table = el('table', 'd365lu-table'); const headRow = el('tr'); config.headers.forEach(value => headRow.append(el('th', '', value))); const thead = el('thead'); thead.append(headRow); const tbody = el('tbody');
  const valueColumn = config.headers.length === 2;
  if (config.rows.length) for (const row of config.rows) {
    const tr = el('tr'); tr.dataset.searchable = row.map(cellText).join(' ').toLowerCase();
    row.forEach((value, cellIndex) => { const td = el('td', valueColumn && cellIndex === row.length - 1 ? 'value-cell' : ''); if (value instanceof HTMLElement) td.append(value); else td.textContent = format(value); tr.append(td); });
    tbody.append(tr);
  } else { const tr = el('tr', 'empty-row'); const td = el('td', '', 'No data available'); td.colSpan = config.headers.length; tr.append(td); tbody.append(tr); }
  table.append(thead, tbody);
  if (searchable) {
    const label = el('label', 'd365lu-table-search'); const icon = el('span'); icon.append(strokeIcon('search', 16)); const input = el('input', 'd365lu-table-search-input'); input.type = 'search'; input.placeholder = 'Search…'; input.setAttribute('aria-label', `Search ${config.title}`);
    const clear = el('button', 'd365lu-table-search-clear hidden'); clear.type = 'button'; clear.setAttribute('aria-label', 'Clear search'); clear.append(strokeIcon('close', 14));
    const rows = [...tbody.querySelectorAll<HTMLTableRowElement>('tr[data-searchable]')]; let timer: ReturnType<typeof setTimeout> | undefined;
    const draw = () => { const needle = input.value.toLowerCase().trim(); rows.forEach(row => { row.style.display = !needle || (row.dataset.searchable ?? '').includes(needle) ? '' : 'none'; }); clear.classList.toggle('hidden', !input.value); };
    input.oninput = () => { clear.classList.toggle('hidden', !input.value); if (timer) clearTimeout(timer); if (rows.length > 300) timer = setTimeout(draw, 150); else draw(); };
    // Esc in a non-empty search clears it instead of closing the dialog.
    input.onkeydown = event => { if (event.key === 'Escape' && input.value) { event.preventDefault(); event.stopPropagation(); input.value = ''; draw(); } };
    clear.onclick = () => { input.value = ''; draw(); input.focus(); };
    label.append(icon, input, clear); section.append(label);
  }
  section.append(table);
  section.querySelectorAll<HTMLButtonElement>('.d365lu-copy[data-d365lu-copy-value]').forEach(copy => { copy.onclick = () => void copyText(copy.dataset.d365luCopyValue ?? '').then(() => ui.toast('OptionSet Value copied', 'success'), error => ui.toast(String(error), 'error')); });
  return section;
}

function format(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') { try { return JSON.stringify(value, null, 2); } catch { return String(value); } }
  return String(value);
}

const GUID = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;
/** JSON and long multi-line values get a scrolling code box; ids a monospace face. */
function valueStyle(raw: unknown, text: string): string {
  if ((raw && typeof raw === 'object') || text.split('\n').length > 3 || (/^[[{]/.test(text.trim()) && text.length > 80)) return ' is-code';
  return GUID.test(text.trim()) ? ' is-mono' : '';
}

function cellText(value: TableCell): string { return value instanceof HTMLElement ? value.textContent ?? '' : format(value); }
function escapeHtml(value: string): string { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }
