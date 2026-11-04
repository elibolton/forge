import Foundation
import WorkoutEngine

/// Day-of changes to a program day (swaps and skipped exercises). They apply only to that week's day.
struct ProgramDayEdits: Codable, Equatable {
    var key: String
    /// Slot id → replacement exercise id.
    var swaps: [String: String] = [:]
    var removed: [String] = []

    static func key(programID: String, week: Int, dayID: String) -> String { "\(programID)|\(week)|\(dayID)" }
}

enum ProgramDayEditsStore {
    private static let storageKey = "programDayEdits"

    static func load(key: String) -> ProgramDayEdits {
        let stored = UserDefaults.standard.data(forKey: storageKey).flatMap { try? JSONDecoder().decode(ProgramDayEdits.self, from: $0) }
        return stored?.key == key ? stored! : ProgramDayEdits(key: key)
    }

    static func save(_ edits: ProgramDayEdits) {
        UserDefaults.standard.set(JSON.encode(edits), forKey: storageKey)
    }
}

/// One exercise of today's program day with its suggestion.
struct ProgramDayItem: Identifiable {
    var prescription: ResolvedPrescription
    var suggestion: ProgressionSuggestion
    var isSwapped: Bool

    var id: String { prescription.slot.id }
    var exercise: Exercise { prescription.exercise }

    /// Working sets the logger will show (per-side work counts each side).
    var loggedSetCount: Int { prescription.sets * (prescription.slot.laterality.isPerSide ? 2 : 1) }
}

/// Today's program day, resolved and ready to show or start.
struct ProgramDayPlan {
    let program: WorkoutProgram
    let progress: ProgramProgress
    let session: ResolvedSession
    let items: [ProgramDayItem]
    let removed: [ResolvedPrescription]

    var ref: ProgramRef {
        ProgramRef(programID: program.id, week: session.week, dayID: session.day.id, isDeload: session.rule.isDeload)
    }

    var title: String { "Week \(session.week) · \(session.day.title)" }

    var estimatedMinutes: Int {
        let seconds = items.reduce(0) { total, item in
            let p = item.prescription
            let sideRest = p.slot.laterality.isPerSide ? p.sets * (p.slot.sideRest ?? 0) : 0
            return total + item.loggedSetCount * 40 + p.sets * p.restSeconds + sideRest + 60
        }
        return Int((Double(seconds) / 60).rounded())
    }

    static func make(program: WorkoutProgram, progress: ProgramProgress, dayID: String? = nil, history: [WorkoutRecord],
                     profile: Profile) -> ProgramDayPlan? {
        guard let dayID = dayID ?? progress.nextDayID(in: program),
              var session = program.session(dayID: dayID, week: progress.week, setAdjustments: progress.setAdjustments)
        else { return nil }
        let edits = ProgramDayEditsStore.load(key: ProgramDayEdits.key(programID: program.id, week: progress.week, dayID: dayID))
        for i in session.exercises.indices {
            if let swap = edits.swaps[session.exercises[i].slot.id] { session.exercises[i].slot.exerciseID = swap }
        }
        let gym = profile.activeGym
        let kept = session.exercises.filter { !edits.removed.contains($0.slot.id) }
        let items = kept.map { p in
            ProgramDayItem(prescription: p,
                           suggestion: ProgramProgression.suggest(p, progress: progress, history: history, gym: gym, plan: profile.plan),
                           isSwapped: edits.swaps[p.slot.id] != nil)
        }
        return ProgramDayPlan(program: program, progress: progress, session: session, items: items,
                              removed: session.exercises.filter { edits.removed.contains($0.slot.id) })
    }

    /// Logger state for this day, and the progress with big-jump range changes applied.
    func start(profile: Profile, history: [WorkoutRecord]) -> (SessionState, ProgramProgress) {
        var progress = self.progress
        let planner = profile.planner(history: history)
        let exercises = items.map { item -> SessionExercise in
            let p = item.prescription, s = item.suggestion, e = item.exercise
            switch s.action {
            case let .extendRange(by): progress.rangeExtensions[p.slot.id] = by
            case .resetRange: progress.rangeExtensions[p.slot.id] = nil
            default: break
            }
            var sets: [SessionSet] = []
            let perSide = p.slot.laterality.isPerSide
            if let w = s.weight, !perSide {
                sets += planner.warmupSets(to: w, reps: s.reps, exercise: e)
                    .map { SessionSet(weight: $0.weight, reps: $0.reps, isWarmup: true, isAMRAP: false) }
            }
            for _ in 0..<p.sets {
                if perSide {
                    sets.append(SessionSet(weight: s.weight, reps: s.reps, isWarmup: false, isAMRAP: false, side: .left))
                    sets.append(SessionSet(weight: s.weight, reps: s.reps, isWarmup: false, isAMRAP: false, side: .right))
                } else {
                    sets.append(SessionSet(weight: s.weight, reps: s.reps, isWarmup: false, isAMRAP: false))
                }
            }
            let info = ProgramSlotInfo(slotID: p.slot.id, label: p.slot.label, range: s.range, effort: p.effort,
                                       setsText: p.setsText, effortText: p.effortText, restText: p.restText,
                                       notes: p.slot.notes + [p.weekNote].compactMap { $0 }, lastSetNote: p.lastSetNote,
                                       laterality: p.slot.laterality, sideRest: p.slot.sideRest,
                                       supersetGroup: p.slot.supersetGroup, supersetRestBetween: p.supersetRestBetween,
                                       isOptional: p.slot.isOptional, suggestionReason: s.reason)
            return SessionExercise(exerciseID: e.id, sets: sets, restSeconds: p.restSeconds, targetRIR: p.effort.rir?.low ?? 0,
                                   targetReps: s.reps, reasons: [s.reason], program: info)
        }
        return (SessionState(startedAt: .now, focus: session.day.focus, exercises: exercises, program: ref, title: title), progress)
    }
}
