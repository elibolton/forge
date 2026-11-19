<script lang="ts">
  import { type Muscle, type MuscleMap, muscleName, recoveryStatus } from '../engine';
  import BodyMap from './BodyMap.svelte';
  import { app } from '../lib/store.svelte';
  import { PersonStanding } from '@lucide/svelte';

  /** Body map of today's targets over a ranked list of their recovery. */
  let { targets, recovery }: { targets: Muscle[]; recovery: MuscleMap } = $props();
  const avg = $derived(targets.length ? targets.reduce((t, m) => t + (recovery[m] ?? 1), 0) / targets.length : 1);
  let expanded = $state(false);
  /** The body map is tall, so it's tucked away until you ask for it; the choice is remembered. */
  const showMap = $derived(app.get<boolean>('showBodyMap') ?? false);
  const shown = $derived(expanded ? targets : targets.slice(0, 6));
</script>

<section class="card">
  <div class="row between" style="align-items:flex-end;margin-bottom:6px">
    <div class="stack" style="--gap:6px">
      <span class="eyebrow">Target readiness</span>
      <span class="num big" style="color:var(--{recoveryStatus(avg)})">{Math.round(avg * 100)}<span class="pct">%</span></span>
    </div>
    <button class="chip" class:on={showMap} aria-pressed={showMap} onclick={() => app.set('showBodyMap', !showMap)}>
      <PersonStanding size={15} /> Body map
    </button>
  </div>
  {#if showMap}
    <div class="figure"><BodyMap {recovery} highlight={targets} size={118} /></div>
    <div class="legend caption faint" aria-hidden="true">
      <span><i style="background:var(--fresh)"></i>Fresh</span><span><i style="background:var(--recovering)"></i>Recovering</span><span><i style="background:var(--fatigued)"></i>Tired</span>
    </div>
  {/if}
  <ul aria-label="Target muscle recovery">
    {#each shown as m (m)}
      {@const v = recovery[m] ?? 1}
      <li>
        <span class="sub one-line grow">{muscleName(m)}</span>
        <span class="caption mono pct-v">{Math.round(v * 100)}%</span>
        <span class="meter" aria-hidden="true"><b style="width:{Math.max(4, v * 100)}%;background:var(--{recoveryStatus(v)})"></b></span>
      </li>
    {/each}
  </ul>
  {#if targets.length > 6}
    <button class="more caption" onclick={() => (expanded = !expanded)}>{expanded ? 'Show fewer' : `Show all ${targets.length} muscles`}</button>
  {/if}
</section>

<style>
  .big { font-size: 2.3rem; line-height: 0.9; }
  .pct { font-size: 1rem; margin-left: 2px; opacity: 0.7; }
  .legend { display: flex; justify-content: center; gap: 14px; margin: -6px 0 16px; }
  .legend i { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 6px; vertical-align: 1px; }
  .figure { margin: 10px 0 16px; padding: 14px 0 10px; border-radius: var(--r-md);
    background: radial-gradient(60% 70% at 50% 45%, rgba(255, 255, 255, 0.04), transparent 70%); }
  ul { list-style: none; margin: 14px 0 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 14px 18px; }
  li { display: grid; grid-template-columns: 1fr auto; row-gap: 6px; align-items: baseline; }
  .meter { grid-column: 1 / -1; height: 3px; border-radius: 2px; background: var(--surface-3); overflow: hidden; }
  .meter b { display: block; height: 100%; border-radius: 2px; }
  .pct-v { color: var(--text-2); }
  .more { margin-top: 2px; min-height: 44px; color: var(--text-2); font-weight: 600; }
</style>
