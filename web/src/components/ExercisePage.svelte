<script lang="ts">
  import { type LoggedSet, isBodyweight, isPerSide, muscleName, repRangeText } from '../engine';
  import { ArrowDownRight, ArrowLeftRight, ArrowRight, Check, ChevronDown, Circle, CircleCheck, Flag, Flame, Info, Pencil, Plus, Trophy } from '@lucide/svelte';
  import { type SessionExercise, type SessionSet, exerciseOf, isRated, numberedSets, parentOf, session } from '../lib/session.svelte';
  import { app } from '../lib/store.svelte';
  import { fmtNum, maxReps, maxWeight } from '../lib/units';
  import ActionMenu from './ActionMenu.svelte';
  import ExerciseNote from './ExerciseNote.svelte';
  import PlateBar from './PlateBar.svelte';
  import { plateSetup } from '../lib/plates';
  import ExerciseThumb from './ExerciseThumb.svelte';
  import ValueStepper from './ValueStepper.svelte';
  import RIRChips from './RIRChips.svelte';
  import Sheet from './Sheet.svelte';
  import { checkSet } from '../lib/setCheck';
  import { exerciseRecords, liveRecords } from '../lib/records';
  import { toasts } from '../lib/toasts.svelte';

  /** This exercise's superset, tri-set or circuit: where it sits, the round, and who's up next. */
  interface GroupInfo {
    label: string; position: number; size: number; round: number; rounds: number;
    next?: { name: string; newRound: boolean; go: () => void };
  }
  let { exercise: ex, nextName, onNext, onFinish, onswap, group }: {
    exercise: SessionExercise; nextName?: string; onNext: () => void; onFinish: () => void;
    onswap?: () => void; group?: GroupInfo;
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
  /** Sets with a number; drop sets belong to the set before them. */
  const numbered = $derived(numberedSets(ex.sets));
  const roundCount = $derived(perSide ? Math.ceil(numbered.length / 2) : numbered.length);
  const weightStep = $derived(app.weightStep(e));
  const plateFor = $derived(plateSetup(e, app.activeGym, units.pounds));
  const eccentric = $derived(ex.program?.effort.type === 'eccentricOnly');
  const rated = $derived(isRated(ex));
  /** Sets today that are personal records. */
  const prs = $derived(liveRecords(ex.sets, app.derivedHistory.bestOneRM.get(ex.exerciseID), ex.rir));
  /** A set's reps in reserve: its own rating, else the old per-exercise one. */
  const rirOf = (s: SessionSet) => s.rir ?? ex.rir;
  const rirText = (v: number | null | undefined) => (v == null ? '–' : v >= 4 ? '4+' : String(v));

  /** Set number; for per-side work both sides of a round share it. */
  /** Set number; for per-side work both sides of a round share it, and a drop set shares its set's. */
  function number(id: string) {
    const at = ex.sets.findIndex((s) => s.id === id);
    const own = ex.sets[at]?.type === 'drop' ? parentOf(ex.sets, at) : ex.sets[at];
    const i = Math.max(0, numbered.findIndex((s) => s.id === own?.id));
    return perSide ? Math.floor(i / 2) + 1 : i + 1;
  }

  /** Last time's matching set, compared like for like: straight sets with straight sets. */
  const lastStraight = $derived(lastSets.filter((s) => s.type !== 'drop'));
  function lastFor(id: string): LoggedSet | undefined {
    const i = numbered.findIndex((s) => s.id === id);
    if (i < 0) return undefined;
    return lastStraight[i] ?? lastStraight[lastStraight.length - 1];
  }

  /** A lighter weight for a new drop set: about 80%, on a loadable step. */
  function dropWeight(s: SessionSet): number | null {
    if (s.weight === null || isBodyweight(e)) return s.weight;
    const shown = units.display(s.weight) * 0.8;
    return units.kg(Math.max(0, Math.round(shown / weightStep) * weightStep));
  }

  const typeName = { drop: 'Drop set', failure: 'To failure' } as const;
  function setMenu(s: SessionSet) {
    return [
      ...(s.done ? [{ label: 'Mark not done', action: () => toggle(s) }] : []),
      ...(s.type !== 'drop' ? [{ label: 'Add a drop set after it', action: () => session.addDropSet(ex.id, s.id, dropWeight(s)) }] : []),
      ...(s.type === 'failure'
        ? [{ label: 'Make it a straight set', action: () => session.setType(ex.id, s.id, null) }]
        : s.type === 'drop'
          ? [{ label: 'Make it a straight set', action: () => session.setType(ex.id, s.id, null) }]
          : [{ label: 'Mark as taken to failure', action: () => session.setType(ex.id, s.id, 'failure') }]),
      { label: 'Delete set', danger: true, action: () => remove(s.id) },
    ];
  }

  /** Heaviest working set (kg) and most reps ever logged for this exercise. */
  const bests = $derived(exerciseRecords(app.derivedHistory.sessions.get(ex.exerciseID) ?? []));
  const heaviest = $derived(bests.heaviest?.value);
  /** A set that looks like a typo, waiting for "log it anyway". */
  let checking = $state<{ id: string; weight: number; heaviest?: number } | null>(null);
  let checkingReps = $state<{ id: string; reps: number; usual?: number } | null>(null);

  function log(id: string, checked = false) {
    const s = ex.sets.find((x) => x.id === id);
    if (!s) return;
    if (!checked) {
      const problem = checkSet(isBodyweight(e) ? null : s.weight, s.reps, heaviest,
        { targetReps: ex.targetReps, mostReps: bests.mostReps?.value, isTimed: e.isTimed });
      if (problem?.kind === 'noReps') { toasts.show(e.isTimed ? 'Set the time before logging' : 'Set your reps before logging'); return; }
      if (problem?.kind === 'heavy') { checking = { id, weight: s.weight ?? 0, heaviest: problem.heaviest }; return; }
      if (problem?.kind === 'manyReps') { checkingReps = { id, reps: s.reps, usual: problem.usual }; return; }
    }
    session.logSet(id, ex.id);
    editingID = null;
  }

  const toggle = (s: SessionSet) => session.setDone(ex.id, s.id, !s.done);

  function remove(id: string) {
    session.removeSet(ex.id, id);
    if (editingID === id) editingID = null;
  }

  const repsLabel = (reps: number) => (e.isTimed ? `${reps}s` : `${reps}`);
  const setText = (s: SessionSet) => (isBodyweight(e) ? `${repsLabel(s.reps)} reps` : `${units.format(s.weight)} × ${repsLabel(s.reps)}`);
  const lastText = (s: LoggedSet) => (isBodyweight(e) || s.weight <= 0 ? `${repsLabel(s.reps)} reps` : `${units.format(s.weight)} × ${repsLabel(s.reps)}`);
  const lastShort = (s: LoggedSet) => (isBodyweight(e) || s.weight <= 0 ? `${s.reps}` : `${fmtNum(units.display(s.weight), 2)}×${s.reps}`);

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
    {#if group}
      {@const g = group}
      <button class="pair" disabled={!g.next} onclick={() => g.next?.go()}
        aria-label="{g.label}, exercise {g.position} of {g.size}, round {g.round} of {g.rounds}{g.next ? `. Next: ${g.next.name}` : ''}">
        <span class="kicker">{g.label.toUpperCase()}</span>
        <span class="caption grow one-line" style="text-align:left">
          {g.position} of {g.size} · round {g.round}/{g.rounds}{#if g.next}{` · ${g.next.newRound ? 'then back to' : 'then'} `}<b>{g.next.name}</b>{/if}
        </span>
        {#if g.next}<ArrowRight size={14} />{/if}
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
            <button class="set-row" class:done={w.done} onclick={() => toggle(w)} aria-label="Warm-up set, {setText(w)}{w.done ? ', done' : ''}">
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
          <span class="eyebrow" style="color:{s.isAMRAP ? 'var(--ember-2)' : 'var(--text-3)'}">{s.type ? typeName[s.type] : s.isAMRAP ? 'Max effort' : s.side ? (s.side === 'left' ? 'Left side' : 'Right side') : s.done ? 'Editing' : 'Now'}</span>
          <span class="setno num">Set {number(s.id)}{#if s.type === 'drop'}<span class="of">{' · drop'}</span>{:else}<span class="of">{` / ${roundCount}`}</span>{/if}</span>
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
            max={maxWeight(units.pounds)} onchange={(v) => session.editSet(ex.id, s.id, { weight: units.kg(v) })} />
        {/if}
        <ValueStepper title={e.isTimed ? 'Time' : 'Reps'} value={s.reps} step={e.isTimed ? 5 : 1} unit={e.isTimed ? 'seconds' : 'reps'} decimals={false}
          max={maxReps(e.isTimed)} onchange={(v) => session.editSet(ex.id, s.id, { reps: v })} />
      </div>
      {#if plateFor && (s.weight ?? 0) > 0}
        <PlateBar total={units.display(s.weight ?? 0)} bar={plateFor.bar} plates={plateFor.plates} pounds={units.pounds} />
      {/if}
      {#if s.type === 'drop'}<span class="caption muted">Straight on from the set before at a lighter weight. No rest until the drops are done.</span>{/if}
      {#if s.type === 'failure'}<span class="caption muted">Go until you can't do another clean rep. It's logged with 0 reps left.</span>{/if}
      {#if s.done && rated && !s.isWarmup && !s.type}
        <div class="stack" style="--gap:8px">
          <span class="eyebrow">Reps left</span>
          <RIRChips compact value={s.rir} label="Reps left on set {number(s.id)}" onpick={(v) => session.rateSet(ex.id, s.id, v)} />
        </div>
      {/if}
    </section>
  {:else if working.length}
    <section class="focus complete stack" style="--gap:18px">
      <div class="row" style="--gap:12px">
        <span class="done-badge"><Check size={20} strokeWidth={3} /></span>
        <div><div class="bold">All sets logged</div><div class="caption muted">{numbered.length} sets of {e.name}{working.length > numbered.length ? ` + ${working.length - numbered.length} drop` : ''}</div></div>
      </div>
      {#if eccentric}
        <p class="sub muted">Lowering reps only, so there's no RIR to rate. Progress comes from more controlled reps.</p>
      {:else if rated}
        {@const doneSets = numbered.filter((x) => x.done)}
        {@const last = doneSets[doneSets.length - 1]}
        {#if last && rirOf(last) == null && session.pendingRating?.setID !== last.id}
          <div class="stack" style="--gap:10px">
            <span class="sub semibold">How many more reps did you have left on your last set?</span>
            <RIRChips value={last.rir} label="Reps left on your last set" onpick={(v) => session.rateSet(ex.id, last.id, v)} />
          </div>
        {:else}
          <div class="row wrap" style="--gap:6px">
            <span class="caption muted" style="margin-right:4px">Reps left</span>
            {#each doneSets as d (d.id)}<span class="chip small-chip num">{rirText(rirOf(d))}</span>{/each}
          </div>
        {/if}
        <span class="caption faint">Rating each set tunes how quickly Forge adds weight next time.</span>
      {/if}
    </section>
  {/if}

  <div class="stack" style="--gap:6px">
    <span class="eyebrow" style="margin:6px 4px 2px">Sets</span>
    {#each working as s (s.id)}
      {@const isActive = s.id === activeID}
      {@const last = lastFor(s.id)}
      <div class="row" class:drop-row={s.type === 'drop'} style="--gap:4px">
        <button class="set-row grow" class:active={isActive} class:done={s.done && !isActive}
          aria-label="{s.type === 'drop' ? `Drop set after set ${number(s.id)}` : `Set ${s.side === 'left' ? 'L' : s.side === 'right' ? 'R' : ''}${number(s.id)}`}{s.type === 'failure' ? ', to failure' : ''}, {setText(s)}{s.done ? ', done' : ''}{s.done && rated && rirOf(s) != null ? `, ${rirText(rirOf(s))} reps left` : ''}{prs.has(s.id) ? ', personal record' : ''}"
          aria-pressed={isActive} onclick={() => (editingID = isActive ? null : s.id)}>
          <span class="badge num" class:drop={s.type === 'drop'} class:failure={s.type === 'failure'}>{#if s.type === 'drop'}<ArrowDownRight size={15} strokeWidth={2.6} />{:else}{s.side === 'left' ? 'L' : s.side === 'right' ? 'R' : ''}{number(s.id)}{/if}</span>
          <span class="semibold mono">{setText(s)}</span>
          {#if last && !s.done}<span class="caption muted mono">last {lastShort(last)}</span>{/if}
          {#if prs.has(s.id)}<span class="pr" role="img" aria-label="Personal record"><Trophy size={13} /></span>{/if}
          {#if s.type === 'failure'}<span class="caption nowrap failure-tag">failure</span>
          {:else if s.done && rated && s.type !== 'drop' && rirOf(s) != null}<span class="caption muted nowrap">{rirOf(s) === 0 ? 'to failure' : `${rirText(rirOf(s))} left`}</span>{/if}
          <span class="grow"></span>
          {#if s.done}<CircleCheck size={22} color="var(--fresh)" />{:else if isActive}<Pencil size={18} color="var(--ember-2)" />{:else}<Circle size={22} color="var(--text-3)" />{/if}
        </button>
        <ActionMenu label="{s.type === 'drop' ? 'Drop set' : `Set ${number(s.id)}`} options" items={setMenu(s)}><span class="dots">⋯</span></ActionMenu>
      </div>
    {/each}
    <button class="add-set" onclick={() => session.addSet(ex.id)}><Plus size={16} /> Add set</button>
  </div>

  <!-- The one action that matters between sets, pinned where the thumb rests. -->
  {#if active || working.length}
    <div class="dock">
      {#if active}
        {@const s = active}
        <button class="btn primary block big log" onclick={() => log(s.id)}>
          <span class="check"><Check size={18} strokeWidth={3.2} /></span> {s.done ? 'Update set' : s.type === 'drop' ? 'Log drop set' : `Log set ${number(s.id)}`}
        </button>
      {:else}
        <button class="btn primary block big log" onclick={nextName ? onNext : onFinish}>
          {#if nextName}<span class="one-line">Next · {nextName}</span> <ArrowRight size={18} />{:else}<Flag size={18} /> Finish workout{/if}
        </button>
      {/if}
    </div>
  {/if}
</div>

{#if checking}
  {@const c = checking}
  <Sheet title="Check the Weight" onclose={() => (checking = null)}>
    {#snippet leading()}<span></span>{/snippet}
    <div class="stack" style="--gap:14px">
      <p class="sub muted">
        {units.format(c.weight)} is {c.heaviest ? `far more than your heaviest ${e.name} so far (${units.format(c.heaviest)})` : 'a lot of weight'}.
        A typo here would count as a personal record and change your next workouts.
      </p>
      <button class="btn primary block big" onclick={() => (checking = null)}>Fix the Weight</button>
      <button class="btn block big" onclick={() => { checking = null; log(c.id, true); }}>Log {units.format(c.weight)}</button>
    </div>
  </Sheet>
{/if}

{#if checkingReps}
  {@const c = checkingReps}
  <Sheet title="Check the Reps" onclose={() => (checkingReps = null)}>
    {#snippet leading()}<span></span>{/snippet}
    <div class="stack" style="--gap:14px">
      <p class="sub muted">
        {c.reps} reps is {c.usual ? `far more than the ${c.usual} you usually do on ${e.name}` : 'a lot of reps'}.
        A typo here would count as a personal record and change your next workouts.
      </p>
      <button class="btn primary block big" onclick={() => (checkingReps = null)}>Fix the Reps</button>
      <button class="btn block big" onclick={() => { checkingReps = null; log(c.id, true); }}>Log {c.reps} Reps</button>
    </div>
  </Sheet>
{/if}

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
  /* Sticks to the bottom of the logger's scroll area; its natural place is after the set list. */
  .dock { position: sticky; bottom: 0; z-index: 2; margin: 0 -18px; padding: 10px 18px 12px;
    background: linear-gradient(to top, var(--bg) 70%, rgba(7, 7, 8, 0)); }
  .log { min-height: 62px; font-size: 1.08rem; }
  .check { width: 30px; height: 30px; border-radius: 50%; background: rgba(255, 255, 255, 0.22); display: grid; place-items: center; }
  .pr { flex: none; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%;
    color: var(--recovering); background: rgba(255, 187, 69, 0.14); border: 1px solid rgba(255, 187, 69, 0.3); }
  .nowrap, .set-row .mono { white-space: nowrap; }
  .done-badge { width: 40px; height: 40px; border-radius: 50%; background: var(--fresh); color: #062b1e; display: grid; place-items: center; box-shadow: 0 0 24px rgba(60, 239, 176, 0.45); }
  .set-row { display: flex; align-items: center; gap: 12px; padding: 8px 12px 8px 8px; border-radius: 16px; width: 100%; text-align: left; min-height: 52px;
    background: var(--surface); border: 1px solid var(--hairline); }
  .set-row:active { transform: none; }
  .set-row.active { background: var(--ember-soft); border-color: rgba(255, 106, 46, 0.4); }
  .set-row.done { opacity: 0.7; }
  .badge { width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; font-size: 0.82rem; background: var(--surface-2); flex: none; }
  .set-row.active .badge { background: var(--ember-gradient); color: #fff; }
  .set-row.done .badge { background: rgba(60, 239, 176, 0.16); color: var(--fresh); }
  /* Drop sets sit indented under their set; failure sets are marked in red. */
  .drop-row { padding-left: 22px; }
  .badge.drop { color: var(--ember-2); }
  .badge.failure { box-shadow: inset 0 0 0 1.5px var(--fatigued); }
  .failure-tag { color: var(--fatigued); font-weight: 600; }
  .add-set { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 48px; border-radius: 16px; border: 1px dashed var(--hairline-2);
    color: var(--text-2); font-weight: 600; font-size: 0.9rem; }
  .dots { font-size: 1.3rem; line-height: 1; color: var(--text-2); }
  @media (max-width: 340px) { .steppers { flex-direction: column; } }
</style>
