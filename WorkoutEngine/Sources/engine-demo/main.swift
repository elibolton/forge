import Foundation
import WorkoutEngine

// Simulates two weeks of following the plan exactly, printing each generated workout.
// Usage: swift run engine-demo [buildMuscle|getStronger|...] [pushPullLegs|upperLower|fullBody|freshMuscles] [minutes]

let args = CommandLine.arguments.dropFirst()
let goal = args.first.flatMap(Goal.init(rawValue:)) ?? .buildMuscle
let split = args.dropFirst().first.flatMap(Split.init(rawValue:)) ?? .pushPullLegs
let minutes = args.dropFirst(2).first.flatMap { Int($0) } ?? 60
let plan = UserPlan(goal: goal, split: split, sessionMinutes: minutes)

func lb(_ kg: Double) -> String { "\(Int((kg * 2.20462).rounded())) lb" }

var history: [WorkoutRecord] = []
let start = Date()
for day in stride(from: 0, to: 14, by: 2) {
    let date = start.addingTimeInterval(Double(day) * 86_400)
    let w = Planner(plan: plan, gym: .commercial, history: history).generate(now: date)
    print("\n=== Day \(day + 1): \(w.focus.rawValue) · ~\(w.estimatedMinutes) min · targets: \(w.targetMuscles.prefix(4).map(\.displayName).joined(separator: ", "))")
    for p in w.exercises {
        let working = p.workingSets
        let load = working.first?.weight.map(lb) ?? "bodyweight"
        let unit = p.exercise.isTimed ? "s" : ""
        let warm = p.sets.count - working.count
        print("  \(p.exercise.name): \(working.count) × \(working.first?.reps ?? 0)\(unit) @ \(load)"
              + (warm > 0 ? " (+\(warm) warm-up)" : "") + (working.contains { $0.isAMRAP } ? " [AMRAP last]" : ""))
        for r in p.reasons { print("      · \(r)") }
    }
    history.append(WorkoutRecord(date: date, focus: w.focus, exercises: w.exercises.map { p in
        LoggedExercise(exerciseID: p.exercise.id,
                       sets: p.sets.map { LoggedSet(weight: $0.weight ?? 0, reps: $0.reps, rir: $0.isWarmup ? nil : p.targetRIR, isWarmup: $0.isWarmup) },
                       targetReps: p.workingSets.first?.reps)
    }))
}
