<script lang="ts" module>
  export interface MenuItem {
    label: string;
    action: () => void;
    danger?: boolean;
    /** Starts a new group with this heading. */
    section?: string;
    checked?: boolean;
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Check } from '@lucide/svelte';

  let { items, label, children, class: cls = 'icon-btn plain' }: {
    items: MenuItem[]; label: string; children: Snippet; class?: string;
  } = $props();
  let open = $state(false);
  let list = $state<HTMLDivElement>();

  $effect(() => {
    if (!open) return;
    list?.querySelector('button')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') open = false; };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  function pick(item: MenuItem) {
    open = false;
    item.action();
  }
</script>

<button class={cls} aria-label={label} aria-haspopup="menu" aria-expanded={open} onclick={() => (open = true)}>
  {@render children()}
</button>

{#if open}
  <div class="scrim" onclick={() => (open = false)} role="presentation"></div>
  <div class="menu" role="menu" aria-label={label} bind:this={list}>
    {#each items as item, i (i)}
      {#if item.section}<div class="section-head">{item.section}</div>{/if}
      <button role="menuitem" class:danger={item.danger} onclick={() => pick(item)}>
        <span>{item.label}</span>
        {#if item.checked}<Check size={18} />{/if}
      </button>
    {/each}
    <button class="cancel" onclick={() => (open = false)}>Cancel</button>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); z-index: 70; animation: fade 0.2s; }
  .menu { position: fixed; left: 10px; right: 10px; bottom: calc(var(--safe-bottom) + 6px); z-index: 71; max-width: 520px; margin: 0 auto;
    background: rgba(28, 28, 33, 0.92); backdrop-filter: blur(30px) saturate(160%); -webkit-backdrop-filter: blur(30px) saturate(160%);
    border: 1px solid var(--hairline-2); border-radius: 26px; overflow: hidden; max-height: 72dvh; overflow-y: auto; padding: 6px;
    box-shadow: 0 30px 60px -10px rgba(0, 0, 0, 0.7); animation: rise 0.32s var(--ease); }
  .menu button { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 50px;
    padding: 12px 16px; font-size: 1rem; font-weight: 520; text-align: left; border-radius: 16px; }
  .menu button:active { background: var(--surface-2); transform: none; }
  .danger { color: var(--fatigued); }
  .cancel { font-weight: 650; color: var(--text-2); justify-content: center !important; margin-top: 4px; background: var(--surface-2); }
  .section-head { padding: 12px 16px 4px; font-family: var(--font-display); font-stretch: 125%; font-size: 0.66rem; font-weight: 700;
    letter-spacing: 0.13em; color: var(--text-3); text-transform: uppercase; }
  @keyframes rise { from { transform: translateY(30px) scale(0.98); opacity: 0; } }
  @keyframes fade { from { opacity: 0; } }
</style>
