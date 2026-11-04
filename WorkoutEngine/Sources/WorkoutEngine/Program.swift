import Foundation

// Structured multi-week programs. A program is static data shipped with the app (see `Programs`);
// only the user's place in it (`ProgramProgress`) is stored.

// MARK: - Building blocks

public struct RepRange: Codable, Hashable, Sendable {
    public var lower: Int
    public var upper: Int

    public init(_ lower: Int, _ upper: Int) { self.lower = lower; self.upper = max(lower, upper) }

    public var text: String { lower == upper ? "\(lower)" : "\(lower)–\(upper)" }
}

/// Reps in reserve as a range, e.g. 1–2. A single value has `low == high`.
public struct RIRTarget: Codable, Hashable, Sendable {
    public var low: Int
    public var high: Int

    public init(_ low: Int, _ high: Int? = nil) { self.low = low; self.high = max(low, high ?? low) }

    public var text: String { low == high ? "\(low)" : "\(low)–\(high)" }
}

public enum Effort: Codable, Hashable, Sendable {
    case rir(RIRTarget)
    /// Lowering-only reps with no RIR (Nordic curls): end the set when the descent can't be controlled.
    case eccentricOnly

    public var rir: RIRTarget? { if case let .rir(t) = self { t } else { nil } }
}

public enum Laterality: String, Codable, Hashable, Sendable {
    case bilateral, perArm, perLeg

    public var isPerSide: Bool { self != .bilateral }
}

public enum Side: String, Codable, Hashable, Sendable {
    case left, right
    public var letter: String { self == .left ? "L" : "R" }
}

/// How load goes up once every set reaches the top of the range.
public enum LoadStep: String, Codable, Hashable, Sendable {
    /// Squat, RDL: +5 kg / 10 lb.
    case lowerBodyBarbell
    /// Presses, rows, EZ bar: +2.5 kg / 5 lb.
    case upperBarbell
    /// The gym's next dumbbell.
    case dumbbell
    /// The next pin on a cable stack.
    case cablePin
    /// No load: progress by reps only.
    case bodyweight
}

/// Which column of the week table sets this exercise's RIR.
public enum ExerciseClass: String, Codable, Hashable, Sendable { case compound, isolation }

// MARK: - Prescription

public struct PrescriptionOverride: Codable, Hashable, Sendable {
    public var sets: Int?
    public var reps: RepRange?
    public var effort: Effort?
    public var note: String?

    public init(sets: Int? = nil, reps: RepRange? = nil, effort: Effort? = nil, note: String? = nil) {
        self.sets = sets; self.reps = reps; self.effort = effort; self.note = note
    }
}

public struct ExercisePrescription: Codable, Hashable, Sendable, Identifiable {
    /// Stable slot id within the program, e.g. "push.1" or "upper.6a".
    public var id: String
    public var exerciseID: String
    /// Shown before the name, e.g. "6a".
    public var label: String?
    public var sets: Int
    public var reps: RepRange
    /// Base effort; the week table overrides it by class.
    public var effort: Effort
    public var kind: ExerciseClass
    /// Seconds between sets (or between rounds for per-side work).
    public var rest: ClosedRange<Int>
    /// Seconds between the two sides of a per-side set; nil = go straight to the other side.
    public var sideRest: Int?
    public var laterality: Laterality
    public var loadStep: LoadStep
    public var isOptional: Bool
    public var supersetGroup: String?
    /// Setup and technique cues.
    public var notes: [String]
    /// Applies to the last working set only, e.g. "Lengthened partials".
    public var lastSetNote: String?
    /// Week number → changes for that week only.
    public var weekOverrides: [Int: PrescriptionOverride]

