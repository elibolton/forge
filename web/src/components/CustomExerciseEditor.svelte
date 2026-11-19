<script lang="ts">
  import { Catalog, NEEDS, type Need, type Exercise, MUSCLES, type Muscle, type MovementPattern, isBodyweight, isCustom, muscleName } from '../engine';
  import { MOVEMENTS, likelyJoints, makeCustomID } from '../lib/customExercises';
  import { needTitle } from '../lib/labels';
  import { app } from '../lib/store.svelte';
  import Sheet from './Sheet.svelte';

  /** Create or edit a custom exercise. Only name and main muscle are required; the rest has sensible defaults. */
  let { existing, initialName = '', onsave, onclose }: {
    existing?: Exercise; initialName?: string; onsave: (e: Exercise) => void; onclose: () => void;
  } = $props();

  type Tracking = 'weight' | 'bodyweight' | 'time';
  // svelte-ignore state_referenced_locally
  const start = existing;
  // svelte-ignore state_referenced_locally
  let name = $state(start?.name ?? initialName);
  let movement = $state<MovementPattern>(start?.pattern ?? 'isolation');
  let primary = $state<Muscle[]>([...(start?.primary ?? [])]);
  let secondary = $state<Muscle[]>([...(start?.secondary ?? [])]);
  let equipment = $state<Need[]>([...(start?.equipment ?? ['dumbbell'])]);
  let tracking = $state<Tracking>(start ? (start.isTimed ? 'time' : isBodyweight(start) ? 'bodyweight' : 'weight') : 'weight');
  let notes = $state(start?.notes ?? '');

  const trimmed = $derived(name.trim());
  const canSave = $derived(trimmed.length > 0 && primary.length > 0);
  /** Another exercise already uses this name; allowed, but worth pointing out. */
  const duplicate = $derived(Catalog.all.find((e) => e.id !== start?.id && e.name.toLowerCase() === trimmed.toLowerCase()));

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  function save() {
    if (!canSave) return;
    const orderedPrimary = MUSCLES.filter((m) => primary.includes(m));
    const isCompound = !['isolation', 'core', 'mobility'].includes(movement);
    const eq = NEEDS.filter((e) => equipment.includes(e));
    const starter = tracking === 'weight'
      ? (start && !isBodyweight(start) ? start.starterOneRM : Catalog.suggestedStarterOneRM(orderedPrimary, eq, isCompound))
      : 0;
    const exercise: Exercise = {
      id: start?.id ?? makeCustomID(trimmed), name: trimmed, primary: orderedPrimary,
      secondary: MUSCLES.filter((m) => secondary.includes(m) && !primary.includes(m)), equipment: eq, pattern: movement,
      isCompound, level: start?.level ?? 'beginner', starterOneRM: starter, jointsStressed: likelyJoints(movement),
      isTimed: tracking === 'time', notes: notes.trim() ? notes : undefined,
    };
    app.saveCustomExercise(exercise);
    onsave(exercise);
    onclose();
  }
</script>

<Sheet title={start ? 'Edit Exercise' : 'New Exercise'} {onclose} full>
  {#snippet trailing()}<button class="link bold" disabled={!canSave} onclick={save}>Save</button>{/snippet}
  <div class="stack">
    <input type="text" placeholder="Name" bind:value={name} aria-label="Name" class="bold" />
    {#if duplicate}
      <p class="caption muted">{duplicate.name} already exists{isCustom(duplicate) ? '' : ' in the library'}. You can still save this one.</p>
    {/if}

    <div class="section-title">Main muscles {#if !primary.length}<span class="accent">· required</span>{/if}</div>
    <div class="row wrap" style="--gap:8px">
      {#each MUSCLES as m (m)}
        <button class="chip" class:on={primary.includes(m)} aria-pressed={primary.includes(m)}
          onclick={() => { primary = toggle(primary, m); secondary = secondary.filter((x) => !primary.includes(x)); }}>{muscleName(m)}</button>
      {/each}
    </div>

    <div class="section-title">Also works</div>
    <div class="row wrap" style="--gap:8px">
      {#each MUSCLES.filter((m) => !primary.includes(m)) as m (m)}
        <button class="chip" class:on={secondary.includes(m)} aria-pressed={secondary.includes(m)} onclick={() => (secondary = toggle(secondary, m))}>{muscleName(m)}</button>
      {/each}
    </div>

    <label class="stack" style="--gap:6px">
      <span class="section-title">Movement</span>
      <select bind:value={movement}>
        {#each MOVEMENTS as [p, title] (p)}<option value={p}>{title}</option>{/each}
      </select>
    </label>

    <div class="section-title">Track</div>
    <div class="segmented" role="radiogroup" aria-label="Track">
      {#each [['weight', 'Weight & reps'], ['bodyweight', 'Reps only'], ['time', 'Time']] as [v, t] (v)}
        <button role="radio" aria-checked={tracking === v} class:on={tracking === v} onclick={() => (tracking = v as Tracking)}>{t}</button>
      {/each}
    </div>

    <div class="section-title">Equipment</div>
    <div class="row wrap" style="--gap:8px">
      <button class="chip" class:on={!equipment.length} aria-pressed={!equipment.length} onclick={() => (equipment = [])}>None</button>
      {#each NEEDS as e (e)}
        <button class="chip" class:on={equipment.includes(e)} aria-pressed={equipment.includes(e)} onclick={() => (equipment = toggle(equipment, e))}>{needTitle[e]}</button>
      {/each}
    </div>
    <p class="caption muted">Forge only suggests this exercise when your gym has everything listed. Pick a pulley position for cable work, since gyms differ.</p>

    <label class="stack" style="--gap:6px">
      <span class="section-title">How to (optional)</span>
      <textarea rows="4" bind:value={notes} placeholder={'One cue per line, e.g. "Keep elbows tucked"'}></textarea>
    </label>
  </div>
</Sheet>

<style>
  .section-title { font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; margin-top: 8px; }
</style>
