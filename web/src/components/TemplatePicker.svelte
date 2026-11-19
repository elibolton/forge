<script lang="ts">
  import { Catalog } from '../engine';
  import { Bookmark, Ellipsis } from '@lucide/svelte';
  import type { WorkoutTemplate } from '../lib/templates';
  import { sessionFromTemplate } from '../lib/templateStart';
  import { addMobility } from '../lib/mobility';
  import { session } from '../lib/session.svelte';
  import { app } from '../lib/store.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import ActionMenu from './ActionMenu.svelte';
  import Sheet from './Sheet.svelte';

  /** Your saved workouts: start one, rename or delete it. */
  let { onclose }: { onclose: () => void } = $props();
  const list = $derived([...app.templates].sort((a, b) => (b.lastUsed ?? b.createdAt) - (a.lastUsed ?? a.createdAt)));

  function start(t: WorkoutTemplate) {
    // Starting replaces a workout in progress, so ask first.
    if (!session.okToReplace()) return;
    app.saveTemplate({ ...t, lastUsed: Date.now() });
    const state = sessionFromTemplate(t, app.planner());
    addMobility(state, [...new Set(t.exercises.flatMap((x) => Catalog.exercise(x.exerciseID).primary))], app.profile!.mobility);
    session.startPrepared(state, true);
    const skipped = t.exercises.filter((x) => !Catalog.byID.has(x.exerciseID)).length;
    if (skipped) toasts.show(`Left out ${skipped} exercise${skipped === 1 ? '' : 's'} that no longer exist${skipped === 1 ? 's' : ''}`);
    onclose();
  }

  function rename(t: WorkoutTemplate) {
    const name = prompt('Rename workout', t.name)?.trim();
    if (name) app.saveTemplate({ ...t, name });
  }

  function remove(t: WorkoutTemplate) {
    app.removeTemplate(t.id);
    toasts.show(`Deleted “${t.name}”`, () => app.saveTemplate(t));
  }
</script>

<Sheet title="Saved Workouts" {onclose}>
  {#if !list.length}
    <div class="stack" style="align-items:center;text-align:center;padding:40px 12px;--gap:10px">
      <Bookmark size={32} color="var(--text-3)" />
      <div class="bold">No saved workouts yet</div>
      <p class="sub muted">Save a workout from Today, from the workout logger, or from any past workout in your history.</p>
    </div>
  {:else}
    <div class="stack" style="--gap:10px">
      {#each list as t (t.id)}
        <div class="tpl">
          <button class="grow stack" style="--gap:4px;text-align:left" onclick={() => start(t)}>
            <span class="bold">{t.name}</span>
            <span class="caption muted one-line">{t.exercises.map((x) => Catalog.exercise(x.exerciseID).name).join(' · ')}</span>
            <span class="caption faint">{t.exercises.length} exercises · {t.exercises.reduce((n, x) => n + x.sets, 0)} sets{t.lastUsed ? ` · last done ${new Date(t.lastUsed).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}</span>
          </button>
          <ActionMenu label="{t.name} options" items={[
            { label: 'Start', action: () => start(t) },
            { label: 'Rename', action: () => rename(t) },
            { label: 'Delete', danger: true, action: () => remove(t) },
          ]}><Ellipsis size={18} /></ActionMenu>
        </div>
      {/each}
    </div>
  {/if}
</Sheet>

<style>
  .tpl { display: flex; align-items: center; gap: 8px; padding: 14px 8px 14px 16px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--hairline); }
</style>
