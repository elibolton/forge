<script lang="ts">
  import { TriangleAlert } from '@lucide/svelte';
  import { exportRawBackup } from '../lib/backup';
  import { app } from '../lib/store.svelte';

  /**
   * Full-screen stop for when saved data can't be read or the app hits an error. Reloading comes first;
   * with `recover`, there's also a raw export and, behind a confirmation, setting up again, since that
   * writes over a profile that may only be briefly unreadable.
   */
  let { title, message, detail, recover = false }: { title: string; message: string; detail?: string | null; recover?: boolean } = $props();

  let exported = $state(false);
  async function exportCopy() {
    try { exported = await exportRawBackup(); } catch (e) { alert(`Couldn't read the data to export it: ${(e as Error).message}`); }
  }

  /** The way out when the profile itself is damaged. Logged workouts live apart and are kept. */
  function setUpAgain() {
    const ok = confirm(
      'Set up Forge again?\n\nYour settings, program progress, saved workouts, cardio and weigh-ins will be replaced. ' +
      'Logged workouts are kept. Export a copy first if you haven\'t.',
    );
    if (ok) app.resetAfterLoadError();
  }
</script>

<div class="problem" role="alert">
  <div class="stack" style="--gap:14px;align-items:center;text-align:center;max-width:360px">
    <span class="ico" aria-hidden="true"><TriangleAlert size={30} /></span>
    <h1 class="display">{title}</h1>
    <p class="muted">{message}</p>
    <button class="btn primary block big" onclick={() => location.reload()}>Reload Forge</button>
    {#if recover}
      <button class="btn block" onclick={exportCopy}>{exported ? 'Copy Exported' : 'Export a Copy of Your Data'}</button>
      <button class="link sub" onclick={setUpAgain}>Still stuck? Set up again</button>
    {/if}
    {#if detail}<p class="caption faint mono">{detail}</p>{/if}
  </div>
</div>

<style>
  .problem { min-height: 100dvh; display: grid; place-items: center; padding: calc(var(--safe-top) + 24px) 24px calc(var(--safe-bottom) + 24px); }
  .ico { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; background: rgba(255, 187, 69, 0.14); color: var(--recovering); }
  h1 { font-size: 1.7rem; margin: 0; }
  p { margin: 0; }
  .mono { word-break: break-word; }
</style>
