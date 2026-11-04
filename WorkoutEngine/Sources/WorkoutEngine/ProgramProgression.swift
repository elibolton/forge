import Foundation

/// What to load and aim for on a program exercise this week, and why.
public struct ProgressionSuggestion: Codable, Hashable, Sendable {
    public enum Action: Codable, Hashable, Sendable {
        /// Big-jump rule: the next load step is more than ~10%, so add reps to the top of the range first.
        case extendRange(by: Int)
        /// The extended range was reached and load went up: back to the normal range.
        case resetRange
        /// Stall rule: no progress for 2 weeks, cut a set.
        case dropSet
    }

    /// kg; nil for bodyweight or lowering-only work.
    public var weight: Double?
    /// Target reps per working set.
    public var reps: Int
    /// The range this week, including any big-jump extension.
    public var range: RepRange
    public var reason: String
    public var action: Action?
}

/// Double progression for program exercises. Each exercise appears once a week, so this compares
/// against the most recent session of the same exercise (preferring the same program slot).
public enum ProgramProgression {
    /// Load added once every set reaches the top of the range, in kg.
    public static func stepKg(_ step: LoadStep, exercise: Exercise, gym: Gym) -> Double {
        switch step {
        case .lowerBodyBarbell: gym.usesPounds ? 10 / Units.poundsPerKg : 5
        case .upperBarbell: gym.usesPounds ? 5 / Units.poundsPerKg : 2.5
        case .dumbbell: gym.incrementKg(for: .dumbbell)
        case .cablePin: gym.incrementKg(for: exercise.loadEquipment ?? .cable)
        case .bodyweight: 0
        }
    }

    /// Rounds to something loadable; exercises with no load equipment (a held plate) use 2.5 kg / 5 lb.
    public static func round(_ kg: Double, exercise: Exercise, gym: Gym) -> Double {
        if let eq = exercise.loadEquipment { return gym.round(kg, for: eq) }
        if gym.usesPounds { return Strength.round(kg * Units.poundsPerKg, increment: 5, base: 0) / Units.poundsPerKg }
        return Strength.round(kg, increment: 2.5, base: 0)
    }

    public static func suggest(_ p: ResolvedPrescription, progress: ProgramProgress? = nil, history: [WorkoutRecord],
                               gym: Gym, plan: UserPlan = UserPlan(), now: Date = .now) -> ProgressionSuggestion {
        let e = p.exercise
        let fmt = { (kg: Double) in format(kg, pounds: gym.usesPounds) }
        let ext = p.isDeload ? 0 : (progress?.rangeExtensions[p.slot.id] ?? 0)
        let range = RepRange(p.reps.lower, p.reps.upper + ext)
        let loaded = p.slot.loadStep != .bodyweight && !e.isBodyweight
        let rir = p.effort.rir

        let past = pastSessions(of: p, history: history)
        guard let last = past.first?.logged else {
            guard loaded else {
                let reason = p.effort == .eccentricOnly
                    ? "Lower as slowly as you can; end the set when you lose control"
                    : "First session: aim for \(range.lower)+ reps"
                return ProgressionSuggestion(weight: nil, reps: range.lower, range: range, reason: reason)
            }
            let known = Strength.estimatedOneRM(for: e.id, history: history, now: now)
            let oneRM = known ?? Planner(plan: plan, gym: gym, history: history).startingOneRM(for: e, now: now)
            let weight = round(Strength.weight(forReps: range.lower, rir: rir?.high ?? 2, oneRM: oneRM), exercise: e, gym: gym)
            let source = known == nil ? "Starting guess" : "From your history"
            return ProgressionSuggestion(weight: weight, reps: range.lower, range: range,
                                         reason: "\(source): adjust so set 1 lands at \(range.lower) reps with RIR \(rir?.text ?? "2")")
        }

        let working = last.workingSets
        let lastLoad = working.map(\.weight).max() ?? 0
        let repsList = working.map { "\($0.reps)" }.joined(separator: ", ")

        if p.isDeload {
            return ProgressionSuggestion(weight: loaded ? lastLoad : nil, reps: range.lower, range: range,
                                         reason: loaded ? "Deload: same load or up to 10% lighter, stop with reps to spare"
                                                        : "Deload: easy reps, nowhere near failure")
        }

        let targetRIR = last.targetRIR ?? rir?.low ?? 0
        let allTop = !working.isEmpty && working.allSatisfy { $0.reps >= range.upper && ($0.rir ?? targetRIR) >= targetRIR }
        let minReps = working.map(\.reps).min() ?? 0

        var s: ProgressionSuggestion
        if !loaded {
            if allTop {
                s = ProgressionSuggestion(weight: nil, reps: range.upper, range: range,
                                          reason: p.effort == .eccentricOnly ? "Top of the range last time: lower even slower"
                                                                             : "Top of the range last time: slow the reps down")
            } else {
                let reps = min(range.upper, max(range.lower, minReps + 1))
                s = ProgressionSuggestion(weight: nil, reps: reps, range: range, reason: "Aim for \(reps)+ on every set (last: \(repsList))")
            }
        } else if allTop {
            let step = stepKg(p.slot.loadStep, exercise: e, gym: gym)
            if ext == 0, lastLoad > 0, step > lastLoad * 0.10 {
                let extended = RepRange(p.reps.lower, p.reps.upper + 4)
                s = ProgressionSuggestion(weight: lastLoad, reps: min(extended.upper, range.upper + 1), range: extended,
                                          reason: "Next jump (+\(fmt(step))) is over 10% of the load: extend to \(extended.text) reps first",
                                          action: .extendRange(by: 4))
            } else {
                let next = round(lastLoad + step, exercise: e, gym: gym)
                let base = RepRange(p.reps.lower, p.reps.upper)
                s = ProgressionSuggestion(weight: next, reps: base.lower, range: base,
                                          reason: "Top of the range on every set: +\(fmt(next - lastLoad))",
                                          action: ext > 0 ? .resetRange : nil)
            }
        } else {
            let reps = min(range.upper, max(range.lower, minReps + 1))
            let reason = minReps < range.lower
                ? "Below the range last time (\(repsList)): keep the load, build back up"
                : "Add reps first: aim for \(reps)+ on every set (last: \(repsList))"
            s = ProgressionSuggestion(weight: lastLoad, reps: reps, range: range, reason: reason)
        }

        if s.action == nil, p.sets > 1, (progress?.setAdjustments[p.slot.id] ?? 0) == 0,
           isStalled(past.filter { !$0.isDeload && $0.slotMatches }.map(\.logged)) {
            s.action = .dropSet
            s.reason += " · No progress for 2 weeks: drop a set"
        }
        return s
    }

