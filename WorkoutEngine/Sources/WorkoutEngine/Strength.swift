import Foundation

public enum Strength {
    /// Epley estimate, counting reps left in the tank as reps done.
    public static func oneRM(weight: Double, reps: Int, rir: Int? = nil) -> Double {
        let effective = min(reps + (rir ?? 0), 15)
        guard effective > 1 else { return weight }
        return weight * (1 + Double(effective) / 30)
    }

    /// Inverse Epley: the load that leaves `rir` reps in reserve after `reps`.
    public static func weight(forReps reps: Int, rir: Int, oneRM: Double) -> Double {
        let effective = reps + rir
        guard effective > 1 else { return oneRM }
        return oneRM / (1 + Double(effective) / 30)
    }

    /// Best recent e1RM, discounted for time away (no discount for 14 days, then 0.5%/day down to 80%).
    public static func estimatedOneRM(for exerciseID: String, history: [WorkoutRecord], now: Date) -> Double? {
        var best: Double?
        for record in history {
            let days = now.timeIntervalSince(record.date) / 86_400
            guard days >= 0, days <= 120 else { continue }
            let factor = days <= 14 ? 1 : max(0.8, 1 - 0.005 * (days - 14))
            for logged in record.exercises where logged.exerciseID == exerciseID {
                for set in logged.workingSets where set.weight > 0 {
                    let value = oneRM(weight: set.weight, reps: set.reps, rir: set.rir) * factor
                    if value > (best ?? 0) { best = value }
                }
            }
        }
        return best
    }

    /// Best reps (or seconds) in a single set over the last 60 days, for bodyweight work.
    public static func bestReps(for exerciseID: String, history: [WorkoutRecord], now: Date) -> Int? {
        history
            .filter { now.timeIntervalSince($0.date) <= 60 * 86_400 }
            .flatMap { $0.exercises.filter { $0.exerciseID == exerciseID }.flatMap(\.workingSets) }
            .map(\.reps)
            .max()
    }

    /// Rounds to a loadable weight: bar plus whole increments, never below the bar.
    public static func round(_ weight: Double, increment: Double, base: Double) -> Double {
        guard increment > 0 else { return weight }
        let steps = ((weight - base) / increment).rounded()
        return max(base, base + steps * increment)
    }
}
