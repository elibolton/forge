# Bug hunt: workout generator engine (planner / block / quality / templates / recovery / strength)

All repros were run as throwaway vitest files in web/src/engine (now deleted), importing from `./index`.
Shared helpers in the repros:
`now = 1_800_000_000_000; daysAgo = d => now - d*DAY_MS; sess(id, [[w, reps, rir?],...]) = { exerciseID: id, sets: [...{weight, reps, rir (default 2), isWarmup:false}] }`.

---

## 1. Unrated sets count as sets to failure, so strength main lifts drop and then stall even when every rep is hit
- Severity: wrong-advice (high: hits anyone who skips the optional RIR rating)
- CONFIRMED (simulation)
- strength.ts:5 (`reps + (rir ?? 0)`), planner.ts:732 (`(s.rir ?? 0) >= (last.targetRIR ?? 0)`)
- What happens: rating a set is optional in the logger (rir stays null). `oneRM` treats null RIR as 0, i.e. the set was taken to failure, although the planner prescribed RIR 2–3. The e1RM comes out low, so the next weight drops. The "hit every rep" check also treats null as 0 and never passes, so the progression bump never fires. recovery.ts:12 treats unrated as RIR 2, so the code isn't consistent with itself.
- Repro: simulate 20 PPL sessions, every 2 days, goal getStronger, Gyms.commercial(). Log exactly the generated sets with all reps hit. Push-day bench:
  - rir: 2 logged → 50x3, 45x5, 45x6, 52.5x3, 52.5x5, 55x6, deload 57.5x3 (progresses)
  - rir: null → 50x3, 42.5x5, 42.5x6, 45x3, 42.5x5, deload 37.5x6, next block 42.5x3 (goes backwards and never recovers)
  - Single step: history `[{date: daysAgo(3), exercises:[{...sess('bb-bench', [[80,5,null]x3]), targetReps:5, targetRIR:2}]}]` with `goal:'getStronger'` gives a bench of 72.5x5. The same history with rir 2 gives 80x5, "Hit every rep last time, adding weight".
- Fix: treat a missing RIR as the prescribed `targetRIR` (or 2, as recovery does) in oneRM/estimatedOneRM and in the hit check. Use 0 only for sets of type 'failure'.

## 2. Double progression reads the heaviest weight and the lowest rep count, even when they come from different sets
- Severity: wrong-advice (prescribes loads the user has never lifted for the reps)
- CONFIRMED
- planner.ts:757-758 (`lastLoad = max(weight)`, `minReps = min(reps)` over all straight sets)
- What happens: (a) A heavier top set followed by back-off sets, e.g. db-curl 20x3 (rir 0) + 14x12 x3, leads to the prescription **20 kg x 10 x3**, with the reason "Same weight: aim for 10 reps". The user only managed 3 reps at 20 kg. (b) A light back-off or failure set with few reps hides real progress: 14x15 x3 + 8x4 gives "Same weight: aim for 10 reps" at 14 kg. Without that set it would add weight.
- Repro: `new Planner({plan: defaultPlan(), gym: Gyms.commercial(), history:[{date: daysAgo(3), exercises:[sess('db-curl', [[20,3,0],[14,12],[14,12],[14,12]])]}]}).prescribe(Catalog.byID.get('db-curl')!, now)` returns 3 x 10 @ 20.
- Fix: take minReps only over the sets at lastLoad (or use the most common working weight). Judge "missed" against those same sets.