    public init(id: String, exerciseID: String, label: String? = nil, sets: Int, reps: RepRange, effort: Effort,
                kind: ExerciseClass, rest: ClosedRange<Int>, sideRest: Int? = nil, laterality: Laterality = .bilateral,
                loadStep: LoadStep, isOptional: Bool = false, supersetGroup: String? = nil, notes: [String] = [],
                lastSetNote: String? = nil, weekOverrides: [Int: PrescriptionOverride] = [:]) {
        self.id = id; self.exerciseID = exerciseID; self.label = label; self.sets = sets; self.reps = reps
        self.effort = effort; self.kind = kind; self.rest = rest; self.sideRest = sideRest; self.laterality = laterality
        self.loadStep = loadStep; self.isOptional = isOptional; self.supersetGroup = supersetGroup; self.notes = notes
        self.lastSetNote = lastSetNote; self.weekOverrides = weekOverrides
    }
}

public struct SupersetSpec: Codable, Hashable, Sendable {
    public var group: String
    /// Rest between the paired exercises.
    public var restBetween: ClosedRange<Int>
    /// Rest after each pair.
    public var restAfter: Int

    public init(group: String, restBetween: ClosedRange<Int>, restAfter: Int) {
        self.group = group; self.restBetween = restBetween; self.restAfter = restAfter
    }
}

public struct ProgramDay: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var focus: DayFocus
    public var exercises: [ExercisePrescription]
    public var supersets: [SupersetSpec]

    public init(id: String, title: String, focus: DayFocus, exercises: [ExercisePrescription], supersets: [SupersetSpec] = []) {
        self.id = id; self.title = title; self.focus = focus; self.exercises = exercises; self.supersets = supersets
    }
}

public enum ScheduleSlot: Codable, Hashable, Sendable {
    case day(String)
    case rest

    public var dayID: String? { if case let .day(id) = self { id } else { nil } }
}

public enum SetRule: String, Codable, Hashable, Sendable {
    case normal
    /// Halve, rounding up: 3→2, 4→2, 5→3, 2→1.
    case halved

    public func apply(_ sets: Int) -> Int {
        switch self {
        case .normal: sets
        case .halved: sets == 4 ? 2 : max(1, Int((Double(sets) / 2).rounded(.up)))
        }
    }
}

/// One row of the block table.
public struct WeekRule: Codable, Hashable, Sendable {
    public var week: Int
    /// Nil = keep each exercise's own base RIR.
    public var compoundRIR: RIRTarget?
    public var isolationRIR: RIRTarget?
    /// Per-exercise RIR that beats the class column (e.g. squat/RDL 1–2 in weeks 5–7).
    public var rirExceptions: [String: RIRTarget]
    public var sets: SetRule
    /// Last-set note for every isolation this week.
    public var isolationLastSetNote: String?
    /// Week 1: take the last set of one isolation per session to true failure.
    public var calibrate: Bool
    /// Deload: no failure and no last-set notes.
    public var isDeload: Bool
    public var notes: [String]

    public init(week: Int, compoundRIR: RIRTarget? = nil, isolationRIR: RIRTarget? = nil, rirExceptions: [String: RIRTarget] = [:],
                sets: SetRule = .normal, isolationLastSetNote: String? = nil, calibrate: Bool = false, isDeload: Bool = false,
                notes: [String] = []) {
        self.week = week; self.compoundRIR = compoundRIR; self.isolationRIR = isolationRIR; self.rirExceptions = rirExceptions
        self.sets = sets; self.isolationLastSetNote = isolationLastSetNote; self.calibrate = calibrate
        self.isDeload = isDeload; self.notes = notes
    }
}

