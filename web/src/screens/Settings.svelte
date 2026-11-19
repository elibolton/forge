<script lang="ts">
  // The small settings pages pushed from You: gym editor, workout style, injuries, preferences, custom exercises.
  import { Catalog, EQUIPMENT, type Equipment, JOINTS, VARIABILITIES, gymIncrement, muscleName } from '../engine';
  import { Check, ChevronRight, Plus, Trash2 } from '@lucide/svelte';
  import BackBar from '../components/BackBar.svelte';
  import CustomExerciseEditor from '../components/CustomExerciseEditor.svelte';
  import ExerciseThumb from '../components/ExerciseThumb.svelte';
  import Toggle from '../components/Toggle.svelte';
  import { removeCustomExercise } from '../lib/customExercises';
  import { equipmentTitle, jointTitle, preferenceTitle, variabilityTitle } from '../lib/labels';
  import { type Route, nav } from '../lib/nav.svelte';
  import { app } from '../lib/store.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { REST_SOUNDS, restSoundTitle } from '../lib/sounds';
  import { session } from '../lib/session.svelte';

  let { route }: { route: Route } = $props();
  const p = $derived(app.profile!);
  let creating = $state(false);

  const GROUPS: [string, Equipment[]][] = [
    ['Free Weights', ['barbell', 'ezBar', 'trapBar', 'dumbbell', 'kettlebell', 'resistanceBand']],
    ['Stations', ['bench', 'squatRack', 'pullUpBar', 'dipStation', 'smithMachine']],
    ['Machines', ['cable', 'latPulldown', 'legPress', 'legCurl', 'legExtension', 'chestPressMachine', 'shoulderPressMachine']],
  ];

  function updateGym(id: string, change: (g: (typeof p.gyms)[number]) => void) {
    app.updateProfile((x) => { const g = x.gyms.find((y) => y.id === id); if (g) change(g); });
  }
  void EQUIPMENT;
</script>