    /// No load or rep gain across the last two week-to-week comparisons. `sessions` is newest first.
    public static func isStalled(_ sessions: [LoggedExercise]) -> Bool {
        guard sessions.count >= 3 else { return false }
        func progressed(_ newer: LoggedExercise, _ older: LoggedExercise) -> Bool {
            let a = newer.workingSets.map(\.weight).max() ?? 0, b = older.workingSets.map(\.weight).max() ?? 0
            if a > b + 0.01 { return true }
            if a < b - 0.01 { return false }
            return newer.workingSets.map(\.reps).reduce(0, +) > older.workingSets.map(\.reps).reduce(0, +)
        }
        return !progressed(sessions[0], sessions[1]) && !progressed(sessions[1], sessions[2])
    }

    struct Past { var logged: LoggedExercise; var isDeload: Bool; var slotMatches: Bool }

    /// Newest first; same slot preferred, then the same exercise logged anywhere.
    static func pastSessions(of p: ResolvedPrescription, history: [WorkoutRecord]) -> [Past] {
        let all = history.sorted { $0.date > $1.date }.compactMap { record -> Past? in
            guard let logged = record.exercises.first(where: { $0.exerciseID == p.exerciseID && !$0.workingSets.isEmpty })
            else { return nil }
            return Past(logged: logged, isDeload: record.program?.isDeload ?? false, slotMatches: logged.slotID == p.slot.id)
        }
        let sameSlot = all.filter(\.slotMatches)
        return sameSlot.isEmpty ? all : sameSlot
    }

    static func format(_ kg: Double, pounds: Bool) -> String {
        let v = ((pounds ? kg * Units.poundsPerKg : kg) * 2).rounded() / 2
        return "\(v.formatted(.number.precision(.fractionLength(0...1)))) \(pounds ? "lb" : "kg")"
    }

    // MARK: Fatigue

    /// Slots where reps dropped at the same load compared with the week before.
    public static func repsDropped(history: [WorkoutRecord], programID: String, week: Int) -> [String] {
        guard week > 1 else { return [] }
        func byWeek(_ w: Int) -> [String: LoggedExercise] {
            var out: [String: LoggedExercise] = [:]
            for r in history where r.program?.programID == programID && r.program?.week == w && r.program?.isDeload != true {
                for l in r.exercises where !l.workingSets.isEmpty { out[l.slotID ?? l.exerciseID] = l }
            }
            return out
        }
        let this = byWeek(week), before = byWeek(week - 1)
        return this.compactMap { key, now in
            guard let prev = before[key] else { return nil }
            let a = now.workingSets.map(\.weight).max() ?? 0, b = prev.workingSets.map(\.weight).max() ?? 0
            guard abs(a - b) < 0.01 else { return nil }
            let repsNow = now.workingSets.map(\.reps), repsPrev = prev.workingSets.map(\.reps)
            // Compare like for like when a set was cut.
            let n = min(repsNow.count, repsPrev.count)
            return repsNow.prefix(n).reduce(0, +) < repsPrev.prefix(n).reduce(0, +) ? key : nil
        }.sorted()
    }

    /// The automatic flag: reps dropped at the same load on 2+ exercises.
    public static func repsDroppedFlag(history: [WorkoutRecord], programID: String, week: Int) -> Bool {
        repsDropped(history: history, programID: programID, week: week).count >= 2
    }
}

extension Planner {
    /// Warm-up ramp to a working weight, for program sessions.
    public func warmupSets(to top: Double, reps: Int, exercise: Exercise) -> [PlannedSet] {
        plan.warmUpSets && exercise.isCompound ? warmups(to: top, reps: reps, exercise: exercise) : []
    }
}
