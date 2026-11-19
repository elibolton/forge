<script lang="ts">
  import { CircleAlert } from '@lucide/svelte';
  import { exportBackup } from '../lib/backup';
  import { saving } from '../lib/saving.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { portal } from '../lib/portal';

  /** Stays up while anything is failing to save, so a lost write is never silent. */
  let busy = $state(false);
  async function retry() {
    busy = true;
    const ok = await saving.retry();
    busy = false;
    toasts.show(ok ? 'Saved' : 'Still not saving');
  }
</script>

<!-- On <body> so it sits above any open sheet. -->
<div class="banner" role="alert" use:portal>
  <span class="ico" aria-hidden="true"><CircleAlert size={18} /></span>
  <div class="grow stack" style="--gap:2px">
    <span class="sub bold">Changes aren't being saved</span>
    <span class="caption muted">{saving.error} Keep Forge open, and export a backup so nothing is lost.</span>
    <div class="row" style="--gap:8px;margin-top:8px">
      <button class="btn primary" disabled={busy} onclick={retry}>Try Again</button>
      <button class="btn" onclick={() => exportBackup()}>Export Backup</button>
    </div>
  </div>
</div>

<style>
  .banner { position: fixed; top: calc(var(--safe-top) + 10px); left: 50%; transform: translateX(-50%); z-index: 95;
    width: min(520px, calc(100% - 24px)); display: flex; align-items: flex-start; gap: 12px; padding: 14px;
    border-radius: var(--r-md); background: rgba(40, 18, 24, 0.94); border: 1px solid rgba(255, 77, 109, 0.45);
    backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px); box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.7);
    animation: drop 0.4s var(--ease); }
  .ico { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; flex: none;
    background: rgba(255, 77, 109, 0.16); color: var(--fatigued); }
  .btn { min-height: 40px; padding: 8px 14px; }
  @keyframes drop { from { transform: translate(-50%, -20px); opacity: 0; } }
</style>
