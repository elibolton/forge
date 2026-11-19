import { Catalog } from './catalog';
import { type Exercise, type LoggedExercise, type LoggedSet, type WorkoutRecord, POUNDS_PER_KG } from './models';

/** Reads workout-history CSV exports (Fitbod, Strong, Hevy and similar) into workout records. */
export interface ImportResult {
  workouts: WorkoutRecord[];
  /** Exercise names that couldn't be matched to the catalog, with how many sets were skipped. */
  unmatched: Record<string, number>;
}

export const importSetCount = (r: ImportResult) =>
  r.workouts.reduce((t, w) => t + w.exercises.reduce((u, e) => u + e.sets.length, 0), 0);

export class ImportError extends Error {}

/**
 * Columns are found by header name rather than position, so small format differences don't break it.
 * Rows are grouped into one workout per calendar day.
 * @param defaultPounds unit to assume when the weight column doesn't say (Strong exports).
 * @param manualMatches exercise names from the file the user matched by hand, mapped to exercise IDs.
 */
export function parseHistory(text: string, defaultPounds: boolean, manualMatches: Record<string, string> = {},
                             catalog: Exercise[] = Catalog.all): ImportResult {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new ImportError('The file has no workout rows.');
  const columns = rows[0].map((h) => h.toLowerCase().trim());
  const column = (test: (c: string) => boolean) => { const i = columns.findIndex(test); return i < 0 ? undefined : i; };
  const date = column((c) => c === 'date' || c === 'start_time' || c === 'start time' || c === 'workout date');
  const name = column((c) => c === 'exercise' || c === 'exercise name' || c === 'exercise_title' || c === 'exercise title');
  const reps = column((c) => c === 'reps');
  const weight = column((c) => c.startsWith('weight'));
  const seconds = column((c) => c.startsWith('duration(s') || c === 'seconds' || c === 'duration_seconds');
  const warmup = column((c) => c === 'iswarmup' || c === 'set_type' || c === 'set order');
  const rpe = column((c) => c === 'rpe');

  const missing: string[] = [];
  if (date === undefined) missing.push('Date');
  if (name === undefined) missing.push('Exercise');
  if (reps === undefined && seconds === undefined) missing.push('Reps');
  if (missing.length || date === undefined || name === undefined) {
    throw new ImportError(`Couldn't find these columns: ${missing.join(', ')}.`);
  }

  const weightHeader = weight !== undefined ? columns[weight] : '';
  const pounds = weightHeader.includes('lb') ? true : weightHeader.includes('kg') ? false : defaultPounds;
  const warmupHeader = warmup !== undefined ? columns[warmup] : undefined;

  const matcher = new NameMatcher(catalog);
  const unmatched: Record<string, number> = {};
  const byDay = new Map<number, { date: number; exercises: LoggedExercise[] }>();

  for (const row of rows.slice(1)) {
    if (row.length < columns.length / 2) continue;
    const value = (i?: number) => (i !== undefined && i < row.length ? row[i].trim() : '');
    const when = parseDate(value(date));
    if (when === undefined) continue;
    const rawName = value(name);
    if (!rawName) continue;
    const manualID = manualMatches[rawName];
    const manual = manualID ? catalog.find((e) => e.id === manualID) : undefined;
    const exercise = manual ?? matcher.match(rawName);
    if (!exercise) { unmatched[rawName] = (unmatched[rawName] ?? 0) + 1; continue; }

    const num = (s: string) => { const n = Number(s); return s !== '' && Number.isFinite(n) ? n : undefined; };
    const repCount = Math.trunc((exercise.isTimed ? num(value(seconds)) : num(value(reps))) ?? 0);
    if (repCount <= 0) continue;
    let kg = num(value(weight)) ?? 0;
    if (pounds) kg /= POUNDS_PER_KG;
    const flag = value(warmup).toLowerCase();
    const isWarmup = warmupHeader === 'set order' ? flag === 'w'   // Strong: set number, or W for warm-up
      : warmupHeader === 'set_type' ? flag === 'warmup'             // Hevy
      : flag === 'true' || flag === '1';                            // Fitbod: isWarmup boolean
    const rpeValue = num(value(rpe));
    const rir = rpeValue !== undefined ? Math.max(0, Math.round(10 - rpeValue)) : null;

    const set: LoggedSet = { weight: kg, reps: repCount, rir, isWarmup };
    const d = new Date(when); d.setHours(0, 0, 0, 0);
    const day = d.getTime();
    const entry = byDay.get(day) ?? { date: when, exercises: [] };
    entry.date = Math.min(entry.date, when);
    const existing = entry.exercises.find((x) => x.exerciseID === exercise.id);
    if (existing) existing.sets.push(set);
    else entry.exercises.push({ exerciseID: exercise.id, sets: [set] });
    byDay.set(day, entry);
  }

  const workouts = [...byDay.values()]
    .map((v): WorkoutRecord => ({ date: v.date, focus: null, exercises: v.exercises }))
    .sort((a, b) => a.date - b.date);
  return { workouts, unmatched };
}

