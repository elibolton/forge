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
    <div class="burst" aria-hidden="true"><BadgeCheck size={46} color="#062b1e" strokeWidth={2.4} /></div>
    <span class="eyebrow" style="color:var(--fresh)">Session complete</span>
    <h2 class="display" style="font-size:2.1rem">Workout saved</h2>
    {#if !records.length}
      <p class="muted">Recovery and your next workout have been updated.</p>
    {:else}
      <div class="card stack prs" style="width:100%;text-align:left;--gap:10px">
        <div class="row bold" style="--gap:8px;color:var(--recovering)"><Trophy size={18} /> New personal records</div>
        {#each records as r (r.exercise.id)}
          <div class="row between sub"><span>{r.exercise.name}</span><span class="muted">{app.units.format(r.oneRM)} est. 1RM</span></div>
        {/each}
      </div>
    {/if}
    <button class="btn primary block big" onclick={close}>Done</button>
  </div>
</Sheet>

<style>
  .burst { width: 92px; height: 92px; border-radius: 50%; display: grid; place-items: center; margin-top: 8px;
    background: radial-gradient(circle at 35% 30%, #8ff7cf, var(--fresh)); box-shadow: 0 0 0 10px rgba(60, 239, 176, 0.12), 0 0 60px rgba(60, 239, 176, 0.5);
    animation: pop 0.6s var(--ease); }
  .prs { background: radial-gradient(80% 100% at 100% 0%, rgba(255, 187, 69, 0.16), transparent 60%), var(--surface); border-color: rgba(255, 187, 69, 0.3); }
  @keyframes pop { from { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.08); } }
</style>
