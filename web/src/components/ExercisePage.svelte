<script lang="ts">
  import { type LoggedSet, isBodyweight, isPerSide, muscleName, repRangeText } from '../engine';
  import { ArrowRight, ChevronDown, CircleCheck, Circle, Flame, Flag, Info, Pencil, Plus, Check } from '@lucide/svelte';
  import { type SessionExercise, type SessionSet, exerciseOf, newSet, session } from '../lib/session.svelte';
  import { app } from '../lib/store.svelte';
  import { fmtNum } from '../lib/units';
  import ActionMenu from './ActionMenu.svelte';
  import ExerciseThumb from './ExerciseThumb.svelte';
  import ValueStepper from './ValueStepper.svelte';

  let { exercise: ex, nextName, onNext, onFinish }: {
    exercise: SessionExercise; nextName?: string; onNext: () => void; onFinish: () => void;
  } = $props();

  /** A set the user tapped to edit; otherwise the first unlogged working set is active. */
  let editingID = $state<string | null>(null);
  let showWarmups = $state(false);

  const e = $derived(exerciseOf(ex));
  const units = $derived(app.units);
  const lastSets = $derived(app.derivedHistory.lastWorkingSets.get(ex.exerciseID) ?? []);
  const working = $derived(ex.sets.filter((s) => !s.isWarmup));
  const warmups = $derived(ex.sets.filter((s) => s.isWarmup));
  const activeID = $derived(editingID ?? working.find((s) => !s.done)?.id ?? null);
  const active = $derived(ex.sets.find((s) => s.id === activeID));
  const perSide = $derived(ex.program ? isPerSide(ex.program.laterality) : false);
  const roundCount = $derived(perSide ? Math.ceil(working.length / 2) : working.length);
  const weightStep = $derived(app.weightStep(e));
  const eccentric = $derived(ex.program?.effort.type === 'eccentricOnly');

  /** Set number; for per-side work both sides of a round share it. */
  function number(id: string) {
    const i = Math.max(0, working.findIndex((s) => s.id === id));
    return perSide ? Math.floor(i / 2) + 1 : i + 1;
  }

  function lastFor(id: string): LoggedSet | undefined {
    const i = working.findIndex((s) => s.id === id);
    if (i < 0) return undefined;
    return lastSets[i] ?? lastSets[lastSets.length - 1];
  }

  const setUpdate = (id: string, change: (s: SessionSet) => void) =>
    session.updateExercise(ex.id, (x) => { const s = x.sets.find((y) => y.id === id); if (s) change(s); });

  function log(id: string) {
    session.logSet(id, ex.id);
    editingID = null;
  }

  function toggle(id: string) { setUpdate(id, (s) => { s.done = !s.done; }); }

  function remove(id: string) {
    session.updateExercise(ex.id, (x) => { x.sets = x.sets.filter((s) => s.id !== id); });
    if (editingID === id) editingID = null;
  }

  function addSet() {
    const last = working[working.length - 1];
    session.updateExercise(ex.id, (x) => {
      if (perSide) {
        x.sets.push(newSet(last?.weight ?? null, last?.reps ?? 10, { side: 'left' }), newSet(last?.weight ?? null, last?.reps ?? 10, { side: 'right' }));
      } else x.sets.push(newSet(last?.weight ?? null, last?.reps ?? 10));
    });
  }

  const repsLabel = (reps: number) => (e.isTimed ? `${reps}s` : `${reps}`);
  const setText = (s: SessionSet) => (isBodyweight(e) ? `${repsLabel(s.reps)} reps` : `${units.format(s.weight)} × ${repsLabel(s.reps)}`);
  const lastText = (s: LoggedSet) => (isBodyweight(e) || s.weight <= 0 ? `${repsLabel(s.reps)} reps` : `${units.format(s.weight)} × ${repsLabel(s.reps)}`);
  const lastShort = (s: LoggedSet) => (isBodyweight(e) || s.weight <= 0 ? `${s.reps}` : `${fmtNum(units.display(s.weight))}×${s.reps}`);

  function heading(s: SessionSet) {
    if (s.isAMRAP) return `SET ${number(s.id)} · MAX EFFORT`;
    return `SET ${number(s.id)} OF ${roundCount}${s.side ? (s.side === 'left' ? ' · LEFT' : ' · RIGHT') : ''}`;
  }
