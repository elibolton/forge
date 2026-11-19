<script lang="ts">
  import { toasts } from '../lib/toasts.svelte';

  /** Newest first. Each toast keeps its own Undo until it times out. */
  const shown = $derived([...toasts.items].reverse());
</script>

<div class="host" aria-live="polite">
  {#each shown as t (t.id)}
    <div class="toast">
      <span class="grow">{t.message}</span>
      {#if t.undo}<button class="link" aria-label="Undo: {t.message}" onclick={() => toasts.performUndo(t.id)}>Undo</button>{/if}
    </div>
  {/each}
</div>

<style>
  .host { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; }
  .toast { pointer-events: auto; display: flex; align-items: center; gap: 12px; padding: 13px 14px 13px 20px; border-radius: 999px; max-width: 520px; width: 100%;
    /* Opaque enough that a title underneath can't show through and make both unreadable. */
    background: rgba(30, 30, 35, 0.97); backdrop-filter: blur(30px) saturate(160%); -webkit-backdrop-filter: blur(30px) saturate(160%);
    border: 1px solid var(--hairline-2); font-size: 0.9rem; font-weight: 580; box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.7);
    animation: drop 0.4s var(--ease); }
  .toast :global(.link) { background: var(--ember-soft); padding: 6px 14px; border-radius: 999px; }
  @keyframes drop { from { transform: translateY(-24px) scale(0.96); opacity: 0; } }
</style>