## 3. Generating is quadratic in history size: about 4.6 s with 2,000 workouts, and each swap or prescribe pays it again
- Severity: crash-or-stuck (UI freeze on the main thread)
- CONFIRMED (timing)
- planner.ts:686 and 796-803 (`wasDeload` calls `blockStatus(this.history, date)` for every past record of every prescribed exercise). block.ts:65-106 is O(n), plus `fallingLifts` filters at each week boundary.
- Measured: 100 records 16 ms; 300 records 62 ms; 600 records 192 ms; 2,000 records (8 exercises each) 4,641 ms for one `generate`. A single `prescribe('bb-bench')` takes 174 ms at 600 records. `app.planner()` builds a new Planner, which empties the cache, for every swap, template start, LogEditor and program day (store.svelte.ts:355).
- Repro: 2,000 records, `date: daysAgo(i*0.5+1)`, each with 8 exercises x 3 sets. Time `new Planner({...history}).generate({now, seed:1, focus:'push'})`.
- Fix: work out all block/deload boundaries in one pass over the sorted history (one `blockStatus` walk that records the deload intervals), then look dates up. Or memoize per history array.

## 4. Generated workouts can prescribe 0 kg for loaded dumbbell work, and stay at 0 forever
- Severity: wrong-advice
- CONFIRMED
- models.ts:218-222 (`roundLoad` with base 0 rounds small loads to 0), planner.ts:747/753, 750 (`weight > 0` filter means a logged 0 kg looks like a new exercise)
- What happens: when the dumbbell step is large (Settings allows up to 10 kg / 20 lb), light isolation loads round to 0. A beginner push day in a 20 lb dumbbell gym includes `leaning-db-lateral-raise 3x10 @0` and `db-rear-delt-fly 2x10 @0`. Once the user logs 0 kg, the next prescription says "New exercise: starting light" and gives 0 again.
- Repro: `makeGym('lb', ['dumbbell','flatBench','adjustableBench'], true, {dumbbell: 20})`, plan `{experience:'beginner'}`, `generate({now, seed:1, focus:'push'})`. Affected: db-rear-delt-fly, lateral-to-front-raise, leaning-db-lateral-raise, single-arm-tricep-ext, db-kickback, chest-supported-rear-raise, spider-curl. kg gym `{dumbbell:10}` with a beginner gives the same result.
- Fix: for loaded equipment, round to at least one increment (`Math.max(base + inc, …)` when base is 0). Treat logged 0-weight sets on a loaded exercise as "no data", not as "new exercise".

## 5. Barbell loads below the empty bar round up to the bar, as much as 70% heavier than intended
- Severity: wrong-advice
- CONFIRMED
- models.ts:221 (`Math.max(base, …)`), planner.ts:747/753
- What happens: beginner prescriptions in Gyms.commercial(): bb-front-raise wants 11.7 kg and gets 20; bb-drag-curl 13.4 → 20; wide-grip-bb-curl 15.1 → 20; bb-reverse-curl 11.7 → 20. Nothing tells the user it is heavier than planned, or to swap to EZ bar or dumbbells.
- Repro: `new Planner({plan: defaultPlan({experience:'beginner'}), gym: Gyms.commercial(), history:[]}).prescribe(Catalog.byID.get('bb-front-raise')!, now)` gives 20 kg x 10.
- Fix: when the computed load is under about 85% of the bar, add a reason ("empty bar is heavier than planned: lower reps or swap"). In generate(), skip those barbell picks for lighter alternatives.

## 6. Loaded exercises with no load-kind equipment never progress and get unrounded weights
- Severity: wrong-advice
- CONFIRMED
- planner.ts:806-811 (`progressionStep` returns 0), 813-817, 819-822 (`round` returns the raw value), 774-775 (reason says "adding weight")
- What happens: built-ins incline-svend-press (adjustableBench, 15), plate-front-raise (no equipment, 16), russian-twist (8), sissy-squat (squatRack, 20), and any custom "weight"-tracked exercise without barbell, dumbbell or similar equipment (CustomExerciseEditor gives them a starter 1RM > 0). New prescription: `incline-svend-press 3 x 10 @ 9.107142857142858`. After 10x15 x3 (top of range) the result is still 10 kg, with the reason "Hit the top of the range on every set, adding weight". A custom "Vest Push Up" (equipment [], starter 37) gets 24.19230769 kg.
- Repro: `p.prescribe(Catalog.byID.get('incline-svend-press')!, now)` with no history, then with history `sess('incline-svend-press', [[10,15],[10,15],[10,15]])`.
- Fix: give exercises with no load kind a fallback kind (e.g. 'plates', 2.5 kg / 5 lb) for step and rounding. Never say "adding weight" when step is 0.

