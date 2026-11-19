import type { Equipment, Exercise, Joint, Level, MovementPattern, Muscle } from './models';

interface Opts { compound: boolean; level?: Level; oneRM: number; joints?: Joint[]; timed?: boolean }

export function ex(id: string, name: string, primary: Muscle[], secondary: Muscle[], equipment: Equipment[],
                   pattern: MovementPattern, o: Opts): Exercise {
  return {
    id, name, primary, secondary, equipment, pattern, isCompound: o.compound, level: o.level ?? 'beginner',
    starterOneRM: o.oneRM, jointsStressed: o.joints ?? [], isTimed: o.timed ?? false,
  };
}

export function stretch(id: string, name: string, primary: Muscle[], secondary: Muscle[] = [], timed = false): Exercise {
  return ex(id, name, primary, secondary, [], 'mobility', { compound: false, oneRM: 0, timed });
}
