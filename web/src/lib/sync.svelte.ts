// Keeping two open copies of Forge (a Safari tab beside the Home Screen app, two windows) from writing
// over each other. Each copy loads once and keeps its data in memory, so after another copy saves,
// this one's copy is out of date. Every save is announced on a BroadcastChannel; a copy that hears one
// reloads when it next comes into view, or, if it's on screen, offers to reload and meanwhile merges its
// settings changes into what's stored instead of writing its older copy over them.

import { onEverySave, saving } from './saving.svelte';

class Sync {
  /** Another copy of Forge saved since this one loaded. */
  stale = $state(false);
  private channel: BroadcastChannel | undefined;

  start() {
    if (this.channel || typeof BroadcastChannel === 'undefined') return;
    this.channel = new BroadcastChannel('forge-writes');
    this.channel.onmessage = () => { this.stale = true; };
    onEverySave(() => this.channel?.postMessage('saved'));
    // Out of view, nothing is mid-edit: pick up the other copy's changes as soon as this one is looked at.
    // A workout in progress is saved as it goes, so reloading carries on with it. Not while a save is
    // failing, though: that change exists only in memory, so the banner asks instead.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.stale && !saving.error) location.reload();
    });
  }
}

export const sync = new Sync();
