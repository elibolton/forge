<script lang="ts">
  import { Catalog, type ExercisePreference, type LoggedExercise, guideFor, isBodyweight, isCustom, muscleName, oneRM, workingSets } from '../engine';
  import { Lightbulb, SquarePen, TriangleAlert } from '@lucide/svelte';
  import BackBar from '../components/BackBar.svelte';
  import CustomExerciseEditor from '../components/CustomExerciseEditor.svelte';
  import ExerciseThumb from '../components/ExerciseThumb.svelte';
  import ExerciseNote from '../components/ExerciseNote.svelte';
  import LineChart from '../components/LineChart.svelte';
  import { removeCustomExercise } from '../lib/customExercises';
  import { needTitle } from '../lib/labels';
  import { fmtDate } from '../lib/logs';
  import { nav } from '../lib/nav.svelte';
  import { app } from '../lib/store.svelte';
  import { exerciseRecords } from '../lib/records';

  let { id }: { id: string } = $props();
  let editing = $state(false);

  /** Re-read so edits to a custom exercise show immediately. */
  const e = $derived.by(() => { void app.profile; return Catalog.exercise(id); });
  const sessions = $derived(app.derivedHistory.sessions.get(id) ?? []);
  const guide = $derived(guideFor(e));
  const pref = $derived(app.profile!.plan.preferences[id] ?? '');

  const best = (l: LoggedExercise) => {
    const v = workingSets(l).filter((s) => s.weight > 0).map((s) => oneRM(s.weight, s.reps, s.rir));
    return v.length ? Math.max(...v) : undefined;
  };
  const points = $derived(sessions.flatMap((s) => { const b = best(s.logged); return b ? [{ x: s.date, y: app.units.display(b) }] : []; }));
  const records = $derived(exerciseRecords(sessions));
  const top = $derived(Math.max(0, ...sessions.map((s) => best(s.logged) ?? 0)));

  function setPref(v: string) {
    app.updatePlan((p) => { if (v) p.preferences[id] = v as ExercisePreference; else delete p.preferences[id]; });
  }

  function remove() {
    const deleting = !sessions.length;
    removeCustomExercise(e);
    if (deleting) nav.pop();
  }
</script>

