<script lang="ts">
  import { Catalog } from '../engine';
  import type { WorkoutTemplate } from '../lib/templates';
  import { app } from '../lib/store.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import Sheet from './Sheet.svelte';

  /** Name a workout and keep it to do again. `make` builds the template from whatever is being saved. */
  let { suggested, make, onclose }: { suggested: string; make: (name: string) => WorkoutTemplate; onclose: () => void } = $props();
  // svelte-ignore state_referenced_locally
  let name = $state(suggested);
  const preview = $derived(make(name));

  function save() {
    app.saveTemplate(preview);
    toasts.show(`Saved “${preview.name}”`);
    onclose();
  }
</script>

<Sheet title="Save Workout" {onclose}>
  {#snippet trailing()}<button class="link bold" onclick={save}>Save</button>{/snippet}
  <div class="stack" style="--gap:16px">
    <input type="text" bind:value={name} aria-label="Workout name" placeholder="e.g. Heavy Push" onkeydown={(e) => e.key === 'Enter' && save()} />
    <div class="list">
      {#each preview.exercises as x, i (i)}
        <div class="item"><span class="grow">{Catalog.exercise(x.exerciseID).name}</span><span class="value mono">{x.sets} × {x.reps}</span></div>
      {/each}
    </div>
    <p class="caption muted">Starting it later uses these sets and reps, with weights picked from your latest numbers. Find it under Today's ⋯ menu.</p>
    <button class="btn primary block big" onclick={save}>Save workout</button>
  </div>
</Sheet>
