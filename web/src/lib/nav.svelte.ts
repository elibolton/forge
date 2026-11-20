// Tabs, each with its own stack of pushed screens. Pushes are mirrored into browser history so the
// system back gesture / button and our own back buttons all go through the same path, and each
// screen remembers where it was scrolled to.

export type Tab = 'today' | 'progress' | 'you';

export type Route =
  | { name: 'exercise'; id: string }
  | { name: 'program'; id: string }
  | { name: 'programs' }
  | { name: 'plan' }
  | { name: 'history' }
  | { name: 'log'; id: string }
  | { name: 'gym'; id: string }
  | { name: 'style' }
  | { name: 'injuries' }
  | { name: 'preferences' }
  | { name: 'customExercises' }
  | { name: 'data' }
  | { name: 'account' }
  | { name: 'recovery' };

class Nav {
  tab = $state<Tab>('today');
  stacks = $state<Record<Tab, Route[]>>({ today: [], progress: [], you: [] });
  /** Which way the last move went, for the screen transition. */
  direction = $state<'forward' | 'back' | 'none'>('none');

  /** Scroll offset per screen, keyed by tab and stack depth. */
  private scroll = new Map<string, number>();

  constructor() {
    if (typeof window === 'undefined') return;
    history.scrollRestoration = 'manual';
    // A base entry to stand on, so the first back doesn't leave the app.
    history.replaceState({ forge: 0 }, '');
    window.addEventListener('popstate', () => this.popNow());
  }

  get top(): Route | undefined { const s = this.stacks[this.tab]; return s[s.length - 1]; }
  get depth(): number { return this.stacks[this.tab].length; }
  /** Changes whenever the visible screen changes. */
  get key(): string { return `${this.tab}:${this.depth}`; }

  private remember() { this.scroll.set(this.key, scrollY); }

  /** Where the screen now showing was left, or the top for a new one. */
  savedScroll(): number { return this.direction === 'forward' ? 0 : this.scroll.get(this.key) ?? 0; }

  push(route: Route) {
    this.remember();
    this.direction = 'forward';
    this.stacks[this.tab] = [...this.stacks[this.tab], route];
    history.pushState({ forge: this.depth }, '');
  }

  /** Back one screen. Goes through history so the browser's own back stays in step. */
  pop() {
    if (!this.depth) return;
    if (history.state?.forge) history.back(); else this.popNow();
  }

  private popNow() {
    if (!this.depth) return;
    this.scroll.delete(this.key);
    this.direction = 'back';
    this.stacks[this.tab] = this.stacks[this.tab].slice(0, -1);
  }

  select(tab: Tab) {
    this.remember();
    this.direction = 'none';
    if (tab === this.tab) {
      // Tapping the current tab goes back to its root, as on iOS.
      for (let d = this.depth; d > 0; d--) this.scroll.delete(`${tab}:${d}`);
      this.scroll.set(`${tab}:0`, 0);
      this.stacks[tab] = [];
    }
    this.tab = tab;
  }
}

export const nav = new Nav();
