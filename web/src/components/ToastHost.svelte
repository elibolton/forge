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
  .host { position: fixed; top: calc(var(--safe-top) + 8px); left: 16px; right: 16px; z-index: 100; pointer-events: none; display: flex; justify-content: center; }
  .toast { pointer-events: auto; display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-radius: 999px; max-width: 560px; width: 100%;
    background: rgba(58, 58, 60, 0.92); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    font-size: 0.92rem; font-weight: 600; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4); animation: drop 0.25s ease-out; }
  @keyframes drop { from { transform: translateY(-20px); opacity: 0; } }
</style>