## 7. A custom exercise's slot role comes from its movement pattern only, so a custom adductor "squat" became the main quad lift
- Severity: wrong-advice
- CONFIRMED
- quality.ts:298-320 (`inferred`: e.g. `case 'squat': role = 'squatMain'`, `case 'horizontalPush': role = 'pressFlat'`, ignoring the primary muscle)
- What happens: custom `{id:'custom-cossack', primary:['adductors'], pattern:'squat', equipment:['kettlebell'], starterOneRM:30}` in a kettlebell, barbell and flat bench gym. The legs day picks `custom-cossack 4x6@20` for the main quads slot, so quads get no direct work from the slot meant for them. A triceps-primary 'horizontalPush' custom can likewise fill the main chest slot (role pressFlat).
- Repro: `new Planner({plan: defaultPlan(), gym: makeGym('k',['kettlebell','barbell','flatBench']), history:[], catalog:[...Catalog.builtIn, cossack]}).generate({now, seed:1, focus:'legs'})`.
- Fix: in `inferred`, only give pattern roles when primary[0] matches the role's muscle (squatMain/unilateral → quads, pressFlat → chest, etc.). Otherwise fall back to the isolation mapping by muscle, or to 'other'.

## 8. Short sessions (15–20 min) run 20–60% over the time you set
- Severity: wrong-advice
- CONFIRMED
- planner.ts:383 (first 3 picks forced), 450, 471-479 (trimming stops at 2 working sets and never drops warm-ups or exercises)
- What happens, sessionMinutes 15, Gyms.commercial(), no history: upper/powerlifting 28 min, fullBody/getStronger 26, upper/buildMuscle 24, legs/powerlifting 23, pull/buildMuscle 20. At 20 min: upper 24–28, fullBody 24–28. Supersets on, 15 min: pull 20 min. `estimatedMinutes` reports the overrun and no note explains it.
- Repro: `new Planner({plan: defaultPlan({sessionMinutes:15, goal:'powerlifting'}), gym: Gyms.commercial(), history:[]}).generate({now, seed:1, focus:'upper'}).estimatedMinutes` returns 28.
- Fix: when still over budget, drop warm-ups on non-main lifts, then cut exercises down to 2 or sets down to 1. Or add a note ("the shortest useful session is about N min").

## 9. "Every muscle has all the sets that help" note shows when muscles got nothing for lack of equipment, and the workout can be empty or under 3 exercises
- Severity: wrong-advice
- CONFIRMED
- planner.ts:364 (a slot with no candidate is marked filled), 395/431 (blocked muscles count as done), 435, 450, 482-486
- What happens:
  - Gyms.bodyweight() pull day: `crunch, single-leg-calf-raise` (2 exercises, no back or biceps work) with the note "Every muscle today has all the sets that help, so this runs about 12 minutes instead of 60."
  - Bodyweight push day: push-up only, with no triceps or side delts, and the same note.
  - Every exercise excluded: `exercises: []`, estimatedMinutes 0, note "…runs about 0 minutes instead of 60."
  - Every joint injured, push day: face-pull + cable-crunch only (no push muscle), same note.
- Repro: `new Planner({plan: defaultPlan(), gym: Gyms.bodyweight(), history:[]}).generate({now, seed:1, focus:'pull'})`. For the empty case: `defaultPlan({preferences: Object.fromEntries(Catalog.all.map(e=>[e.id,'exclude']))})`.
- Fix: track muscles blocked because no eligible exercise exists, and write a note naming them ("No pull exercises fit this gym's equipment"). Don't claim completeness. Handle 0 exercises explicitly.

