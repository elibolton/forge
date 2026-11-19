<script lang="ts">
  import { RefreshCw } from '@lucide/svelte';

  /** Another copy of Forge saved changes this one hasn't loaded. Reloading picks them up (and any workout in progress). */
</script>

<div class="banner glass" role="status">
  <span class="ico"><RefreshCw size={16} /></span>
  <span class="grow sub semibold">Forge changed in another window</span>
  <button class="btn primary" onclick={() => location.reload()}>Reload</button>
</div>

<style>
  .banner { position: fixed; top: calc(var(--safe-top) + 10px); left: 50%; transform: translateX(-50%); z-index: 91;
    width: min(520px, calc(100% - 24px)); display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 12px; border-radius: 999px;
    box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.7); animation: drop 0.4s var(--ease); }
  .ico { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: var(--ember-soft); color: var(--ember-2); flex: none; }
  .btn { min-height: 36px; padding: 6px 14px; }
  @keyframes drop { from { transform: translate(-50%, -20px); opacity: 0; } }
</style>
