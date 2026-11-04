import Foundation
import Observation
import SwiftData
import UserNotifications
import WorkoutEngine

struct SessionSet: Codable, Identifiable, Hashable {
    var id = UUID()
    /// kg; nil for bodyweight.
    var weight: Double?
    var reps: Int
    var isWarmup: Bool
    var isAMRAP: Bool
    var done = false
    /// For per-arm and per-leg work.
    var side: Side?

    init(weight: Double?, reps: Int, isWarmup: Bool, isAMRAP: Bool, done: Bool = false, side: Side? = nil) {
        self.weight = weight; self.reps = reps; self.isWarmup = isWarmup; self.isAMRAP = isAMRAP; self.done = done
        self.side = side
    }

    private enum CodingKeys: String, CodingKey { case id, weight, reps, isWarmup, isAMRAP, done, side }

    // Defaults for every field so an in-progress workout survives app updates.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.value(.id, or: UUID())
        weight = c.value(.weight, or: nil)
        reps = c.value(.reps, or: 0)
        isWarmup = c.value(.isWarmup, or: false)
        isAMRAP = c.value(.isAMRAP, or: false)
        done = c.value(.done, or: false)
        side = c.value(.side, or: nil)
    }
}

/// The program prescription behind a session exercise.
struct ProgramSlotInfo: Codable, Hashable {
    var slotID: String
    var label: String?
    var range: RepRange
    var effort: Effort
    var setsText: String
    var effortText: String
    var restText: String
    var notes: [String]
    var lastSetNote: String?
    var laterality: Laterality
    var sideRest: Int?
    var supersetGroup: String?
    /// Set on the first exercise of a superset pair.
    var supersetRestBetween: Int?
    var isOptional: Bool
    var suggestionReason: String?

    var isEccentric: Bool { effort == .eccentricOnly }
}

struct SessionExercise: Codable, Identifiable, Hashable {
    var id = UUID()
    var exerciseID: String
    var sets: [SessionSet]
    var restSeconds: Int
    var targetRIR: Int
    var targetReps: Int?
    var rir: Int?
    var reasons: [String]
    var program: ProgramSlotInfo?

    var exercise: Exercise { Catalog.exercise(exerciseID) }
    /// All working sets done; skipped warm-ups don't count against it.
    var isComplete: Bool {
        let working = sets.filter { !$0.isWarmup }
        return !working.isEmpty && working.allSatisfy(\.done)
    }

    init(_ planned: PlannedExercise) {
        exerciseID = planned.exercise.id
        sets = planned.sets.map { SessionSet(weight: $0.weight, reps: $0.reps, isWarmup: $0.isWarmup, isAMRAP: $0.isAMRAP) }
        restSeconds = planned.restSeconds
        targetRIR = planned.targetRIR
        targetReps = planned.workingSets.first?.reps
        reasons = planned.reasons
    }

    init(exerciseID: String, sets: [SessionSet], restSeconds: Int, targetRIR: Int, targetReps: Int?,
         reasons: [String], program: ProgramSlotInfo?) {
        self.exerciseID = exerciseID; self.sets = sets; self.restSeconds = restSeconds; self.targetRIR = targetRIR
        self.targetReps = targetReps; self.reasons = reasons; self.program = program
    }

    private enum CodingKeys: String, CodingKey { case id, exerciseID, sets, restSeconds, targetRIR, targetReps, rir, reasons, program }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.value(.id, or: UUID())
        exerciseID = try c.decode(String.self, forKey: .exerciseID)
        sets = c.lossyArray(.sets)
        restSeconds = c.value(.restSeconds, or: 90)
        targetRIR = c.value(.targetRIR, or: 2)
        targetReps = c.value(.targetReps, or: nil)
        rir = c.value(.rir, or: nil)
        reasons = c.value(.reasons, or: [])
        program = c.value(.program, or: nil)
    }
}

struct SessionState: Codable {
    var startedAt: Date
    var focus: DayFocus?
    var exercises: [SessionExercise]
    /// The exercise shown in the logger.
    var currentIndex = 0
    /// Set when this workout is a program day.
    var program: ProgramRef?
    /// Shown as the logger's title for program days, e.g. "Week 2 · Pull".
    var title: String?

