import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Bug hunt batch 3: U11 (nested sheets unlock scroll), U12 (Escape closes every overlay; focus not returned).
type Key = { key: string; preventDefault: () => void };
let keyListeners: ((e: Key) => void)[] = [];
const body = { style: { overflow: '' } };
const el = (name: string) => ({ name, isConnected: true, focus: vi.fn() });
const doc = { addEventListener: (_: string, f: (e: Key) => void) => keyListeners.push(f), activeElement: null as unknown, body };
vi.stubGlobal('document', doc);

const { openOverlay, openOverlayCount } = await import('./overlays');
const press = (key: string) => keyListeners.forEach((f) => f({ key, preventDefault: () => {} }));

beforeEach(() => { body.style.overflow = ''; });
afterEach(() => expect(openOverlayCount()).toBe(0));

describe('Overlays', () => {
  test('closing an inner sheet keeps the page locked while the outer one is open', () => {
    const closeOuter = openOverlay(() => {}, { lockScroll: true });
    const closeInner = openOverlay(() => {}, { lockScroll: true });
    closeInner();
    expect(body.style.overflow).toBe('hidden');
    closeOuter();
    expect(body.style.overflow).toBe('');
  });

  test('Escape closes only the top-most overlay', () => {
    const sheet = vi.fn(), menu = vi.fn();
    const closeSheet = openOverlay(sheet, { lockScroll: true });
    const closeMenu = openOverlay(menu);
    press('Escape');
    expect(menu).toHaveBeenCalledOnce();
    expect(sheet).not.toHaveBeenCalled();
    closeMenu();
    press('Escape');
    expect(sheet).toHaveBeenCalledOnce();
    closeSheet();
  });

  test('focus goes back to what opened it, unless told it has moved on', () => {
    const trigger = el('trigger');
    doc.activeElement = trigger;
    openOverlay(() => {})();
    expect(trigger.focus).toHaveBeenCalledOnce();

    const menuButton = el('menu');
    openOverlay(() => {}, { returnFocus: menuButton as unknown as HTMLElement })(false);
    expect(menuButton.focus).not.toHaveBeenCalled();

    const gone = { ...el('gone'), isConnected: false };
    doc.activeElement = gone;
    openOverlay(() => {})();
    expect(gone.focus).not.toHaveBeenCalled();
  });
});
