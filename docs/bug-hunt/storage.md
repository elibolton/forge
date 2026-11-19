# Forge bug hunt: persistence and data integrity

Paths are relative to `web/src/`. Each "CONFIRMED" finding was reproduced in a throwaway vitest file (now deleted) or traced exactly through the code. The vitest run used a UTC-5 timezone.

---

## 1. Restoring a backup that has no `logs` section (or a bad one) silently deletes every workout
- **Severity:** data-loss
- **Status:** CONFIRMED (test)
- **Where:** lib/store.svelte.ts:443 (`this.restoreLogs(lossy(data.logs, readLog))`), plus db.ts:57 (`replace` clears the store)
- **What happens:** `restore` needs only `app: 'forge'` and a profile object. If `logs` is missing, `null`, an object, or written by a newer version with a different shape, `lossy()` returns `[]`. `restoreLogs([])` then clears the logs store. The toast says "Restored 0 workouts" after the wipe has already happened. The same applies to `activities`/`bodyweights`/`templates` when they are missing both at the top level and inside the profile. A newer-version backup (`version: 99`) is also accepted with no warning.
- **What should happen:** Refuse, or at least warn, when a section is missing or unreadable, or when the backup's `version` is newer than this app understands. Never replace a non-empty store with nothing unless the user confirms.
- **Repro:** Log a few workouts. Restore `{"app":"forge","version":2,"profile":{"usesPounds":true}}`. Memory and the DB both show 0 logs (the test went from 3 to 0).
- **Fix:** Before calling `restore`, check that `Array.isArray(data.logs)` and `data.version <= 2`. Show the counts (backup vs device) in the confirm dialog.

## 2. Retrying a failed batch write brings back deleted workouts and overwrites newer edits
- **Severity:** data-loss
- **Status:** CONFIRMED (test)
- **Where:** lib/store.svelte.ts:384 (key `log:${ids.join(',')}`), lib/saving.svelte.ts:41-45
- **What happens:** `addLogs` saves a failed write under one combined key such as `log:X,Y`. A later `deleteLog('X')` or `updateLog(X)` uses the key `log:X`, so it doesn't replace the pending failed write. When `saving.retry()` runs (the banner's Retry), it puts the old X back. Result: deleted workouts reappear in IndexedDB after the next reload, and an edited workout reverts to its old version. Saving a finished workout is also a batch of one, but CSV import (`importNow`) writes everything as one batch.
- **Repro:** Make `db.putLogs` reject once. Run `addLogs([X, Y])`, then `deleteLog('X')`, then `saving.retry()`. Memory has `['Y']`; the DB has `['X','Y']`.
- **Fix:** Save failures under per-record keys (one `saving.run` per id), or have `deleteLog`/`updateLog` remove that id from any pending batch.

## 3. A legacy log migration interrupted midway duplicates workouts
- **Severity:** data-loss (integrity: doubled history, volume, PRs and recovery load)
- **Status:** CONFIRMED (test)
- **Where:** lib/store.svelte.ts:197-201
- **What happens:** `putLogs(moved)` and `del('logs')` are separate transactions. If the app is closed or the second write fails, the next load reads the logs both from the store and from the legacy key, and builds `[...stored, ...moved]` without removing duplicates. Memory then holds the same id twice. If any legacy log had no `id`, `readLog` gives it a new `uuid()` on every load, so each interrupted attempt also adds a permanent duplicate to the store.
- **Repro:** Put `L1` in the logs store and also `kv['logs'] = [L1]`, then call `app.load()`. `app.logs` ids are `['L1','L1']`.
- **Fix:** Do the move in one transaction (like `moveIntoCollections`), and remove duplicates by id when merging.

## 4. The database upgrade hangs forever when another tab still has the older version open (stuck loading screen)
- **Severity:** crash-or-stuck
- **Status:** CONFIRMED (test with fake-indexeddb, plus git history)
- **Where:** lib/db.ts:17-30 (no `req.onblocked`). The previous db.ts (commit bbab108) had no `onversionchange` handler.
- **What happens:** If an older Forge (DB version 2) is still open in another tab or a suspended Home Screen instance, `indexedDB.open('forge', 3)` is blocked. Nothing handles `onblocked`, so `app.load()` never resolves, `ready` never becomes true and the app sits on its splash screen. Every future version bump has the same risk. The test opened a v2 connection and left it open; the v3 open was still pending after 500 ms with no success or error.
- **Fix:** Add `req.onblocked`, which sets a "Close other Forge tabs" message or rejects into `loadError`, with a timeout.

