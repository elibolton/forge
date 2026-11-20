<script lang="ts">
  import type { Snippet } from 'svelte';
  import { X } from '@lucide/svelte';

  /**
   * One quiet card style for every secondary message on Today (backup, check-in, plan changed…), so
   * none competes with Start. Actions are small secondary buttons (`.notice-act`), never primaries.
   */
  type Tone = 'ember' | 'fresh' | 'warn' | 'info';
  let { icon: Icon, tone = 'ember', title, children, actions, onclose, closeLabel = 'Dismiss', role }: {
    icon: typeof X; tone?: Tone; title: string; children?: Snippet; actions?: Snippet;
    onclose?: () => void; closeLabel?: string; role?: 'note' | 'status' | 'alert';
  } = $props();
</script>

<section class="notice {tone}" {role}>
  <span class="ico" aria-hidden="true"><Icon size={16} strokeWidth={2.2} /></span>
  <div class="grow stack" style="--gap:3px;min-width:0">
    <div class="sub bold">{title}</div>
    {#if children}<div class="caption muted">{@render children()}</div>{/if}
    {#if actions}<div class="acts">{@render actions()}</div>{/if}
  </div>
  {#if onclose}
    <button class="close" aria-label={closeLabel} onclick={onclose}><X size={16} /></button>
  {/if}
</section>

<style>
  .notice { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: var(--r-md);
    background: var(--surface); border: 1px solid var(--hairline); }
  .ico { width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center; flex: none; }
  .ember .ico { background: var(--ember-soft); color: var(--ember-2); }
  .fresh .ico { background: rgba(60, 239, 176, 0.12); color: var(--fresh); }
  .warn .ico { background: rgba(255, 187, 69, 0.13); color: var(--recovering); }
  .info .ico { background: rgba(92, 150, 255, 0.15); color: #8db4ff; }
  .acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .acts :global(.notice-act) { position: relative; display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 6px 14px;
    border-radius: 999px; background: var(--surface-2); border: 1px solid var(--hairline-2); font-size: 0.86rem; font-weight: 620; color: var(--text); }
  /* Slim to look at, a 44px tap. */
  .acts :global(.notice-act)::after { content: ''; position: absolute; inset: -5px 0; }
  .acts :global(.notice-act.plain) { background: transparent; border-color: transparent; color: var(--text-2); padding: 6px 8px; }
  .close { width: 44px; height: 44px; margin: -10px -12px -10px 0; display: grid; place-items: center; color: var(--text-3); flex: none; }
</style>
