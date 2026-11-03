import Foundation
import WorkoutEngine

// Times the engine and JSON decoding against a large synthetic history (~4 years, 4 workouts/week).
func time(_ label: String, _ block: () -> Void) {
    let start = Date()
    block()
    print(String(format: "%-34@ %7.1f ms", label as NSString, Date().timeIntervalSince(start) * 1000))
}

let now = Date()
var history: [WorkoutRecord] = []
let ids = Catalog.all.map(\.id)
for day in stride(from: 1460, to: 0, by: -2) {
    let exercises = (0..<6).map { i in
        LoggedExercise(exerciseID: ids[(day + i * 7) % ids.count],
                       sets: (0..<4).map { _ in LoggedSet(weight: 60, reps: 8, rir: 2) }, targetReps: 8)
    }
    history.append(WorkoutRecord(date: now.addingTimeInterval(-Double(day) * 86_400), focus: .push, exercises: exercises))
}
print("workouts:", history.count)

let blobs = history.map { try! JSONEncoder().encode($0.exercises) }
time("decode all workouts (JSON)") { for b in blobs { _ = try! JSONDecoder().decode(LossyArray<LoggedExercise>.self, from: b) } }
time("Recovery.compute") { _ = Recovery.compute(history: history, now: now) }
time("Planner.init (sort)") { _ = Planner(plan: UserPlan(), gym: .commercial, history: history) }
let planner = Planner(plan: UserPlan(), gym: .commercial, history: history)
time("Planner.generate") { _ = planner.generate(now: now) }
time("weeklySets") { _ = planner.weeklySets(now: now) }
time("estimatedOneRM x 75 exercises") { for id in ids { _ = Strength.estimatedOneRM(for: id, history: history, now: now) } }
