<script lang="ts">
  // The small settings pages pushed from You: gym editor, workout style, injuries, preferences, custom exercises.
  import { type BarKind, Catalog, EQUIPMENT, type Equipment, JOINTS, MAX_BAR, MAX_PAIRS, VARIABILITIES, gymBar, gymIncrement, gymPlates, isPlateLoaded, muscleName, stepTooFine } from '../engine';
  import { PLATE_CHOICES, gymBarKinds, gymLoadKinds, nextStep, readAmount, usesPlates } from '../lib/loadSteps';
  import { fmtNum } from '../lib/units';
  import { Check, ChevronRight, Plus, Trash2 } from '@lucide/svelte';
  import BackBar from '../components/BackBar.svelte';
  import CustomExerciseEditor from '../components/CustomExerciseEditor.svelte';
  import ExerciseThumb from '../components/ExerciseThumb.svelte';
  import Toggle from '../components/Toggle.svelte';
  import { removeCustomExercise } from '../lib/customExercises';
  import { EQUIPMENT_GROUPS, equipmentTitle, jointTitle, loadTitle, preferenceTitle, variabilityTitle } from '../lib/labels';
  import { type Route, nav } from '../lib/nav.svelte';
  import { app } from '../lib/store.svelte';
  import { toasts } from '../lib/toasts.svelte';
  import { REST_SOUNDS, restSoundTitle } from '../lib/sounds';
  import { session } from '../lib/session.svelte';

  let { route }: { route: Route } = $props();
  const p = $derived(app.profile!);
  let creating = $state(false);

  function updateGym(id: string, change: (g: (typeof p.gyms)[number]) => void) {
    app.updateProfile((x) => { const g = x.gyms.find((y) => y.id === id); if (g) change(g); });
  }

  /** Changing the list counts as checking it. */
  function toggleEquipment(id: string, eq: Equipment, on: boolean) {
    updateGym(id, (g) => {
      g.equipment = EQUIPMENT.filter((x) => (x === eq ? on : g.equipment.includes(x)));
      delete g.reviewEquipment;
    });
  }

  /** Adds or removes a plate size; the gym always keeps at least one. */
  function togglePlate(id: string, weight: number, on: boolean) {
    updateGym(id, (g) => {
      const owned = gymPlates(g).filter((x) => x.weight !== weight);
      if (on) owned.push({ weight });
      if (!owned.length) return toasts.show('Keep at least one plate size');
      g.plates = owned.sort((a, b) => b.weight - a.weight).map((x) => ({ ...x }));
    });
  }

  /** Blank is as many as needed. */
  function setPairs(id: string, weight: number, input: HTMLInputElement) {
    const pairs = readAmount(input.value, MAX_PAIRS, true);
    const gym = p.gyms.find((g) => g.id === id);
    if (pairs === undefined) { input.value = String(gym && gymPlates(gym).find((x) => x.weight === weight)?.pairs || ''); return; }
    updateGym(id, (g) => {
      g.plates = gymPlates(g).map((x) => (x.weight !== weight ? { ...x } : pairs === null ? { weight } : { weight, pairs }));
    });
  }

  /** Blank is the standard bar. */
  function setBar(id: string, kind: BarKind, input: HTMLInputElement) {
    const weight = readAmount(input.value, MAX_BAR, false, kind === 'smithMachine');
    const gym = p.gyms.find((g) => g.id === id);
    if (weight === undefined) { input.value = String(gym?.bars?.[kind] ?? ''); return; }
    updateGym(id, (g) => {
      const bars = { ...g.bars };
      if (weight === null) delete bars[kind]; else bars[kind] = weight;
      if (Object.keys(bars).length) g.bars = bars; else delete g.bars;
    });
  }

</script>

