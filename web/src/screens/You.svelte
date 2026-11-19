<script lang="ts">
  import { GOALS, type Gym, Gyms, LEVELS, Programs, SPLITS, uuid } from '../engine';
  import { ChevronRight, Trash2 } from '@lucide/svelte';
  import ActionMenu from '../components/ActionMenu.svelte';
  import BackBar from '../components/BackBar.svelte';
  import { goalTitle, levelTitle, splitTitle, variabilityTitle } from '../lib/labels';
  import { type Route, nav } from '../lib/nav.svelte';
  import { app } from '../lib/store.svelte';
  import { toasts } from '../lib/toasts.svelte';

  /** Pushed from Today rather than shown as its own tab. */
  let { embedded = false }: { embedded?: boolean } = $props();
  const p = $derived(app.profile!);

  const programStatus = $derived.by(() => {
    const progress = p.programProgress;
    const program = progress && Programs.byID(progress.programID);
    if (!progress || !program) return 'None';
    return progress.isFinished ? 'Finished' : `Week ${progress.week} of ${program.weeks}`;
  });

  function addGym(preset: () => Gym, name: string) {
    const gym = { ...preset(), id: uuid(), name, usesPounds: p.usesPounds };
    app.updateProfile((x) => { x.gyms.push(gym); });
    nav.push({ name: 'gym', id: gym.id });
  }

  function deleteGym(id: string) {
    // Always keep at least one gym.
    if (p.gyms.length <= 1) return toasts.show('You need at least one gym');
    const before = structuredClone(p);
    app.updateProfile((x) => {
      x.gyms = x.gyms.filter((g) => g.id !== id);
      if (!x.gyms.some((g) => g.id === x.activeGymID)) x.activeGymID = x.gyms[0].id;
    });
    toasts.show('Gym deleted', () => app.updateProfile((x) => { x.gyms = before.gyms; x.activeGymID = before.activeGymID; }));
  }

  function setPounds(pounds: boolean) {
    // Increment overrides were in the old unit; drop them rather than misread them.
    app.updateProfile((x) => { x.usesPounds = pounds; x.gyms = x.gyms.map((g) => ({ ...g, usesPounds: pounds, increments: {} })); });
  }

  const sessionStep = (by: number) => app.updatePlan((x) => { x.sessionMinutes = Math.min(90, Math.max(15, x.sessionMinutes + by)); });
</script>

{#snippet link(label: string, value: string, route: Route)}
  <button class="item" onclick={() => nav.push(route)}>{label}<span class="value">{value}</span><ChevronRight size={16} color="var(--muted)" /></button>
{/snippet}

<div class="screen">
  {#if embedded}<BackBar title="Your Plan" />{:else}<h1 class="display" style="font-size:2rem;margin-top:12px">You</h1>{/if}

  <div class="section">
    <div class="head">Training</div>
    <div class="list">
      <label class="item">Goal
        <select value={p.plan.goal} onchange={(e) => app.updatePlan((x) => { x.goal = (e.currentTarget as HTMLSelectElement).value as never; })}>
          {#each GOALS as g (g)}<option value={g}>{goalTitle[g]}</option>{/each}
        </select>
      </label>
      <label class="item">Experience
        <select value={p.plan.experience} onchange={(e) => app.updatePlan((x) => { x.experience = (e.currentTarget as HTMLSelectElement).value as never; })}>
          {#each LEVELS as l (l)}<option value={l}>{levelTitle[l]}</option>{/each}
        </select>
      </label>
      <label class="item">Split
        <select value={p.plan.split} onchange={(e) => app.updatePlan((x) => { x.split = (e.currentTarget as HTMLSelectElement).value as never; })}>
          {#each SPLITS as s (s)}<option value={s}>{splitTitle[s]}</option>{/each}
        </select>
      </label>
      <div class="item">
        <span class="grow">Session: {p.plan.sessionMinutes} min</span>
        <div class="segmented" style="width:110px">
          <button aria-label="Shorter session" disabled={p.plan.sessionMinutes <= 15} onclick={() => sessionStep(-5)}>−</button>
          <button aria-label="Longer session" disabled={p.plan.sessionMinutes >= 90} onclick={() => sessionStep(5)}>+</button>
        </div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="head">Program</div>
    <div class="list">{@render link('Program', programStatus, { name: 'programs' })}</div>
  </div>

  <div class="section">
    <div class="head">Gyms</div>
    <div class="list">
      <label class="item">Training At
        <select value={p.activeGymID} onchange={(e) => app.updateProfile((x) => { x.activeGymID = (e.currentTarget as HTMLSelectElement).value; })}>
          {#each p.gyms as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
        </select>
      </label>
      {#each p.gyms as g (g.id)}
        <div class="item" style="padding-right:4px">
          <button class="row grow" onclick={() => nav.push({ name: 'gym', id: g.id })}>
            <span class="grow" style="text-align:left">{g.name}</span><span class="muted">{g.equipment.length} items</span><ChevronRight size={16} color="var(--muted)" />
          </button>
          <button class="icon-btn" style="color:var(--fatigued)" aria-label="Delete {g.name}" onclick={() => deleteGym(g.id)}><Trash2 size={18} /></button>
        </div>
      {/each}
      <ActionMenu label="Add Gym" class="item link" items={[
        { label: 'Full Gym', action: () => addGym(Gyms.commercial, 'New Gym') },
        { label: 'Home Gym (Barbell + Cables)', action: () => addGym(Gyms.homeBarbell, 'Home Gym') },
        { label: 'Home Gym', action: () => addGym(Gyms.home, 'Home') },
        { label: 'No Equipment', action: () => addGym(Gyms.bodyweight, 'Travel') },
      ]}>Add Gym</ActionMenu>
    </div>
  </div>

  <div class="section">
    <div class="head">Units</div>
    <div class="segmented" role="radiogroup" aria-label="Weights">
      <button role="radio" aria-checked={p.usesPounds} class:on={p.usesPounds} onclick={() => setPounds(true)}>Pounds</button>
      <button role="radio" aria-checked={!p.usesPounds} class:on={!p.usesPounds} onclick={() => setPounds(false)}>Kilograms</button>
    </div>
  </div>

  <div class="section">
    <div class="head">Fine-Tuning</div>
    <div class="list">
      {@render link('Workout Style', variabilityTitle[p.plan.variability], { name: 'style' })}
      {@render link('Injuries & Limitations', p.plan.injuries.length ? `${p.plan.injuries.length}` : 'None', { name: 'injuries' })}
      {@render link('My Exercises', p.customExercises.length ? `${p.customExercises.length}` : 'None', { name: 'customExercises' })}
      {@render link('Exercise Preferences', Object.keys(p.plan.preferences).length ? `${Object.keys(p.plan.preferences).length}` : 'None', { name: 'preferences' })}
    </div>
  </div>

  <div class="section">
    <div class="head">Data</div>
    <div class="list">{@render link('Backup, Import & Export', '', { name: 'data' })}</div>
    <div class="foot">Your workouts are stored only on this device, in this browser.</div>
  </div>
</div>

<style>
  .item select { width: auto; margin-left: auto; min-height: 0; padding: 4px 8px; background: transparent; color: var(--muted); text-align: right; }
</style>