/** Fuzzy exercise-name matching against the catalog. */
export class NameMatcher {
  /** Common names that don't share enough words with the catalog name. */
  static aliases: Record<string, string> = {
    'bench press': 'bb-bench', 'back squat': 'bb-squat', squat: 'bb-squat', deadlift: 'bb-deadlift',
    'overhead press': 'bb-ohp', 'military press': 'bb-ohp', 'shoulder press': 'db-shoulder-press',
    pullup: 'pull-up', 'pull up': 'pull-up', chinup: 'chin-up', 'chin up': 'chin-up',
    'romanian deadlift': 'bb-rdl', rdl: 'bb-rdl', 'hip thrust': 'hip-thrust', lunge: 'db-lunge',
    'bent over row': 'bb-row', 'barbell row': 'bb-row', 'seated row': 'cable-row', 'lat pulldown': 'lat-pulldown',
    'triceps pushdown': 'tricep-pushdown', 'tricep pushdown': 'tricep-pushdown', 'leg press': 'leg-press',
    'leg extension': 'leg-extension', 'leg curl': 'leg-curl', 'lateral raise': 'db-lateral-raise',
    'face pull': 'face-pull', skullcrusher: 'skull-crusher', pushup: 'push-up', 'push up': 'push-up',
  };

  /** Fitbod's names, matched exactly before any fuzzy matching. */
  static fitbod: Record<string, string> = {
    'air squats': 'air-squat', 'alternating dumbbell bench press': 'db-bench', 'arnold dumbbell press': 'arnold-press',
    'back squat': 'bb-squat', 'barbell bicep drag curl': 'bb-drag-curl', 'barbell shoulder press': 'bb-ohp',
    'bent over barbell row': 'bb-row', 'bulgarian split squat': 'bulgarian-split-squat', 'butt kick': 'butt-kick',
    'cable row': 'cable-row', 'cable rope tricep extension': 'rope-tricep-ext', 'calf raise': 'bw-calf-raise',
    'chest dip': 'dip', 'chest doorway stretch': 'doorway-chest-stretch', clam: 'clamshell',
    'concentration curl': 'concentration-curl', 'cross body hammer curls': 'cross-body-hammer-curl',
    'dumbbell back fly': 'db-rear-delt-fly', 'dumbbell bent over reverse fly': 'db-rear-delt-fly',
    'dumbbell rear delt raise': 'db-rear-delt-fly', 'dumbbell bicep curl': 'db-curl', 'dumbbell kickbacks': 'db-kickback',
    'dumbbell row': 'db-row', 'dumbbell skullcrusher': 'db-skull-crusher', 'dumbbell squat': 'db-squat',
    'dumbbell stiff legged deadlift': 'db-stiff-leg-deadlift', 'dumbbell tricep extension': 'overhead-tricep-ext',
    'front plate raise': 'plate-front-raise', 'handle band bent over row': 'band-row', 'handle band bicep curl': 'band-curl',
    'handle band pec fly': 'band-chest-fly', 'handle band squat': 'band-squat', 'handle band tricep extension': 'band-tricep-ext',
    'high knee': 'high-knee', 'hip hinge': 'hip-hinge-drill', 'hip thrust': 'bw-hip-thrust',
    'incline dumbbell curl': 'incline-db-curl', 'incline dumbbell row': 'incline-db-row',
    'leaning dumbbelllateral raise': 'leaning-db-lateral-raise', 'leg raise': 'leg-raise', lunge: 'bw-lunge',
    'prone hip circles forward': 'prone-hip-circle', 'rack pulls': 'rack-pull',
    'reverse grip barbell bent over row': 'bb-reverse-row', 'reverse grip pull down': 'reverse-grip-pulldown',
    'seated dumbbell curl': 'seated-db-curl', 'shin box hip flexor': 'shin-box',
    'side laterals to front raise': 'lateral-to-front-raise', 'side leg raises': 'side-leg-raise',
    'single leg standing calf raise': 'single-leg-calf-raise', 'split squat': 'split-squat',
    'standing barbell calf raise': 'bb-calf-raise', 'standing dumbbell calf raise': 'db-calf-raise',
    'walking lunge': 'walking-lunge', 'wide grip lat pulldown': 'lat-pulldown',
    // Cardio isn't logged as sets; empty keeps these from fuzzy-matching "Walking Lunge".
    walking: '', hiking: '',
  };

