export class CleanupRegistry {
  private callbacks = new Set<() => void>();

  add(callback: () => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  run(): void {
    for (const callback of [...this.callbacks]) {
      try { callback(); } catch { /* best-effort host cleanup */ }
    }
    this.callbacks.clear();
  }
}
