/** Page decorations (badges, highlights, links) grouped by owner, so each feature can be undone on its own. */
export class DecorationManager {
  private nodes = new Map<string, Set<Node>>();
  private restorers = new Map<string, Set<() => void>>();
  private observers = new Map<string, MutationObserver>();
  private disposed = false;

  addNode(owner: string, node: Node): void {
    if (this.disposed) { node.parentNode?.removeChild(node); return; }
    const nodes = this.nodes.get(owner) ?? new Set<Node>();
    nodes.add(node);
    this.nodes.set(owner, nodes);
  }

  addRestore(owner: string, restore: () => void): void {
    if (this.disposed) { try { restore(); } catch { /* host changed */ } return; }
    const restorers = this.restorers.get(owner) ?? new Set<() => void>();
    restorers.add(restore);
    this.restorers.set(owner, restorers);
  }

  /**
   * Runs callback after the page adds content (a tab rendered, a form re-rendered). Changes that add no elements, or
   * only Level Up's own decorations, are ignored; the wait restarts with each change but never exceeds maxWait, so
   * a page that changes constantly (timers, presence) still gets decorated.
   */
  observe(owner: string, document: Document, callback: () => void, delay = 180, maxWait = 700): void {
    if (this.disposed) return;
    this.observers.get(owner)?.disconnect();
    let timer = 0, first = 0;
    // Level Up's own nodes (badges, the <br> before them, notices, the panel host) never count as page changes.
    const own = (node: Node) => node.nodeType === 1 && (node.nodeName === 'BR' || (node as Element).matches('[data-d365lu-logical-names],[data-d365lu-field-editor],[data-d365lu-lookup-link],[data-d365lu-copy-notice],.levelup-logical-name') || (node as Element).id === 'd365-levelup-bookmarklet-host');
    const run = () => { first = 0; callback(); };
    const observer = new MutationObserver(records => {
      // New page content, or a badge the page itself removed (a script re-rendered a label): decorate again.
      if (!records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && !own(node)) || [...record.removedNodes].some(own))) return;
      const now = Date.now(); if (!first) first = now;
      window.clearTimeout(timer);
      timer = window.setTimeout(run, Math.max(0, Math.min(delay, maxWait - (now - first))));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    this.observers.set(owner, observer);
    this.addRestore(owner, () => window.clearTimeout(timer));
  }

  has(owner: string): boolean { return this.nodes.has(owner) || this.restorers.has(owner) || this.observers.has(owner); }

  removeOwner(owner: string): void {
    this.observers.get(owner)?.disconnect();
    this.observers.delete(owner);
    for (const restore of [...(this.restorers.get(owner) ?? [])].reverse()) { try { restore(); } catch { /* host changed */ } }
    this.restorers.delete(owner);
    for (const node of this.nodes.get(owner) ?? []) node.parentNode?.removeChild(node);
    this.nodes.delete(owner);
  }

  /** Removes every decoration (navigation); the manager stays usable. */
  clear(): void {
    const owners = new Set([...this.nodes.keys(), ...this.restorers.keys(), ...this.observers.keys()]);
    owners.forEach(owner => this.removeOwner(owner));
  }

  /** The panel was destroyed: remove everything, and undo anything a still-running action adds later. */
  dispose(): void { this.clear(); this.disposed = true; }
}