</script>

<div class="stack" style="--gap:18px">
  <header class="row" style="align-items:flex-start;--gap:14px">
    <ExerciseThumb exercise={e} size={56} />
    <div class="stack grow" style="--gap:4px">
      <h2 class="display" style="font-size:1.35rem">{e.name}</h2>
      <span class="sub muted">{e.primary.map(muscleName).join(' · ')}</span>
      {#if ex.program}
        {@const info = ex.program}
        <span class="sub semibold accent">{[info.label, info.setsText, info.effortText].filter(Boolean).join(' · ')}</span>
        <span class="caption muted">Rest {info.restText}{info.isOptional ? ' · optional' : ''}</span>
        {#each info.notes as n (n)}<span class="caption muted row" style="--gap:6px;align-items:flex-start"><Info size={13} style="flex:none;margin-top:2px" /> {n}</span>{/each}
      {/if}
      {#if ex.reasons[1] ?? ex.reasons[0]}<span class="caption muted">{ex.reasons[1] ?? ex.reasons[0]}</span>{/if}
    </div>
  </header>

  {#if warmups.length}
    <div class="card tight stack" style="--gap:8px">
      <button class="row" style="--gap:8px" aria-expanded={showWarmups} onclick={() => (showWarmups = !showWarmups)}>
        <Flame size={18} color="var(--recovering)" aria-hidden="true" />
        <span class="sub semibold">{warmups.length} warm-up sets</span>
        <span class="caption muted grow" style="text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{warmups.map((w) => units.format(w.weight)).join(' → ')}</span>
        <span class="caption muted mono">{warmups.filter((w) => w.done).length}/{warmups.length}</span>
        <ChevronDown size={16} style="transform:rotate({showWarmups ? 180 : 0}deg)" />
      </button>
      {#if showWarmups}
        {#each warmups as w (w.id)}
          <button class="set-row" onclick={() => toggle(w.id)} aria-label="Warm-up set, {setText(w)}{w.done ? ', done' : ''}">
            <span class="badge" class:done={w.done}>W</span>
            <span class="semibold mono grow">{setText(w)}</span>
            {#if w.done}<CircleCheck size={22} color="var(--fresh)" />{:else}<Circle size={22} color="var(--muted)" />{/if}
          </button>
        {/each}
      {/if}
    </div>
  {/if}

  {#if active}
    {@const s = active}
    <div class="card stack" style="--gap:14px">
      <div class="row between">
        <span class="kicker" style="color:{s.isAMRAP ? 'var(--accent)' : 'var(--muted)'}">{heading(s)}</span>
        {#if lastFor(s.id)}<span class="caption muted mono">Last: {lastText(lastFor(s.id)!)}</span>{/if}
      </div>
      {#if ex.program}
        <span class="sub semibold accent">{eccentric ? `${repRangeText(ex.program.range)} lowering reps` : `${repRangeText(ex.program.range)} reps · ${ex.program.effortText}`}</span>
      {/if}
      {#if ex.program?.lastSetNote && number(s.id) === roundCount}
        <div class="row sub semibold note"><Flame size={16} /> {ex.program.lastSetNote}</div>
      {/if}
      {#if s.isAMRAP}<span class="caption muted">As many good reps as you can on this set.</span>{/if}
      <div class="row steppers" style="--gap:10px">
        {#if !isBodyweight(e)}
          <ValueStepper title="Weight" value={units.display(s.weight ?? 0)} step={weightStep} unit={units.symbol} decimals
            onchange={(v) => setUpdate(s.id, (x) => { x.weight = units.kg(v); })} />
        {/if}
        <ValueStepper title={e.isTimed ? 'Time' : 'Reps'} value={s.reps} step={e.isTimed ? 5 : 1} unit={e.isTimed ? 'sec' : 'reps'} decimals={false}
          onchange={(v) => setUpdate(s.id, (x) => { x.reps = Math.max(0, Math.round(v)); })} />
      </div>
      <button class="btn primary block big" onclick={() => log(s.id)}><Check size={20} strokeWidth={3} /> {s.done ? 'Update Set' : 'Log Set'}</button>
    </div>
  {:else if working.length}
    <div class="card stack" style="--gap:16px">
      <div class="row bold" style="--gap:8px;color:var(--fresh)"><CircleCheck size={20} /> All sets logged</div>
      {#if eccentric}
        <p class="sub muted">Lowering reps only, so there's no RIR to rate. Progress comes from more controlled reps.</p>
      {:else if !e.isTimed}
        <div class="stack" style="--gap:10px">
          <span class="sub semibold" id="rir-{ex.id}">How many more reps could you have done?</span>
          <div class="row" style="--gap:8px" role="radiogroup" aria-labelledby="rir-{ex.id}">
            {#each [0, 1, 2, 3, 4] as v (v)}
              <button class="rir" class:on={ex.rir === v} role="radio" aria-checked={ex.rir === v}
                aria-label={v === 0 ? 'None, went to failure' : `${v} reps left`}
                onclick={() => session.updateExercise(ex.id, (x) => { x.rir = v; })}>{v === 4 ? '4+' : v}</button>
            {/each}
          </div>
          <span class="caption muted">This tunes how quickly Forge adds weight next time.</span>
        </div>
      {/if}
      <button class="btn primary block big" onclick={nextName ? onNext : onFinish}>
        {#if nextName}<ArrowRight size={20} /> Next: {nextName}{:else}<Flag size={20} /> Finish Workout{/if}
      </button>
    </div>
  {/if}

  <div class="stack" style="--gap:6px">
    {#each working as s (s.id)}
      {@const isActive = s.id === activeID}
      {@const last = lastFor(s.id)}
      <div class="row" style="--gap:4px">
        <button class="set-row grow" class:active={isActive} class:dim={s.done && !isActive}
          aria-label="Set {s.side === 'left' ? 'L' : s.side === 'right' ? 'R' : ''}{number(s.id)}, {setText(s)}{s.done ? ', done' : ''}"
          aria-pressed={isActive} onclick={() => (editingID = isActive ? null : s.id)}>
          <span class="badge" class:done={s.done} class:on={isActive && !s.done}>{s.side === 'left' ? 'L' : s.side === 'right' ? 'R' : ''}{number(s.id)}</span>
          <span class="semibold mono">{setText(s)}</span>
          {#if last && !s.done}<span class="caption muted mono">last {lastShort(last)}</span>{/if}
          <span class="grow"></span>
          {#if s.done}<CircleCheck size={22} color="var(--fresh)" />{:else if isActive}<Pencil size={20} color="var(--accent)" />{:else}<Circle size={22} color="var(--muted)" />{/if}
        </button>
        <ActionMenu label="Set {number(s.id)} options" items={[
          ...(s.done ? [{ label: 'Mark Not Done', action: () => toggle(s.id) }] : []),
          { label: 'Delete Set', danger: true, action: () => remove(s.id) },
        ]}><span class="dots">⋯</span></ActionMenu>
      </div>
    {/each}
  </div>

  <button class="link sub row" style="--gap:6px;padding-left:4px" onclick={addSet}><Plus size={18} /> Add Set</button>
</div>

<style>
  .set-row { display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: var(--card); border-radius: 14px; width: 100%; text-align: left; min-height: 48px; }
  .set-row.active { background: rgba(255, 107, 46, 0.1); }
  .set-row.dim { opacity: 0.85; }
  .badge { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: 0.75rem; font-weight: 700; background: var(--raised); flex: none; }
  .badge.on { background: var(--accent); }
  .badge.done { background: var(--fresh); color: #000; }
  .note { color: var(--recovering); background: rgba(255, 199, 77, 0.12); padding: 10px; border-radius: 12px; --gap: 8px; }
  .rir { flex: 1; min-height: 44px; border-radius: 12px; background: var(--raised); font-weight: 700; font-variant-numeric: tabular-nums; }
  .rir.on { background: var(--accent); color: #fff; }
  .dots { font-size: 1.3rem; line-height: 1; }
  @media (max-width: 340px) { .steppers { flex-direction: column; } }
</style>
