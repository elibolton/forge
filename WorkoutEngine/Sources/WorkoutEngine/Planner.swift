import Foundation

// MARK: - Output

public struct PlannedSet: Codable, Hashable, Sendable {
    /// kg; nil for bodyweight.
    public var weight: Double?
    /// Reps, or seconds for timed exercises.
    public var reps: Int
    public var isWarmup: Bool
    /// Last set to failure (Max Effort), used to recalibrate the 1RM.
    public var isAMRAP: Bool
}

public struct PlannedExercise: Codable, Hashable, Sendable {
    public var exercise: Exercise
    public var sets: [PlannedSet]
    public var restSeconds: Int
    public var targetRIR: Int
    /// Short human-readable reasons this exercise and load were picked.
    public var reasons: [String]

    public var workingSets: [PlannedSet] { sets.filter { !$0.isWarmup } }
}

public struct PlannedWorkout: Codable, Sendable {
    public var focus: DayFocus
    public var targetMuscles: [Muscle]
    public var exercises: [PlannedExercise]
    public var estimatedMinutes: Int
    public var recovery: [Muscle: Double]
}

// MARK: - Planner

public struct Planner {
    public var plan: UserPlan
    public var gym: Gym
    public var history: [WorkoutRecord]
    public var external: [ExternalActivity]
    public var overrides: [RecoveryOverride]
    public var catalog: [Exercise]

    public init(plan: UserPlan, gym: Gym, history: [WorkoutRecord],
                external: [ExternalActivity] = [], overrides: [RecoveryOverride] = [],
                catalog: [Exercise] = Catalog.all) {
        self.plan = plan; self.gym = gym
        self.history = history.sorted { $0.date > $1.date }
        self.external = external; self.overrides = overrides; self.catalog = catalog
    }

    /// Builds today's workout. Pass a different `seed` to regenerate; `focus` forces a day (swap menu).
    public func generate(now: Date = .now, seed: UInt64? = nil, focus forcedFocus: DayFocus? = nil) -> PlannedWorkout {
        let byID = Dictionary(uniqueKeysWithValues: catalog.map { ($0.id, $0) })
        let recovery = Recovery.compute(history: history, external: external, overrides: overrides, catalog: byID, now: now)
        let (focus, targets) = forcedFocus.map { ($0, targetMuscles(for: $0, recovery: recovery)) } ?? nextFocus(recovery: recovery)
        let weekly = weeklySets(byID: byID, now: now)
        let scheme = Scheme(goal: plan.goal, experience: plan.experience)

        var priority: [Muscle: Double] = [:]
        for m in targets {
            let deficit = max(0, 1 - (weekly[m] ?? 0) / scheme.weeklySetTarget)
            let size = [.adductors, .abductors].contains(m) ? 0.4 : Self.minorMuscles.contains(m) ? 0.6 : 1.0
            priority[m] = recovery[m, default: 1] * (0.5 + deficit) * size
        }

        var rng = SeededRandom(seed: seed ?? UInt64(Calendar.current.ordinality(of: .day, in: .era, for: now) ?? 0))
        let eligible = catalog.filter { isEligible($0) && $0.pattern != .mobility }
        var chosen: [PlannedExercise] = []
        var plannedSets: [Muscle: Double] = [:]
        var usedPatterns: Set<MovementPattern> = []
        var hitsPerMuscle: [Muscle: Int] = [:]
        var seconds = 0
        let budget = plan.sessionMinutes * 60
        let maxExercises = min(8, max(3, plan.sessionMinutes / 9))

        while chosen.count < maxExercises {
            let slot = chosen.count
            var best: (exercise: Exercise, score: Double, reasons: [String])?
            for exercise in eligible where !chosen.contains(where: { $0.exercise.id == exercise.id }) {
                guard let (score, reasons) = score(exercise, slot: slot, targets: targets, priority: priority,
                                                   plannedSets: plannedSets, hitsPerMuscle: hitsPerMuscle,
                                                   isolationTargets: Set(chosen.filter { !$0.exercise.isCompound }.map { Set($0.exercise.primary) }),
                                                   usedPatterns: usedPatterns,
                                                   recovery: recovery, weekly: weekly, scheme: scheme, now: now, rng: &rng)
                else { continue }
                if score > (best?.score ?? -.infinity) { best = (exercise, score, reasons) }
            }
            guard let pick = best, pick.score > -0.4 || chosen.count < 3 else { break }

            let planned = prescribe(pick.exercise, scheme: scheme, now: now, reasons: pick.reasons)
            let cost = Self.seconds(for: planned)
            if seconds + cost > budget && chosen.count >= 3 { break }

            chosen.append(planned)
            seconds += cost
            let setCount = Double(planned.workingSets.count)
            for m in pick.exercise.primary { plannedSets[m, default: 0] += setCount; hitsPerMuscle[m, default: 0] += 1 }
            for m in pick.exercise.secondary { plannedSets[m, default: 0] += setCount * 0.5 }
            if ![.isolation, .core].contains(pick.exercise.pattern) { usedPatterns.insert(pick.exercise.pattern) }
        }

        // The 3-exercise minimum can overrun short sessions with long rests: trim sets until it fits.
        while seconds > budget, let i = chosen.indices.max(by: { chosen[$0].workingSets.count < chosen[$1].workingSets.count }),
              chosen[i].workingSets.count > 2,
              let last = chosen[i].sets.lastIndex(where: { !$0.isWarmup }) {
            chosen[i].sets.remove(at: last)
            seconds = chosen.map(Self.seconds(for:)).reduce(0, +)
        }

        // Loaded compounds first, then bodyweight compounds, isolations, core.
        chosen.sort { rank($0.exercise) < rank($1.exercise) }

        return PlannedWorkout(focus: focus, targetMuscles: targets.sorted { priority[$0, default: 0] > priority[$1, default: 0] },
                              exercises: chosen, estimatedMinutes: Int((Double(seconds) / 60).rounded()), recovery: recovery)
    }