public struct WorkoutProgram: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var summary: String
    public var weeks: Int
    /// Monday first, 7 slots.
    public var schedule: [ScheduleSlot]
    public var days: [ProgramDay]
    public var weekRules: [WeekRule]
    public var progressionNotes: [String]

    public init(id: String, name: String, summary: String, weeks: Int, schedule: [ScheduleSlot], days: [ProgramDay],
                weekRules: [WeekRule], progressionNotes: [String] = []) {
        self.id = id; self.name = name; self.summary = summary; self.weeks = weeks; self.schedule = schedule
        self.days = days; self.weekRules = weekRules; self.progressionNotes = progressionNotes
    }

    public func day(_ id: String) -> ProgramDay? { days.first { $0.id == id } }

    /// Training days in schedule order.
    public var dayOrder: [String] { schedule.compactMap(\.dayID) }

    public func rule(week: Int) -> WeekRule {
        weekRules.first { $0.week == week } ?? WeekRule(week: week)
    }

    /// The deload week, if the program has one.
    public var deloadWeek: Int? { weekRules.first(where: \.isDeload)?.week }

    /// What the calendar says for a date: a training day or rest.
    public func scheduled(on date: Date, calendar: Calendar = .current) -> ScheduleSlot {
        guard schedule.count == 7 else { return .rest }
        // Calendar weekday: 1 = Sunday … 7 = Saturday. Schedule index: 0 = Monday.
        let weekday = calendar.component(.weekday, from: date)
        return schedule[(weekday + 5) % 7]
    }
}

// MARK: - Resolved (one concrete week and day)

public struct ResolvedPrescription: Codable, Hashable, Sendable, Identifiable {
    public var id: String { slot.id }
    public var slot: ExercisePrescription
    public var week: Int
    public var sets: Int
    public var reps: RepRange
    public var effort: Effort
    public var lastSetNote: String?
    public var weekNote: String?
    public var isDeload: Bool
    /// Rest after the set: superset rules applied.
    public var restSeconds: Int
    /// Rest between the paired exercises of a superset, when this is the first of the pair.
    public var supersetRestBetween: Int?

    public var exerciseID: String { slot.exerciseID }
    public var exercise: Exercise { Catalog.exercise(slot.exerciseID) }

    /// "3 × 8–12" with "/leg" or "/arm" for per-side work.
    public var setsText: String {
        let side = switch slot.laterality { case .perArm: " per arm"; case .perLeg: " per leg"; case .bilateral: "" }
        return "\(sets) × \(reps.text)\(side)"
    }

    public var effortText: String {
        switch effort {
        case let .rir(t): "RIR \(t.text)"
        case .eccentricOnly: "lowering reps · stop when you lose control"
        }
    }

    public var restText: String {
        func fmt(_ s: Int) -> String {
            guard s >= 120 else { return "\(s) s" }
            let m = Double(s) / 60
            return m == m.rounded() ? "\(Int(m)) min" : "\(m.formatted(.number.precision(.fractionLength(1)))) min"
        }
        let r = slot.rest
        let range: String
        if r.lowerBound == r.upperBound {
            range = fmt(r.lowerBound)
        } else if (r.lowerBound >= 120) == (r.upperBound >= 120) {
            // Same unit: "60–90 s", "2.5–3 min".
            let unit = r.lowerBound >= 120 ? " min" : " s"
            range = "\(fmt(r.lowerBound).replacingOccurrences(of: unit, with: ""))–\(fmt(r.upperBound))"
        } else {
            range = "\(fmt(r.lowerBound))–\(fmt(r.upperBound))"
        }
        if slot.laterality.isPerSide && slot.sideRest == nil { return "~\(range), alternating sides" }
        if let side = slot.sideRest { return "\(fmt(side)) between sides · \(range) between rounds" }
        return range
    }
}

public struct ResolvedSession: Codable, Hashable, Sendable {
    public var programID: String
    public var week: Int
    public var day: ProgramDay
    public var rule: WeekRule
    public var exercises: [ResolvedPrescription]
}

