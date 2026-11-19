<script lang="ts">
  import { ShieldCheck } from '@lucide/svelte';
  import { backupDue, exportBackup, lastBackupAt, snoozeBackup, unsavedCount } from '../lib/backup';
  import { count } from '../lib/labels';
  import { app } from '../lib/store.svelte';

  /** A gentle reminder that history lives only on this phone. Re-evaluates whenever the data changes. */
  const due = $derived.by(() => { void app.kv; void app.logs; return backupDue(); });
  const unsaved = $derived.by(() => { void app.kv; void app.logs; return unsavedCount(); });
</script>

{#if due}
  <section class="nudge">
    <span class="ico" aria-hidden="true"><ShieldCheck size={18} /></span>
    <div class="grow stack" style="--gap:3px">
      <span class="sub bold">Back up your training</span>
      <span class="caption muted">
        {lastBackupAt() === undefined
          ? `${count(app.logs.length, 'workout')} ${app.logs.length === 1 ? 'lives' : 'live'} only on this phone.`
          : `${count(unsaved, 'new workout')} since your last backup.`}
        Save a copy to Files or iCloud Drive.
      </span>
      <div class="row" style="--gap:8px;margin-top:8px">
        <button class="btn primary small-btn" onclick={exportBackup}>Back up now</button>
        <button class="btn small-btn" onclick={() => snoozeBackup()}>Later</button>
      </div>
    </div>
  </section>
{/if}

<style>
  .nudge { display: flex; gap: 12px; align-items: flex-start; padding: 14px; border-radius: var(--r-lg);
    background: linear-gradient(90deg, rgba(92, 150, 255, 0.1), rgba(92, 150, 255, 0.02)); border: 1px solid rgba(92, 150, 255, 0.25); }
  .ico { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; background: rgba(92, 150, 255, 0.18); color: #8db4ff; flex: none; }
  .small-btn { min-height: 36px; padding: 6px 14px; font-size: 0.86rem; }
</style>
