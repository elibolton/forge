import { type LoggedExercise, oneRM, workingSets } from '../engine';

/** A logged workout, as much as records need. */
interface Log { id: string; date: number; exercises: LoggedExercise[] }

export interface Mark { value: number; date: number; weight: number; reps: number }

/** Personal bests for one exercise. Weights are kg. */
export interface ExerciseRecords {
  /** Best estimated one-rep max. */
  oneRM?: Mark;
  /** Heaviest working set. */
  heaviest?: Mark;
  /** Most reps (or seconds) in a working set. */
  mostReps?: Mark;
  /** Most weight moved in one session (weight × reps across working sets). */
  volume?: Mark;
}

const better = (cur: Mark | undefined, next: Mark) => !cur || next.value > cur.value + 1e-9;

export function exerciseRecords(sessions: { date: number; logged: LoggedExercise }[]): ExerciseRecords {
  const r: ExerciseRecords = {};
  for (const { date, logged } of sessions) {
    let volume = 0;
    for (const s of workingSets(logged)) {
      volume += s.weight * s.reps;
      const mark = (value: number): Mark => ({ value, date, weight: s.weight, reps: s.reps });
      if (s.weight > 0 && better(r.oneRM, mark(oneRM(s.weight, s.reps, s.rir)))) r.oneRM = mark(oneRM(s.weight, s.reps, s.rir));
      if (s.weight > 0 && better(r.heaviest, mark(s.weight))) r.heaviest = mark(s.weight);
      if (better(r.mostReps, mark(s.reps))) r.mostReps = mark(s.reps);
    }
    if (volume > 0 && better(r.volume, { value: volume, date, weight: 0, reps: 0 })) r.volume = { value: volume, date, weight: 0, reps: 0 };
  }
  return r;
}

/** One time a workout beat your best estimated 1RM on an exercise. */
export interface PREvent { exerciseID: string; logID: string; date: number; oneRM: number; previous: number }

/**
 * Every new best e1RM, newest first. The first time you do an exercise isn't a record, and a gain
 * under 0.5% is noise.
 */
export function prTimeline(logs: Log[]): PREvent[] {
  const best = new Map<string, number>();
  const events: PREvent[] = [];
  for (const log of [...logs].sort((a, b) => a.date - b.date)) {
    for (const logged of log.exercises) {
      const values = workingSets(logged).filter((s) => s.weight > 0).map((s) => oneRM(s.weight, s.reps, s.rir));
      if (!values.length) continue;
      const top = Math.max(...values);
      const previous = best.get(logged.exerciseID);
      if (previous !== undefined && top > previous * 1.005) {
        events.push({ exerciseID: logged.exerciseID, logID: log.id, date: log.date, oneRM: top, previous });
      }
      if (previous === undefined || top > previous) best.set(logged.exerciseID, top);
    }
  }
  return events.reverse();
}