extension WorkoutProgram {
    /// The concrete prescription for one day of one week, with the week table, deload and the user's
    /// set adjustments (stall rule) applied.
    public func session(dayID: String, week: Int, setAdjustments: [String: Int] = [:]) -> ResolvedSession? {
        guard let day = day(dayID) else { return nil }
        let rule = rule(week: week)
        // Week 1 calibration: the last non-optional isolation with an RIR target.
        let calibrationSlot = rule.calibrate
            ? day.exercises.last { $0.kind == .isolation && !$0.isOptional && $0.effort.rir != nil }?.id
            : nil

        let resolved = day.exercises.map { slot -> ResolvedPrescription in
            let override = slot.weekOverrides[week]
            var effort = slot.effort
            if case .rir = slot.effort {
                if let exception = rule.rirExceptions[slot.exerciseID] {
                    effort = .rir(exception)
                } else if let column = slot.kind == .compound ? rule.compoundRIR : rule.isolationRIR {
                    effort = .rir(column)
                }
            }
            if let e = override?.effort { effort = e }

            var sets = override?.sets ?? rule.sets.apply(slot.sets)
            if override?.sets == nil, !rule.isDeload { sets = max(1, sets + (setAdjustments[slot.id] ?? 0)) }

            var lastSetNote: String?
            if !rule.isDeload {
                lastSetNote = slot.lastSetNote
                if slot.kind == .isolation, slot.effort.rir != nil, let n = rule.isolationLastSetNote { lastSetNote = n }
                if slot.id == calibrationSlot { lastSetNote = "Calibration: take this last set to true failure" }
            }

            var rest = slot.rest.upperBound
            var between: Int?
            if let group = slot.supersetGroup, let spec = day.supersets.first(where: { $0.group == group }) {
                let members = day.exercises.filter { $0.supersetGroup == group }
                if members.first?.id == slot.id {
                    between = spec.restBetween.upperBound
                    rest = spec.restBetween.upperBound
                } else {
                    rest = spec.restAfter
                }
            }

            return ResolvedPrescription(slot: slot, week: week, sets: sets, reps: override?.reps ?? slot.reps, effort: effort,
                                        lastSetNote: lastSetNote, weekNote: override?.note, isDeload: rule.isDeload,
                                        restSeconds: rest, supersetRestBetween: between)
        }
        return ResolvedSession(programID: id, week: week, day: day, rule: rule, exercises: resolved)
    }
}

// MARK: - Logged reference

/// Which program day a logged workout was.
public struct ProgramRef: Codable, Hashable, Sendable {
    public var programID: String
    public var week: Int
    public var dayID: String
    public var isDeload: Bool

    public init(programID: String, week: Int, dayID: String, isDeload: Bool = false) {
        self.programID = programID; self.week = week; self.dayID = dayID; self.isDeload = isDeload
    }

    private enum CodingKeys: String, CodingKey { case programID, week, dayID, isDeload }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        programID = try c.decode(String.self, forKey: .programID)
        week = c.value(.week, or: 1)
        dayID = try c.decode(String.self, forKey: .dayID)
        isDeload = c.value(.isDeload, or: false)
    }
}

// MARK: - Progress (stored)

public struct FatigueCheckIn: Codable, Hashable, Sendable {
    public var jointPain: Bool
    public var stillSore: Bool
    public var poorSleepOrMotivation: Bool
    /// Computed from logs when the check-in was answered.
    public var repsDropped: Bool

    public init(jointPain: Bool = false, stillSore: Bool = false, poorSleepOrMotivation: Bool = false, repsDropped: Bool = false) {
        self.jointPain = jointPain; self.stillSore = stillSore
        self.poorSleepOrMotivation = poorSleepOrMotivation; self.repsDropped = repsDropped
    }

    public var flagCount: Int { [jointPain, stillSore, poorSleepOrMotivation, repsDropped].filter { $0 }.count }
    /// Two or more flags: deload early.
    public var suggestsDeload: Bool { flagCount >= 2 }

    private enum CodingKeys: String, CodingKey { case jointPain, stillSore, poorSleepOrMotivation, repsDropped }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        jointPain = c.value(.jointPain, or: false)
        stillSore = c.value(.stillSore, or: false)
        poorSleepOrMotivation = c.value(.poorSleepOrMotivation, or: false)
        repsDropped = c.value(.repsDropped, or: false)
    }
}

public struct ProgramProgress: Codable, Hashable, Sendable {
    public var programID: String
    public var startedAt: Date
    public var week: Int
    /// Week → day ids logged.
    public var completed: [Int: [String]]
    /// Week → day ids skipped.
    public var skipped: [Int: [String]]
    /// Jump to the deload week once the current week ends.
    public var deloadNext: Bool
    /// Slot id → set change (stall rule: −1).
    public var setAdjustments: [String: Int]
    /// Slot id → extra reps on the top of the range (big-jump rule).
    public var rangeExtensions: [String: Int]
    public var checkIns: [Int: FatigueCheckIn]
    /// Every day of the last week is done.
    public var isFinished: Bool

