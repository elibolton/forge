<script lang="ts">
  import { type LoggedSet, isBodyweight, isPerSide, muscleName, repRangeText } from '../engine';
  import { ArrowLeftRight, ArrowRight, Check, ChevronDown, Circle, CircleCheck, Flag, Flame, Info, Pencil, Plus } from '@lucide/svelte';
  import { type SessionExercise, type SessionSet, exerciseOf, newSet, session } from '../lib/session.svelte';
  import { app } from '../lib/store.svelte';
  import { fmtNum } from '../lib/units';
  import ActionMenu from './ActionMenu.svelte';
  import ExerciseNote from './ExerciseNote.svelte';
  import PlateBar from './PlateBar.svelte';
  import { barFor } from '../lib/plates';
  import ExerciseThumb from './ExerciseThumb.svelte';
  import ValueStepper from './ValueStepper.svelte';

  let { exercise: ex, nextName, onNext, onFinish, onswap, partner }: {
    exercise: SessionExercise; nextName?: string; onNext: () => void; onFinish: () => void;
    onswap?: () => void; partner?: { name: string; go: () => void };
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
  const bar = $derived(barFor(e, units.pounds));
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

<div class="stack" style="--gap:16px">
  <header class="stack" style="--gap:10px">
    <div class="row" style="--gap:14px">
      <ExerciseThumb exercise={e} size={50} />
      <div class="stack grow" style="--gap:5px">
        <h2 class="display ex-name">{e.name}</h2>
        <span class="caption muted">{e.primary.map(muscleName).join(' · ')}</span>
      </div>
      {#if onswap}<button class="icon-btn swap" aria-label="Swap {e.name} for another exercise" onclick={onswap}><ArrowLeftRight size={17} /></button>{/if}
    </div>
    {#if partner}
      <button class="pair" onclick={partner.go}>
        <span class="kicker">SUPERSET</span>
        <span class="caption grow one-line" style="text-align:left">Alternate with <b>{partner.name}</b></span>
        <ArrowRight size={14} />
      </button>
    {/if}
    {#if ex.program}
      {@const info = ex.program}
      <div class="row wrap" style="--gap:6px">
        {#if info.label}<span class="chip on small-chip">{info.label}</span>{/if}
        <span class="chip small-chip">{info.setsText}</span>
        <span class="chip small-chip">{info.effortText}</span>
        <span class="chip small-chip">Rest {info.restText}{info.isOptional ? ' · optional' : ''}</span>
      </div>
      {#if info.notes.length}<span class="caption muted row" style="--gap:8px;align-items:flex-start"><Info size={13} style="flex:none;margin-top:2px" color="var(--ember-2)" /> {info.notes.join(' · ')}</span>{/if}
    {/if}
    {#if ex.reasons[1] ?? ex.reasons[0]}<span class="caption faint">{ex.reasons[1] ?? ex.reasons[0]}</span>{/if}
    <ExerciseNote exerciseID={e.id} />
  </header>

  {#if warmups.length}
    <div class="warm">
      <button class="row" style="--gap:10px;width:100%" aria-expanded={showWarmups} onclick={() => (showWarmups = !showWarmups)}>
        <span class="flame"><Flame size={15} /></span>
        <span class="sub semibold">Warm-up</span>
        <span class="caption faint grow one-line" style="text-align:left">{warmups.map((w) => units.format(w.weight)).join(' → ')}</span>
        <span class="caption mono muted">{warmups.filter((w) => w.done).length}/{warmups.length}</span>
        <ChevronDown size={16} style="transform:rotate({showWarmups ? 180 : 0}deg);transition:transform .3s" />
      </button>
      {#if showWarmups}
        <div class="stack" style="--gap:6px;margin-top:10px">
          {#each warmups as w (w.id)}
            <button class="set-row" class:done={w.done} onclick={() => toggle(w.id)} aria-label="Warm-up set, {setText(w)}{w.done ? ', done' : ''}">
              <span class="badge">W</span>
              <span class="semibold mono grow">{setText(w)}</span>
              {#if w.done}<CircleCheck size={22} color="var(--fresh)" />{:else}<Circle size={22} color="var(--text-3)" />{/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if active}
    {@const s = active}
    {@const last = lastFor(s.id)}
    <section class="focus" class:amrap={s.isAMRAP}>
      <div class="row between" style="align-items:flex-end">
        <div class="stack" style="--gap:4px">
          <span class="eyebrow" style="color:{s.isAMRAP ? 'var(--ember-2)' : 'var(--text-3)'}">{s.isAMRAP ? 'Max effort' : s.side ? (s.side === 'left' ? 'Left side' : 'Right side') : s.done ? 'Editing' : 'Now'}</span>
          <span class="setno num">Set {number(s.id)}<span class="of"> / {roundCount}</span></span>
        </div>
        {#if last}
          <div class="last stack" style="--gap:3px">
            <span class="eyebrow">Last time</span>
            <span class="num sub">{lastText(last)}</span>
          </div>
        {/if}
      </div>
      {#if ex.program}
        <div class="target sub semibold">{eccentric ? `${repRangeText(ex.program.range)} lowering reps` : `Aim ${repRangeText(ex.program.range)} reps · ${ex.program.effortText}`}</div>
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
        <ValueStepper title={e.isTimed ? 'Time' : 'Reps'} value={s.reps} step={e.isTimed ? 5 : 1} unit={e.isTimed ? 'seconds' : 'reps'} decimals={false}
          onchange={(v) => setUpdate(s.id, (x) => { x.reps = Math.max(0, Math.round(v)); })} />
      </div>
      {#if bar !== undefined && (s.weight ?? 0) > 0}
        <PlateBar total={units.display(s.weight ?? 0)} {bar} pounds={units.pounds} />
      {/if}
      <button class="btn primary block big log" onclick={() => log(s.id)}>
        <span class="check"><Check size={18} strokeWidth={3.2} /></span> {s.done ? 'Update set' : `Log set ${number(s.id)}`}
      </button>
    </section>
  {:else if working.length}
    <section class="focus complete stack" style="--gap:18px">
      <div class="row" style="--gap:12px">
        <span class="done-badge"><Check size={20} strokeWidth={3} /></span>
        <div><div class="bold">All sets logged</div><div class="caption muted">{working.length} sets of {e.name}</div></div>
      </div>
      {#if eccentric}
        <p class="sub muted">Lowering reps only, so there's no RIR to rate. Progress comes from more controlled reps.</p>
      {:else if !e.isTimed}
        <div class="stack" style="--gap:10px">
          <span class="sub semibold" id="rir-{ex.id}">How many more reps did you have left?</span>
          <div class="rirs" role="radiogroup" aria-labelledby="rir-{ex.id}">
            {#each [0, 1, 2, 3, 4] as v (v)}
              <button class="rir num" class:on={ex.rir === v} role="radio" aria-checked={ex.rir === v}
                aria-label={v === 0 ? 'None, went to failure' : `${v} reps left`}
                onclick={() => session.updateExercise(ex.id, (x) => { x.rir = v; })}>{v === 4 ? '4+' : v}<small>{v === 0 ? 'failure' : v === 1 ? 'one' : v === 4 ? 'easy' : ''}</small></button>
            {/each}
          </div>
          <span class="caption faint">This tunes how quickly Forge adds weight next time.</span>
        </div>
      {/if}
      <button class="btn primary block big" onclick={nextName ? onNext : onFinish}>
        {#if nextName}<span class="one-line">Next · {nextName}</span> <ArrowRight size={18} />{:else}<Flag size={18} /> Finish workout{/if}
      </button>
    </section>
  {/if}

  <div class="stack" style="--gap:6px">
    <span class="eyebrow" style="margin:6px 4px 2px">Sets</span>
    {#each working as s (s.id)}
      {@const isActive = s.id === activeID}
      {@const last = lastFor(s.id)}
      <div class="row" style="--gap:4px">
        <button class="set-row grow" class:active={isActive} class:done={s.done && !isActive}
          aria-label="Set {s.side === 'left' ? 'L' : s.side === 'right' ? 'R' : ''}{number(s.id)}, {setText(s)}{s.done ? ', done' : ''}"
          aria-pressed={isActive} onclick={() => (editingID = isActive ? null : s.id)}>
          <span class="badge num">{s.side === 'left' ? 'L' : s.side === 'right' ? 'R' : ''}{number(s.id)}</span>
          <span class="semibold mono">{setText(s)}</span>
          {#if last && !s.done}<span class="caption faint mono">last {lastShort(last)}</span>{/if}
          <span class="grow"></span>
          {#if s.done}<CircleCheck size={22} color="var(--fresh)" />{:else if isActive}<Pencil size={18} color="var(--ember-2)" />{:else}<Circle size={22} color="var(--text-3)" />{/if}
        </button>
        <ActionMenu label="Set {number(s.id)} options" items={[
          ...(s.done ? [{ label: 'Mark not done', action: () => toggle(s.id) }] : []),
          { label: 'Delete set', danger: true, action: () => remove(s.id) },
        ]}><span class="dots">⋯</span></ActionMenu>
      </div>
    {/each}
    <button class="add-set" onclick={addSet}><Plus size={16} /> Add set</button>
  </div>
</div>

<style>
  .ex-name { font-size: 1.55rem; line-height: 1.05; }
  .swap { align-self: flex-start; }
  .pair { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 14px; color: var(--ember-2);
    background: var(--ember-soft); border: 1px solid rgba(255, 106, 46, 0.3); }
  .pair b { color: var(--text); font-weight: 650; }
  .small-chip { padding: 5px 10px; font-size: 0.76rem; }
  .warm { padding: 12px 14px; border-radius: var(--r-md); background: var(--surface); border: 1px solid var(--hairline); }
  .flame { width: 28px; height: 28px; border-radius: 9px; display: grid; place-items: center; background: rgba(255, 187, 69, 0.14); color: var(--recovering); }
  .focus { position: relative; display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: var(--r-xl); overflow: hidden;
    background: radial-gradient(90% 70% at 100% 0%, rgba(255, 90, 31, 0.22), transparent 60%), linear-gradient(170deg, #19140f, #111013 60%);
    border: 1px solid var(--hairline-2); box-shadow: 0 30px 60px -30px rgba(255, 90, 31, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.07); }
  .focus.amrap { border-color: rgba(255, 106, 46, 0.55); }
  .focus.complete { background: radial-gradient(90% 70% at 100% 0%, rgba(60, 239, 176, 0.14), transparent 60%), linear-gradient(170deg, #101614, #111013 60%); box-shadow: none; }
  .setno { font-size: 2.1rem; font-stretch: 125%; font-weight: 800; line-height: 1; }
  .of { color: var(--text-3); font-size: 1.3rem; }
  .last { text-align: right; align-items: flex-end; }
  .target { color: var(--ember-2); }
  .note { color: var(--recovering); background: rgba(255, 187, 69, 0.1); border: 1px solid rgba(255, 187, 69, 0.2); padding: 10px 12px; border-radius: 14px; --gap: 8px; }
  .log { min-height: 62px; font-size: 1.08rem; }
  .check { width: 30px; height: 30px; border-radius: 50%; background: rgba(255, 255, 255, 0.22); display: grid; place-items: center; }
  .done-badge { width: 40px; height: 40px; border-radius: 50%; background: var(--fresh); color: #062b1e; display: grid; place-items: center; box-shadow: 0 0 24px rgba(60, 239, 176, 0.45); }
  .rirs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
  .rir { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 12px 0 8px; border-radius: 16px; background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--hairline); font-size: 1.3rem; }
  .rir small { font-family: var(--font); font-size: 0.6rem; font-weight: 600; color: var(--text-3); min-height: 0.8em; }
  .rir.on { background: var(--ember-gradient); border-color: transparent; color: #fff; box-shadow: 0 10px 24px -8px var(--ember-glow); }
  .rir.on small { color: rgba(255, 255, 255, 0.8); }
  .set-row { display: flex; align-items: center; gap: 12px; padding: 8px 12px 8px 8px; border-radius: 16px; width: 100%; text-align: left; min-height: 52px;
    background: var(--surface); border: 1px solid var(--hairline); }
  .set-row:active { transform: none; }
  .set-row.active { background: var(--ember-soft); border-color: rgba(255, 106, 46, 0.4); }
  .set-row.done { opacity: 0.7; }
  .badge { width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; font-size: 0.82rem; background: var(--surface-2); flex: none; }
  .set-row.active .badge { background: var(--ember-gradient); color: #fff; }
  .set-row.done .badge { background: rgba(60, 239, 176, 0.16); color: var(--fresh); }
  .add-set { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 48px; border-radius: 16px; border: 1px dashed var(--hairline-2);
    color: var(--text-2); font-weight: 600; font-size: 0.9rem; }
  .dots { font-size: 1.3rem; line-height: 1; color: var(--text-2); }
  @media (max-width: 340px) { .steppers { flex-direction: column; } }
</style>
