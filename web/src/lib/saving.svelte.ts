// Every write to the device goes through here, so a failed save is never silent: the app shows a
// banner, keeps the latest failed write for each thing it saves, and can try them again.

/** Turns a storage error into something a person can act on. */
export function saveErrorMessage(e: unknown): string {
  const name = (e as { name?: string } | null)?.name;
  if (name === 'QuotaExceededError') return 'Your phone is out of storage space for Forge.';
  return 'Forge couldn\'t save to this device.';
}

let onSaved: (() => void) | undefined;
/** Called after every write that reaches the device (other tabs are told about it). */
export function onEverySave(f: () => void) { onSaved = f; }

class Saving {
  /** Set while any write is still failing. */
  error = $state<string | null>(null);
  /** Why the most recent failed write failed, kept after it's retried or given up on. */
  lastFailure = $state<string | null>(null);
  /** The latest failed write for each key; a newer write to the same key replaces it. */
  private failed = new Map<string, () => Promise<unknown>>();

  /**
   * Runs `write`, remembering it under `key` if it fails. Resolves to whether it saved; never rejects.
   * Writes to IndexedDB run in the order they're made, so the newest write for a key lands last.
   */
  run(key: string, write: () => Promise<unknown>): Promise<boolean> {
    return this.runBatch([key], write, () => write);
  }

  /**
   * One write that saves several records at once. If it fails, each record is remembered under its own
   * key with `retryOne(i)` as its retry, so a later write to one of them (a delete, an edit) replaces
   * just that record's retry instead of leaving the old batch to bring it back.
   */
  runBatch(keys: string[], write: () => Promise<unknown>, retryOne: (i: number) => () => Promise<unknown>): Promise<boolean> {
    // A write that throws before returning a promise counts as a failed save too.
    return new Promise<unknown>((resolve) => resolve(write())).then(
      () => {
        for (const key of keys) this.failed.delete(key);
        if (!this.failed.size) this.error = null;
        onSaved?.();
        return true;
      },
      (e) => {
        console.error(`Could not save ${keys.join(', ')}`, e);
        keys.forEach((key, i) => this.failed.set(key, retryOne(i)));
        this.error = this.lastFailure = saveErrorMessage(e);
        return false;
      },
    );
  }

  /** Tries every failed write again. Resolves to whether they all saved. */
  async retry(): Promise<boolean> {
    let ok = true;
    for (const [key, write] of [...this.failed]) ok = (await this.run(key, write)) && ok;
    return ok;
  }

  /** A whole-store replace makes earlier failed writes to that store moot. */
  forget(prefix: string) {
    for (const key of [...this.failed.keys()]) if (key.startsWith(prefix)) this.failed.delete(key);
    if (!this.failed.size) this.error = null;
  }
}

export const saving = new Saving();
