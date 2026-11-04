import Foundation

/// Per-muscle recovery, 0 (wrecked) to 1 (fresh).
///
/// Each session adds fatigue per muscle from its working sets. Light sessions clear in about
/// two days, a muscle hit to saturation takes seven. Manual overrides replace earlier history.
public enum Recovery {
    static let setDose = 0.12
    static let secondaryWeight = 0.5

    public static func compute(history: [WorkoutRecord],
                               external: [ExternalActivity] = [],
                               overrides: [RecoveryOverride] = [],
                               catalog: [String: Exercise] = Catalog.byID,
                               now: Date) -> [Muscle: Double] {
        let latestOverride = Dictionary(overrides.map { ($0.muscle, $0) }, uniquingKeysWith: { $0.date > $1.date ? $0 : $1 })
        var fatigue = Dictionary(uniqueKeysWithValues: Muscle.allCases.map { ($0, 0.0) })

        func add(_ muscle: Muscle, dose: Double, at date: Date, maxWindowHours: Double = 168) {
            if let o = latestOverride[muscle], date < o.date { return }
            let hours = now.timeIntervalSince(date) / 3600
            guard hours >= 0 else { return }
            let amount = min(1, dose)
            let window = min(maxWindowHours, 48 + 120 * amount)
            fatigue[muscle, default: 0] += amount * max(0, 1 - hours / window)
        }

        for record in history {
            var doses: [Muscle: Double] = [:]
            for logged in record.exercises {
                guard let exercise = catalog[logged.exerciseID], exercise.pattern != .mobility else { continue }
                for set in logged.workingSets {
                    let dose = setDose * effortFactor(rir: set.rir)
                    for m in exercise.primary { doses[m, default: 0] += dose }
                    for m in exercise.secondary { doses[m, default: 0] += dose * secondaryWeight }
                }
            }
            for (m, dose) in doses { add(m, dose: dose, at: record.date) }
        }

        for activity in external {
            for m in activity.muscles { add(m, dose: min(0.6, activity.minutes / 100), at: activity.date, maxWindowHours: 48) }
        }

        for (m, o) in latestOverride { add(m, dose: 1 - o.recovery, at: o.date) }

        return fatigue.mapValues { max(0, min(1, 1 - $0)) }
    }

    /// Sets closer to failure fatigue more. Unlogged RiR is treated as 2.
    static func effortFactor(rir: Int?) -> Double {
        switch rir ?? 2 {
        case ...0: 1.2
        case 1: 1.1
        case 2: 1.0
        case 3: 0.85
        default: 0.7
        }
    }

    public enum Status: String, Sendable { case fresh, recovering, fatigued }

    public static func status(_ value: Double) -> Status {
        value >= 0.8 ? .fresh : value >= 0.5 ? .recovering : .fatigued
    }
}
