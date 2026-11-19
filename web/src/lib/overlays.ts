// Open sheets and menus, top-most last. Escape closes only the top one (not every overlay at once), and
// the page behind stays locked from scrolling until the last overlay that locked it has closed.

interface Overlay { onEscape: () => void; lockScroll: boolean }

const stack: Overlay[] = [];
let listening = false;

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !stack.length) return;
  e.preventDefault();
  stack[stack.length - 1].onEscape();
}

function syncScrollLock() {
  document.body.style.overflow = stack.some((o) => o.lockScroll) ? 'hidden' : '';
}

/**
 * Registers an open overlay. Returns the function to call when it closes, which also hands focus back to
 * `returnFocus` (by default whatever had focus when it opened), if that's still on the page, unless
 * told not to (focus has already moved on, e.g. to a sheet the menu opened).
 */
export function openOverlay(onEscape: () => void, opts: { lockScroll?: boolean; returnFocus?: HTMLElement | null } = {}): (restoreFocus?: boolean) => void {
  const entry: Overlay = { onEscape, lockScroll: opts.lockScroll ?? false };
  const previous = opts.returnFocus !== undefined ? opts.returnFocus : (document.activeElement as HTMLElement | null);
  stack.push(entry);
  if (!listening) { document.addEventListener('keydown', onKey); listening = true; }
  syncScrollLock();
  return (restoreFocus = true) => {
    const i = stack.indexOf(entry);
    if (i === -1) return;
    stack.splice(i, 1);
    syncScrollLock();
    if (restoreFocus && previous && previous !== document.body && previous.isConnected) previous.focus?.();
  };
}

/** How many overlays are open (for tests). */
export const openOverlayCount = () => stack.length;
