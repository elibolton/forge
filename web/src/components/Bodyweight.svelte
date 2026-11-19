<script lang="ts">
  import { ArrowDownRight, ArrowUpRight, Plus, Scale } from '@lucide/svelte';
  import { uuid } from '../engine';
  import { bodyweightTrend } from '../lib/bodyweight';
  import { app } from '../lib/store.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { fmtNum } from '../lib/units';
  import ActionMenu from './ActionMenu.svelte';
  import LineChart from './LineChart.svelte';
  import Sheet from './Sheet.svelte';
  import ValueStepper from './ValueStepper.svelte';

  /** Bodyweight over time, with a quick weigh-in. */
  let logging = $state(false);
  let value = $state(0);
  const entries = $derived(app.bodyweights);
  const trend = $derived(bodyweightTrend(entries));
  const u = $derived(app.units);
  const points = $derived(entries.slice(0, 120).map((e) => ({ x: e.date, y: u.display(e.kg) })));

  function open() {
    value = trend ? u.display(trend.latest.kg) : u.pounds ? 175 : 80;
    logging = true;
  }

  function save() {
    const entry = { id: uuid(), date: Date.now(), kg: u.kg(value) };
    app.addBodyweight(entry);
    toasts.show(`Logged ${fmtNum(value)} ${u.symbol}`, () => app.removeBodyweight(entry.id));
    logging = false;
  }

  function remove(id: string) {
    const e = entries.find((x) => x.id === id)!;
    app.removeBodyweight(id);
    toasts.show('Weigh-in deleted', () => app.addBodyweight(e));
  }
</script>

<section class="stack" style="--gap:12px">
  <div class="row between head-row">
    <h2 class="eyebrow">Bodyweight</h2>
    <button class="chip" onclick={open}><Plus size={14} /> Weigh in</button>
  </div>
  <div class="card stack" style="--gap:12px">
    {#if !trend}
      <div class="row" style="--gap:12px">
        <span class="ico"><Scale size={18} /></span>
        <p class="sub muted grow">Log your weight now and then to see the trend here. Weigh in at the same time of day for the steadiest numbers.</p>
      </div>
    {:else}
      <div class="row between" style="align-items:flex-end">
        <div class="stack" style="--gap:4px">
          <span class="num big">{fmtNum(u.display(trend.latest.kg))}<span class="unit"> {u.symbol}</span></span>
          <span class="caption faint">{new Date(trend.latest.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        </div>
        {#if trend.change !== undefined}
          {@const d = u.display(Math.abs(trend.change))}
          <span class="caption delta">
            {#if trend.change > 0.05}<ArrowUpRight size={14} />{:else if trend.change < -0.05}<ArrowDownRight size={14} />{/if}
            {d < 0.25 ? 'Steady' : `${fmtNum(d)} ${u.symbol}`} since {new Date(trend.since!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        {/if}
      </div>
      {#if points.length > 1}<LineChart series={[{ name: 'Bodyweight', points }]} height={150} unit={u.symbol} label="Bodyweight over time" />{/if}
      <div class="list recent">
        {#each entries.slice(0, 3) as e (e.id)}
          <div class="item">
            <span class="grow sub">{new Date(e.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            <span class="num sub">{fmtNum(u.display(e.kg))} {u.symbol}</span>
            <ActionMenu label="Weigh-in options" items={[{ label: 'Delete', danger: true, action: () => remove(e.id) }]}>⋯</ActionMenu>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>

{#if logging}
  <Sheet title="Weigh In" onclose={() => (logging = false)}>
    {#snippet trailing()}<button class="link bold" onclick={save}>Save</button>{/snippet}
    <div class="stack" style="--gap:16px">
      <ValueStepper title="Bodyweight" value={value} step={u.pounds ? 0.5 : 0.1} unit={u.symbol} decimals onchange={(v) => (value = v)} />
      <button class="btn primary block big" onclick={save}>Save {fmtNum(value)} {u.symbol}</button>
    </div>
  </Sheet>
{/if}

<style>
  .head-row { padding: 0 4px; }
  .big { font-size: 2rem; font-stretch: 125%; font-weight: 800; line-height: 1; }
  .unit { font-size: 1rem; color: var(--text-3); }
  .delta { display: inline-flex; align-items: center; gap: 4px; color: var(--text-2); }
  .ico { width: 36px; height: 36px; border-radius: 12px; display: grid; place-items: center; background: var(--surface-2); color: var(--ember-2); flex: none; }
  .recent { background: transparent; }
</style>
