<script lang="ts">
  import { type Exercise, MUSCLES, type Muscle, isCustom, muscleName } from '../engine';
  import CustomExerciseEditor from './CustomExerciseEditor.svelte';
  import ExerciseThumb from './ExerciseThumb.svelte';
  import Sheet from './Sheet.svelte';
  import { SquarePlus } from '@lucide/svelte';

  let { title, exercises, allowCreate = false, onpick, onclose }: {
    title: string; exercises: Exercise[]; allowCreate?: boolean; onpick: (e: Exercise) => void; onclose: () => void;
  } = $props();

  let search = $state('');
  let muscle = $state<Muscle | ''>('');
  let creating = $state(false);

  const filtered = $derived(exercises.filter((e) =>
    (!search || e.name.toLowerCase().includes(search.toLowerCase())) && (!muscle || e.primary.includes(muscle))));

  function pick(e: Exercise) { onpick(e); onclose(); }
</script>

<Sheet {title} {onclose} full>
  <div class="stack" style="--gap:10px">
    <div class="row" style="--gap:8px">
      <input type="search" placeholder="Search" bind:value={search} aria-label="Search exercises" />
      <select bind:value={muscle} aria-label="Filter by muscle" style="width:auto">
        <option value="">All muscles</option>
        {#each MUSCLES as m (m)}<option value={m}>{muscleName(m)}</option>{/each}
      </select>
    </div>
    <div class="list">
      {#each filtered as e (e.id)}
        <button class="item" onclick={() => pick(e)}>
          <ExerciseThumb exercise={e} size={44} />
          <span class="grow">
            <span>{e.name}</span><br />
            <span class="caption muted">{e.primary.map(muscleName).join(', ')}</span>
          </span>
          {#if isCustom(e)}<span class="caption bold muted">Custom</span>{/if}
        </button>
      {/each}
    </div>
    {#if !filtered.length && !allowCreate}
      <p class="muted" style="text-align:center;padding:32px 0">
        {exercises.length ? 'No matches. Try a different name or muscle.' : "No alternatives: nothing else fits these muscles with your gym's equipment."}
      </p>
    {/if}
    {#if allowCreate}
      <div class="list"><button class="item link" onclick={() => (creating = true)}>
        <SquarePlus size={20} /> {search ? `Create “${search}”` : 'Create Custom Exercise'}
      </button></div>
      <p class="caption muted">Can't find it? Add it once and Forge will use it like any other exercise.</p>
    {/if}
  </div>
</Sheet>

{#if creating}
  <CustomExerciseEditor initialName={search} onsave={pick} onclose={() => (creating = false)} />
{/if}