    // MARK: Single-exercise helpers for the app

    /// Sets, reps and weight for one exercise (swaps, or adding mid-workout).
    public func prescribe(_ e: Exercise, now: Date = .now) -> PlannedExercise {
        prescribe(e, scheme: Scheme(goal: plan.goal, experience: plan.experience), now: now, reasons: [])
    }

    /// Eligible exercises that hit the same primary muscles, closest matches first.
    public func alternatives(to e: Exercise, excluding: Set<String> = []) -> [Exercise] {
        catalog
            .filter { $0.id != e.id && !excluding.contains($0.id) && isEligible($0) && !Set($0.primary).isDisjoint(with: e.primary) }
            // Don't offer a stretch as a swap for a lift, or the other way round.
            .filter { ($0.pattern == .mobility) == (e.pattern == .mobility) }
            .sorted { lhs, rhs in
                func match(_ x: Exercise) -> Int {
                    (x.pattern == e.pattern ? 2 : 0) + (x.isCompound == e.isCompound ? 1 : 0)
                        + Set(x.primary).intersection(e.primary).count
                }
                return match(lhs) != match(rhs) ? match(lhs) > match(rhs) : lhs.name < rhs.name
            }
    }

    /// Working sets per muscle over the last 7 days.
    public func weeklySets(now: Date = .now) -> [Muscle: Double] {
        weeklySets(byID: Dictionary(uniqueKeysWithValues: catalog.map { ($0.id, $0) }), now: now)
    }

    public var weeklySetTarget: Double { Scheme(goal: plan.goal, experience: plan.experience).weeklySetTarget }

    // MARK: Day selection

    static let minorMuscles: Set<Muscle> = [.forearms, .calves, .adductors, .abductors, .lowerBack, .abs]

    /// Muscle groups the "Fresh Muscles" split chooses between.
    static let freshGroups: [[Muscle]] = [
        [.chest], [.lats, .upperBack], [.shoulders], [.biceps, .triceps], [.quads, .glutes], [.hamstrings, .glutes],
    ]

    /// Major muscle groups that are at least 80% recovered.
    public static func freshGroupNames(recovery: [Muscle: Double]) -> [[Muscle]] {
        freshGroups.filter { group in
            group.map { recovery[$0, default: 1] }.reduce(0, +) / Double(group.count) >= 0.8
        }
    }