{#if route.name === 'gym'}
  {@const gym = p.gyms.find((g) => g.id === route.id)}
  <div class="screen">
    <BackBar title={gym?.name ?? 'Gym'} />
    {#if gym}
      <div class="section" style="margin-top:12px">
        <input type="text" aria-label="Gym name" value={gym.name} onchange={(e) => {
          const input = e.currentTarget as HTMLInputElement;
          const name = input.value.trim();
          // An empty name keeps the old one; show it again rather than leave the field blank.
          if (!name) { input.value = gym.name; return; }
          updateGym(gym.id, (g) => { g.name = name; });
        }} />
      </div>
      {#if gym.reviewEquipment}
        <div class="section"><div class="card stack notice" style="--gap:8px">
          <div class="sub bold">Check your equipment</div>
          <p class="caption muted">Forge now asks about specific pieces, like which bench or cable setup you have. We filled this in from your old list; untick anything you don't have.</p>
          <button class="btn primary" onclick={() => updateGym(gym.id, (g) => { delete g.reviewEquipment; })}>Looks right</button>
        </div></div>
      {/if}
      {#each EQUIPMENT_GROUPS as group (group.title)}
        <div class="section"><div class="head">{group.title}</div>
          <div class="list">
            {#each group.items as eq (eq)}
              <Toggle label={equipmentTitle[eq]} checked={gym.equipment.includes(eq)} onchange={(on) => toggleEquipment(gym.id, eq, on)} />
            {/each}
          </div>
          {#if group.foot}<div class="foot">{group.foot}</div>{/if}
        </div>
      {/each}
      {#if usesPlates(gym)}
        {@const unit = gym.usesPounds ? 'lb' : 'kg'}
        {@const owned = gymPlates(gym)}
        {@const choices = [...new Set([...(gym.usesPounds ? PLATE_CHOICES.lb : PLATE_CHOICES.kg), ...owned.map((x) => x.weight)])].sort((a, b) => b - a)}
        <div class="section"><div class="head">Plates and bars</div>
          <div class="list">
            <div class="item stack" style="--gap:10px;align-items:stretch">
              <span class="sub muted">Plates you have ({unit})</span>
              <div class="row wrap" style="--gap:8px">
                {#each choices as w (w)}
                  {@const on = owned.some((x) => x.weight === w)}
                  <button class="chip" class:on aria-pressed={on} aria-label="{fmtNum(w, 2)} {unit} plates"
                    onclick={() => togglePlate(gym.id, w, !on)}>{fmtNum(w, 2)}</button>
                {/each}
              </div>
            </div>
            {#each owned as plate (plate.weight)}
              <label class="item">
                <span class="grow">{fmtNum(plate.weight, 2)} {unit} pairs</span>
                <input type="text" inputmode="numeric" enterkeyhint="done" class="amount" placeholder="Any"
                  aria-label="Pairs of {fmtNum(plate.weight, 2)} {unit} plates" value={plate.pairs ?? ''}
                  onchange={(ev) => setPairs(gym.id, plate.weight, ev.currentTarget as HTMLInputElement)} />
              </label>
            {/each}
            {#each gymBarKinds(gym) as kind (kind)}
              <label class="item">
                <span class="grow">{kind === 'smithMachine' ? 'Smith machine start' : loadTitle[kind]} ({unit})</span>
                <input type="text" inputmode="decimal" enterkeyhint="done" class="amount" placeholder={fmtNum(gymBar({ ...gym, bars: undefined }, kind), 2)}
                  aria-label="{loadTitle[kind]} weight in {unit}" value={gym.bars?.[kind] ?? ''}
                  onchange={(ev) => setBar(gym.id, kind, ev.currentTarget as HTMLInputElement)} />
              </label>
            {/each}
          </div>
          <div class="foot">Suggested weights are ones these plates and bars can make. Leave pairs blank if you have plenty, and a bar blank for the standard weight.</div>
        </div>
      {/if}
      <div class="section"><div class="head">Weight Steps</div>
        <div class="list">
          {#each gymLoadKinds(gym) as eq (eq)}
            {@const step = gymIncrement(gym, eq)}
            {@const down = nextStep(step, -1, gym.usesPounds)}
            {@const up = nextStep(step, 1, gym.usesPounds)}
            {@const fine = stepTooFine(gym, eq)}
            {@const unitName = gym.usesPounds ? 'lb' : 'kg'}
            <div class="item">
              <span class="grow">{loadTitle[eq]}: {fmtNum(step, 2)} {unitName} steps</span>
              <div class="segmented" style="width:110px">
                <button aria-label="Smaller {loadTitle[eq]} step" disabled={down === undefined}
                  onclick={() => updateGym(gym.id, (g) => { if (down !== undefined) g.increments[eq] = down; })}>−</button>
                <button aria-label="Larger {loadTitle[eq]} step" disabled={up === undefined}
                  onclick={() => updateGym(gym.id, (g) => { if (up !== undefined) g.increments[eq] = up; })}>+</button>
              </div>
            </div>
            {#if fine > 0 || (isPlateLoaded(eq) && gym.increments[eq] !== undefined)}
              <div class="item step-note">
                <span class="grow caption" class:warn={fine > 0}>
                  {fine > 0 ? `Finer than your plates can make: weights go up ${fmtNum(fine, 2)} ${unitName} at a time.` : 'Your own step, not the plates\' smallest jump.'}
                </span>
                <button class="btn reset" onclick={() => updateGym(gym.id, (g) => { delete g.increments[eq]; })}>Reset to plates</button>
              </div>
            {/if}
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
        <Toggle label="Warm-Up Drills" checked={p.mobility.warmup} onchange={(v) => app.updateProfile((x) => { x.mobility.warmup = v; })} />
        <Toggle label="Cool-Down Stretches" checked={p.mobility.cooldown} onchange={(v) => app.updateProfile((x) => { x.mobility.cooldown = v; })} />
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

<style>
  /* A short number field at the end of a settings row. */
  .amount { width: 84px; min-height: 38px; padding: 7px 12px; text-align: right; flex: none; }
  /* A step finer than the plates make: the note below it says so and offers the plate-based default. */
  .step-note { gap: 10px; padding-top: 0; }
  .step-note .warn { color: var(--ember-2); }
  .step-note .reset { flex: none; min-height: 36px; padding: 6px 14px; font-size: 0.86rem; }
</style>
