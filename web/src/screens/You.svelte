<script lang="ts">
  import TemplatePicker from '../components/TemplatePicker.svelte';
  import { GOALS, type Gym, Gyms, LEVELS, Programs, SPLITS, uuid } from '../engine';
  import { ChevronRight, MapPin, Trash2 } from '@lucide/svelte';
  import ActionMenu from '../components/ActionMenu.svelte';
  import BackBar from '../components/BackBar.svelte';
  import { goalTitle, levelTitle, splitTitle, variabilityTitle } from '../lib/labels';
  import { type Route, nav } from '../lib/nav.svelte';
  import { app } from '../lib/store.svelte';
  import { toasts } from '../lib/toasts.svelte';

  /** Pushed from Today rather than shown as its own tab. */
  let { embedded = false }: { embedded?: boolean } = $props();
  const p = $derived(app.profile!);
  let pickingTemplate = $state(false);
  const splitShort = { pushPullLegs: 'PPL', upperLower: 'U/L', fullBody: 'Full', freshMuscles: 'Fresh' } as const;

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

  const goalStep = (by: number) => app.updateProfile((x) => { x.weeklyGoal = Math.min(7, Math.max(1, x.weeklyGoal + by)); });
  const sessionStep = (by: number) => app.updatePlan((x) => { x.sessionMinutes = Math.min(90, Math.max(15, x.sessionMinutes + by)); });
</script>

{#snippet link(label: string, value: string, route: Route)}
  <button class="item" onclick={() => nav.push(route)}>{label}<span class="value">{value}</span><ChevronRight size={16} color="var(--muted)" /></button>
{/snippet}

<div class="screen">
  {#if embedded}<BackBar title="Your Plan" />{:else}
    <header class="stack" style="--gap:6px;padding-top:6px"><span class="eyebrow">Settings</span><h1 class="page-title">You</h1></header>
  {/if}

  <section class="profile">
    <div class="glow" aria-hidden="true"></div>
    <span class="eyebrow" style="color:var(--ember-2)">Your plan</span>
    <div class="display goal">{goalTitle[p.plan.goal]}</div>
    <div class="facts">
      <div><span class="num">{p.plan.sessionMinutes}</span><span class="eyebrow">min</span></div>
      <div><span class="num">{splitShort[p.plan.split]}</span><span class="eyebrow">split</span></div>
      <div><span class="num">{levelTitle[p.plan.experience].slice(0, 3)}</span><span class="eyebrow">level</span></div>
      <div><span class="num">{app.logs.length}</span><span class="eyebrow">workouts</span></div>
    </div>
    <div class="row caption muted" style="--gap:6px"><MapPin size={13} /> {app.activeGym.name} · {app.activeGym.equipment.length} pieces of equipment</div>
  </section>

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
      <div class="item">
        <span class="grow">Weekly goal: {p.weeklyGoal} {p.weeklyGoal === 1 ? 'workout' : 'workouts'}</span>
        <div class="segmented" style="width:110px">
          <button aria-label="Fewer workouts per week" disabled={p.weeklyGoal <= 1} onclick={() => goalStep(-1)}>−</button>
          <button aria-label="More workouts per week" disabled={p.weeklyGoal >= 7} onclick={() => goalStep(1)}>+</button>
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
      <button class="item" onclick={() => (pickingTemplate = true)}>Saved Workouts<span class="value">{app.templates.length || 'None'}</span><ChevronRight size={16} color="var(--muted)" /></button>
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
  .profile { position: relative; overflow: hidden; margin-top: 18px; padding: 20px; border-radius: var(--r-xl); border: 1px solid var(--hairline-2);
    background: linear-gradient(165deg, #1d1410, #111013 55%); display: flex; flex-direction: column; gap: 10px; }
  .glow { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(70% 70% at 100% 0%, rgba(255, 90, 31, 0.38), transparent 60%); }
  .profile > * { position: relative; }
  .goal { font-size: 2rem; }
  .facts { display: grid; grid-template-columns: repeat(4, 1fr); padding: 12px 0; margin: 4px 0; border-block: 1px solid var(--hairline); }
  .facts div { display: flex; flex-direction: column; gap: 4px; }
  .facts div + div { padding-left: 12px; border-left: 1px solid var(--hairline); }
  .facts .num { font-size: 1.2rem; }
  .facts .eyebrow { font-stretch: 100%; letter-spacing: 0.08em; font-size: 0.6rem; }
  .item select { width: auto; margin-left: auto; min-height: 0; padding: 4px 8px; background: transparent; border: 0; color: var(--text-2); text-align: right; }
</style>

{#if pickingTemplate}<TemplatePicker onclose={() => (pickingTemplate = false)} />{/if}