<div class="screen">
  <BackBar title={e.name} />
  <div class="row" style="--gap:14px;margin:12px 0 8px">
    <ExerciseThumb exercise={e} size={56} />
    <div>
      <h2 style="font-size:1.25rem" class="bold">{e.name}</h2>
      <span class="caption muted">{isCustom(e) ? 'Custom exercise' : e.isCompound ? 'Compound lift' : 'Isolation'}</span>
    </div>
  </div>

  <div class="section"><div class="head">Your note</div><ExerciseNote exerciseID={id} /></div>

  {#if guide}
    <div class="section">
      <div class="head">How To</div>
      <div class="card stack">
        {#each guide.steps as step, i (i)}
          <div class="row" style="align-items:flex-start"><span class="step-num">{i + 1}</span><span class="sub">{step}</span></div>
        {/each}
        {#each guide.tips ?? [] as tip (tip)}
          <div class="row" style="align-items:flex-start"><Lightbulb size={18} color="var(--fresh)" style="flex:none;margin:1px 2px 0" /><span class="sub"><b>Tip:</b>{" "}{tip}</span></div>
        {/each}
        {#if guide.mistake}
          <div class="row" style="align-items:flex-start"><TriangleAlert size={18} color="var(--recovering)" style="flex:none;margin:1px 2px 0" /><span class="sub"><b>Avoid:</b>{" "}{guide.mistake}</span></div>
        {/if}
      </div>
    </div>
  {:else if isCustom(e)}
    <div class="section"><div class="head">How To</div>
      <div class="list"><button class="item link" onclick={() => (editing = true)}><SquarePen size={18} /> Add your own cues</button></div></div>
  {/if}

  <div class="section">
    <div class="list">
      <div class="item">Primary <span class="value">{e.primary.map(muscleName).join(', ')}</span></div>
      {#if e.secondary.length}<div class="item">Secondary <span class="value">{e.secondary.map(muscleName).join(', ')}</span></div>{/if}
      <div class="item">Equipment <span class="value">{e.equipment.length ? e.equipment.map((x) => needTitle[x]).join(', ') : 'None'}</span></div>
      <label class="item">Recommend
        <select value={pref} onchange={(ev) => setPref((ev.currentTarget as HTMLSelectElement).value)} style="width:auto;margin-left:auto">
          <option value="">Normally</option><option value="more">More often</option><option value="less">Less often</option><option value="exclude">Never</option>
        </select>
      </label>
    </div>
  </div>

  {#if records.oneRM || records.mostReps}
    {@const reps = (n: number) => (e.isTimed ? `${n}s` : `${n}`)}
    <div class="section">
      <div class="head">Personal records</div>
      <div class="prs">
        {#if records.oneRM && !e.isTimed}{@render pr('Est. 1RM', app.units.format(records.oneRM.value), `${app.units.format(records.oneRM.weight)} × ${records.oneRM.reps}`, records.oneRM.date)}{/if}
        {#if records.heaviest}{@render pr('Heaviest', app.units.format(records.heaviest.value), `× ${reps(records.heaviest.reps)}`, records.heaviest.date)}{/if}
        {#if records.mostReps}{@render pr(e.isTimed ? 'Longest set' : 'Most reps', reps(records.mostReps.value), records.mostReps.weight > 0 ? `at ${app.units.format(records.mostReps.weight)}` : 'bodyweight', records.mostReps.date)}{/if}
        {#if records.volume}{@render pr('Best session', app.units.format(records.volume.value), 'total moved', records.volume.date)}{/if}
      </div>
    </div>
  {/if}

  {#if !isBodyweight(e) && !e.isTimed && points.length}
    <div class="section">
      <div class="head">Estimated 1RM</div>
      <div class="card stack">
        <LineChart series={[{ name: e.name, points }]} height={180} unit={app.units.symbol} label="Estimated one rep max for {e.name}" />
        <div class="row between sub"><span>Best</span><span class="bold">{app.units.format(top)}</span></div>
      </div>
    </div>
  {/if}

  <div class="section">
    <div class="head">History</div>
    <div class="list">
      {#if !sessions.length}<div class="item muted">Not logged yet.</div>{/if}
      {#each sessions.slice(0, 100) as s, i (i)}
        <button class="item" style="display:block" onclick={() => nav.push({ name: 'log', id: s.logID })}>
          <div class="sub bold">{fmtDate(s.date, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          <div class="caption muted mono">{workingSets(s.logged).map((x) => (isBodyweight(e) ? `${x.reps}` : `${app.units.format(x.weight)}×${x.reps}`)).join(', ')}</div>
        </button>
      {/each}
    </div>
  </div>

  {#if isCustom(e)}
    <div class="section">
      <div class="list">
        <button class="item link" onclick={() => (editing = true)}>Edit Exercise</button>
        <button class="item" style="color:var(--fatigued)" onclick={remove}>{sessions.length ? 'Hide from Recommendations' : 'Delete Exercise'}</button>
      </div>
      {#if sessions.length}<div class="foot">It's in your history, so it can't be deleted without losing those records.</div>{/if}
    </div>
  {/if}
</div>

{#snippet pr(label: string, value: string, detail: string, date: number)}
  <div class="pr">
    <span class="eyebrow">{label}</span>
    <span class="num pr-value">{value}</span>
    <span class="caption faint">{detail} · {fmtDate(date, { month: 'short', day: 'numeric' })}</span>
  </div>
{/snippet}

{#if editing}
  <CustomExerciseEditor existing={e} onsave={() => {}} onclose={() => (editing = false)} />
{/if}

<style>
  .prs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .pr { display: flex; flex-direction: column; gap: 4px; padding: 14px; border-radius: var(--r-md); border: 1px solid var(--hairline);
    background: radial-gradient(90% 90% at 100% 0%, rgba(255, 187, 69, 0.1), transparent 70%), var(--surface); }
  .pr-value { font-size: 1.35rem; font-stretch: 125%; font-weight: 800; }
  .step-num { width: 22px; height: 22px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-size: 0.75rem; font-weight: 700; display: grid; place-items: center; flex: none; }
</style>
