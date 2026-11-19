/** Short-lived banners with an optional Undo, used instead of confirmation dialogs for reversible actions. */
export interface Toast { id: number; message: string; undo?: () => void }

let nextID = 1;

/** More than this and the oldest plain confirmation goes first; an Undo is only dropped as a last resort. */
const MAX_SHOWN = 3;

class ToastCenter {
  /** Oldest first. Several can show at once, so a second undoable action never takes away the first one's Undo. */
  items = $state<Toast[]>([]);

  /** The newest toast, if any. */
  get current(): Toast | null { return this.items[this.items.length - 1] ?? null; }

  show(message: string, undo?: () => void): number {
    const toast = { id: nextID++, message, undo };
    // The same plain message again (e.g. "Still not saving" twice) replaces the old one rather than stacking.
    let next = this.items.filter((t) => t.undo || undo || t.message !== message);
    next.push(toast);
    while (next.length > MAX_SHOWN) {
      const plain = next.findIndex((t) => !t.undo);
      next = next.filter((_, i) => i !== (plain === -1 ? 0 : plain));
    }
    this.items = next;
    // Undo needs time to notice and reach for; plain confirmations can go sooner.
    setTimeout(() => this.dismiss(toast.id), undo ? 7000 : 3000);
    return toast.id;
  }

  dismiss(id: number) {
    if (this.items.some((t) => t.id === id)) this.items = this.items.filter((t) => t.id !== id);
  }

  /** Runs a toast's Undo (the newest undoable one if no id is given) and removes it. */
  performUndo(id?: number) {
    const toast = id === undefined ? [...this.items].reverse().find((t) => t.undo) : this.items.find((t) => t.id === id);
    if (!toast) return;
    this.dismiss(toast.id);
    toast.undo?.();
  }
}

export const toasts = new ToastCenter();