    func nextFocus(recovery: [Muscle: Double]) -> (DayFocus, Set<Muscle>) {
        let rotation: [DayFocus]
        switch plan.split {
        case .pushPullLegs: rotation = [.push, .pull, .legs]
        case .upperLower: rotation = [.upper, .lower]
        case .fullBody: rotation = [.fullBody]
        case .freshMuscles: return (.recovered, targetMuscles(for: .recovered, recovery: recovery))
        }
        let focus: DayFocus
        if let last = history.first(where: { $0.focus.map(rotation.contains) ?? false })?.focus,
           let i = rotation.firstIndex(of: last) {
            focus = rotation[(i + 1) % rotation.count]
        } else {
            // No history: start with the freshest day.
            focus = rotation.max { average(recovery, $0.muscles) < average(recovery, $1.muscles) }!
        }
        return (focus, targetMuscles(for: focus, recovery: recovery))
    }

    func targetMuscles(for focus: DayFocus, recovery: [Muscle: Double]) -> Set<Muscle> {
        guard focus == .recovered else { return focus.muscles }
        let top = Self.freshGroups.sorted { average(recovery, Set($0)) > average(recovery, Set($1)) }.prefix(2)
        return Set(top.flatMap { $0 })
    }

    private func average(_ recovery: [Muscle: Double], _ muscles: Set<Muscle>) -> Double {
        muscles.map { recovery[$0, default: 1] }.reduce(0, +) / Double(max(1, muscles.count))
    }

    /// Working sets per muscle over the last 7 days (secondary muscles count half).
    func weeklySets(byID: [String: Exercise], now: Date) -> [Muscle: Double] {
        var sets: [Muscle: Double] = [:]
        for record in history where now.timeIntervalSince(record.date) < 7 * 86_400 {
            for logged in record.exercises {
                guard let e = byID[logged.exerciseID], e.pattern != .mobility else { continue }
                let n = Double(logged.workingSets.count)
                for m in e.primary { sets[m, default: 0] += n }
                for m in e.secondary { sets[m, default: 0] += n * 0.5 }
            }
        }
        return sets
    }

    // MARK: Exercise selection

    public func isEligible(_ e: Exercise) -> Bool {
        guard e.equipment.isSubset(of: gym.equipment) else { return false }
        guard plan.preferences[e.id] != .exclude else { return false }
        guard e.jointsStressed.isDisjoint(with: plan.injuries) else { return false }
        return e.level.rawValue <= plan.experience.rawValue + 1
    }

