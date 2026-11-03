import Foundation
import Observation
import OSLog
import SwiftData
import WorkoutEngine

/// Decoded workout history plus the per-exercise facts screens need, rebuilt only when the log changes.
///
/// Decoding every saved workout is the expensive part (~55 ms for 730 workouts in the simulator), so each
/// log is decoded once and reused until its stored bytes change.
@MainActor
@Observable
final class HistoryStore {
    /// Newest first.
    private(set) var records: [WorkoutRecord] = []
    /// False until the first sync, so nothing plans against an empty history by mistake.
    private(set) var isLoaded = false
    /// Bumps whenever `records` changes.
    private(set) var revision = 0

    /// Working sets from the most recent session of each exercise.
    private(set) var lastWorkingSets: [String: [LoggedSet]] = [:]
    /// Best estimated 1RM ever logged per exercise (kg), undiscounted.
    private(set) var bestOneRM: [String: Double] = [:]
    /// Every session of each exercise, newest first.
    private(set) var sessions: [String: [(date: Date, logged: LoggedExercise)]] = [:]

    @ObservationIgnored private var decoded: [PersistentIdentifier: (data: Data, record: WorkoutRecord)] = [:]

    static let perf = Logger(subsystem: "com.elibolton.forge", category: "perf")

    func sync(_ logs: [WorkoutLog]) {
        let started = Date()
        defer { Self.perf.debug("history sync \(logs.count, privacy: .public) logs: \(Int(Date().timeIntervalSince(started) * 1000), privacy: .public) ms") }
        var nextDecoded: [PersistentIdentifier: (data: Data, record: WorkoutRecord)] = [:]
        var next: [WorkoutRecord] = []
        next.reserveCapacity(logs.count)
        for log in logs {
            let id = log.persistentModelID
            let record: WorkoutRecord
            if let cached = decoded[id], cached.data == log.exercisesData, cached.record.date == log.date {
                record = cached.record
            } else {
                record = log.record
            }
            nextDecoded[id] = (log.exercisesData, record)
            next.append(record)
        }
        next.sort { $0.date > $1.date }
        decoded = nextDecoded

        let changed = !isLoaded || next.count != records.count
            || zip(next, records).contains { $0.date != $1.date || $0.exercises != $1.exercises }
        isLoaded = true
        guard changed else { return }
        records = next
        rebuildDerived()
        revision += 1
    }

    private func rebuildDerived() {
        var last: [String: [LoggedSet]] = [:]
        var best: [String: Double] = [:]
        var byExercise: [String: [(date: Date, logged: LoggedExercise)]] = [:]
        for record in records {
            for logged in record.exercises {
                let id = logged.exerciseID
                if last[id] == nil { last[id] = logged.workingSets }
                byExercise[id, default: []].append((record.date, logged))
                for set in logged.workingSets where set.weight > 0 {
                    let oneRM = Strength.oneRM(weight: set.weight, reps: set.reps, rir: set.rir)
                    if oneRM > best[id] ?? 0 { best[id] = oneRM }
                }
            }
        }
        lastWorkingSets = last
        bestOneRM = best
        sessions = byExercise
    }
}
