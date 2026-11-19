<script lang="ts">
  import { type BlockCheckIn, type BlockStatus, MAX_LOADING_WEEKS, blockWeekStart, decideBlock, fallingLifts } from '../engine';
  import { BatteryCharging, CircleCheck, TriangleAlert } from '@lucide/svelte';
  import { app } from '../lib/store.svelte';
  import Sheet from './Sheet.svelte';
  import Toggle from './Toggle.svelte';

  /**
   * The end-of-block check-in for generated workouts. Same questions as the program's weekly check-in,
   * plus whether lifts are still going up; the logs add the estimated-max trend.
   */
  let { block, week, onsave, onclose }: {
    block: BlockStatus; week: number; onsave: (answer: BlockCheckIn) => void; onclose: () => void;
  } = $props();

  let jointPain = $state(false);
  let stillSore = $state(false);
  let poorSleepOrMotivation = $state(false);
  let stalled = $state(false);

  const weekStart = $derived(blockWeekStart(block.startedAt, week));
  // The same records the block uses: this block, before this week.
  const falling = $derived(fallingLifts([...app.records].filter((r) => r.date >= block.startedAt && r.date < weekStart).sort((a, b) => a.date - b.date)));
  const trainedThisWeek = $derived(app.records.some((r) => r.date >= weekStart));
  const answer = $derived<BlockCheckIn>({ jointPain, stillSore, poorSleepOrMotivation, stalled, answeredAt: Date.now() });
  const decision = $derived(decideBlock(answer, falling.length, week));

  const outcome = $derived(
    decision.action === 'extend' ? `Extend the block: week ${week + 1} is another training week, then check in again${week + 1 === MAX_LOADING_WEEKS ? ' (7 is the most)' : ''}.`
    : decision.action === 'deload' ? (trainedThisWeek ? 'Deload next week. You already trained this week, so it carries on as planned.' : 'Deload now: this week becomes the deload week.')
    : `Keep the plan: deload after week ${week}.`,
  );

  function save() {
    onsave({ ...answer, answeredAt: Date.now() });
    onclose();
  }
</script>

<Sheet title="Week {week} Check-In" {onclose}>
  <div class="section" style="margin-top:8px">
    <div class="head">From your logs</div>
    <div class="list"><div class="item">Estimated maxes falling <span class="value">{falling.length ? `Yes (${falling.length})` : 'No'}</span></div></div>
    <div class="foot">Lifts whose estimated max fell over their last two sessions this block.</div>
  </div>
  <div class="section">
    <div class="head">This block</div>
    <div class="list">
      <Toggle label="Persistent joint pain" checked={jointPain} onchange={(v) => (jointPain = v)} />
      <Toggle label="A muscle was still sore when due again" checked={stillSore} onchange={(v) => (stillSore = v)} />
      <Toggle label="Poor sleep or low motivation" checked={poorSleepOrMotivation} onchange={(v) => (poorSleepOrMotivation = v)} />
      <Toggle label="Lifts have stopped going up" checked={stalled} onchange={(v) => (stalled = v)} />
    </div>
  </div>
  <div class="section">
    <div class="list">
      <div class="item" style="--gap:8px;color:var(--{decision.action === 'deload' ? 'recovering' : 'fresh'})">
        {#if decision.action === 'deload'}<TriangleAlert size={18} style="flex:none" />{:else if decision.action === 'extend'}<BatteryCharging size={18} style="flex:none" />{:else}<CircleCheck size={18} style="flex:none" />{/if}
        <span class="grow">{outcome}</span>
      </div>
      <button class="item link" onclick={save}>Save</button>
    </div>
    <div class="foot">All clear and no lift falling: one more training week, up to 7. Joint pain, or two or more flags: deload early. Otherwise the block runs as planned.</div>
  </div>
</Sheet>