    private func score(_ e: Exercise, slot: Int, targets: Set<Muscle>, priority: [Muscle: Double],
                       plannedSets: [Muscle: Double], hitsPerMuscle: [Muscle: Int], isolationTargets: Set<Set<Muscle>>,
                       usedPatterns: Set<MovementPattern>,
                       recovery: [Muscle: Double], weekly: [Muscle: Double], scheme: Scheme,
                       now: Date, rng: inout SeededRandom) -> (Double, [String])? {
        let primaryTargets = e.primary.filter(targets.contains)
        guard !primaryTargets.isEmpty else { return nil }
        // Don't let one day's focus drag in exercises that mostly hit other muscles.
        guard primaryTargets.count * 2 >= e.primary.count else { return nil }

        func remaining(_ m: Muscle) -> Double { max(0, 1 - plannedSets[m, default: 0] / scheme.sessionSetCap) }
        var score = 0.0
        for m in primaryTargets { score += priority[m, default: 0] * remaining(m) }
        for m in e.secondary where targets.contains(m) { score += 0.3 * priority[m, default: 0] * remaining(m) }

        if e.isCompound {
            score += scheme.compoundBias * (slot < 2 ? 1 : 0.4)
        } else {
            score += slot >= 2 ? 0.2 : -0.3
        }
        if e.pattern != .isolation && e.pattern != .core && usedPatterns.contains(e.pattern) { score -= 0.6 }
        if e.pattern == .core && plannedSets[.abs, default: 0] > 0 { score -= 0.5 }
        // Spread the session across muscles instead of stacking variations of one.
        let repeats = e.primary.map { hitsPerMuscle[$0, default: 0] }.max() ?? 0
        // A second isolation for the same muscle is rarely worth a slot; a second compound often is.
        let repeatCost = e.isCompound ? 0.3 : Self.minorMuscles.isSuperset(of: e.primary) ? 0.8 : 0.5
        score -= repeatCost * Double(repeats)
        // Never two isolations working exactly the same muscles (e.g. two calf raises).
        if !e.isCompound, isolationTargets.contains(Set(e.primary)) { return nil }
        if e.level > plan.experience { score -= 0.3 }
        // Loaded lifts are easier to progress; prefer them when the gym has gear.
        if e.isBodyweight && !gym.equipment.isEmpty && plan.goal != .reduceBodyweight { score -= 0.5 }

        var reasons: [String] = []
        let lead = primaryTargets.max { priority[$0, default: 0] < priority[$1, default: 0] }!
        reasons.append("\(lead.displayName) \(Int((recovery[lead, default: 1] * 100).rounded()))% recovered · "
                       + "\(Int(weekly[lead, default: 0].rounded()))/\(Int(scheme.weeklySetTarget)) sets this week")

        let fatigued = e.primary.filter { recovery[$0, default: 1] < 0.4 }
        if !fatigued.isEmpty { score -= 0.5 }

        switch plan.preferences[e.id] {
        case .more: score += 0.4; reasons.append("You asked to see this more")
        case .less: score -= 0.4
        default: break
        }

        let daysSince = history.first { $0.exercises.contains { $0.exerciseID == e.id } }
            .map { now.timeIntervalSince($0.date) / 86_400 }
        switch plan.variability {
        case .consistent:
            if let d = daysSince, d < 21 { score += 0.4 }
        case .balanced:
            if let d = daysSince { score += d < 3 ? -0.25 : d < 21 ? 0.15 : 0 }
        case .variable:
            if let d = daysSince, d < 7 { score -= 0.4 } else if daysSince == nil { score += 0.2 }
        }

        let noise: Double = switch plan.variability { case .consistent: 0.05; case .balanced: 0.12; case .variable: 0.25 }
        score += rng.next(in: -noise...noise)
        return (score, reasons)
    }

    private func rank(_ e: Exercise) -> Int {
        e.pattern == .core ? 3 : !e.isCompound ? 2 : e.isBodyweight ? 1 : 0
    }

    // MARK: Prescription