## 5. Two tabs or instances overwrite each other's profile and settings (last write wins, no sync)
- **Severity:** data-loss
- **Status:** CONFIRMED (code trace)
- **Where:** lib/store.svelte.ts:271-276 (writes the whole profile), :412-418 (writes the whole kv). There is no BroadcastChannel, storage event or re-read on `visibilitychange` anywhere in src.
- **What happens:** Each tab loads once and keeps its own copy in memory. Suppose tab B completes a program day (programProgress), adds a custom exercise or a gym. Then tab A (opened earlier, for example a Safari tab next to the Home Screen app) changes any setting. Tab A writes its stale whole profile and erases B's changes. kv works the same way (todayPlan, programDayEdits).
- **Repro:** Open Forge in two tabs. In tab 1 add a custom exercise. In tab 2 toggle "Warm-Up Sets". Reload: the custom exercise is gone.
- **Fix:** Send a BroadcastChannel "changed" message after each write and reload state in other tabs, or re-read the profile before `updateProfile` writes.

## 6. CSV import: assisted exercises are imported as added weight
- **Severity:** wrong-advice
- **Status:** CONFIRMED (test)
- **Where:** engine/historyImport.ts:67-68, 152-178
- **What happens:** "Pull Up (Assisted)", "Assisted Dip" and "Chin Up (Assisted)" fuzzy-match the plain `pull-up`/`dip`/`chin-up`, and the assistance weight is stored as a positive load. For example, 40 lb of assistance becomes an 18.1 kg weighted pull-up. That inflates e1RM and PRs and gives badly wrong suggestions. A negative weight, as some apps export, is stored as negative kg.
- **Fix:** Treat names containing "assist" as unmatched (or map them to an assisted variant), and never import a negative weight as a load.

## 7. CSV import: European files with decimal commas import every weight as 0
- **Severity:** wrong-advice (imported history looks like bodyweight work)
- **Status:** CONFIRMED (test)
- **Where:** engine/historyImport.ts:64 (`Number(s)`)
- **What happens:** A semicolon-separated file (which `parseCSV` detects) with `62,5` gives `Number('62,5')` = NaN, which becomes weight 0, with no warning. Both quoted and unquoted values fail.
- **Repro:** `parseHistory('Date;Exercise;Reps;Weight(kg)\n2024-01-15;Bench Press (Barbell);5;62,5\n', false)` gives weight 0.
- **Fix:** When the separator is `;`, replace `,` with `.` in numeric fields. Also count rows whose weight couldn't be parsed and show that count.

## 8. CSV import: invalid or DD/MM dates roll over silently into wrong (even future) dates
- **Severity:** wrong-advice
- **Status:** CONFIRMED (test)
- **Where:** engine/historyImport.ts:239, 246-247
- **What happens:** `new Date(y, m, d)` normalizes out-of-range values instead of rejecting them:
  - `25/12/2024` (a UK/EU date) becomes 2026-01-12, a date in the future.
  - `99/99/2024` becomes 2032.
  - `2024-02-30` becomes 1 March.
  - Other UK dates such as `05/01/2024` are silently read as 1 May.
  - Future-dated workouts then sort to the top and confuse "last trained", recovery and `isTodayPlanCurrent`.
- **Fix:** Check that the built Date's year, month and day match the input. When the first number is over 12, read the date as DD/MM. Reject dates in the future.

## 9. CSV import freezes the UI for seconds on real-size files, and again on every Fix or unit toggle
- **Severity:** crash-or-stuck
- **Status:** CONFIRMED (test: 30,000 rows / 1.4 MB took 4.6 s on a desktop Mac; a phone will be several times slower)
- **Where:** engine/historyImport.ts:61 and 152-178. `match()` rebuilds `byID` and re-tokenizes the whole catalog for every row. screens/Data.svelte:37 parses again on each manual match and each kg/lb toggle.
- **Fix:** Store the match result for each raw name (and the catalog tokens) once per parse, so each distinct name is matched only once.

## 10. Exercises skipped in a CSV import can never be added later, and same-day workouts are dropped
- **Severity:** data-loss (imported history is incomplete with no way to recover it)
- **Status:** CONFIRMED (code trace)
- **Where:** screens/Data.svelte:29-32 (dedupe by `dayKey` only), :134 (Fix menu hidden after import)
- **What happens:**
  - After an import, the "Not recognized" Fix menu disappears.
  - Re-picking the file and matching the names leaves every day "Already logged", so those sets are skipped for good.
  - Any Forge-logged workout on the same calendar day also blocks the whole imported day, for example when switching apps mid-day or logging two sessions in one day.
