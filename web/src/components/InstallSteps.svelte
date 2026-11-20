<script lang="ts">
  import { Download, EllipsisVertical, Menu, Share, SquarePlus, ToggleRight } from '@lucide/svelte';
  import { type Device, browserName, device as detected, installPrompt } from '../lib/install.svelte';

  /** How to add Forge to the Home Screen on this phone's OS and browser. `device` is for previews and tests. */
  let { device = detected }: { device?: Device } = $props();
</script>

{#if device.os === 'android' && installPrompt.available}
  <button class="btn primary block install" onclick={() => installPrompt.show()}><Download size={18} /> Install Forge</button>
  <p class="caption muted or">Or from the menu:</p>
{/if}

<ol class="sub steps">
  {#if device.os === 'ios' && device.browser === 'safari'}
    <li>Tap <b class="dots">⋯</b> at the bottom of Safari, then <Share size={16} class="inline-ico" aria-hidden="true" /> <b>Share</b>.
      <span class="caption muted alt">On older iOS, tap <b>Share</b> in Safari's toolbar.</span></li>
    <li>Scroll down and choose <SquarePlus size={16} class="inline-ico" aria-hidden="true" /> <b>Add to Home Screen</b>.</li>
    <li>Keep <ToggleRight size={16} class="inline-ico" aria-hidden="true" /> <b>Open as Web App</b> on, then tap <b>Add</b>.
      <span class="caption muted alt">If it's off, Forge opens in Safari and keeps Safari's data.</span></li>
  {:else if device.os === 'ios' && device.browser === 'firefox'}
    <li>Tap <Menu size={16} class="inline-ico" aria-hidden="true" /> at the bottom right, then <Share size={16} class="inline-ico" aria-hidden="true" /> <b>Share</b>.</li>
    <li>Choose <SquarePlus size={16} class="inline-ico" aria-hidden="true" /> <b>Add to Home Screen</b>.</li>
    <li>Keep <b>Open as Web App</b> on if you see it, then tap <b>Add</b>.</li>
  {:else if device.os === 'ios'}
    <li>Tap <Share size={16} class="inline-ico" aria-hidden="true" /> <b>Share</b> in the address bar at the top of {browserName[device.browser]}.</li>
    <li>Scroll down and choose <SquarePlus size={16} class="inline-ico" aria-hidden="true" /> <b>Add to Home Screen</b>.</li>
    <li>Keep <b>Open as Web App</b> on if you see it, then tap <b>Add</b>.</li>
  {:else if device.os === 'android' && device.browser === 'samsung'}
    <li>Tap <Menu size={16} class="inline-ico" aria-hidden="true" /> at the bottom right of Samsung Internet.</li>
    <li>Choose <b>Add page to</b>, then <b>Home screen</b>.
      <span class="caption muted alt">Or tap the <Download size={14} class="inline-ico" aria-hidden="true" /> install icon in the address bar if it shows.</span></li>
    <li>Tap <b>Add</b>.</li>
  {:else if device.os === 'android' && device.browser === 'firefox'}
    <li>Tap <EllipsisVertical size={16} class="inline-ico" aria-hidden="true" /> next to the address bar.</li>
    <li>Choose <b>Add app to Home screen</b> (or <b>Install</b>).</li>
    <li>Tap <b>Add</b>.</li>
  {:else if device.os === 'android'}
    <li>Tap <EllipsisVertical size={16} class="inline-ico" aria-hidden="true" /> at the top right of {browserName[device.browser]}.</li>
    <li>Choose <b>Install app</b>, or <b>Add to Home screen</b> and then <b>Install</b>.
      <span class="caption muted alt">Pick Install rather than Create shortcut, so Forge opens as its own app.</span></li>
    <li>Tap <b>Install</b> to confirm.</li>
  {:else}
    <li>Open your browser's menu and choose <b>Install Forge</b> or <b>Add to Home Screen</b>.</li>
  {/if}
  <li>Open Forge from your {device.os === 'android' ? 'home screen' : 'Home Screen'}.</li>
</ol>

<style>
  .steps { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; line-height: 1.45; }
  .alt { display: block; margin-top: 2px; }
  .dots { display: inline-block; padding: 0 6px; border-radius: 6px; background: var(--surface-3); }
  .steps :global(.inline-ico) { vertical-align: -3px; }
  .install { margin-bottom: 4px; }
  .or { margin: 6px 0 8px; }
</style>
