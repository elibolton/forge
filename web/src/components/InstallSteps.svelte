<script lang="ts">
  import { Share, SquarePlus, ToggleRight } from '@lucide/svelte';

  /** How to add Forge to the Home Screen in Safari: iOS 26 first, with the older toolbar Share as an alternative. */
</script>

<ol class="sub steps">
  <li>Tap <b class="dots">⋯</b> at the bottom of Safari, then <Share size={16} class="inline-ico" aria-hidden="true" /> <b>Share</b>.
    <span class="caption muted alt">On older iOS, tap <b>Share</b> in Safari's toolbar.</span></li>
  <li>Scroll down and choose <SquarePlus size={16} class="inline-ico" aria-hidden="true" /> <b>Add to Home Screen</b>.</li>
  <li>Keep <ToggleRight size={16} class="inline-ico" aria-hidden="true" /> <b>Open as Web App</b> on, then tap <b>Add</b>.
    <span class="caption muted alt">If it's off, Forge opens in Safari and keeps Safari's data.</span></li>
  <li>Open Forge from your Home Screen.</li>
</ol>

<style>
  .steps { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; line-height: 1.45; }
  .alt { display: block; margin-top: 2px; }
  .dots { display: inline-block; padding: 0 6px; border-radius: 6px; background: var(--surface-3); }
  .steps :global(.inline-ico) { vertical-align: -3px; }
</style>