- **Fix:** Merge imported exercises into an existing imported log for that day (remove duplicates by exercise and set), or mark imported logs (`source: 'csv'`) and dedupe against those only.

## 11. Deleting a custom exercise that is used in a saved workout, a program swap or the active workout leaves a fake "bodyweight" placeholder
- **Severity:** wrong-advice
- **Status:** CONFIRMED (code trace plus test of the placeholder)
- **Where:** lib/customExercises.ts:32-46 (checks only `derivedHistory`), engine/catalog.ts:39-44, lib/templateStart.ts:12
- **What happens:** Only logged history protects a custom exercise from deletion. Templates, `programDayEdits.swaps` and the in-progress session keep the id. `Catalog.exercise(id)` then returns a placeholder with:
  - the name "Custom Landmine Press A1b2c3"
  - no equipment (allowed at every gym)
  - `starterOneRM: 0`, so it counts as bodyweight
  - no muscles
  
  Starting the template shows this, and finishing the active workout logs sets under an exercise that no longer exists.
- **Fix:** Before deleting, also count uses in `app.templates`, `programDayEdits` and `session.state`. Hide the exercise instead of deleting it when it is in use.

## 12. Gym "Weight Steps" can't edit EZ bar, trap bar, Smith machine, leg press, leg curl, leg extension, chest press or shoulder press steps; the "Barbell" row only looks like it covers EZ and trap bars
- **Severity:** wrong-advice (suggested weights you can't load, with no way to fix them)
- **Status:** CONFIRMED (code trace)
- **Where:** screens/Settings.svelte:33-46 against engine/models.ts:61-64 and 134-140
- **What happens:** These are separate entries in `LOAD_KINDS` and `gymIncrement` reads `g.increments[kind]`:
  - `ezBar`, `trapBar`, `smithMachine`, `legPress`, `legCurl`, `legExtension`, `chestPressMachine`, `shoulderPressMachine`.
  - `loadKinds()` never lists any of them. A gym with only an EZ or trap bar shows a "Barbell" row, but it writes `increments.barbell`, which those exercises never read.
  
  A separate problem: in kg the step changes by 0.5, so going down from 2.5 gives 2.0, 1.5, 1.0. The common 1.25 kg microplate step can't be reached.
- **Fix:** Build the list from `LOAD_ORDER` for the gym's equipment, or make the barbell row write all bar kinds. In kg use a 0.25 delta or offer preset values.

## 13. kg display rounds to 0.5, so logged or imported 1.25 kg microplate weights show wrong
- **Severity:** cosmetic (borders on wrong-advice when copying numbers)
- **Status:** CONFIRMED (test)
- **Where:** lib/units.ts:9-12
- **What happens:** `display(61.25)` shows 61.5 kg, and `format(0.2)` shows "0 kg". The value stored in kg is right, but history, PRs and the bodyweight chart show a heavier number.
- **Fix:** Round to 0.25 in kg, or round only where a value is entered.

## 14. Weigh-ins under 20 kg or over 400 kg, and 0-minute activities, save and then disappear on the next launch
- **Severity:** data-loss (minor)
- **Status:** CONFIRMED (code trace plus reader test)
- **Where:** lib/bodyweight.ts:9 against components/Bodyweight.svelte:26-28 and ValueStepper (only `Math.max(0, …)`); lib/activities.ts:45 against ActivitySheet (minutes can be 0)
- **What happens:** The sheet accepts the value, it shows up and is written to IndexedDB, then `readBodyweight`/`readActivity` drop it on reload.
- **Fix:** Use the same limits in the sheet (disable Save), or relax the readers.

## 15. Export can mark a backup as done when nothing was saved
- **Severity:** data-loss (silences the backup reminder)
- **Status:** SUSPECTED
- **Where:** lib/backup.ts:35-48, :13-15
- **What happens:** If `navigator.share` fails for any reason other than AbortError, the code falls back to `a.click()` downloads, which often do nothing in an iOS standalone PWA. `saveFile` still returns true, `lastBackupAt` and `backupLogCount` are set, and `backupDue` stops asking. Separately, `backupDue` compares only log counts (:67): delete 2 workouts and log 2 new ones and it reports 0 unsaved.
- **Fix:** Return false on the fallback path in standalone mode. Track the newest log date or id at backup time instead of the count.

## 16. Migrating from version 2 permanently discards collection entries the reader can't read
- **Severity:** data-loss (minor)
- **Status:** CONFIRMED (code trace)
- **Where:** lib/store.svelte.ts:245-248
- **What happens:** `readCollections(raw)` drops entries it can't read (for example an activity with `minutes: 0`, a weigh-in under 20 kg, or a template with no exercises). The slimmed profile is then written without the raw arrays, so those entries are gone, even from `exportRawBackup`.
- **Fix:** Move the raw arrays (with ids) into the stores without filtering, and filter only when reading.

## 17. Deleting a gym and then tapping Undo reverts edits made to other gyms in between
- **Severity:** cosmetic / minor data-loss
- **Status:** CONFIRMED (code trace)
- **Where:** screens/You.svelte:34-39 (`x.gyms = before.gyms`)
- **What happens:** Undo restores the whole gym list as it was before the delete, which undoes any change to other gyms made while the toast was showing. In the same way, Undo for a custom-exercise delete (lib/customExercises.ts:53-55) calls `setProfile(before)` with the whole profile and reverts any program progress logged in between.
- **Fix:** Undo should put back only the deleted gym or exercise, at its old index.

## 18. A gym stored without an `id` gets a new random id on every read
- **Severity:** cosmetic
- **Status:** CONFIRMED (test)
- **Where:** engine/decode.ts:90 (`str(v.id, uuid())`)
- **What happens:** `activeGymID` never matches it, so the active gym falls back to `gyms[0]`, and the gym-editor route ids change between reads until the profile is saved again.
- **Fix:** Give the gym a stable id (derive it from its name or index) and save it right away.

## 19. Stored gym increments and set values are bounded only below
- **Severity:** cosmetic / wrong-advice from corrupt or imported data
- **Status:** CONFIRMED (test)
- **Where:** engine/decode.ts:82 and 98
- **What happens:** Increments must be greater than 0 but have no upper limit, so `increments.dumbbell = 1e9` makes every suggestion round to the base weight. `readSet` accepts negative weight and reps (`{weight:-50, reps:-3}`), which lowers volume totals.
- **Fix:** Limit increments to a sane range (for example 0.25 to 50), and limit reps to 0 or more and weight to 0 or more.

## 20. Renaming a gym to an empty name leaves the field blank while the old name is kept
- **Severity:** cosmetic
- **Status:** SUSPECTED (Svelte `value=` attribute caching)
- **Where:** screens/Settings.svelte:56
- **What happens:** `g.name` stays the same, so the bound value doesn't change and Svelte doesn't write it back into the input, which stays empty.
- **Fix:** In the handler, reset `e.currentTarget.value = g.name` when the trimmed value is empty.

## 21. A workout `focus` that this version doesn't know is kept as is, giving the title "undefined Day"
- **Severity:** cosmetic
- **Status:** CONFIRMED (code trace)
- **Where:** lib/store.svelte.ts:116 (unlike `readRecord` at decode.ts:124, it doesn't validate), lib/logs.ts:17
- **Fix:** Validate against `DAY_FOCUSES` as `readRecord` does.

## 22. CSV parsing gaps
- **Severity:** cosmetic
- **Status:** CONFIRMED (tests)
- **Where:** engine/historyImport.ts:200, 31, 55-56, 232-247
- **What happens:**
  - A file with old-Mac CR-only line endings parses as a single row, so the user gets "no workout rows".
  - The weight column is the first header that starts with `weight`, so a `Weight Unit` column placed before `Weight` makes every weight 0.
  - Rows whose date doesn't parse (`1/5/2024`, `01/05/2024 6:30 PM`, `Jan 5, 2024`) are dropped silently. They aren't counted anywhere, so the user only sees "Workouts 0".
- **Fix:** Treat a bare `\r` as a line break, prefer a numeric weight column, and report how many rows were skipped because of their date.

---

### Checked and found OK
- Restoring the same backup twice creates no duplicates: ids are kept and the stores are replaced.
- Every alias and Fitbod mapping points to an existing catalog id.
- Converting v1 gym equipment is idempotent: reading a converted gym again gives the same result.
- Increments of 0 or below are filtered out.
- A custom exercise can't take over a built-in id: `setCustom` requires the `custom-` prefix and built-ins win in `index`.
- Hevy and Strong timed sets and warm-up flags parse correctly.
- Time-zone offsets in Fitbod ISO dates are handled.
