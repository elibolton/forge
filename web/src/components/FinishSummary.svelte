<script lang="ts">
  import { BadgeCheck, Trophy } from '@lucide/svelte';
  import { session } from '../lib/session.svelte';
  import { app } from '../lib/store.svelte';
  import Sheet from './Sheet.svelte';

  const records = $derived(session.finished?.records ?? []);
  const close = () => (session.finished = null);
</script>

<Sheet title="" onclose={close}>
  {#snippet leading()}<span></span>{/snippet}
  <div class="stack" style="--gap:20px;align-items:center;text-align:center;padding-top:12px">
    <BadgeCheck size={56} color="var(--fresh)" aria-hidden="true" />
    <h2 class="display" style="font-size:1.5rem">Workout Saved</h2>
    {#if !records.length}
      <p class="muted">Recovery and your next workout have been updated.</p>
    {:else}
      <div class="card stack" style="width:100%;text-align:left;--gap:10px">
        <div class="row bold" style="--gap:8px;color:var(--recovering)"><Trophy size={18} /> New personal records</div>
        {#each records as r (r.exercise.id)}
          <div class="row between sub"><span>{r.exercise.name}</span><span class="muted">{app.units.format(r.oneRM)} est. 1RM</span></div>
        {/each}
      </div>
    {/if}
    <button class="btn primary block big" onclick={close}>Done</button>
  </div>
</Sheet>
