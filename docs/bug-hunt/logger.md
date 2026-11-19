# Bug hunt: live workout session and finishing it

Paths are relative to `web/src/`. "Test" means a throwaway vitest repro, since deleted, that used the setup patterns from session.test.ts.

## Data loss

### 1. Undoing "Removed X" also wipes out sets logged since the removal
- Severity: data-loss. **CONFIRMED** (test)
- Where: lib/session.svelte.ts:251, 258 (`removeExercise`)
- What happens: the undo snapshots the whole `exercises` array when you remove an exercise and puts it all back. A set you log on another exercise during the 7 s undo window goes back to not done. Any edits, drop sets or swaps made in that window are lost too. If you remove A and then B, undoing A brings B back as well.
- Should: undo should only put the removed exercise back, at its old index.
- Repro: start with exercises a and b. `removeExercise('a')` returns undo. `logSet(b.sets[0])`, then `undo()`. b's set 1 now has `done === false`.
- Fix: capture `{removed, index}` only, and splice that one exercise back in (then run `normalizeGroups`).

### 2. Two tabs or windows overwrite each other's workout
- Severity: data-loss. **SUSPECTED** (code trace)
- Where: lib/session.svelte.ts:183-188 (`persist`). There is no BroadcastChannel, storage listener or lock anywhere in src.
- What happens: each tab keeps its own `state` and writes the whole session to IndexedDB on every change, so the last write wins. If you finish in tab A, tab B still shows the workout. Its next tap re-persists it, so the workout comes back on reload. Finishing in B saves a second, duplicate log.
- Should: there should be a single writer, or later tabs should pick up changes.
- Repro: open the app in two tabs mid-workout. Log a set in A. Log a different set in B, then reload: A's set is gone. Or finish in A, tap anything in B, then reload: the workout is open again.
- Fix: add a BroadcastChannel ('session') that reloads state on change, or a `navigator.locks` / `updatedAt` check before writing.

### 3. Undoing "Workout discarded" overwrites a workout started since then
- Severity: data-loss. **SUSPECTED** (code trace)
- Where: screens/ActiveWorkout.svelte:70, components/StaleWorkoutSheet.svelte:38, lib/session.svelte.ts:230 (`restore` calls `begin` unconditionally)
- What happens: the undo toast stays for 7 s. If you start another workout in that window and then tap Undo, `restore` replaces the new workout without asking.
- Should: Undo should do nothing, or ask, when a different session is active.
- Repro: discard, start an empty workout, add an exercise, then tap Undo on the toast.
- Fix: in `restore`, bail out if `this.state` is non-null and its `startedAt` differs from the snapshot's.

### 4. A crash between saving the log and deleting the session can save the workout twice
- Severity: data-loss (duplicate history). **SUSPECTED** (code trace)
- Where: lib/session.svelte.ts:479-486
- What happens: `finish()` awaits `addLog`, then `discard()` queues `db.del('session')` without awaiting it. If the app is killed, or iOS reaps the PWA, in that gap, the next launch restores the session. Finishing again then saves a second log with a new uuid.
- Should: finishing should be idempotent.
- Repro: hard to hit by hand. Stub `db.del` to never resolve, then reload.
- Fix: store the log id in the session before saving (`state.savedLogID`) and reuse it, so a retry overwrites instead of duplicating. Or delete the session in the same transaction as the log.

## Crash or stuck

