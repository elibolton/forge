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
  .scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 70; }
  .menu { position: fixed; left: 8px; right: 8px; bottom: calc(var(--safe-bottom) + 8px); z-index: 71; max-width: 560px; margin: 0 auto;
    background: #2c2c2e; border-radius: 16px; overflow: hidden; max-height: 70dvh; overflow-y: auto; animation: rise 0.2s ease-out; }
  .menu button { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 52px;
    padding: 12px 18px; font-size: 1.05rem; text-align: left; border-top: 0.5px solid #48484a; }
  .menu button:first-child { border-top: 0; }
  .menu button:active { background: #3a3a3c; }
  .danger { color: var(--fatigued); }
  .cancel { font-weight: 700; color: var(--accent); justify-content: center !important; border-top: 6px solid #1c1c1e !important; }
  .section-head { padding: 10px 18px 4px; font-size: 0.78rem; color: var(--muted); text-transform: uppercase; border-top: 0.5px solid #48484a; }
  @keyframes rise { from { transform: translateY(30px); opacity: 0; } }
</style>