    init(startedAt: Date, focus: DayFocus?, exercises: [SessionExercise], program: ProgramRef? = nil, title: String? = nil) {
        self.startedAt = startedAt; self.focus = focus; self.exercises = exercises; self.program = program; self.title = title
    }

    private enum CodingKeys: String, CodingKey { case startedAt, focus, exercises, currentIndex, program, title }

    // Fields added later decode with defaults so an in-progress workout survives app updates.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        startedAt = try c.decode(Date.self, forKey: .startedAt)
        focus = c.value(.focus, or: nil)
        exercises = c.lossyArray(.exercises)
        currentIndex = c.value(.currentIndex, or: 0)
        program = c.value(.program, or: nil)
        title = c.value(.title, or: nil)
    }

    /// Working sets not yet logged.
    var pendingSetCount: Int { exercises.flatMap(\.sets).filter { !$0.isWarmup && !$0.done }.count }
}

struct FinishedWorkout: Identifiable {
    let id = UUID()
    let records: [PersonalRecord]
}

struct PersonalRecord: Identifiable {
    var id: String { exercise.id }
    var exercise: Exercise
    var oneRM: Double
    var previous: Double
}

/// The workout in progress. Saved to UserDefaults on every change so it survives the app being killed.
@Observable
final class WorkoutSession {
    private static let key = "activeSession"

    var state: SessionState? {
        didSet { persist() }
    }
    var restEndsAt: Date?
    var restTotal: Int = 0
    /// Set after finishing, for the summary sheet.
    var finished: FinishedWorkout?
    /// Full-screen logger vs. the minimized bar over the tabs.
    var isExpanded = true

    init() {
        if let data = UserDefaults.standard.data(forKey: Self.key) {
            // On failure JSON.decode keeps a backup of the raw session before it can be overwritten.
            state = JSON.decode(data, label: "session")
        }
    }

    var isActive: Bool { state != nil }

    func start(_ workout: PlannedWorkout) {
        requestNotificationPermission()
        state = SessionState(startedAt: .now, focus: workout.focus, exercises: workout.exercises.map(SessionExercise.init))
        isExpanded = true
    }

    /// Starts a prepared session (a program day).
    func start(_ prepared: SessionState) {
        requestNotificationPermission()
        state = prepared
        isExpanded = true
    }

    /// Brings back a discarded session (Undo).
    func restore(_ snapshot: SessionState) {
        state = snapshot
        isExpanded = true
    }

    /// Marks a working set done, carries its weight to the remaining sets and starts rest.
    func logSet(_ setID: UUID, in exerciseID: UUID) {
        guard let e = state?.exercises.firstIndex(where: { $0.id == exerciseID }),
              let s = state?.exercises[e].sets.firstIndex(where: { $0.id == setID }),
              var exercise = state?.exercises[e] else { return }
        let wasDone = exercise.sets[s].done
        exercise.sets[s].done = true
        if !exercise.sets[s].isWarmup {
            for j in exercise.sets.indices where j > s && !exercise.sets[j].isWarmup && !exercise.sets[j].done {
                exercise.sets[j].weight = exercise.sets[s].weight
            }
        }
        state?.exercises[e] = exercise
        guard !wasDone && !exercise.sets[s].isWarmup else { return }
        guard let info = exercise.program else { return startRest(exercise.restSeconds) }

        // First side of a per-side set: short (or no) rest, then the other side.
        if info.laterality.isPerSide, exercise.sets[s].side == .left,
           exercise.sets.contains(where: { $0.side == .right && !$0.done && !$0.isWarmup }) {
            if let side = info.sideRest, side > 0 { startRest(side) }
            return
        }
        // Supersets: alternate between the pair, short rest in between, full rest after the pair.
        if let group = info.supersetGroup, let exercises = state?.exercises,
           let partner = exercises.indices.first(where: { $0 != e && exercises[$0].program?.supersetGroup == group }) {
            let isFirst = info.supersetRestBetween != nil
            startRest(isFirst ? (info.supersetRestBetween ?? exercise.restSeconds) : exercise.restSeconds)
            let partnerPending = exercises[partner].sets.contains { !$0.isWarmup && !$0.done }
            if partnerPending { state?.currentIndex = partner }
            return
        }
        startRest(exercise.restSeconds)
    }

