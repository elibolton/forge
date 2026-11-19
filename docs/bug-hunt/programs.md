# Bug hunt: multi-week programs and progression

Area: web/src/engine/program.ts, programs.ts, progression.ts, web/src/lib/plans.ts, finishWorkout.ts, ProgramToday.svelte, FatigueCheckInSheet.svelte, Programs.svelte.
All repro tests were throwaway (zz_bh_program_*.test.ts) and have been deleted.

Most severe first.

---

## 1. "Jump to Week" to a week that's already done leaves the program stuck with no session
- Severity: crash-or-stuck
- Status: CONFIRMED (test)
- Where: web/src/screens/Programs.svelte:97 (`p.week = w; p.isFinished = false`), web/src/engine/program.ts:292-295, 302-316
- What happens: Jump to Week sets `week` but keeps `completed[w]`/`skipped[w]`. If every day of that week is already done, `nextDayID` returns undefined, `isFinished` stays false, and `advanceIfWeekDone` only runs on complete or skip. Today shows no hero and no Start button. "Skip This Day" does nothing because there's no next day. The only way out is to jump to another week.
- Should: jumping should either clear that week's completed/skipped lists, or advance right away when the week is already done.
- Repro: `p=newProgress(id,now,1)`; complete all 5 days of week 1 (week becomes 2). Then `p.week=1; p.isFinished=false` → `nextDayID(p)` is undefined; `skipDay(p,'push')` changes nothing.
- Fix: in the jump action, also run `p.completed[w]=[]; p.skipped[w]=[]` (as `deloadNow` does), or call a shared `advanceIfWeekDone` after changing `week`.

## 2. Doing only the warm-up mobility drills marks the program day complete
- Severity: data-loss (progress state wrong; the day is gone from the week)
- Status: CONFIRMED (test)
- Where: web/src/lib/finishWorkout.ts:59-60, web/src/lib/mobility.ts:28 (`newSet(null, 10)` gives `isWarmup:false`, reps 10)
- What happens: `addMobility` adds warm-up and cool-down drills as normal working sets. `completesProgramDay` accepts any exercise with a working set. Tick one drill, finish, and the program day counts as done and the week moves on, even though no program exercise was logged.
- Should: only sets on program slots (`slotID != null`) should count.
- Repro: build a SessionState with a program ref, one mobility exercise with its set done, and the bench slot with no sets done. `completesProgramDay(workoutLog(state,…))` returns true.
- Fix: `log.exercises.some(l => l.slotID && workingSets(l).length > 0)`.

## 3. A swapped exercise keeps the original slot's load step, effort, laterality and range extension
- Severity: wrong-advice
- Status: CONFIRMED (test)
- Where: web/src/lib/plans.ts:113-114 (swap replaces only `slot.exerciseID`), progression.ts:94 (`loaded` uses `slot.loadStep`), 150-151, plans.ts:136-152
- What happens:
  (a) Nordic curl (loadStep `bodyweight`, `eccentricOnly`) swapped to `prone-db-leg-curl`, which is the first alternative offered in the home gym: the suggestion has weight null and says "Lower as slowly as you can…", and RIR is never saved because the effort is eccentric. A loaded exercise never gets a load suggestion.
  (b) db-fly (dumbbell step, 2 kg) swapped to cable-fly (cable grid, 5 kg): after the top of the range at 20 kg the suggestion is "Top of the range on every set: +0 kg" at 20 kg, then reps reset to the bottom. That loops forever.
  (c) Per-leg slots swapped to bilateral exercises still log left and right sets with no warm-ups. Week overrides (Nordic week 1 2×3–5), notes, `rangeExtensions` and `setAdjustments` all carry over to the substitute.
- Should: a swap should take the load step, effort and laterality from the new exercise (equipment and isBodyweight), or at least recompute the step from it.
- Repro: `suggest({...rx('legs.3',3), slot:{...slot, exerciseID:'prone-db-leg-curl'}}, …)` gives `weight:null`. `suggest({...rx('push.3',3), slot:{…'cable-fly'}}, {history:[20kg×15,15 on push.3], gym: commercial})` gives `weight:20, "+0 kg"`.
- Fix: when a slot is swapped, derive `loadStep` from `loadEquipment(newExercise)` (bodyweight when isBodyweight), and use `rir` effort with bilateral laterality unless the new exercise matches.

