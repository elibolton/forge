/** Short-lived banners with an optional Undo, used instead of confirmation dialogs for reversible actions. */
interface Toast { id: number; message: string; undo?: () => void }

let nextID = 1;

class ToastCenter {
  current = $state<Toast | null>(null);

  show(message: string, undo?: () => void) {
    const toast = { id: nextID++, message, undo };
    this.current = toast;
    // Undo needs time to notice and reach for; plain confirmations can go sooner.
    setTimeout(() => { if (this.current?.id === toast.id) this.current = null; }, undo ? 7000 : 3000);
  }

  performUndo() {
    const undo = this.current?.undo;
    this.current = null;
    undo?.();
  }
}

export const toasts = new ToastCenter();