    func prescribe(_ e: Exercise, scheme: Scheme, now: Date, reasons baseReasons: [String]) -> PlannedExercise {
        var reasons = baseReasons
        let past = history.compactMap { $0.exercises.first { $0.exerciseID == e.id } }
        let sessions = past.count
        let range = e.isCompound ? scheme.compoundReps : scheme.isolationReps
        // Undulate heavy → medium → light across sessions of the same exercise.
        let wave = [0.0, 0.5, 1.0][sessions % 3]
        var reps = range.lowerBound + Int((Double(range.upperBound - range.lowerBound) * wave).rounded())
        let setCount = scheme.sets + (e.isCompound ? scheme.compoundExtraSets : 0)
        let rest = e.isCompound ? scheme.restCompound : scheme.restIsolation
        let maxEffort = e.isCompound && !e.isTimed && sessions > 0 && (sessions + 1) % 6 == 0
        if maxEffort { reasons.append("Max effort: go to failure on the last set") }

        if e.isTimed {
            let best = Strength.bestReps(for: e.id, history: history, now: now)
            let seconds = best.map { min($0 + 5, 120) } ?? 30
            // Loaded holds and carries: reuse the last weight, else a moderate share of the starter 1RM.
            let lastWeight = past.first?.workingSets.map(\.weight).max()
            let weight = e.isBodyweight ? nil : round(lastWeight ?? startingOneRM(for: e, now: now) * 0.6, for: e)
            let sets = (0..<max(2, setCount - 1)).map { _ in PlannedSet(weight: weight, reps: seconds, isWarmup: false, isAMRAP: false) }
            return PlannedExercise(exercise: e, sets: sets, restSeconds: 60, targetRIR: scheme.rir, reasons: reasons)
        }

        var weight: Double?
        if e.isBodyweight {
            if let best = Strength.bestReps(for: e.id, history: history, now: now) {
                reps = min(best + 1, 30)
                reasons.append("Best set lately: \(best) reps")
            } else {
                reps = max(range.lowerBound, 8)
            }
        } else {
            var oneRM: Double
            if let known = Strength.estimatedOneRM(for: e.id, history: history, now: now) {
                oneRM = known
                if let last = past.first, let target = last.targetReps, !last.workingSets.isEmpty {
                    let hit = last.workingSets.allSatisfy { $0.reps >= target && ($0.rir ?? scheme.rir) >= scheme.rir }
                    let missed = { (l: LoggedExercise) in l.workingSets.contains { $0.reps < target - 1 } }
                    if hit {
                        oneRM += progressionBump(e)
                        reasons.append("Hit every rep last time, adding weight")
                    } else if past.count >= 2, missed(past[0]), missed(past[1]) {
                        oneRM *= 0.95
                        reasons.append("Missed reps twice, backing off 5%")
                    }
                }
                if let lastDate = history.first(where: { $0.exercises.contains { $0.exerciseID == e.id } })?.date,
                   now.timeIntervalSince(lastDate) > 14 * 86_400 {
                    reasons.append("Easing back in after time off")
                }
            } else {
                oneRM = startingOneRM(for: e, now: now)
                reasons.append("New exercise: starting light, adjust to feel")
            }
            let raw = Strength.weight(forReps: reps, rir: scheme.rir, oneRM: oneRM)
            weight = round(raw, for: e)
        }

        var sets: [PlannedSet] = []
        if plan.warmUpSets, e.isCompound, let top = weight {
            sets += warmups(to: top, reps: reps, exercise: e)
        }
        for i in 0..<setCount {
            sets.append(PlannedSet(weight: weight, reps: reps, isWarmup: false, isAMRAP: maxEffort && i == setCount - 1))
        }
        return PlannedExercise(exercise: e, sets: sets, restSeconds: rest, targetRIR: scheme.rir, reasons: reasons)
    }

    func progressionBump(_ e: Exercise) -> Double {
        guard let eq = e.loadEquipment else { return 0 }
        // One loadable step in working weight is ~1.15x that step in e1RM at moderate reps.
        return gym.incrementKg(for: eq) * 1.15
    }

    func round(_ weight: Double, for e: Exercise) -> Double {
        guard let eq = e.loadEquipment else { return weight }
        return gym.round(weight, for: eq)
    }

    /// No history for this lift: scale from a related lift you have done, else a conservative default.
    func startingOneRM(for e: Exercise, now: Date) -> Double {
        let related = catalog.filter {
            $0.id != e.id && $0.pattern == e.pattern && !$0.isBodyweight && !Set($0.primary).isDisjoint(with: e.primary)
        }
        for r in related {
            if let known = Strength.estimatedOneRM(for: r.id, history: history, now: now) {
                return known * e.starterOneRM / r.starterOneRM * 0.9
            }
        }
        let level: Double = switch plan.experience { case .beginner: 0.6; case .intermediate: 0.85; case .advanced: 1.2 }
        return e.starterOneRM * level
    }

    func warmups(to top: Double, reps: Int, exercise e: Exercise) -> [PlannedSet] {
        let base = e.loadEquipment.map(gym.baseLoadKg) ?? 0
        guard top >= max(40, base * 2) else { return [] }
        var steps: [(Double, Int)] = [(0.5, 8), (0.7, 5)]
        if reps <= 6 { steps.append((0.85, 2)) }
        var seen: Set<Double> = []
        return steps.compactMap { pct, r in
            let w = round(top * pct, for: e)
            guard w < top, seen.insert(w).inserted else { return nil }
            return PlannedSet(weight: w, reps: r, isWarmup: true, isAMRAP: false)
        }
    }