## 10. Breaking up a superset gives the leftover exercise the wrong rest (compound 60 s, or isolation inherits 120 s)
- Severity: wrong-advice (also skews estimatedMinutes)
- CONFIRMED
- planner.ts:191-197 (`unpair`: `Math.max(p.restSeconds, 60)` from the paired values, not the original rest)
- What happens: with supersets on and a 30 min legs session, `bb-rdl 4x6@55 r60` is a compound that should rest 120 s (it was the "A" side with 30 s). A 30 min push session has `machine-lateral-raise r120` (an isolation that inherited its compound partner's rest) and `overhead-tricep-ext r60` (should be 75). GeneratorToday.svelte's own unpairing sets scheme rest correctly, so the engine doesn't match the UI.
- Repro: `new Planner({plan: defaultPlan({supersets:true, sessionMinutes:30}), gym: Gyms.commercial(), history:[]}).generate({now, seed:1, focus:'legs'})`.
- Fix: in `unpair`, set `restSeconds = exercise.isCompound ? scheme.restCompound : scheme.restIsolation` (pass the scheme in, or keep the original rest on the object).

## 11. Future-dated records count toward this week's sets, focus rotation, bodyweight bests and "last done"
- Severity: wrong-advice (clock skew or imported or edited dates)
- CONFIRMED (weekly sets). The other effects are by code trace.
- planner.ts:526 (`now - record.date >= 7*DAY_MS` is false for negative ages), 554, 617, 711; strength.ts:40 (`bestReps` has no `< 0` guard). recovery.ts and estimatedOneRM correctly skip future records.
- Repro: history `[{date: now + 30*DAY_MS, exercises:[sess('bb-bench', 10 x [80,8])]}]`. `planner.weeklySets(now).chest` returns 10, so today's chest budget shrinks.
- Fix: filter `r.date <= now` once at the top of generate/prescribe (or in the constructor relative to the now passed in).

## 12. Beginner strength goals get up to 5 sets per exercise, overriding the beginner cap of 3
- Severity: wrong-advice (low)
- CONFIRMED
- planner.ts:100 vs 104 (the goal override runs after the beginner block)
- Repro: `makeScheme('getStronger','beginner').maxSetsPerExercise` is 5, while `makeScheme('buildMuscle','beginner')` is 3.
- Fix: `if (strength goal) s.maxSetsPerExercise = experience === 'beginner' ? 3 /*or 4*/ : 5;`

## 13. Loaded timed exercises stick at 0 kg once a 0 is logged
- Severity: wrong-advice (low)
- CONFIRMED
- planner.ts:702-704 (`lastWeight ?? …`: a 0 is not nullish)
- Repro: history `sess('db-glute-bridge', [[0,40],[0,40]])`. `prescribe(db-glute-bridge)` returns `{weight: 0, reps: 45}` every time.
- Fix: ignore weights <= 0 when picking lastWeight. Use `||` or filter `w > 0`.

## 14. Deload for small dumbbell loads doesn't reduce the weight
- Severity: wrong-advice (low)
- CONFIRMED
- planner.ts:762 (`round(lastLoad * 0.9)` rounds back up)
- Repro: db-lateral-raise 8 kg logged weekly for 5 weeks (`daysAgo(35..7)`). In the deload week `prescribe` returns 8 kg x 10 x 2. 7.2 rounds back to 8.
- Fix: in a deload, use `min(round(lastLoad*0.9), lastLoad - step)`, floored at the smallest load.

## 15. Strength-goal deload can prescribe the heaviest load of the block while saying "lighter"
- Severity: wrong-advice (low)
- SUSPECTED (seen in simulation; the intent may be RIR-only deloads)
- planner.ts:723-747 (the undulation wave keeps running in deload, so low-rep days give a higher load). Reason at line 696.
- Simulation (rated, getStronger): bench 52.5x3, 52.5x5, 55x6, then **deload 57.5x3** with "Deload: lighter and easier".
- Fix: in a deload, use the middle or light wave point and cap the load at about 90% of the last training load.

## 16. A non-integer or NaN seed (or NaN now) throws a RangeError from BigInt
- Severity: crash-or-stuck (low: today's callers pass integers)
- CONFIRMED
- planner.ts:115 (`BigInt(seed)`), 342
- Repro: `planner.generate({now, seed: 0.5})` throws "The number 0.5 cannot be converted to a BigInt". `seed: NaN` and `generate({now: NaN})` throw too. A corrupted saved `todayPlan.seed` would crash Today.
- Fix: `BigInt(Math.trunc(Number.isFinite(seed) ? seed : 0))`.

## 17. Absurd logged weights (Infinity, 1e9) flow straight into prescriptions
- Severity: wrong-advice (low; reachable through history import or bad edits)
- CONFIRMED
- planner.ts:750-757 (only `weight > 0` is checked)
- Repro: history with `sess('bb-bench', [[Infinity,5]])` and `sess('cable-fly', [[1e9,12]])`. generate gives `bb-bench 4x6@Infinity`, `db-incline-bench @Infinity` (via startingOneRM scaling), and `cable-fly 3x13@1000000000`.
- Fix: ignore non-finite weights (and maybe anything over 1000 kg) in straightSets/estimatedOneRM consumers.

## 18. Double progression keeps an unrounded last load (e.g. after switching between kg and lb gyms)
- Severity: wrong-advice (low)
- SUSPECTED (code trace; the display effect wasn't checked)
- planner.ts:770 and 778 (`weight = lastLoad`, not passed through `this.round`)
- What happens: a load logged at 60 kg, then trained in a pounds gym, is prescribed as 60 kg (132.3 lb), which can't be loaded with 5 lb steps.
- Fix: `weight = this.round(lastLoad, e)`.

## 19. Block week boundaries drift by an hour across DST
- Severity: cosmetic
- CONFIRMED (TZ=America/New_York)
- block.ts:34-38 and 104 (`start` is local midnight, but weeks are added as fixed 7*DAY_MS)
- Repro: block start 2027-02-08 12:00 local, weekly records to day 28. `blockStatus(h, new Date(2027,2,15,0,30))` (the first day of week 6) returns `week 5, isDeload false`. DST started on 3/14.
- Fix: compute week index from calendar days (`dayNumber(t) - dayNumber(start)`), not raw ms.

## 20. Fresh Muscles split trains muscles that are nowhere near recovered, with no note
- Severity: wrong-advice (low)
- SUSPECTED (behavior confirmed; whether it's intended is a design question)
- planner.ts:564-567 (top 2 groups by average, with no threshold), 334-336 (the base is only halved)
- Repro: every major muscle hammered 5 h ago (recovery about 0.03 for all groups). `split:'freshMuscles'` still plans bb-bench, db-incline, lat-pulldown, machine-row at 4 sets each, with no note.
- Fix: when no group is ≥ 0.5 recovered, suggest rest or mobility, or add a note.

## 21. Logging 0 kg on a loaded exercise reads as "New exercise" next time
- Severity: cosmetic
- CONFIRMED
- planner.ts:750-755 (`weight > 0` filter, then `known === undefined` → "New exercise: starting light")
- Repro: history `sess('db-rear-delt-fly', [[0,15]x3])` gives the reason "New exercise: starting light, adjust to feel".
- Fix: say "No weight logged last time" when there are past sessions but no loaded sets.

---
Checked and found OK: determinism with the same seed; the block guard loop; records all on one day; records exactly 14 days apart (no new block, as the spec says); future-only history; NaN dates in blockStatus; unknown exercise ids; reps 0 and NaN weights (filtered); the AMRAP / deload exclusion; supersets never leave a lonely group letter; Fresh Muscles rotation over time; `differentFrom` pointing at an unfilled slot (the constraint is just skipped, which is fine).
