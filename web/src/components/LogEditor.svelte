<script lang="ts">
  import { setLabels } from '../lib/labels';
  import { Catalog, type Exercise, type LoggedExercise, type LoggedSet, isBodyweight, plannedWorkingSets, uuid } from '../engine';
  import { Plus, Trash2 } from '@lucide/svelte';
  import { type WorkoutLog, app } from '../lib/store.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { fromLocalInput, maxReps, maxWeight, toLocalInput } from '../lib/units';
  import ActionMenu from './ActionMenu.svelte';
  import ExercisePicker from './ExercisePicker.svelte';
  import SetLine from './SetLine.svelte';
  import Sheet from './Sheet.svelte';
  import ValueStepper from './ValueStepper.svelte';

  /** Edits a saved workout as a draft: nothing is written until Save, and Save shows an Undo banner. */
  let { log, onclose, ondelete }: { log: WorkoutLog; onclose: () => void; ondelete: () => void } = $props();

  interface DraftSet { id: string; set: LoggedSet }
  /** Keeps everything else the log carried (program slot, range, RIR target) through edits. */
  interface DraftExercise { id: string; template: LoggedExercise; sets: DraftSet[] }

  // svelte-ignore state_referenced_locally
  const original = log;
  let date = $state(toLocalInput(original.date));
  let exercises = $state<DraftExercise[]>(original.exercises.map((l) => ({
    id: uuid(), template: structuredClone(l), sets: l.sets.map((s) => ({ id: uuid(), set: { ...s } })),
  })));
  /** The set whose steppers are open; one at a time keeps the list scannable. */
  let selected = $state<string | null>(null);
  let adding = $state(false);

  const edited = $derived(exercises.filter((x) => x.sets.length).map((x): LoggedExercise => ({ ...x.template, sets: x.sets.map((s) => ({ ...s.set })) })));
  // The input keeps only minutes: the same minute keeps the saved time, seconds and all.
  const newDate = $derived(fromLocalInput(date, original.date));
  const hasChanges = $derived(newDate !== original.date || JSON.stringify(edited) !== JSON.stringify(original.exercises));

  function label(x: DraftExercise, id: string) {
    return setLabels(x.sets.map((y) => y.set))[x.sets.findIndex((y) => y.id === id)];
  }

  function addSet(x: DraftExercise) {
    const last = [...x.sets].reverse().find((s) => !s.set.isWarmup)?.set;
    const s = { id: uuid(), set: { weight: last?.weight ?? 0, reps: last?.reps ?? 10, rir: last?.rir ?? null, isWarmup: false } };
    x.sets.push(s);
    selected = s.id;
  }

  function add(e: Exercise) {
    // Prefill from what Forge would prescribe now; usually close to what was actually lifted.
    const first = plannedWorkingSets(app.planner().prescribe(e))[0];
    const s = { id: uuid(), set: { weight: first?.weight ?? 0, reps: first?.reps ?? 10, isWarmup: false } };
    exercises.push({ id: uuid(), template: { exerciseID: e.id, sets: [] }, sets: [s] });
    selected = s.id;
  }

  function removeExercise(id: string) {
    const i = exercises.findIndex((x) => x.id === id);
    const [removed] = exercises.splice(i, 1);
    toasts.show(`Removed ${Catalog.exercise(removed.template.exerciseID).name}`, () => exercises.splice(Math.min(i, exercises.length), 0, removed));
  }

  function cancel() {
    if (hasChanges && !confirm('Discard your changes to this workout?')) return;
    onclose();
  }

  function save() {
    if (!hasChanges) return onclose();
    const before = original;
    const updated: WorkoutLog = { ...before, date: newDate, exercises: $state.snapshot(edited) };
    app.updateLog(updated);
    onclose();
    toasts.show('Workout updated', () => { if (app.logs.some((l) => l.id === before.id)) app.updateLog(before); });
  }
</script>