  static synonyms: Record<string, string> = {
    db: 'dumbbell', dumbbells: 'dumbbell', bb: 'barbell', kb: 'kettlebell', ez: 'ez',
    triceps: 'tricep', rows: 'row', presses: 'press', curls: 'curl', raises: 'raise',
    extensions: 'extension', pulldowns: 'pulldown', lunges: 'lunge', squats: 'squat',
    deadlifts: 'deadlift', crunches: 'crunch', flyes: 'fly', flies: 'fly', pushups: 'pushup',
    pullups: 'pullup', chinups: 'chinup',
  };

  static equipmentWords = new Set(['barbell', 'dumbbell', 'cable', 'machine', 'kettlebell', 'smith', 'band', 'ez']);

  static tokens(name: string): Set<string> {
    const cleaned = name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ' ');
    return new Set(cleaned.split(' ').filter(Boolean).map((w) => NameMatcher.synonyms[w] ?? w));
  }

  constructor(private catalog: Exercise[]) {}

  match(name: string): Exercise | undefined {
    const words = NameMatcher.tokens(name);
    const byID = new Map(this.catalog.map((e) => [e.id, e]));
    const exact = NameMatcher.fitbod[name.toLowerCase().trim()];
    if (exact !== undefined) return byID.get(exact);
    const without = (s: Set<string>) => [...s].filter((w) => !NameMatcher.equipmentWords.has(w));
    // "Bench Press (Barbell)" → "bench press" alias when the equipment agrees.
    const bare = without(words).sort().join(' ');
    for (const [alias, id] of Object.entries(NameMatcher.aliases)) {
      if ([...NameMatcher.tokens(alias)].sort().join(' ') !== bare) continue;
      const e = byID.get(id);
      if (e && this.equipmentAgrees(words, e)) return e;
    }

    // Compare movement words only; equipment was already checked.
    const movement = new Set(without(words));
    let best: [Exercise, number] | undefined;
    for (const e of this.catalog) {
      const target = new Set(without(NameMatcher.tokens(e.name)));
      if (!this.equipmentAgrees(words, e) || !movement.size) continue;
      const inter = [...movement].filter((w) => target.has(w)).length;
      const union = new Set([...movement, ...target]).size;
      const score = inter / union;
      if (score > (best?.[1] ?? 0)) best = [e, score];
    }
    return best && best[1] >= 0.5 ? best[0] : undefined;
  }

  /** If the imported name names equipment, the catalog exercise must use it. */
  private equipmentAgrees(words: Set<string>, e: Exercise): boolean {
    const named = [...words].filter((w) => NameMatcher.equipmentWords.has(w));
    if (!named.length) return true;
    const uses = new Set([...NameMatcher.tokens(e.name)].filter((w) => NameMatcher.equipmentWords.has(w)));
    for (const eq of e.equipment) {
      const w = eq === 'barbell' ? 'barbell' : eq === 'dumbbell' ? 'dumbbell'
        : eq === 'cableHigh' || eq === 'cableLow' || eq === 'cableAdjustable' || eq === 'latPulldown' ? 'cable'
        : eq === 'kettlebell' ? 'kettlebell' : eq === 'smithMachine' ? 'smith' : eq === 'resistanceBand' ? 'band'
        : eq === 'ezBar' ? 'ez'
        : ['legPress', 'legCurl', 'legExtension', 'chestPressMachine', 'shoulderPressMachine'].includes(eq) ? 'machine' : undefined;
      if (w) uses.add(w);
    }
    return named.every((w) => uses.has(w));
  }
}

/** RFC 4180-ish: quoted fields, doubled quotes, commas or semicolons as separators. */
export function parseCSV(input: string): string[][] {
  let text = input.replace(/\r\n/g, '\n');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const firstLine = text.split('\n', 1)[0];
  const count = (c: string) => firstLine.split(c).length - 1;
  const separator = count(';') > count(',') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === separator) { row.push(field); field = ''; }
    else if (c === '\n') {
      row.push(field); field = '';
      if (!(row.length === 1 && row[0] === '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** The date formats the Swift importer accepted; times without a zone are local. */
export function parseDate(s: string): number | undefined {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/);
  if (m) {
    const [, y, mo, d, h = '0', mi = '0', se = '0', zone] = m;
    if (zone) {
      const offset = zone === 'Z' ? 0 : (zone[0] === '-' ? -1 : 1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(-2)));
      return Date.UTC(+y, +mo - 1, +d, +h, +mi, +se) - offset * 60_000;
    }
    return new Date(+y, +mo - 1, +d, +h, +mi, +se).getTime();
  }
  m = t.match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4}), (\d{2}):(\d{2})$/);
  if (m) {
    const month = MONTHS.indexOf(m[2].toLowerCase());
    if (month >= 0) return new Date(+m[3], month, +m[1], +m[4], +m[5]).getTime();
  }
  m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}))?$/);
  if (m) return new Date(+m[3], +m[1] - 1, +m[2], +(m[4] ?? 0), +(m[5] ?? 0)).getTime();
  return undefined;
}