    public init(programID: String, startedAt: Date = .now, week: Int = 1) {
        self.programID = programID; self.startedAt = startedAt; self.week = week
        completed = [:]; skipped = [:]; deloadNext = false; setAdjustments = [:]; rangeExtensions = [:]
        checkIns = [:]; isFinished = false
    }

    public var program: WorkoutProgram? { Programs.byID[programID] }

    public func isDone(_ dayID: String, week: Int? = nil) -> Bool {
        let w = week ?? self.week
        return (completed[w] ?? []).contains(dayID) || (skipped[w] ?? []).contains(dayID)
    }

    /// Next training day this week, in schedule order.
    public func nextDayID(in program: WorkoutProgram) -> String? {
        guard !isFinished else { return nil }
        return program.dayOrder.first { !isDone($0) }
    }

    public func nextSession(in program: WorkoutProgram) -> ResolvedSession? {
        nextDayID(in: program).flatMap { program.session(dayID: $0, week: week, setAdjustments: setAdjustments) }
    }

    public mutating func complete(_ dayID: String, week: Int, in program: WorkoutProgram) {
        guard !(completed[week] ?? []).contains(dayID) else { return }
        completed[week, default: []].append(dayID)
        skipped[week]?.removeAll { $0 == dayID }
        advanceIfWeekDone(program)
    }

    public mutating func skip(_ dayID: String, in program: WorkoutProgram) {
        guard !isDone(dayID) else { return }
        skipped[week, default: []].append(dayID)
        advanceIfWeekDone(program)
    }

    /// Starts the deload week now, from its first day.
    public mutating func deloadNow(in program: WorkoutProgram) {
        guard let deload = program.deloadWeek else { return }
        week = deload
        completed[deload] = []
        skipped[deload] = []
        deloadNext = false
        isFinished = false
    }

    /// The week just finished still needs its fatigue check-in. Not asked during or after the deload.
    public func checkInDue(in program: WorkoutProgram) -> Int? {
        guard !isFinished, !deloadNext, !program.rule(week: week).isDeload else { return nil }
        let candidate = week - 1
        guard candidate >= 1, checkIns[candidate] == nil, !(completed[candidate] ?? []).isEmpty else { return nil }
        return candidate
    }

    mutating func advanceIfWeekDone(_ program: WorkoutProgram) {
        guard program.dayOrder.allSatisfy({ isDone($0) }) else { return }
        let wasDeload = program.rule(week: week).isDeload
        if wasDeload || week >= program.weeks {
            isFinished = true
            return
        }
        if deloadNext, let deload = program.deloadWeek {
            week = deload
            deloadNext = false
        } else {
            week += 1
        }
    }

    private enum CodingKeys: String, CodingKey {
        case programID, startedAt, week, completed, skipped, deloadNext, setAdjustments, rangeExtensions, checkIns, isFinished
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        programID = try c.decode(String.self, forKey: .programID)
        startedAt = c.value(.startedAt, or: .now)
        week = max(1, c.value(.week, or: 1))
        completed = c.value(.completed, or: [:])
        skipped = c.value(.skipped, or: [:])
        deloadNext = c.value(.deloadNext, or: false)
        setAdjustments = c.value(.setAdjustments, or: [:])
        rangeExtensions = c.value(.rangeExtensions, or: [:])
        checkIns = c.value(.checkIns, or: [:])
        isFinished = c.value(.isFinished, or: false)
    }
}

// MARK: - Registry

public enum Programs {
    /// Built-in programs. To add one, define it in its own `Programs+Name.swift` file and list it here.
    public static let all: [WorkoutProgram] = [pplul8]
    public static let byID: [String: WorkoutProgram] = Dictionary(uniqueKeysWithValues: all.map { ($0.id, $0) })
}