    /// Minutes a list of exercises takes, including rest and warm-ups. Recompute after edits.
    public static func estimatedMinutes(for exercises: [PlannedExercise]) -> Int {
        Int((Double(exercises.map(seconds(for:)).reduce(0, +)) / 60).rounded())
    }

    static func seconds(for p: PlannedExercise) -> Int {
        let working = p.workingSets.count * (40 + p.restSeconds)
        let warm = (p.sets.count - p.workingSets.count) * 75
        return working + warm + 60
    }
}

// MARK: - Goal schemes

struct Scheme {
    var compoundReps: ClosedRange<Int>
    var isolationReps: ClosedRange<Int>
    var sets: Int
    var compoundExtraSets: Int
    var rir: Int
    var restCompound: Int
    var restIsolation: Int
    var weeklySetTarget: Double
    var sessionSetCap: Double
    var compoundBias: Double

    init(goal: Goal, experience: Level) {
        switch goal {
        case .getStronger:
            self.init(compoundReps: 3...6, isolationReps: 8...12, sets: 3, compoundExtraSets: 1, rir: 2,
                      restCompound: 180, restIsolation: 90, weeklySetTarget: 10, sessionSetCap: 6, compoundBias: 0.8)
        case .powerlifting:
            self.init(compoundReps: 1...5, isolationReps: 8...12, sets: 3, compoundExtraSets: 2, rir: 2,
                      restCompound: 240, restIsolation: 90, weeklySetTarget: 10, sessionSetCap: 7, compoundBias: 0.9)
        case .buildMuscle:
            self.init(compoundReps: 6...10, isolationReps: 10...15, sets: 3, compoundExtraSets: 1, rir: 2,
                      restCompound: 120, restIsolation: 75, weeklySetTarget: 14, sessionSetCap: 8, compoundBias: 0.4)
        case .getLean:
            self.init(compoundReps: 8...12, isolationReps: 12...15, sets: 3, compoundExtraSets: 0, rir: 2,
                      restCompound: 75, restIsolation: 60, weeklySetTarget: 12, sessionSetCap: 7, compoundBias: 0.3)
        case .improveFitness:
            self.init(compoundReps: 8...12, isolationReps: 12...15, sets: 3, compoundExtraSets: 0, rir: 3,
                      restCompound: 60, restIsolation: 45, weeklySetTarget: 9, sessionSetCap: 6, compoundBias: 0.3)
        case .reduceBodyweight:
            self.init(compoundReps: 12...15, isolationReps: 15...20, sets: 3, compoundExtraSets: 0, rir: 3,
                      restCompound: 45, restIsolation: 30, weeklySetTarget: 9, sessionSetCap: 6, compoundBias: 0.3)
        }
        switch experience {
        case .beginner: sets = max(2, sets - 1); compoundExtraSets = min(compoundExtraSets, 1); rir += 1
        case .advanced: compoundExtraSets += 1
        case .intermediate: break
        }
    }

    init(compoundReps: ClosedRange<Int>, isolationReps: ClosedRange<Int>, sets: Int, compoundExtraSets: Int, rir: Int,
         restCompound: Int, restIsolation: Int, weeklySetTarget: Double, sessionSetCap: Double, compoundBias: Double) {
        self.compoundReps = compoundReps; self.isolationReps = isolationReps; self.sets = sets
        self.compoundExtraSets = compoundExtraSets; self.rir = rir; self.restCompound = restCompound
        self.restIsolation = restIsolation; self.weeklySetTarget = weeklySetTarget
        self.sessionSetCap = sessionSetCap; self.compoundBias = compoundBias
    }
}

// MARK: - Deterministic randomness

/// SplitMix64, so the same seed regenerates the same workout.
struct SeededRandom {
    private var state: UInt64
    init(seed: UInt64) { state = seed &+ 0x9E37_79B9_7F4A_7C15 }

    mutating func nextUInt64() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }

    mutating func next(in range: ClosedRange<Double>) -> Double {
        let unit = Double(nextUInt64() >> 11) / Double(1 << 53)
        return range.lowerBound + unit * (range.upperBound - range.lowerBound)
    }
}