    /// Logs every remaining working set as planned (from the finish review).
    func logRemainingAsPlanned() {
        guard var exercises = state?.exercises else { return }
        for e in exercises.indices {
            for s in exercises[e].sets.indices where !exercises[e].sets[s].isWarmup { exercises[e].sets[s].done = true }
        }
        state?.exercises = exercises
    }

    func startEmpty() {
        requestNotificationPermission()
        state = SessionState(startedAt: .now, focus: nil, exercises: [])
        isExpanded = true
    }

    func startRest(_ seconds: Int) {
        restTotal = seconds
        restEndsAt = .now.addingTimeInterval(TimeInterval(seconds))
        scheduleRestNotification()
    }

    func extendRest(by seconds: Int) {
        guard let end = restEndsAt else { return }
        restEndsAt = end.addingTimeInterval(TimeInterval(seconds))
        restTotal += seconds
        scheduleRestNotification()
    }

    func skipRest() {
        restEndsAt = nil
        cancelRestNotification()
    }

    func discard() {
        state = nil
        restEndsAt = nil
        cancelRestNotification()
    }

    // MARK: Rest notification (fires when the app is in the background or the phone is locked)

    private static let restNotificationID = "rest-timer"

    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    private func scheduleRestNotification() {
        cancelRestNotification()
        guard let end = restEndsAt, end > .now else { return }
        let content = UNMutableNotificationContent()
        content.title = "Rest's up"
        content.body = "Time for your next set."
        content.sound = .default
        content.interruptionLevel = .timeSensitive
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: end.timeIntervalSinceNow, repeats: false)
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: Self.restNotificationID, content: content, trigger: trigger))
    }

    private func cancelRestNotification() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [Self.restNotificationID])
    }

    /// Saves completed sets and returns any new personal records.
    @discardableResult
    /// - Parameter bestOneRM: previous best per exercise, from `HistoryStore`.
    func finish(context: ModelContext, bestOneRM: [String: Double]) -> [PersonalRecord] {
        guard let state else { return [] }
        let logged: [LoggedExercise] = state.exercises.compactMap { ex in
            let sets = ex.sets.filter(\.done).map { set in
                LoggedSet(weight: set.weight ?? 0, reps: set.reps, rir: set.isWarmup || ex.program?.isEccentric == true ? nil : ex.rir,
                          isWarmup: set.isWarmup, side: set.side)
            }
            return sets.isEmpty ? nil : LoggedExercise(exerciseID: ex.exerciseID, sets: sets, targetReps: ex.targetReps,
                                                       slotID: ex.program?.slotID, repRange: ex.program?.range,
                                                       targetRIR: ex.program?.effort.rir?.low)
        }

        var records: [PersonalRecord] = []
        for ex in logged {
            let best = ex.workingSets.filter { $0.weight > 0 }.map { Strength.oneRM(weight: $0.weight, reps: $0.reps, rir: $0.rir) }.max() ?? 0
            let previous = bestOneRM[ex.exerciseID]
            if let previous, best > previous * 1.005, case let exercise = Catalog.exercise(ex.exerciseID) {
                records.append(PersonalRecord(exercise: exercise, oneRM: best, previous: previous))
            }
        }

        if !logged.isEmpty {
            let duration = Int(Date.now.timeIntervalSince(state.startedAt))
            context.insert(WorkoutLog(date: state.startedAt, focus: state.focus, durationSeconds: duration, exercises: logged,
                                      program: state.program))
            try? context.save()
        }
        discard()
        finished = FinishedWorkout(records: records)
        return records
    }

    private func persist() {
        if let state {
            UserDefaults.standard.set(JSON.encode(state), forKey: Self.key)
        } else {
            UserDefaults.standard.removeObject(forKey: Self.key)
        }
    }
}