## 4. Load step and rounding grid come from different equipment: "+0 kg" forever on native slots
- Severity: wrong-advice
- Status: CONFIRMED (test)
- Where: web/src/engine/progression.ts:34-41 (stepKg), 44-49 (roundFor), 151
- What happens: `stepKg` takes the step from the slot's LoadStep: barbell steps are fixed 2.5/5 kg and ignore the gym's barbell increment, and `weighted-dip` uses the *dumbbell* increment. `roundFor` rounds to the exercise's own load kind (barbell increment, `plates` for dip belt). When the step is under half the grid, `roundFor(last+step)` rounds back to `last`. Examples: weighted dip with dumbbell step set to 1 kg gives 10 kg → "+0 kg". Bench with barbell step set to 6 kg (reachable in Settings, 0.5 to 10) gives 80 kg → "+0 kg". The reps then reset to the bottom of the range every week.
- Should: the next load is always at least one loadable step above the last.
- Repro: `suggest(rx('upper.2',3), {history:[10kg×12,12], gym:{...commercial, increments:{dumbbell:1}}})` gives `weight 10, "+0 kg"`.
- Fix: compute the step from `loadEquipment(e)` (`gymIncrementKg`) or take `max(stepKg, gymIncrementKg(gym, loadEquipment(e)))`. If the rounded next load is ≤ last, add one grid step.