### 5. The Finish summary crashes when one exercise appears twice and both copies set a PR
- Severity: crash-or-stuck. **CONFIRMED** (test plus Svelte source)
- Where: components/FinishSummary.svelte:22 (`{#each records as r (r.exercise.id)}`), lib/finishWorkout.ts:47-55, screens/ActiveWorkout.svelte:285 (the Add picker doesn't exclude exercises already in the workout)
- What happens: `newRecords` gives one record per logged exercise. With bench added twice, both beating the previous best, it returns two records with id `bb-bench` (test T7). Svelte throws `each_key_duplicate` on a keyed each block in production too (node_modules/svelte/.../errors.js:136-147). The log has already been saved, but the summary sheet errors out and the UI can break until reload. The live PR toast also fires once per copy.
- Should: one record per exercise, showing the best one.
- Repro: start a workout, add Barbell Bench Press twice (it needs history), log a heavier set on each, then finish.
- Fix: in `newRecords`, merge by exerciseID (max e1RM) before comparing. Key FinishSummary by index or exerciseID after the merge.

### 6. "Swap" does nothing on an exercise whose working sets are all done, but says it worked
- Severity: crash-or-stuck (the action silently fails). **CONFIRMED** (test T3)
- Where: lib/swap.ts:41-47 (there is no branch for `done.length && !pending.length`), screens/ActiveWorkout.svelte:281 (the toast "Swapped in X" always shows)
- What happens: if every working set is done, the state doesn't change, but the toast claims the swap happened.
- Should: either insert the replacement after it with fresh sets, or hide or disable swap for completed exercises.
- Repro: log every set of an exercise, open ⋯ and choose "Swap this exercise", then pick any exercise. Nothing changes.
- Fix: in swap.ts, when `done.length && !pending.length`, splice in `next` (with its planned sets) after `i`. Or have `swapExercise` return a boolean and only show the toast on success.

### 7. Swapping a program-day exercise mid-superset aliases its `program` object, and "unlink" then stops working
- Severity: crash-or-stuck (you can't ungroup). **CONFIRMED** (test T10)
- Where: lib/swap.ts:29 (`next = { ...old, ... }` is a shallow copy, so `program` is shared)
- What happens: the old exercise, which keeps its done sets, and the replacement share one `program` object. `structuredClone` in `update()` and IndexedDB both keep that aliasing, so it lasts. Program days store the group only in `program.supersetGroup`. As a result `setGroup()` on one exercise also regroups the other, and "Unlink" between them does nothing: in the test all three exercises stayed in group 'A'.
- Should: each exercise should own its `program` info.
- Repro: start a program day with a superset (A+B), log one set of A, swap A for another exercise, open "Reorder & group", then unlink the old A from the new one. They stay linked.
- Fix: `next = { ...old, program: old.program && structuredClone(old.program), ... }`.

## Wrong advice

### 8. Rep typos are never flagged, so they inflate e1RM and PRs
- Severity: wrong-advice. **CONFIRMED** (test T8)
- Where: lib/setCheck.ts:16-25
- What happens: `checkSet(100, 80, 100)` and `checkSet(100, 800, 100)` both return null. Typing 80 instead of 8 at your usual weight caps Epley at 15 reps, giving e1RM = 1.5 × weight versus about 1.27 × for 8 reps. That is roughly an 18% false PR, which then feeds progression.
- Should: reps far above the target or history should get the "check" sheet, as weight does.
- Repro: on bench (best around 100×8), set reps to 80 and log. No warning, and a "New PR" toast appears.
- Fix: also flag `reps > max(2 × targetReps, 30)` for non-timed exercises (pass in targetReps or the most reps in history).

### 9. A set taken to failure and then made straight again keeps RIR 0
- Severity: wrong-advice. **CONFIRMED** (test T9)
- Where: lib/session.svelte.ts:334-335 (`setType`); the same pattern is in components/LogEditor.svelte:109
- What happens: marking failure sets `rir = 0`, and logging a failure set sets 0 too. Reverting to straight deletes `type` but keeps `rir: 0`. The set is saved as "0 left / to failure", and since a straight set is rated as normal, the user is never asked again.
- Should: reverting should clear the RIR that failure set, so the rating prompt can come back.
- Repro: set 1 → "Mark as taken to failure", log it, then "Make it a straight set". The set still shows "to failure" (RIR 0).
- Fix: in `setType`, if the old type was 'failure' and the new one isn't, set `rir = null` (only when it is 0).

### 10. Per-side with a drop set: rating the right side rates the drop, not the left set
- Severity: wrong-advice. **CONFIRMED** (test B1)
- Where: lib/session.svelte.ts:303-304 (`rateSet` uses `e.sets[i - 1]`)
- What happens: with sets L, drop(L), R, rating R copies the value onto the drop set (index i-1, side left). The left straight set stays unrated, and progression loses that set's RIR.
- Should: copy to the left straight set of the same round.
- Repro: on a per-arm program exercise, open ⋯ on L1 → "Add a drop set after it". Log L1, the drop, then R1, and pick RIR 2. Result: L1.rir is undefined and the drop's rir is 2.
- Fix: search backwards for the nearest set with `side === 'left' && type !== 'drop' && !isWarmup`.

### 11. Timed loaded holds (farmer's carry, DB glute bridge) get "est. 1RM" PRs from seconds
- Severity: wrong-advice. **CONFIRMED** (test B2)
- Where: lib/finishWorkout.ts:50, lib/records.ts:29, 50, 77, lib/store.svelte.ts:158-161
- What happens: for `isTimed` exercises, `reps` holds seconds. 40 kg × 60 s gives an "e1RM" of 60 kg, so a longer carry shows up as a "New PR · est. 1RM 60 kg" in the toast and summary, and in the PR timeline.
- Should: timed exercises should have no e1RM records, or a separate "longest hold" record.
- Repro: log Dumbbell Farmer's Carry 40 kg × 30 s once and finish. Next time log 40 kg × 60 s: you get a PR toast with est. 1RM.
- Fix: skip `Catalog.exercise(id).isTimed` in newRecords, liveRecords, prTimeline and the bestOneRM derivation.

### 12. "I did them, log as planned" saves placeholder sets (null weight → 0 kg, 0 reps, extra drop sets)
- Severity: wrong-advice. **CONFIRMED** (test T13)
- Where: lib/session.svelte.ts:427-429, lib/finishWorkout.ts:19
- What happens: it marks every non-warm-up set done without the checks that the Log button runs (`checkSet`). Several kinds of set end up in history as real work: a weighted exercise with `weight: null` (one swapped in with no prescription) is saved as 0 kg; a 0-rep set is saved as done; a drop set the user added but skipped is saved too.
- Should: only fill in sets that have usable numbers, or warn about them.
- Repro: add a set and set its reps to 0, or add a drop set and don't log it. Finish and choose "I did them, log as planned". The log contains `{weight:0, reps:0}` or the unlogged drop.
- Fix: in `logRemainingAsPlanned`, skip sets with `reps <= 0` and `type === 'drop'`.

### 13. A workout left open overnight while the screen stays on gets saved with a 10+ hour duration
- Severity: wrong-advice (bad duration and recovery timing). **SUSPECTED** (code trace)
- Where: lib/session.svelte.ts:148, 536-542 (`checkStale` only runs on load and on visibilitychange→visible), screens/ActiveWorkout.svelte:116 (`finish()` with `Date.now()`), components/StaleWorkoutSheet.svelte:42 (dismissing by backdrop calls `keepGoing`, which resets `updatedAt`)
- What happens: the wake lock keeps the page visible, so the stale check never runs while the logger stays open. Finish then uses now, giving `durationSeconds` in the tens of thousands. Dismissing the "Still training?" sheet by backdrop also treats the workout as active again. Separately, `goTo` (swiping between exercises) bumps `updatedAt`, so just looking around delays stale detection and moves the "Ended at" time later.
- Should: run the stale check on an interval as well, have the Finish review offer "ended at last set", and not count navigation as activity.
- Repro: in a test, call `startPrepared` with `updatedAt = now - 5h` and never fire visibilitychange. `staleSince` stays null, and `finish()` saves a duration of 5h or more.
- Fix: call `checkStale()` from the 1 s tick in ActiveWorkout or MiniBar. In the review, default `endedAt` to the last done set's time when it is more than STALE_AFTER ago. Don't touch `updatedAt` in `goTo`.

## Cosmetic / UX

### 14. Removing an exercise above the current one jumps you to a different exercise
- Severity: cosmetic. **CONFIRMED** (test T1)
- Where: lib/session.svelte.ts:255
- What happens: `currentIndex` is only clamped, never shifted. If you are on exercise 2 and remove exercise 1, you end up looking at exercise 3.
- Should: you should stay on the same exercise.
- Repro: three exercises, `goTo(1)`, `removeExercise(first)`. The current exercise is now 'c'.
- Fix: `if (removedIndex < s.currentIndex) s.currentIndex--` before clamping.

### 15. Moving an exercise past a superset breaks the superset
- Severity: cosmetic (it also silently raises rest to at least 60 s). **CONFIRMED** (test T6)
- Where: lib/session.svelte.ts:262-270, lib/groups.ts:76
- What happens: with [A+B superset, C], moving C up gives [A, C, B]. `normalizeGroups` ungroups both A and B, so the superset is gone. A single exercise can't hop over a group.
- Should: moving next to a group should jump past the whole group.
- Repro: in "Reorder & group", tap the up arrow on the exercise just below a superset.
- Fix: in `moveExercise`, if the neighbour is in a group the mover isn't part of, swap with the whole run of that group.

### 16. Swapping one half of a superset after logging sets turns it into a "Tri-set"
- Severity: cosmetic. **CONFIRMED** (test T4)
- Where: lib/swap.ts:29, 33, 44-45
- What happens: the old exercise, which keeps its done sets, stays in the group and the replacement joins it. The group now has 3 members and is labelled "Tri-set", the strip shows 3 joined segments, and the end-of-round rest takes the maximum including the old exercise.
- Should: the old (finished) exercise should leave the group, or should stay but not be counted.
- Repro: superset A+B, log one set of each, then swap A. The header shows "TRI-SET · 1 of 3".
- Fix: in the split case, `setGroup(old, undefined)` before inserting `next`, or have groupKind count only members with sets left.

### 17. Swapping after only warm-ups are done leaves a warm-up-only "ghost" exercise, and the replacement gets no warm-ups
- Severity: cosmetic (and a warm-up-only exercise in history). **CONFIRMED** (test T5)
- Where: lib/swap.ts:15-16, 24-26, 41-46
- What happens: `done` includes done warm-ups, so the swap takes the split path. The old exercise keeps only its warm-ups: it is never "complete", has no Log/Next dock, and is saved as a logged exercise with no working sets. The replacement also skips its own warm-ups because `done.length > 0`.
- Should: if no working set is done, replace the exercise outright with fresh warm-ups.
- Repro: tick a warm-up, then swap the exercise.
- Fix: in swap.ts, base the split on `old.sets.filter(s => s.done && !s.isWarmup)`.

### 18. Deleting the set a drop set belongs to leaves an orphan drop
- Severity: cosmetic. **CONFIRMED** (test T11)
- Where: lib/session.svelte.ts:353-355 (`removeSet`), and `parentOf` at :31
- What happens: the drop set stays with `type: 'drop'`. If it was hanging off set 1 it has no parent: it is labelled "Set 1 · drop", is never rated after logging, and is saved as a drop with no parent. Off a later set, it silently attaches to the previous set.
- Should: delete the drop sets along with their parent, or turn the first one into a straight set.
- Repro: add a drop after set 1, then delete set 1.
- Fix: in `removeSet`, also remove the drop sets that directly follow the removed straight set.

### 19. An old rest timer keeps counting when the new rest is 0 or a per-side set has no side rest
- Severity: cosmetic. **CONFIRMED** (test T12)
- Where: lib/session.svelte.ts:423 (`if (restFor) this.startRest(restFor)`)
- What happens: with a superset `supersetRestBetween: 0`, `restSeconds: 0`, or the left side of a per-side set with no `sideRest`, the previous countdown stays on screen and chimes during the next set.
- Should: logging a set with no rest should stop the current rest.
- Repro: an exercise with `restSeconds: 0`, `startRest(90)`, then `logSet`. `restEndsAt` doesn't change.
- Fix: `if (restFor) this.startRest(restFor); else if (!wasDone) this.skipRest();`

### 20. MiniBar and superset rounds count per-side L and R as separate sets
- Severity: cosmetic. **CONFIRMED** (code trace)
- Where: components/MiniBar.svelte:18-20, screens/ActiveWorkout.svelte:177-182
- What happens: `numberedSets` includes both sides. For 3 per-arm sets, MiniBar shows "Set 4 of 6" while the logger shows "Set 2 / 3", and a per-side exercise in a group shows "round x/6". With 0 working sets, MiniBar shows "Set 0 of 0".
- Should: divide by 2 for per-side work, as ExercisePage's `roundCount` does, and hide the count when there are no sets.
- Fix: reuse `isPerSide(program.laterality) ? ceil(n/2)` in both places.

### 21. Double-tapping Save briefly shows "Your workout wasn't saved"
- Severity: cosmetic. **SUSPECTED** (code trace)
- Where: lib/session.svelte.ts:473 (it returns `null` while `saving`), screens/ActiveWorkout.svelte:116-117
- What happens: `null` means both "already saving" and "failed", so a second tap before the button disables sets `saveFailed = true` and shows the red failure card.
- Fix: return a distinct value (for example `undefined`) for "busy", and ignore it in `save()`.

### 22. The rest chime doesn't sound after a reload, and is late when the app was in the background
- Severity: cosmetic. **SUSPECTED** (code trace)
- Where: lib/session.svelte.ts:173-176, 500-511
- What happens: after `load()` restores a running rest, `this.audio` is null until the next tap, so the chime is silent (iOS has no vibrate either). While backgrounded, iOS freezes `setTimeout`, so the chime fires when you come back, possibly minutes late.
- Should: skip the chime when it is more than a few seconds late, and unlock audio on the first tap after a reload.
- Fix: in `chime()`, return early if `Date.now() - restEndsAt > 3000`.

### 23. A template with 0 sets, or a deleted custom exercise, starts a broken exercise
- Severity: cosmetic. **CONFIRMED** (test B3; whether templates can actually hold 0 sets is unverified)
- Where: lib/templateStart.ts:11-19
- What happens: `sets: 0` gives an exercise with only warm-ups, the same ghost as #17. A deleted custom exercise starts as a placeholder name with prescribed sets, and logging it saves history under a dead id.
- Fix: skip items with `sets < 1` or with `!Catalog.byID.has(id)`, and tell the user what was skipped.
