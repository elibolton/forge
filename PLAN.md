# Workout App — Fitbod Replacement Plan

Goal: a personal strength-training app that **generates each workout for you** from your equipment,
goals, history and per-muscle recovery, then lets you log it fast and see progress. Original name,
UI and code, using Fitbod's feature set as a reference for what's worth building.

Sources: Fitbod's own algorithm / recovery / insights blog posts and help-center articles
(My Plan, Focus Exercises, Customizing Today's Workout, Circuits & Supersets, Injuries & Limitations,
Reps in Reserve), plus third-party reviews. Read Nov 2026.

---

## 1. What Fitbod does

### Plan setup ("My Plan")
| Setting | Options |
|---|---|
| **Goal** | Build Muscle, Get Lean, Get Stronger, Reduce Bodyweight, Improve Fitness, Practice Powerlifting, Practice Olympic Weightlifting. Drives exercise choice (compound vs isolation), rep ranges, rest, cardio amount |
| **Location / equipment** | Multiple named gyms, each with an equipment checklist; per-equipment **available weight increments** (dumbbells, kettlebells, plates); Bodyweight-Only mode; share a gym setup |
| **Workouts / week** | A count or specific days (Mon/Wed/Fri); drives split recommendation and weekly set targets; optional "workout preview" notification |
| **Duration** | 15 min – 1 h 30 (or custom); scales exercise count and weekly set targets |
| **Experience** | Beginner / Intermediate / Advanced |
| **Split** | Push/Pull/Legs, Upper/Lower, Full Body, **Fresh Muscle Groups** (two most-recovered groups). With Focus Exercises on: hybrids by days/week (e.g. 5 days = PPL + Upper/Lower) |
| **Exercise variability** | More consistent / Balanced / More variable |
| **Focus Exercises** | One main compound lift per day, repeated weekly across a **4-week cycle with phases**: Build Momentum → Dial It In → Close to Peak → Final Push (max effort), then refresh. Phase advances once all split days are done |
| **Warm-up sets** | Toggle; auto ramp sets before heavy lifts |
| **Circuits & supersets** | Toggle auto-grouping; superset = 2 exercises, circuit = 3+ |
| **Timed intervals** | Time-based sets (HIIT), applied to start / end / whole workout |
| **Cardio** | Add at start or end; pick preferred machines (air bike, rower, elliptical, jump rope…) |
| **Stretching** | Before/after: soft tissue (foam roll), dynamic, static, primers |
| **Exercise prefs** | Recommend More / Recommend Less / Exclude, manageable list |
| **Injuries / limitations** | Describe area (or quick-pick knee, shoulder, lower back…) → answer questions → excluded exercises + alternatives recommended more; "Mark as not injured" |
| Units, week start day | lb/kg; Sat/Sun/Mon |

### Today's workout
- **Swap menu:** switch split day (Push → Pull), pick muscles (Recovered, Push, Pull, Upper, Lower,
  Full Body), load a saved workout, create from scratch, on-demand pre-built workouts.
