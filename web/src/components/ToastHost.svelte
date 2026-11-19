<script lang="ts">
  import { toasts } from '../lib/toasts.svelte';
</script>

<div class="host" aria-live="polite">
  {#if toasts.current}
    {#key toasts.current.id}
      <div class="toast">
        <span class="grow">{toasts.current.message}</span>
        {#if toasts.current.undo}<button class="link" onclick={() => toasts.performUndo()}>Undo</button>{/if}
      </div>
    {/key}
  {/if}
</div>

<style>
  .host { position: fixed; top: calc(var(--safe-top) + 10px); left: 16px; right: 16px; z-index: 100; pointer-events: none; display: flex; justify-content: center; }
  .toast { pointer-events: auto; display: flex; align-items: center; gap: 12px; padding: 13px 14px 13px 20px; border-radius: 999px; max-width: 520px; width: 100%;
    background: rgba(30, 30, 35, 0.88); backdrop-filter: blur(30px) saturate(160%); -webkit-backdrop-filter: blur(30px) saturate(160%);
    border: 1px solid var(--hairline-2); font-size: 0.9rem; font-weight: 580; box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.7);
    animation: drop 0.4s var(--ease); }
  .toast :global(.link) { background: var(--ember-soft); padding: 6px 14px; border-radius: 999px; }
  @keyframes drop { from { transform: translateY(-24px) scale(0.96); opacity: 0; } }
</style>
