<script lang="ts">
  import { Sparkles } from '@lucide/svelte';
  import { updates } from '../lib/pwa.svelte';
</script>

<div class="banner glass" role="status">
  <span class="ico"><Sparkles size={16} /></span>
  <span class="grow sub semibold">A new version of Forge is ready</span>
  <button class="caption muted" onclick={() => updates.later()}>Later</button>
  <button class="btn primary" onclick={() => updates.update()}>Update</button>
</div>

<style>
  .banner { pointer-events: auto; width: 100%; max-width: 520px; display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 12px; border-radius: 999px;
    box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.7); animation: drop 0.4s var(--ease); }
  .ico { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: var(--ember-soft); color: var(--ember-2); flex: none; }
  .btn { min-height: 36px; padding: 6px 14px; }
  @keyframes drop { from { transform: translateY(-20px); opacity: 0; } }
</style>
