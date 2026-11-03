import Foundation
import WorkoutEngine

/// Today's generated workout, kept until the day ends or a workout is logged, so edits stick
/// across relaunches and settings changes.
struct TodayPlan: Codable {
    var generatedAt: Date
    /// Settings fingerprint at generation time; when it drifts, Today offers to rebuild.
    var basis: String
    /// Logged workouts at generation time; a new one means it's time for the next workout.
    var logCount: Int
    var seed: UInt64
    /// Today-only overrides from the Switch and duration chips.
    var focus: DayFocus?
    var minutes: Int?
    var workout: PlannedWorkout

    func isCurrent(logCount: Int, now: Date = .now) -> Bool {
        Calendar.current.isDate(generatedAt, inSameDayAs: now) && self.logCount == logCount
    }
}

enum TodayPlanStore {
    private static let key = "todayPlan"

    /// A plan that can't be read is simply rebuilt: it's derived data, nothing is lost.
    static func load() -> TodayPlan? {
        UserDefaults.standard.data(forKey: key).flatMap { try? JSONDecoder().decode(TodayPlan.self, from: $0) }
    }

    static func save(_ plan: TodayPlan) {
        UserDefaults.standard.set(JSON.encode(plan), forKey: key)
    }
}

extension Profile {
    /// Everything a generated workout depends on, as a stable string (hashValue changes per launch).
    /// Exercise preferences are left out: they're changed from Today itself and applied in place.
    var planBasis: String {
        let p = plan
        let gym = activeGym
        let increments = gym.increments.map { "\($0.key.rawValue)=\($0.value)" }.sorted()
        let overrideParts = overrides.map { "\($0.muscle.rawValue)=\($0.recovery)@\(Int($0.date.timeIntervalSince1970))" }.sorted()
        return [
            p.goal.rawValue, "\(p.experience.rawValue)", p.split.rawValue, "\(p.sessionMinutes)",
            p.variability.rawValue, "\(p.warmUpSets)", p.injuries.map(\.rawValue).sorted().joined(separator: ","),
            gym.id.uuidString, gym.equipment.map(\.rawValue).sorted().joined(separator: ","), "\(gym.usesPounds)",
            increments.joined(separator: ","), overrideParts.joined(separator: ","),
        ].joined(separator: "|")
    }
}
