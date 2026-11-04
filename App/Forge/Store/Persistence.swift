import Foundation
import OSLog
import SwiftData
import WorkoutEngine

// Engine types are stored as JSON blobs so the engine stays free of SwiftData.
// Adding a stored property to these models needs a default value so SwiftData can migrate automatically.

@Model
final class Profile {
    var planData: Data
    var gymsData: Data
    var overridesData: Data
    var activeGymID: UUID
    var usesPounds: Bool
    var createdAt: Date
    /// User-made exercises. Has a default so existing stores migrate automatically.
    var customExercisesData: Data = Data()
    /// The active program and where you are in it; empty when none. Defaulted so stores migrate.
    var programData: Data = Data()

    init(plan: UserPlan, gyms: [Gym], usesPounds: Bool) {
        planData = JSON.encode(plan)
        gymsData = JSON.encode(gyms)
        overridesData = JSON.encode([RecoveryOverride]())
        activeGymID = gyms.first?.id ?? UUID()
        self.usesPounds = usesPounds
        createdAt = .now
    }

    var plan: UserPlan {
        get { JSON.decode(planData, label: "plan") ?? UserPlan() }
        set { planData = JSON.encode(newValue) }
    }

    var gyms: [Gym] {
        get {
            let gyms = JSON.decodeList(Gym.self, from: gymsData, label: "gyms")
            return gyms.isEmpty ? [.commercial] : gyms
        }
        set { gymsData = JSON.encode(newValue) }
    }

    var overrides: [RecoveryOverride] {
        get { JSON.decodeList(RecoveryOverride.self, from: overridesData, label: "overrides") }
        set { overridesData = JSON.encode(newValue) }
    }

    var customExercises: [Exercise] {
        get { customExercisesData.isEmpty ? [] : JSON.decodeList(Exercise.self, from: customExercisesData, label: "customExercises") }
        set {
            customExercisesData = JSON.encode(newValue)
            Catalog.setCustom(newValue)
        }
    }

    /// Adds or replaces (same id) a custom exercise and makes it available everywhere immediately.
    func saveCustomExercise(_ exercise: Exercise) {
        var list = customExercises
        if let i = list.firstIndex(where: { $0.id == exercise.id }) { list[i] = exercise } else { list.append(exercise) }
        customExercises = list
    }

    var programProgress: ProgramProgress? {
        get { programData.isEmpty ? nil : JSON.decode(programData, label: "program") }
        set { programData = newValue.map { JSON.encode($0) } ?? Data() }
    }

    /// The active program, unless it's finished.
    var activeProgram: (program: WorkoutProgram, progress: ProgramProgress)? {
        guard let progress = programProgress, !progress.isFinished, let program = progress.program else { return nil }
        return (program, progress)
    }

    /// Marks a logged program day done and moves the program on.
    func completeProgramDay(_ ref: ProgramRef) {
        guard var progress = programProgress, progress.programID == ref.programID, let program = progress.program else { return }
        progress.complete(ref.dayID, week: ref.week, in: program)
        programProgress = progress
    }

    var activeGym: Gym {
        gyms.first { $0.id == activeGymID } ?? gyms.first ?? .commercial
    }

    var units: WeightUnits { WeightUnits(pounds: usesPounds) }

    /// Pass `HistoryStore.records`; decoding logs here on every call was the app's main cost.
    func planner(history: [WorkoutRecord], minutes: Int? = nil) -> Planner {
        var plan = self.plan
        if let minutes { plan.sessionMinutes = minutes }
        return Planner(plan: plan, gym: activeGym, history: history, overrides: overrides)
    }
}

@Model
final class WorkoutLog {
    var date: Date
    var focusRaw: String?
    var durationSeconds: Int
    var exercisesData: Data
    /// The program day this was, if any. Defaulted so stores migrate.
    var programData: Data = Data()

    init(date: Date, focus: DayFocus?, durationSeconds: Int, exercises: [LoggedExercise], program: ProgramRef? = nil) {
        self.date = date
        focusRaw = focus?.rawValue
        self.durationSeconds = durationSeconds
        exercisesData = JSON.encode(exercises)
        programData = program.map { JSON.encode($0) } ?? Data()
    }

    var program: ProgramRef? {
        programData.isEmpty ? nil : JSON.decode(programData, label: "workout-program-\(Int(date.timeIntervalSince1970))")
    }

    var exercises: [LoggedExercise] {
        get { JSON.decodeList(LoggedExercise.self, from: exercisesData, label: "workout-\(Int(date.timeIntervalSince1970))") }
        set { exercisesData = JSON.encode(newValue) }
    }

    var focus: DayFocus? { focusRaw.flatMap(DayFocus.init) }

    var record: WorkoutRecord { WorkoutRecord(date: date, focus: focus, exercises: exercises, program: program) }

    /// Total weight moved in working sets (kg).
    var volume: Double {
        exercises.flatMap(\.workingSets).reduce(0) { $0 + $1.weight * Double($1.reps) }
    }
}

enum JSON {
    private static let log = Logger(subsystem: "com.elibolton.forge", category: "storage")

    static func encode<T: Encodable>(_ value: T) -> Data { (try? JSONEncoder().encode(value)) ?? Data() }

    /// Decodes stored data. If it can't be read, the raw bytes are copied to a backup first,
    /// so a later save of default values never destroys the only copy.
    static func decode<T: Decodable>(_ data: Data, label: String) -> T? {
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            backUp(data, label: label, error: error)
            return nil
        }
    }

    /// Decodes a stored list, skipping individual entries that can't be read.
    static func decodeList<T: Decodable>(_ type: T.Type, from data: Data, label: String) -> [T] {
        (decode(data, label: label) as LossyArray<T>?)?.elements ?? []
    }

    static func backUp(_ data: Data, label: String, error: Error) {
        guard !data.isEmpty else { return }
        let key = "unreadable.\(label)"
        // Keep the first unreadable copy; it's the one that still holds the original data.
        if UserDefaults.standard.data(forKey: key) == nil {
            UserDefaults.standard.set(data, forKey: key)
        }
        log.error("Couldn't read stored \(label, privacy: .public): \(String(describing: error), privacy: .public). Raw data kept under \(key, privacy: .public).")
    }

    // Kept for call sites that store their own types.
    static func decode<T: Decodable>(_ data: Data) -> T? { decode(data, label: String(describing: T.self)) }
}

/// Engine works in kg; this converts for display and input.
struct WeightUnits {
    var pounds: Bool

    var symbol: String { pounds ? "lb" : "kg" }

    func display(_ kg: Double) -> Double {
        let value = pounds ? kg * Units.poundsPerKg : kg
        return (value * 2).rounded() / 2
    }

    func kg(_ display: Double) -> Double { pounds ? display / Units.poundsPerKg : display }

    func format(_ kg: Double?) -> String {
        guard let kg, kg > 0 else { return "BW" }
        return "\(display(kg).formatted(.number.precision(.fractionLength(0...1)))) \(symbol)"
    }
}
