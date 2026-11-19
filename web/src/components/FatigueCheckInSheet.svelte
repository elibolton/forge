<script lang="ts">
  import { Programs, checkInFlags, deloadNow, repsDropped, suggestsDeload } from '../engine';
  import { CircleCheck, TriangleAlert } from '@lucide/svelte';
  import { app } from '../lib/store.svelte';
  import Sheet from './Sheet.svelte';
  import Toggle from './Toggle.svelte';

  /** The weekly fatigue check: one flag from the logs, three from you. */
  let { week, onclose }: { week: number; onclose: () => void } = $props();

  let jointPain = $state(false);
  let stillSore = $state(false);
  let poorSleepOrMotivation = $state(false);

  const dropped = $derived.by(() => {
    const progress = app.profile?.programProgress;
    // Only this run: an earlier run of the same program has its own week numbers.
    return progress ? repsDropped(app.records, progress.programID, week, progress.startedAt) : [];
  });
  const resolved = $derived({ jointPain, stillSore, poorSleepOrMotivation, repsDropped: dropped.length >= 2 });
  const total = $derived(checkInFlags(resolved));

  function save(deload: boolean) {
    const p = structuredClone(app.profile?.programProgress);
    const program = p && Programs.byID(p.programID);
    if (!p || !program) return onclose();
    p.checkIns[week] = resolved;
    if (deload) {
      // Nothing logged yet this week: start the deload now. Otherwise after this week.
      if (!(p.completed[p.week] ?? []).length) deloadNow(p, program); else p.deloadNext = true;
    }
    app.setProgramProgress(p);
    onclose();
  }
</script>

<Sheet title="Week {week} Check-In" {onclose}>
  <div class="section" style="margin-top:8px">
    <div class="head">From your logs</div>
    <div class="list"><div class="item">Reps dropped at the same load <span class="value">{dropped.length >= 2 ? `Yes (${dropped.length})` : 'No'}</span></div></div>
    <div class="foot">Counts as a flag when it happened on 2 or more exercises compared with the week before.</div>
  </div>
  <div class="section">
    <div class="head">This week</div>
    <div class="list">
      <Toggle label="Persistent joint pain" checked={jointPain} onchange={(v) => (jointPain = v)} />
      <Toggle label="A muscle was still sore when due again" checked={stillSore} onchange={(v) => (stillSore = v)} />
      <Toggle label="Poor sleep or low motivation" checked={poorSleepOrMotivation} onchange={(v) => (poorSleepOrMotivation = v)} />
    </div>
  </div>
  <div class="section">
    <div class="list">
      <div class="item" style="color:var(--{total >= 2 ? 'recovering' : 'fresh'})">
        {#if total >= 2}<TriangleAlert size={18} />{:else}<CircleCheck size={18} />{/if} {total} of 4 flags
      </div>
      {#if suggestsDeload(resolved)}
        <button class="item link" onclick={() => save(true)}>Save and Deload Now</button>
        <button class="item link" style="font-weight:400" onclick={() => save(false)}>Save and Keep Going</button>
      {:else}
        <button class="item link" onclick={() => save(false)}>Save</button>
      {/if}
    </div>
    <div class="foot">Two or more flags: deload early. The deload week runs next, then the block is done.</div>
  </div>
</Sheet>