- **Session mods:** change duration or equipment just for today.
- Per exercise: replace (with alternatives), remove, add, reorder, notes.
- Supersets/circuits: build manually, drag in/out, duplicate, unbundle, "log all", **normalize weights**
  (one weight for the whole group so you don't change plates).

### Logging
- Sets prefilled with recommended reps × weight; edit inline; rest timer; pause workout.
- **Reps in Reserve (RiR)** prompt after an exercise (0–4+); feeds progression.
- **Max Effort Day:** every few workouts 1–2 exercises ask for AMRAP on the last set to recalibrate 1RM.
- Plate calculator, exercise notes, save workout, weekly workout goal + streaks.

### Algorithm (Fitbod's own description)
- **Exercise Selector** scores all ~800 exercises each time using:
  muscle recovery (prefer muscles fresh after 48–72 h), goal + experience appropriateness
  (trainer-rated per exercise), your feedback history (swaps, adds, removals, favorites),
  split compatibility, and available equipment.
- **Capability Recommender** sets sets/reps/weight:
  - Strength: 1–6 reps at ~85–100% 1RM, 3–5 min rest.
  - Hypertrophy: mostly 6–12 reps (some 1–5 and 15–25), **10–20 working sets per muscle per week**.
  - General / lean: higher reps, shorter rest.
  - **Cycles heavier and lighter days** (undulating loading) rather than one fixed scheme.
  - Weight from estimated 1RM (Epley), weighted toward your strongest *recent* performances.
  - New exercises seeded from similar users (we'll seed from related lifts / bodyweight ratios instead).
  - RiR adjusts aggression; after a layoff weights are reduced; stalled e1RM / flat volume = plateau flag.
- **Recovery:** sum of fatigue from every exercise hitting a muscle → 0–100%; full recovery assumed
  after 7 days; if a fatigued muscle must be trained it uses lower-intensity variations; user can override;
  cardio and Apple Health / Strava / Fitbit workouts count.

### Insights
- **Strength Score** (overall) and **mStrength** (per muscle group).
- Estimated 1RM charts for squat, bench, deadlift, overhead press (and per exercise).
- Recovery heat map, PRs, volume / intensity trends, exercise percentile ranking.
- **Workout Report:** weekly/monthly totals (workouts, weight lifted, calories, duration) vs previous period.
- Weekly set targets per muscle, year in review.

### Platforms & integrations
iOS, Android, Apple Watch (logging + RiR on wrist), Wear OS, iOS widget, Apple Health / Health Connect,
Fitbit, Strava, live heart rate, AirPods Pro heart rate.

### Pricing
Subscription only (~$13–16/mo or ~$80–96/yr). Building our own removes that.

Complaints to fix: cost, limited variations for advanced lifters, workouts that feel random,
little visibility into *why* something was picked, needs a server (offline banner issues).

---

## 2. Tech stack (recommended)

**Native iOS: SwiftUI + SwiftData**, with a watchOS companion later.

- HealthKit, Apple Watch, Live Activities (rest timer on lock screen) are first-class natively.
- Fully offline/local — no backend, no accounts, no subscription. iCloud sync via CloudKit later.
- Xcode and the iOS Simulator are already on this Mac.

Alternative if Android or the web matter: **Expo (React Native) + TypeScript + expo-sqlite**.
The engine (section 4) is pure logic either way, so it ports cleanly.

**Exercise data:** seed from [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
(~800 exercises, public domain, images, primary/secondary muscles, equipment, level), then hand-tag
what the engine needs: movement pattern, compound/isolation, goal suitability, min experience,
default rep range, load increment, and joints stressed (for injuries).

---

## 3. Data model

```
UserProfile      goal, experience, workoutsPerWeek | specificDays, sessionMinutes, split,
                 variability, focusExercisesOn, warmupsOn, supersetsOn, cardio(prefs, start/end),
                 stretching(types, before/after), units, weekStart, bodyweight
Gym              name, equipment: Set<Equipment>, weightIncrements per equipment, bodyweightOnly
Exercise         id, name, primaryMuscles, secondaryMuscles, equipment, movementPattern,
                 isCompound, goalFit{strength,hypertrophy,general}, minExperience,
                 jointsStressed, isTimed, loadIncrement, instructions, media
ExercisePref     exerciseId, preference (more/less/exclude), source (user|injury)
Injury           area, description, reportedAt, resolvedAt?
FocusCycle       startDate, phase (1–4), exercisesByDay
Workout          date, gymId, splitDay, status, durationSec, notes
WorkoutExercise  workoutId, exerciseId, order, groupId? (superset/circuit), isFocus, isMaxEffort,
                 targetSets/Reps/Weight/Seconds, rir?
SetLog           workoutExerciseId, index, type (warmup/working/drop/amrap), weight, reps,
                 seconds?, completedAt
MuscleOverride   muscle, recoveryPct, setAt
ExternalActivity source (HealthKit), type, start, duration → leg/cardio fatigue
```

Derived (computed, not stored): recovery, e1RM, PRs, mStrength, Strength Score, weekly sets per muscle.

---

## 4. The engine

Pure, unit-tested Swift module `Engine` with no UI dependencies. Every recommendation carries a short
**"why"** string (e.g. "Hamstrings 92% recovered, 4/12 weekly sets done"), our main edge over Fitbod.

### 4a. Muscle recovery
- Each completed working set adds fatigue to primary muscles (1.0) and secondary (0.5), scaled by
  relative intensity (`load / e1RM`) and proximity to failure (RiR).
- Fatigue decays; light sessions clear in ~2 days, heavy ones take up to 7.
  `recovery = clamp(1 − Σ dose_i · decay(t − t_i), 0, 1)`.
- Tiers: ≥80% fresh, 50–80% recovering, <50% fatigued. Manual override wins until it decays out.
- HealthKit runs / rides / hikes add a dose to legs.

### 4b. Today's muscles
- Split rotation decides the day (PPL, U/L, Full Body, hybrids by days/week); the next undone day wins.
- "Fresh Muscle Groups": two most-recovered primary groups.
- Weighting inside a day by `recovery × weeklySetDeficit` (weekly target 10–20 sets/muscle for
  hypertrophy, scaled by days/week and duration).

### 4c. Exercise selection
For each candidate passing filters (equipment, excluded, injury, experience, split):
```
score = muscleMatch·deficit + goalFit + preference(more +, less −) + feedbackHistory
        − recentlyUsed·variabilityWeight − fatiguedSecondaryPenalty + noise(variability)
```
- Focus exercise first (if on), then compounds, then isolations; no duplicate movement patterns.
- Exercise count from duration budget: Σ sets × (work + rest) + warm-ups + cardio/stretch blocks.
- If a fatigued muscle must be trained, pick lower-intensity variations.
- Optional pairing into supersets (antagonists / non-competing muscles) with weight normalization.

### 4d. Sets, reps, weight
| Goal | Reps | Intensity | Rest |
|---|---|---|---|
| Get Stronger / Powerlifting | 1–6 | 85–100% e1RM | 3–5 min |
| Build Muscle | 6–12 (some 1–5, 15–25) | 65–80% | 60–120 s |
| Get Lean / Improve Fitness | 10–15 | 60–70% | 45–75 s |
| Reduce Bodyweight | 12–20, circuits | 50–65% | 30–45 s |

- e1RM via Epley `w × (1 + reps/30)` adjusted by RiR (`reps + RiR` as effective reps), weighted
  toward the best recent sets.
- Undulating heavy / medium / light days per exercise.
- Target weight = `e1RM × intensity`, rounded to the gym's real increments.
- Progression: low RiR on target reps → hold; high RiR → raise; missed reps twice → drop 5–10%.
- Layoff > 10 days → reduce loads ~10% and ramp back.
- Max Effort Day every ~6–8 sessions per lift (AMRAP last set) to recalibrate.
- Focus cycle phases map to rising intensity over 4 weeks, then refresh.
- No history: estimate from related lifts or bodyweight ratios, conservative first session.
- Warm-up ramp for heavy compounds (bar × 10, 50% × 5, 70% × 3, 85% × 1).

---

## 5. Screens

1. **Onboarding** — goal, experience, days/week, duration, units, first gym + equipment.
2. **Workout (today)** — generated list with muscle tags, est. time, the "why"; swap menu
   (split day / muscles / saved / scratch), session mods (duration, equipment), replace/remove/add/reorder.
3. **Active workout** — prefilled sets, tap to complete, inline edit, rest timer (Live Activity),
   superset flow, RiR prompt, AMRAP prompt, plate calculator, notes, pause; finish summary with PRs.
4. **Body / Recovery** — front/back heat map, tap a muscle for detail and override, weekly sets per muscle,
   Focus Exercise progress.
5. **Exercise detail** — instructions/media, history, e1RM chart, PRs, more/less/exclude.
6. **Progress** — Strength Score, per-muscle strength, big-4 e1RM, volume trends, weekly/monthly report, calendar, streak.
7. **My Plan** — all settings in section 1, gyms, injuries, manage exercise preferences.
8. **Library** — search/filter, custom exercises.

---

## 6. Build phases

**Phase 0 — Skeleton (½ day)**
Xcode project (iOS 18+, SwiftUI, SwiftData), tab bar, exercise DB import + tagging script, test target.

**Phase 1 — Manual logger (usable at the gym)**
Library, empty workout, add exercises, log sets, rest timer, history, exercise history, CSV import of
Fitbod/Strong/Hevy history so the engine has data on day one.

**Phase 2 — The engine**
Recovery, e1RM, split rotation, exercise scoring, sets/reps/weight, progression, warm-ups,
"why" strings; unit tests with fixture histories and a simulated 8-week run.
Workout screen with generate / regenerate / replace.

**Phase 3 — My Plan & customization**
Onboarding, gyms + increments, variability, more/less/exclude, swap menu, session mods, supersets/circuits
with weight normalization, RiR and Max Effort Days.

**Phase 4 — Body & progress**
Heat map, weekly set targets, e1RM charts (Swift Charts), PRs, Strength Score, weekly report.

**Phase 5 — Apple ecosystem**
HealthKit (write workouts, read cardio for recovery, heart rate), Live Activity rest timer, Apple Watch
logging, widget, iCloud sync.

**Phase 6 — Extras**
Focus Exercises 4-week cycles, injuries/limitations, cardio/stretching blocks, timed intervals,
saved/on-demand workouts, optional LLM coach for explanations and injury Q&A.

---

## 7. Open decisions
- Native iOS (recommended) vs. Expo cross-platform.
- Export your Fitbod history (CSV) to import in Phase 1?
- Your units, typical gym equipment and goal, to seed the first gym profile and test data.