{#if route.name === 'gym'}
  {@const gym = p.gyms.find((g) => g.id === route.id)}
  <div class="screen">
    <BackBar title={gym?.name ?? 'Gym'} />
    {#if gym}
      <div class="section" style="margin-top:12px">
        <input type="text" aria-label="Gym name" value={gym.name} onchange={(e) => updateGym(gym.id, (g) => { g.name = (e.currentTarget as HTMLInputElement).value.trim() || g.name; })} />
      </div>
      {#each GROUPS as [title, items] (title)}
        <div class="section"><div class="head">{title}</div>
          <div class="list">
            {#each items as eq (eq)}
              <Toggle label={equipmentTitle[eq]} checked={gym.equipment.includes(eq)}
                onchange={(on) => updateGym(gym.id, (g) => { g.equipment = on ? [...g.equipment, eq] : g.equipment.filter((x) => x !== eq); })} />
            {/each}
          </div>
        </div>
      {/each}
      <div class="section"><div class="head">Weight Steps</div>
        <div class="list">
          {#each ['barbell', 'dumbbell', 'kettlebell', 'cable'] as const as eq (eq)}
            {@const step = gymIncrement(gym, eq)}
            {@const delta = gym.usesPounds ? 2.5 : 0.5}
            <div class="item">
              <span class="grow">{equipmentTitle[eq]}: {step} {gym.usesPounds ? 'lb' : 'kg'} steps</span>
              <div class="segmented" style="width:110px">
                <button aria-label="Smaller {equipmentTitle[eq]} step" disabled={step - delta < (gym.usesPounds ? 1 : 0.5)}
                  onclick={() => updateGym(gym.id, (g) => { g.increments[eq] = step - delta; })}>−</button>
                <button aria-label="Larger {equipmentTitle[eq]} step" disabled={step + delta > (gym.usesPounds ? 20 : 10)}
                  onclick={() => updateGym(gym.id, (g) => { g.increments[eq] = step + delta; })}>+</button>
              </div>
            </div>
          {/each}
        </div>
        <div class="foot">The smallest jump available, so suggested weights are ones you can actually load.</div>
      </div>
    {/if}
  </div>

{:else if route.name === 'style'}
  <div class="screen">
    <BackBar title="Workout Style" />
    <div class="section"><div class="head">Exercise Variety</div>
      <div class="list" role="radiogroup" aria-label="Exercise variety">
        {#each VARIABILITIES as v (v)}
          <button class="item" role="radio" aria-checked={p.plan.variability === v} onclick={() => app.updatePlan((x) => { x.variability = v; })}>
            <span class="grow">{variabilityTitle[v]}</span>{#if p.plan.variability === v}<Check size={18} color="var(--accent)" />{/if}
          </button>
        {/each}
      </div>
      <div class="foot">Consistent repeats the same lifts so progress is easy to track. More variety rotates exercises more often.</div>
    </div>
    <div class="section">
      <div class="list"><Toggle label="Warm-Up Sets" checked={p.plan.warmUpSets} onchange={(v) => app.updatePlan((x) => { x.warmUpSets = v; })} /></div>
      <div class="foot">Adds lighter ramp-up sets before heavy compound lifts.</div>
    </div>
    <div class="section">
      <div class="list"><Toggle label="Supersets" checked={p.plan.supersets} onchange={(v) => app.updatePlan((x) => { x.supersets = v; })} /></div>
      <div class="foot">Generated workouts pair exercises that don't compete for the same muscles (push with pull, biceps with triceps) and alternate their sets. More work in the same time. The main lift stays on its own.</div>
    </div>
    <div class="section"><div class="head">Stretching</div>
      <div class="list">
        <Toggle label="Warm-up drills" checked={p.mobility.warmup} onchange={(v) => app.updateProfile((x) => { x.mobility.warmup = v; })} />
        <Toggle label="Cool-down stretches" checked={p.mobility.cooldown} onchange={(v) => app.updateProfile((x) => { x.mobility.cooldown = v; })} />
      </div>
      <div class="foot">Adds three drills before and three stretches after each workout, chosen for the muscles you're training. They don't count toward fatigue.</div>
    </div>
    <div class="section"><div class="head">Rest timer sound</div>
      <div class="list" role="radiogroup" aria-label="Rest timer sound">
        {#each REST_SOUNDS as snd (snd)}
          {@const on = (app.get('restSound') ?? 'chime') === snd}
          <button class="item" role="radio" aria-checked={on} onclick={() => { app.set('restSound', snd); session.preview(snd); }}>
            <span class="grow">{restSoundTitle[snd]}</span>{#if on}<Check size={18} color="var(--accent)" />{/if}
          </button>
        {/each}
      </div>
      <div class="foot">Plays when rest is up while Forge is open. A web app can't sound an alert while the phone is locked, so the screen stays on during a workout.</div>
    </div>
  </div>

{:else if route.name === 'injuries'}
  <div class="screen">
    <BackBar title="Injuries & Limitations" />
    <div class="section">
      <div class="list">
        {#each JOINTS as j (j)}
          <Toggle label={jointTitle(j)} checked={p.plan.injuries.includes(j)}
            onchange={(on) => app.updatePlan((x) => { x.injuries = on ? [...x.injuries, j] : x.injuries.filter((y) => y !== j); })} />
        {/each}
      </div>
      <div class="foot">Exercises that load these joints are left out. Not medical advice.</div>
    </div>
  </div>

{:else if route.name === 'preferences'}
  {@const prefs = Object.entries(p.plan.preferences).sort((a, b) => Catalog.exercise(a[0]).name.localeCompare(Catalog.exercise(b[0]).name))}
  <div class="screen">
    <BackBar title="Exercise Preferences" />
    {#if !prefs.length}
      <p class="muted" style="text-align:center;padding-top:25vh">No preferences yet. Use the ⋯ menu on an exercise to recommend it more, less or never.</p>
    {:else}
      <div class="section"><div class="list">
        {#each prefs as [id, pref] (id)}
          <div class="item">
            <span class="grow">{Catalog.exercise(id).name}</span><span class="muted sub">{preferenceTitle[pref]}</span>
            <button class="icon-btn" style="color:var(--fatigued)" aria-label="Remove preference for {Catalog.exercise(id).name}"
              onclick={() => { app.updatePlan((x) => { delete x.preferences[id]; }); toasts.show('Preference removed', () => app.updatePlan((x) => { x.preferences[id] = pref; })); }}><Trash2 size={18} /></button>
          </div>
        {/each}
      </div></div>
    {/if}
  </div>

{:else if route.name === 'customExercises'}
  {@const list = [...p.customExercises].sort((a, b) => a.name.localeCompare(b.name))}
  <div class="screen">
    <BackBar title="My Exercises">
      {#snippet trailing()}<button class="icon-btn" aria-label="New Exercise" onclick={() => (creating = true)}><Plus /></button>{/snippet}
    </BackBar>
    {#if !list.length}
      <div class="stack" style="align-items:center;text-align:center;padding-top:20vh">
        <div class="bold">No custom exercises</div>
        <p class="sub muted">Add the movements your gym has that Forge's library doesn't. They're used in generated workouts like any other exercise.</p>
        <button class="btn primary" onclick={() => (creating = true)}>New Exercise</button>
      </div>
    {:else}
      <div class="section"><div class="list">
        {#each list as e (e.id)}
          <div class="item">
            <button class="row grow" style="text-align:left" onclick={() => nav.push({ name: 'exercise', id: e.id })}>
              <ExerciseThumb exercise={e} size={40} />
              <span class="grow">{e.name}<br /><span class="caption muted">{e.primary.map(muscleName).join(', ')}</span></span>
              <ChevronRight size={16} color="var(--muted)" />
            </button>
            <button class="icon-btn" style="color:var(--fatigued)" aria-label="Delete {e.name}" onclick={() => removeCustomExercise(e)}><Trash2 size={18} /></button>
          </div>
        {/each}
      </div></div>
    {/if}
  </div>
{/if}

{#if creating}
  <CustomExerciseEditor onsave={() => {}} onclose={() => (creating = false)} />
{/if}
