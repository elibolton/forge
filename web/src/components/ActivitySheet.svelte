<script lang="ts">
  import { Bike, Dribbble, Footprints, HeartPulse, Ship, Waves, Zap } from '@lucide/svelte';
  import { ACTIVITY_KINDS, type ActivityKind, activityMuscles, activityTitle } from '../lib/activities';
  import { app } from '../lib/store.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { muscleName, uuid } from '../engine';
  import { DAY } from '../lib/weeks';
  import Sheet from './Sheet.svelte';
  import ValueStepper from './ValueStepper.svelte';

  /** Log a run, ride or other session so recovery knows your legs (or back) are tired. */
  let { onclose }: { onclose: () => void } = $props();

  const icons: Record<ActivityKind, typeof Zap> = { run: Zap, walk: Footprints, ride: Bike, row: Ship, swim: Waves, sport: Dribbble, other: HeartPulse };
  let kind = $state<ActivityKind>('run');
  let minutes = $state(30);
  let daysAgo = $state(0);
  // Saved activities are read back only with a duration above 0; a 0-minute one would vanish on relaunch.
  const valid = $derived(minutes > 0);

  function save() {
    if (!valid) return;
    // Ended about now, or at the same time of day on an earlier day.
    const date = Date.now() - daysAgo * DAY - minutes * 60_000;
    const a = { id: uuid(), kind, date, minutes };
    app.addActivity(a);
    toasts.show(`${activityTitle[kind]} logged · ${minutes} min`, () => app.removeActivity(a.id));
    onclose();
  }
</script>

<Sheet title="Log Activity" {onclose}>
  {#snippet trailing()}<button class="link bold" disabled={!valid} onclick={save}>Save</button>{/snippet}
  <div class="stack" style="--gap:20px">
    <div class="kinds" role="radiogroup" aria-label="Activity">
      {#each ACTIVITY_KINDS as k (k)}
        {@const Icon = icons[k]}
        <button class="kind" class:on={kind === k} role="radio" aria-checked={kind === k} onclick={() => (kind = k)}>
          <span class="ico"><Icon size={20} /></span>
          <span class="caption semibold">{activityTitle[k]}</span>
        </button>
      {/each}
    </div>

    <ValueStepper title="Duration" value={minutes} step={5} unit="minutes" decimals={false} onchange={(v) => (minutes = v)} />
    {#if !valid}<p class="caption warn" role="alert">Enter a duration of at least 1 minute.</p>{/if}

    <div class="stack" style="--gap:8px">
      <span class="eyebrow">When</span>
      <div class="segmented" role="radiogroup" aria-label="When">
        {#each [[0, 'Today'], [1, 'Yesterday'], [2, '2 days ago']] as [d, label] (d)}
          <button role="radio" aria-checked={daysAgo === d} class:on={daysAgo === d} onclick={() => (daysAgo = d as number)}>{label}</button>
        {/each}
      </div>
    </div>

    <p class="caption muted">
      {#if activityMuscles[kind].length}
        Counts toward recovery for {activityMuscles[kind].map(muscleName).join(', ').toLowerCase()}{kind === 'walk' ? ', at half effort' : ''}. Not counted toward your lifting goal.
      {:else}
        Kept in your calendar; it doesn't change muscle recovery.
      {/if}
    </p>
    <button class="btn primary block big" disabled={!valid} onclick={save}>Log {minutes} min {activityTitle[kind].toLowerCase()}</button>
  </div>
</Sheet>

<style>
  .kinds { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .kind { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 4px 10px; border-radius: 16px;
    background: var(--surface); border: 1px solid var(--hairline); color: var(--text-2); }
  .kind.on { background: var(--ember-soft); border-color: rgba(255, 106, 46, 0.5); color: var(--text); }
  .ico { width: 36px; height: 36px; border-radius: 12px; display: grid; place-items: center; background: var(--surface-2); color: var(--ember-2); }
  .warn { color: var(--fatigued); text-align: center; margin-top: -12px; }
  .kind.on .ico { background: var(--ember-gradient); color: #fff; }
</style>