<Sheet title="Edit Workout" onclose={cancel} full>
  {#snippet leading()}<button class="link" onclick={cancel}>Cancel</button>{/snippet}
  {#snippet trailing()}<button class="link bold" disabled={!edited.length} onclick={save}>Save</button>{/snippet}
  <div class="list"><label class="item">Date <input type="datetime-local" bind:value={date} max={toLocalInput(Date.now())} style="width:auto;margin-left:auto" /></label></div>

  {#each exercises as x (x.id)}
    {@const e = Catalog.exercise(x.template.exerciseID)}
    <div class="section">
      <div class="row between head" style="text-transform:none">
        <span class="bold" style="color:var(--text);font-size:0.95rem">{e.name}</span>
        <ActionMenu label="{e.name} options" items={[{ label: 'Remove Exercise', danger: true, action: () => removeExercise(x.id) }]}>⋯</ActionMenu>
      </div>
      <div class="list">
        {#each x.sets as s (s.id)}
          <div class="stack" style="padding:10px 16px;--gap:12px">
            <div class="row">
              <button class="grow" onclick={() => (selected = selected === s.id ? null : s.id)}><SetLine set={s.set} exercise={e} label={label(x, s.id)} selected={selected === s.id} /></button>
              <button class="icon-btn" style="color:var(--fatigued)" aria-label="Delete set" onclick={() => (x.sets = x.sets.filter((y) => y.id !== s.id))}><Trash2 size={18} /></button>
            </div>
            {#if selected === s.id}
              <div class="row" style="--gap:10px">
                {#if !isBodyweight(e) || s.set.weight > 0}
                  <ValueStepper title="Weight" value={app.units.display(s.set.weight)} step={app.weightStep(e)} unit={app.units.symbol} decimals
                    max={maxWeight(app.units.pounds)}
                    onchange={(v) => (s.set.weight = Math.max(0, app.units.kg(v)))} />
                {/if}
                <ValueStepper title={e.isTimed ? 'Time' : 'Reps'} value={s.set.reps} step={e.isTimed ? 5 : 1} unit={e.isTimed ? 'sec' : 'reps'} decimals={false}
                  max={maxReps(e.isTimed)}
                  onchange={(v) => (s.set.reps = Math.max(0, Math.round(v)))} />
              </div>
              {#if !s.set.isWarmup}
                <div class="stack" style="--gap:6px">
                  <span class="kicker muted">SET TYPE</span>
                  <div class="segmented" role="radiogroup" aria-label="Set type">
                    {#each [[null, 'Straight'], ['drop', 'Drop'], ['failure', 'Failure']] as const as [t, name] (name)}
                      <button role="radio" aria-checked={(s.set.type ?? null) === t} class:on={(s.set.type ?? null) === t}
                        onclick={() => {
                          const was = s.set.type;
                          if (t) s.set.type = t; else delete s.set.type;
                          if (t === 'failure') s.set.rir = 0;
                          else if (was === 'failure' && s.set.rir === 0) s.set.rir = null;
                        }}>{name}</button>
                    {/each}
                  </div>
                </div>
              {/if}
              {#if !s.set.isWarmup && !e.isTimed && s.set.type !== 'failure'}
                <div class="stack" style="--gap:6px">
                  <span class="kicker muted">REPS LEFT</span>
                  <div class="segmented" role="radiogroup" aria-label="Reps left">
                    {#each [0, 1, 2, 3, 4] as v (v)}
                      <button role="radio" aria-checked={s.set.rir === v} class:on={s.set.rir === v} onclick={() => (s.set.rir = v)}>{v === 4 ? '4+' : v}</button>
                    {/each}
                  </div>
                </div>
              {/if}
            {/if}
          </div>
        {/each}
        <button class="item link sub" onclick={() => addSet(x)}><Plus size={18} /> Add Set</button>
      </div>
    </div>
  {/each}

  <div class="section"><div class="list"><button class="item link" onclick={() => (adding = true)}><Plus size={18} /> Add Exercise</button></div></div>
  <div class="section">
    <div class="list"><button class="item" style="color:var(--fatigued)" onclick={ondelete}><Trash2 size={18} /> Delete Workout</button></div>
    {#if !edited.length}<div class="foot">A workout needs at least one set. Add one, or delete the workout.</div>{/if}
  </div>
</Sheet>

{#if adding}
  {@const inLog = new Set(exercises.map((x) => x.template.exerciseID))}
  <ExercisePicker title="Add Exercise" exercises={Catalog.all.filter((e) => !inLog.has(e.id))} allowCreate onpick={add} onclose={() => (adding = false)} />
{/if}
