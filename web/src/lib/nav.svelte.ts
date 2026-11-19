// Tabs, each with its own stack of pushed screens.

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
  | { name: 'recovery' };

class Nav {
  tab = $state<Tab>('today');
  stacks = $state<Record<Tab, Route[]>>({ today: [], progress: [], you: [] });

  get top(): Route | undefined { const s = this.stacks[this.tab]; return s[s.length - 1]; }

  push(route: Route) {
    this.stacks[this.tab] = [...this.stacks[this.tab], route];
    scrollTo({ top: 0 });
  }

  pop() { this.stacks[this.tab] = this.stacks[this.tab].slice(0, -1); }

  select(tab: Tab) {
    // Tapping the current tab goes back to its root, as on iOS.
    if (tab === this.tab) this.stacks[tab] = [];
    this.tab = tab;
    scrollTo({ top: 0 });
  }
}

export const nav = new Nav();