## 5. Week 1 calibration failure set blocks the load increase it was meant to set up
- Severity: wrong-advice
- Status: CONFIRMED (test)
- Where: web/src/engine/progression.ts:130-131
- What happens: week 1 tells you to take the last set of one isolation to true failure. A failure set is logged with rir 0 (session.svelte.ts:335/387). `allTop` requires every set's rir ≥ the last target RIR (2 in week 1), so the calibration exercise never counts as "top of range". Example: push.5 at 20 kg × 15,15,15 (last set to failure) gives week 2 "Add reps first: aim for 15+ on every set (last: 15, 15, 15)" at the same load. The advice contradicts itself and progression is delayed.
- Should: ignore RIR on `type:'failure'` sets, or on the slot's prescribed calibration or last-set-to-failure sets, when judging allTop. Lower RIR than the target means *harder* than planned, which shouldn't block progression anyway once reps hit the top.
- Repro: history with push.5 week 1, sets rir 2,2,0 (last `type:'failure'`), reps 15×3. Call `suggest(rx('push.5',2))`.
- Fix: `working.every(s => s.reps >= range.upper && (s.type === 'failure' || (s.rir ?? targetRIR) >= targetRIR))`. Also consider weeks with 0-RIR last-set notes (weeks 5–7 isolations, the skull crusher's "0 RIR on the last set"), which hit the same check.

## 6. Restarting a program: the deload session becomes "last time" and stall detection uses the previous run
- Severity: wrong-advice
- Status: CONFIRMED (test)
- Where: web/src/engine/progression.ts:63-71 (pastSessions has no startedAt or program-run filter and doesn't skip deload sessions for `last`), 164-166
- What happens: after "Start Again" (Programs.svelte:84), week 1 of the new run bases loads on the week 8 deload (squat 90 kg × 5,5 instead of 100 kg). It also suggests "No progress for 2 weeks: drop a set" in week 1 and week 2, because the stall check compares against weeks 5–7 of the old run. Week 1's deliberately higher RIR (fewer reps) also reads as "no progress".
- Should: `last` should skip deload sessions when a non-deload one exists. Stall detection should only use sessions from the current run (`date >= progress.startedAt`) and ideally the same week sequence.
- Repro: history squat w5,w6,w7 100×8×4 then w8 deload 90×5×2. Call `suggest(rx('legs.1',1), {progress:newProgress(...)})` → `weight 90`, `action dropSet`.
- Fix: in `pastSessions`, put non-deload sessions first for `last`. In the stall filter, add `record.date >= progress.startedAt`.

## 7. repsDropped (fatigue flag) uses data from an older run of the same program
- Severity: wrong-advice
- Status: CONFIRMED (test)
- Where: web/src/engine/progression.ts:176-183
- What happens: `byWeek` matches only programID and week number, and `out.set` keeps the *last* record it iterates. `app.records` is newest first (store.svelte.ts:208/231/375), so the oldest run's week-N log wins. After a restart, the check-in's "Reps dropped" flag reflects the old run. In the test, run 2 improved 6→8 reps but run 1 dropped 8→6, and the flag reports a drop. The same happens after jumping back to redo a week.
- Should: use only records since `progress.startedAt`, and keep the newest record per slot.
- Repro: records (newest first): run2 w2 80×8, run2 w1 80×6, run1 w2 80×6, run1 w1 80×8. `repsDropped(h,id,2)` returns `['push.1']`.
- Fix: pass `startedAt` and skip older records, or `if (!out.has(key)) out.set(...)` with newest-first input.

## 8. Bodyweight or eccentric slot at the top of its range is told to "drop a set"
- Severity: wrong-advice
- Status: CONFIRMED (test)
- Where: web/src/engine/progression.ts:136-141, 164-167
- What happens: for unloaded work at the top (Nordic 8,8,8 three weeks running) there's no action, so the stall rule fires: "Top of the range last time: lower even slower · No progress for 2 weeks: drop a set". Reps can't rise above the cap, so this happens every time someone holds the top. The same applies to a loaded exercise at the top when the user didn't take the suggested load.
- Should: no stall when the last session was already at the top of the range.
- Repro: three Nordic sessions of 0 kg × 8,8,8 on legs.3. `suggest(rx('legs.3',6))` → `action: dropSet`.
- Fix: skip the stall check when `allTop` is true.

## 9. Program suggestions ignore time away
- Severity: wrong-advice
- Status: CONFIRMED (test)
- Where: web/src/engine/progression.ts:63-71, 143-155
- What happens: the generator eases back in after 14 or more days (planner.ts:711-712, 751-755). The program `suggest` takes the last session at any age and adds load. Squat 140 × 8,8,8,8 logged 120 days ago gives "+5 kg → 145 kg" today.
- Should: past about 14 days, fall back to the decayed `estimatedOneRM` (as the first-session path does) or hold the load and say "easing back in".
- Repro: one legs.1 record 120 days ago at the top of the range. `suggest(rx('legs.1',4))` → 145.
- Fix: if `now - lastDate > 14*DAY_MS`, use the `!last` branch's estimatedOneRM path.

## 10. Same exercise in two slots of one workout: the second slot reads the first slot's sets
- Severity: wrong-advice
- Status: CONFIRMED (test)
- Where: web/src/engine/progression.ts:66 (`record.exercises.find` returns only the first match)
- What happens: you can swap a slot to an exercise already in the day. `alternatives(bb-calf-raise)` includes `seated-db-calf-raise`, which is lower.5. The swapped slot's own entry is never found, so `slotMatches` is false and it falls back to the other slot. lower.6 logged at 40 × 12, but the next suggestion is 20 kg with an extended range, taken from lower.5's 20 × 20.
- Should: look up the entry with the matching slotID first.
- Repro: one record with seated-db-calf-raise twice (slot lower.5 20×20, slot lower.6 40×12). Suggest for lower.6 swapped to the same exercise → weight 20.
- Fix: `record.exercises.find(x => x.exerciseID===id && x.slotID===p.slot.id && …) ?? record.exercises.find(x => x.exerciseID===id && …)`. Also exclude exercises already in the day from the swap picker.

## 11. The program's own home gym doesn't have the equipment for weighted dips
- Severity: cosmetic (spurious warning) / wrong-advice
- Status: CONFIRMED (test)
- Where: web/src/engine/programs.ts:96 (`weighted-dip`), models.ts Gyms.homeBarbell (no `dipBelt`), ProgramToday.svelte:224-226
- What happens: the program's described home gym (and the `homeBarbell` preset) has a dip station but no dip belt, so `gymHas` is false. Every Upper day shows "Home Gym doesn't list all the equipment" for slot upper.2. Its step is also the dumbbell increment while it rounds on the `plates` grid (see #4).
- Should: the program should fit the gym it's written for. Either add `dipBelt` to that preset, or use a dumbbell-between-the-feet / bodyweight-dip variant.
- Repro: `gymHas(Gyms.homeBarbell(), Catalog.exercise('weighted-dip'))` → false.
- Fix: add `dipBelt` to the preset, or set the slot's loadStep and equipment to match, e.g. `loadStep:'dumbbell'` with a dumbbell-held dip exercise.

## 12. Range extension and reset are written when the workout *starts*, even if it's discarded
- Severity: wrong-advice (minor)
- Status: SUSPECTED (code trace)
- Where: web/src/lib/plans.ts:130-132, ProgramToday.svelte:52-54
- What happens: `start()` saves `rangeExtensions` changes right away. If the workout is then discarded, the extension (or its removal) stays. After a discarded "resetRange" start, the next suggestion sees ext 0 with reps at the old extended top and proposes extendRange again, so the user is asked to extend a range they already completed.
- Should: apply extension changes when the program day is logged (in `completeProgramDay`) from the log's `repRange`.
- Fix: store the intended action in the session state and commit it in `completeProgramDay`.

## 13. Fatigue check-in for a week can be silently lost
- Severity: wrong-advice (minor)
- Status: CONFIRMED (test)
- Where: web/src/engine/program.ts:345-350
- What happens: only `week-1` is ever offered. If the whole next week is skipped, or the user doesn't answer before that week ends, week N's check-in, with its early-deload chance, is never shown. Test: complete week 1, then skip all of week 2. `checkInDue` returns undefined in week 3 and week 1 was never answered.
- Should: offer the most recent unanswered completed week, or let a skipped week carry the check-in over.
- Fix: search back from `week-1` for the newest week with completions and no check-in.

## 14. Week progress bar marks skipped weeks as done after an early deload
- Severity: cosmetic
- Status: CONFIRMED (code trace)
- Where: web/src/screens/ProgramToday.svelte:169 (`class:done={w + 1 < plan.session.week}`)
- What happens: "Deload Now" in week 2 jumps to week 8, and weeks 3–7 light up as done. Skipped days in the day strip also show the same green "done" dot (`isDone` includes skipped).
- Fix: compute done from `progress.completed[w]?.length`, and give skipped days a separate style.

## 15. Small-weight edge cases in progression
- Severity: cosmetic / wrong-advice (minor)
- Status: CONFIRMED (test) for (a); SUSPECTED for (b)
- Where: web/src/engine/progression.ts:127-129
- (a) If the last session was saved with weight 0 on a loaded exercise (weight never entered), the suggestion is "0 kg × 11". Nothing falls back to a starting guess.
- (b) If the last session had only drop sets, `straightSets` is empty (pastSessions filters with `workingSets`), so lastLoad is 0 and the reps target is the range bottom at 0 kg.
- Fix: when `lastLoad === 0` on a loaded exercise, use the first-session branch. In pastSessions, filter with `straightSets(x).length`.

## 16. Rest-day card follows the calendar, not where you are in the program
- Severity: cosmetic
- Status: SUSPECTED (design question)
- Where: web/src/screens/ProgramToday.svelte:41-42, program.ts:129-134
- What happens: days advance in order, not by date. A user who starts on a Thursday or falls behind is told "Rest day" on Thu and Sun even with Push still pending, and has to tap "Train anyway". `isRestDay` also uses `new Date()` inside `$derived`, so it doesn't update past midnight while the app is open.
- Fix: only show the rest card when the user has already trained on the previous scheduled slot, or drop it once the user is behind.
