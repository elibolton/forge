<script lang="ts">
  import { ArrowDownRight, ArrowUpRight } from '@lucide/svelte';
  import { type Period, change, periodReport } from '../lib/report';
  import { app } from '../lib/store.svelte';
  import { fmtNum } from '../lib/units';

  /** Totals for this week or month, against the whole of the last one. */
  let period = $state<Period>('week');
  const r = $derived(periodReport(app.logs, period));
  const last = $derived(period === 'week' ? 'last week' : 'last month');

  const metrics = $derived([
    { label: 'Workouts', now: r.current.workouts, before: r.previous.workouts, show: (v: number) => `${v}` },
    // Imported workouts have no duration: say so rather than "None" for a week that had workouts.
    { label: 'Time', now: r.current.minutes, before: r.previous.minutes, untracked: r.previous.workouts > 0, show: (v: number) => (v >= 60 ? `${fmtNum(v / 60)} h` : `${v} min`) },
    { label: 'Sets', now: r.current.sets, before: r.previous.sets, show: (v: number) => `${v}` },
    { label: 'Volume', now: r.current.volume, before: r.previous.volume, show: (v: number) => {
      const d = app.units.display(v);
      return d >= 10_000 ? `${fmtNum(d / 1000)}k ${app.units.symbol}` : app.units.format(v);
    } },
  ]);
</script>

<section class="stack" style="--gap:12px">
  <div class="row between head-row">
    <h2 class="eyebrow">Report</h2>
    <div class="segmented" style="width:150px" role="radiogroup" aria-label="Report period">
      <button role="radio" aria-checked={period === 'week'} class:on={period === 'week'} onclick={() => (period = 'week')}>Week</button>
      <button role="radio" aria-checked={period === 'month'} class:on={period === 'month'} onclick={() => (period = 'month')}>Month</button>
    </div>
  </div>
  <div class="grid">
    {#each metrics as m (m.label)}
      {@const c = change(m.now, m.before)}
      <div class="metric">
        <span class="eyebrow">{m.label}</span>
        <span class="num value">{m.now ? m.show(m.now) : '–'}</span>
        <span class="caption delta" class:up={c.kind === 'up'} class:down={c.kind === 'down'}>
          {#if c.kind === 'empty'}No data yet
          {:else if c.kind === 'new'}{'untracked' in m && m.untracked ? `Not tracked ${last}` : `None ${last}`}
          {:else if c.kind === 'up'}<ArrowUpRight size={13} /> {m.show(c.by)} vs {last}
          {:else if c.kind === 'down'}<ArrowDownRight size={13} /> {m.show(c.by)} vs {last}
          {:else}Same as {last}{/if}
        </span>
      </div>
    {/each}
  </div>
  <p class="caption faint">This {period} so far against the whole of {last}.</p>
</section>

<style>
  .head-row { padding: 0 4px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .metric { display: flex; flex-direction: column; gap: 6px; padding: 14px; border-radius: var(--r-md); background: var(--surface); border: 1px solid var(--hairline); }
  .value { font-size: 1.45rem; font-stretch: 125%; font-weight: 800; }
  .delta { display: inline-flex; align-items: center; gap: 3px; color: var(--text-3); }
  .delta.up { color: var(--fresh); }
  .delta.down { color: var(--text-2); }
</style>
