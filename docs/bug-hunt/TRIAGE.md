# Bug hunt triage (2026-11-19)

Debug phase 0 of [the full build plan](../full-build-plan.md). Six sources found **120 issues**:
- five area reviews: [builder](builder.md), [programs](programs.md), [logger](logger.md), [storage](storage.md), [ui](ui.md);
- a fuzz run over 4,000 random setups and 40 simulated four-month histories;
- a hands-on pass at phone size ([fuzz-and-browser](fuzz-and-browser.md)).

About 100 are confirmed by a throwaway test or an exact code trace. The rest are marked SUSPECTED in their reports.

Severity order: data loss, then crash or stuck, then wrong training advice, then cosmetic. IDs refer to the reports:
- **B** builder
- **P** programs
- **L** logger
- **S** storage
- **U** ui
- **F** fuzz and browser

The fuzz run confirmed that equipment, injuries, duplicates, weights and reps hold up across every generated workout. The only failure there was short sessions overrunning.

## Batch 1: data loss and crashes (fix first)

| # | Issue | IDs | Verified by |
|---|---|---|---|
| 1 | Restoring a backup with no `logs` section (or a v1 backup with logs inside the profile) wipes every workout; newer-version backups are accepted silently | S1 | code trace + test |
| 2 | Retrying a failed save brings back deleted workouts and overwrites newer edits (batch keys `log:X,Y`) | S2 | code trace + test |
| 3 | Adding an exercise already in the workout crashes Today until midnight; duplicate exercises also crash Progress, exercise pages and the finish summary (keyed lists) | U1, U2, L5 | code trace + test |
| 4 | "Empty Workout" or "Start a Saved Workout" silently replaces a workout in progress | U3 | code trace |
| 5 | Undo after removing an exercise restores the old list, wiping sets logged since | L1 | test |
| 6 | Undo after discarding overwrites a workout started since | L3 | suspected |
| 7 | Starting or restarting a program wipes current progress with no undo | U4 | code trace |
| 8 | Deleting a custom exercise used in the running or a saved workout loses its name and muscles | U5, S11 | test |
| 9 | Weigh-ins outside 20–400 kg (and 0-minute activities) save, then vanish on the next launch | U6, S14 | test |
| 10 | Interrupted legacy migration duplicates workouts; v2 migration drops unreadable entries | S3, S16 | test |
| 11 | Database upgrade hangs on the loading screen if an older version is open in another tab | S4 | test |
| 12 | Two tabs overwrite each other's settings and workouts (last write wins) | S5, L2 | code trace |
| 13 | A crash between saving the log and clearing the session can save a workout twice | L4 | suspected |
| 14 | "Jump to Week" to a finished week leaves a program stuck with no session | P1 | test |
| 15 | Ticking only warm-up mobility drills completes a program day and advances the week | P2 | test |
| 16 | Swap does nothing on an exercise whose sets are all done but says it worked; program swap aliases the slot | L6, L7 | test |
| 17 | Building a workout is quadratic in history: 4.6 s at 2,000 workouts | B3 | test |
| 18 | A non-integer or NaN seed throws | B16 | test |

## Batch 2: wrong training advice

| # | Issue | IDs |
|---|---|---|
| 19 | Unrated sets count as sets to failure in e1RM, so loads drop and stall (bench 50 → 37.5 kg in a simulation where every rep was hit) | B1 |
| 20 | Double progression mixes the heaviest weight with the lowest reps from different sets | B2 |
| 21 | 0 kg prescriptions that stick (large dumbbell steps, logging 0, timed holds) | B4, B13, B21, P15 |
| 22 | Loads below the empty bar round up to the bar (up to 70% heavier) | B5 |
| 23 | Loaded exercises with no load equipment never progress and get unrounded weights | B6, B18 |
| 24 | No-equipment Push and Pull days get little or no work for the day's muscles, with a note saying every muscle is covered | B9, F2, F3, F4 |
| 25 | 15–20 minute sessions run 20–60% over | B8, F1 |
| 26 | Program swaps keep the old slot's load step, effort and range; the load step and rounding grid disagree, so "+0 kg" repeats forever | P3, P4 |
| 27 | The week 1 calibration set blocks the next increase; restarting reads the old run; the fatigue flag reads an old run | P5, P6, P7 |
| 28 | No easing back in after time away (programs); the same exercise in two slots reads the wrong sets; bodyweight at the top of the range is told to drop a set | P8, P9, P10 |
| 29 | Rep typos (80 for 8) aren't flagged and create false PRs; a failure set made straight keeps RIR 0; per-side plus drop sets rate the wrong set | L8, L9, L10 |
| 30 | Timed holds get e1RM PRs from seconds; "log as planned" saves placeholder sets; an overnight session saves a 10-hour duration | L11, L12, L13 |
| 31 | CSV import: assisted exercises count as added weight; decimal commas import as 0; DD/MM dates roll over; slow on large files; skipped exercises can't be added later | S6–S10 |
| 32 | Weight steps can't be set for EZ bar, trap bar, Smith machine or most machines | S12, U9 |
| 33 | Smaller builder issues: custom-exercise roles, superset rest after a break-up, future-dated records, beginner strength set cap, deload loads, absurd weights, DST drift, Fresh Muscles recovery | B7, B10–B12, B14, B15, B17, B19, B20 |
| 34 | Programs: home preset lacks a dip belt, range extension saved on a discarded start, a lost check-in | P11–P14 |
| 35 | Number inputs have no upper bound; the typed and saved values disagree | U15, U16 |

## Batch 3: cosmetic, UX and accessibility

About 35 issues:
- Toast overlaps (F6, U23), and only one undoable toast at a time (U22).
- Focus isn't returned after sheets close (U12); aria states (U13, U14).
- Swipe-back flash (U10), nested sheet scroll (U11).
- The edit-workout cancel prompt always appears (U7), and weights display rounded to 0.5 (U8, S13).
- Logger reordering and superset edge cases (L14–L23).
- Titles and wording (U19, U29, F5, F7, F8).
- Stale dates after midnight (U30), backup-nudge counting (U25, U27, S15), and the update banner's "Later" (U26).
- Other small storage issues (S17–S22).

## Fixing plan

1. **Batch 1**, in three PRs:
   - storage integrity: 1, 2, 9, 10, 11, 12, 13;
   - session and screens: 3–8, 16;
   - programs and builder robustness: 14, 15, 17, 18.
2. **Batch 2**, in two PRs:
   - builder and progression: 19–25, 33;
   - programs, logger and import: 26–32, 34, 35.
3. **Batch 3**, as one or two PRs.

Each fix gets a regression test where one is possible, and the fuzz run becomes a permanent test.
