import Foundation
import Testing
@testable import WorkoutEngine

/// Parent of every suite. Serialized because some tests register custom exercises in the shared catalog,
/// which would otherwise leak into tests running alongside them.
@Suite(.serialized) struct EngineTests {}

let now = Date(timeIntervalSince1970: 1_800_000_000)
func daysAgo(_ d: Double) -> Date { now.addingTimeInterval(-d * 86_400) }

func session(_ id: String, weight: Double, reps: Int, sets: Int = 3, rir: Int? = 2, target: Int? = nil) -> LoggedExercise {
    LoggedExercise(exerciseID: id, sets: Array(repeating: LoggedSet(weight: weight, reps: reps, rir: rir), count: sets),
                   targetReps: target ?? reps)
}

extension EngineTests {
@Suite struct StrengthTests {
    @Test func epleyRoundTrips() {
        let oneRM = Strength.oneRM(weight: 100, reps: 5, rir: 2)
        #expect(abs(Strength.weight(forReps: 5, rir: 2, oneRM: oneRM) - 100) < 0.001)
        #expect(Strength.oneRM(weight: 100, reps: 1) == 100)
    }

    @Test func roundsToLoadableWeight() {
        #expect(Strength.round(61.2, increment: 2.5, base: 20) == 60)
        #expect(Strength.round(61.3, increment: 2.5, base: 20) == 62.5)
        #expect(Strength.round(10, increment: 2.5, base: 20) == 20)
    }

    @Test func discountsLongLayoffs() {
        let fresh = Strength.estimatedOneRM(for: "bb-bench", history: [WorkoutRecord(date: daysAgo(3), exercises: [session("bb-bench", weight: 80, reps: 5)])], now: now)!
        let stale = Strength.estimatedOneRM(for: "bb-bench", history: [WorkoutRecord(date: daysAgo(40), exercises: [session("bb-bench", weight: 80, reps: 5)])], now: now)!
        #expect(stale < fresh * 0.9)
    }
}
}

extension EngineTests {
@Suite struct RecoveryTests {
    let chestDay = WorkoutRecord(date: daysAgo(1), focus: .push, exercises: [
        session("bb-bench", weight: 80, reps: 6, sets: 4, rir: 1),
        session("db-incline-bench", weight: 26, reps: 8, sets: 3, rir: 1),
        session("cable-fly", weight: 20, reps: 12, sets: 3, rir: 1),
    ])

    @Test func trainedMusclesAreFatigued() {
        let r = Recovery.compute(history: [chestDay], now: now)
        #expect(r[.chest]! < 0.5)
        #expect(r[.triceps]! < 1)
        #expect(r[.quads] == 1)
    }

    @Test func fullyRecoversWithinAWeek() {
        var old = chestDay; old.date = daysAgo(7.1)
        #expect(Recovery.compute(history: [old], now: now)[.chest] == 1)
    }

    @Test func overrideReplacesHistory() {
        let r = Recovery.compute(history: [chestDay], overrides: [RecoveryOverride(muscle: .chest, recovery: 0.9, date: now)], now: now)
        #expect(abs(r[.chest]! - 0.9) < 0.001)
    }

    @Test func cardioTiresLegs() {
        let r = Recovery.compute(history: [], external: [ExternalActivity(date: daysAgo(0.5), minutes: 60)], now: now)
        #expect(r[.quads]! < 0.7)
        #expect(r[.chest] == 1)
    }
}
}

extension EngineTests {
@Suite struct PlannerTests {
    func planner(_ plan: UserPlan = UserPlan(), gym: Gym = .commercial, history: [WorkoutRecord] = []) -> Planner {
        Planner(plan: plan, gym: gym, history: history)
    }

    @Test func respectsEquipment() {
        let w = planner(gym: .bodyweight).generate(now: now, seed: 1)
        #expect(!w.exercises.isEmpty)
        #expect(w.exercises.allSatisfy { $0.exercise.equipment.isEmpty })
    }

    @Test func respectsInjuriesAndExclusions() {
        var plan = UserPlan(split: .pushPullLegs, injuries: [.knee])
        plan.preferences["bb-deadlift"] = .exclude
        let w = planner(plan).generate(now: now, seed: 3, focus: .legs)
        #expect(w.exercises.allSatisfy { !$0.exercise.jointsStressed.contains(.knee) })
        #expect(!w.exercises.contains { $0.exercise.id == "bb-deadlift" })
    }

    @Test func followsSplitRotation() {
        let history = [WorkoutRecord(date: daysAgo(1), focus: .push, exercises: [session("bb-bench", weight: 80, reps: 6)])]
        let w = planner(history: history).generate(now: now)
        #expect(w.focus == .pull)
        #expect(w.exercises.allSatisfy { !Set($0.exercise.primary).isDisjoint(with: DayFocus.pull.muscles) })
    }

    @Test func freshMusclesAvoidsWhatYouJustTrained() {
        let history = [RecoveryTests().chestDay]
        let w = planner(UserPlan(split: .freshMuscles), history: history).generate(now: now)
        #expect(!w.targetMuscles.contains(.chest))
    }

    @Test func compoundsComeFirst() {
        let w = planner(UserPlan(goal: .getStronger)).generate(now: now, seed: 7, focus: .legs)
        #expect(w.exercises.first!.exercise.isCompound)
    }

    @Test func durationScalesExerciseCount() {
        let short = planner(UserPlan(sessionMinutes: 30)).generate(now: now, seed: 2, focus: .fullBody)
        let long = planner(UserPlan(sessionMinutes: 90)).generate(now: now, seed: 2, focus: .fullBody)
        #expect(short.exercises.count < long.exercises.count)
        #expect(long.estimatedMinutes <= 90)
    }

    @Test func shortStrengthSessionFitsBudget() {
        let w = planner(UserPlan(goal: .getStronger, split: .freshMuscles, sessionMinutes: 45)).generate(now: now, seed: 1)
        #expect(w.estimatedMinutes <= 47)
        #expect(w.exercises.count >= 3)
    }

    @Test func noDoubledIsolationsForOneMuscle() {
        for seed in UInt64(0)..<20 {
            for focus in [DayFocus.push, .pull, .legs] {
                let w = planner().generate(now: now, seed: seed, focus: focus)
                let isolations = w.exercises.filter { !$0.exercise.isCompound }
                let targets = isolations.map { Set($0.exercise.primary) }
                #expect(Set(targets).count == targets.count, "seed \(seed) \(focus): \(isolations.map(\.exercise.name))")
            }
        }
    }

    @Test func sameSeedSameWorkout() {
        let a = planner().generate(now: now, seed: 42, focus: .upper).exercises.map(\.exercise.id)
        let b = planner().generate(now: now, seed: 42, focus: .upper).exercises.map(\.exercise.id)
        #expect(a == b)
    }

    @Test func addsWeightAfterHittingReps() {
        let history = [WorkoutRecord(date: daysAgo(3), focus: .push, exercises: [session("bb-bench", weight: 80, reps: 8, rir: 2, target: 8)])]
        let p = planner(history: history)
        let next = p.prescribe(Catalog.byID["bb-bench"]!, scheme: Scheme(goal: .buildMuscle, experience: .intermediate), now: now, reasons: [])
        // Same rep target would be 80 kg; the bump should push it up.
        let sameReps = Strength.weight(forReps: next.workingSets[0].reps, rir: 2, oneRM: Strength.oneRM(weight: 80, reps: 8, rir: 2))
        #expect(next.workingSets[0].weight! > Strength.round(sameReps, increment: 2.5, base: 20) - 0.01)
        #expect(next.reasons.contains { $0.contains("adding weight") })
    }

    @Test func backsOffAfterMissingTwice() {
        let history = [
            WorkoutRecord(date: daysAgo(3), exercises: [session("bb-squat", weight: 100, reps: 4, rir: 0, target: 8)]),
            WorkoutRecord(date: daysAgo(6), exercises: [session("bb-squat", weight: 100, reps: 5, rir: 0, target: 8)]),
        ]
        let next = planner(history: history).prescribe(Catalog.byID["bb-squat"]!, scheme: Scheme(goal: .buildMuscle, experience: .intermediate), now: now, reasons: [])
        #expect(next.reasons.contains { $0.contains("backing off") })
    }

    @Test func newExerciseScalesFromRelatedLift() {
        let history = [WorkoutRecord(date: daysAgo(2), exercises: [session("bb-bench", weight: 100, reps: 5)])]
        let p = planner(history: history)
        let est = p.startingOneRM(for: Catalog.byID["db-bench"]!, now: now)
        let benchOneRM = Strength.oneRM(weight: 100, reps: 5, rir: 2)
        #expect(abs(est - benchOneRM * 28 / 70 * 0.9) < 0.01)
    }

    /// Eight weeks of following the plan exactly: weights should climb and every day should be sane.
    @Test func simulatedEightWeeks() {
        var history: [WorkoutRecord] = []
        var benchWeights: [Double] = []
        for day in stride(from: 56.0, to: 0, by: -2) {
            let date = daysAgo(day)
            let w = Planner(plan: UserPlan(), gym: .commercial, history: history).generate(now: date)
            #expect(w.exercises.count >= 3)
            #expect(w.estimatedMinutes <= 65)
            let logged = w.exercises.map { p in
                LoggedExercise(exerciseID: p.exercise.id,
                               sets: p.sets.map { LoggedSet(weight: $0.weight ?? 0, reps: $0.reps, rir: $0.isWarmup ? nil : p.targetRIR, isWarmup: $0.isWarmup) },
                               targetReps: p.workingSets.first?.reps)
            }
            if let bench = w.exercises.first(where: { $0.exercise.id == "bb-bench" }) { benchWeights.append(Strength.oneRM(weight: bench.workingSets[0].weight!, reps: bench.workingSets[0].reps, rir: 2)) }
            history.append(WorkoutRecord(date: date, focus: w.focus, exercises: logged))
        }
        let focuses = history.compactMap(\.focus)
        #expect(Set(focuses) == [.push, .pull, .legs])
        if benchWeights.count >= 2 { #expect(benchWeights.last! > benchWeights.first!) }
    }
}
}

extension EngineTests {
@Suite struct ImportTests {
    @Test func readsFitbodStyleExport() throws {
        let csv = """
        Date,Exercise,Reps,Weight(kg),Duration(s),Distance(m),Incline,Resistance,isWarmup,Note,multiplier
        2026-10-01 18:00:00 +0000,Barbell Bench Press,10,40,0,0,0,0,true,,1
        2026-10-01 18:05:00 +0000,Barbell Bench Press,8,70,0,0,0,0,false,,1
        2026-10-01 18:09:00 +0000,Barbell Bench Press,8,70,0,0,0,0,false,,1
        2026-10-01 18:20:00 +0000,Dumbbell Fly,12,14,0,0,0,0,false,,2
        2026-10-03 18:00:00 +0000,Plank,0,0,60,0,0,0,false,,1
        2026-10-03 18:10:00 +0000,Zercher Good Morning,5,60,0,0,0,0,false,,1
        """
        let result = try HistoryImport.parse(csv, defaultPounds: true)
        #expect(result.workouts.count == 2)
        let bench = result.workouts[0].exercises.first { $0.exerciseID == "bb-bench" }!
        #expect(bench.sets.count == 3)
        #expect(bench.sets[0].isWarmup)
        #expect(bench.workingSets.first?.weight == 70)
        #expect(result.workouts[0].exercises.contains { $0.exerciseID == "db-fly" })
        #expect(result.workouts[1].exercises.first?.sets.first?.reps == 60)
        #expect(result.unmatched["Zercher Good Morning"] == 1)
    }

    @Test func readsStrongStyleExportInPounds() throws {
        let csv = """
        Date;Workout Name;Duration;Exercise Name;Set Order;Weight;Reps;Distance;Seconds;Notes;Workout Notes;RPE
        2026-10-05 07:30:00;Legs;1h;Squat (Barbell);W;135;5;0;0;;;
        2026-10-05 07:30:00;Legs;1h;Squat (Barbell);1;225;5;0;0;;;8
        2026-10-05 07:30:00;Legs;1h;Lat Pulldown (Cable);1;120;10;0;0;;;
        2026-10-05 07:30:00;Legs;1h;"Romanian Deadlift (Barbell)";1;185;8;0;0;;;
        """
        let result = try HistoryImport.parse(csv, defaultPounds: true)
        let ex = result.workouts[0].exercises
        let squat = ex.first { $0.exerciseID == "bb-squat" }!
        #expect(squat.sets[0].isWarmup)
        #expect(abs(squat.workingSets[0].weight - 102.06) < 0.05)
        #expect(squat.workingSets[0].rir == 2)
        #expect(ex.contains { $0.exerciseID == "lat-pulldown" })
        #expect(ex.contains { $0.exerciseID == "bb-rdl" })
    }

    @Test func reportsMissingColumns() {
        #expect(throws: HistoryImport.ImportError.self) {
            try HistoryImport.parse("foo,bar\n1,2", defaultPounds: false)
        }
    }

    @Test func equipmentMustAgree() {
        let m = NameMatcher(catalog: Catalog.all)
        #expect(m.match("Bench Press (Dumbbell)")?.id == "db-bench")
        #expect(m.match("Bicep Curl (Cable)")?.id == "cable-curl")
        #expect(m.match("Hammer Curl (Dumbbell)")?.id == "db-hammer-curl")
    }
}
}

/// Stored data must keep loading across app versions. Fixtures are the exact JSON the app wrote
/// before tolerant decoding existed.
extension EngineTests {
@Suite struct StorageCompatibilityTests {
    let decoder = JSONDecoder()
    func data(_ s: String) -> Data { Data(s.utf8) }

    @Test func readsPlanSavedByEarlierVersion() throws {
        let plan = try decoder.decode(UserPlan.self, from: data(#"{"experience":1,"goal":"reduceBodyweight","injuries":["knee"],"preferences":{"bb-bench":"more"},"sessionMinutes":60,"split":"pushPullLegs","variability":"consistent","warmUpSets":false}"#))
        #expect(plan.goal == .reduceBodyweight)
        #expect(plan.variability == .consistent)
        #expect(plan.warmUpSets == false)
        #expect(plan.injuries == [.knee])
        #expect(plan.preferences["bb-bench"] == .more)
    }

    @Test func planMissingFieldsGetsDefaultsNotAFailure() throws {
        let plan = try decoder.decode(UserPlan.self, from: data(#"{"goal":"getStronger"}"#))
        #expect(plan.goal == .getStronger)
        #expect(plan.sessionMinutes == UserPlan().sessionMinutes)
        #expect(plan.warmUpSets == UserPlan().warmUpSets)
    }

    @Test func unknownValuesAreIgnoredNotFatal() throws {
        let plan = try decoder.decode(UserPlan.self, from: data(#"{"goal":"yoga","injuries":["knee","tail"],"preferences":{"bb-bench":"sometimes","db-fly":"less"}}"#))
        #expect(plan.goal == UserPlan().goal)
        #expect(plan.injuries == [.knee])
        #expect(plan.preferences == ["db-fly": .less])
    }

    @Test func readsGymsIncludingIncrementFormat() throws {
        let gyms = try decoder.decode([Gym].self, from: data(#"[{"equipment":["dumbbell","bench","hoverboard"],"id":"11111111-2222-3333-4444-555555555555","increments":["dumbbell",2.5],"name":"Home","usesPounds":true}]"#))
        #expect(gyms[0].name == "Home")
        #expect(gyms[0].equipment == [.dumbbell, .bench])
        #expect(gyms[0].increments[.dumbbell] == 2.5)
        #expect(gyms[0].usesPounds)
    }

    @Test func roundTripsUnchanged() throws {
        let gym = Gym(name: "Garage", equipment: [.barbell, .squatRack], usesPounds: true, increments: [.barbell: 2.5])
        let back = try decoder.decode(Gym.self, from: JSONEncoder().encode(gym))
        #expect(back == gym)
        var plan = UserPlan(goal: .powerlifting, injuries: [.wrist])
        plan.preferences["bb-squat"] = .exclude
        let planBack = try decoder.decode(UserPlan.self, from: JSONEncoder().encode(plan))
        #expect(planBack.goal == .powerlifting && planBack.injuries == [.wrist] && planBack.preferences == ["bb-squat": .exclude])
    }

    @Test func oneBadEntryDoesNotLoseTheRest() throws {
        let json = #"[{"exerciseID":"bb-bench","sets":[{"isWarmup":false,"reps":8,"rir":2,"weight":40},{"reps":"lots"},{"isWarmup":true,"reps":10,"weight":20}],"targetReps":8},{"sets":[]},{"exerciseID":"db-fly","sets":[{"reps":12,"weight":14}]}]"#
        let logged = try decoder.decode(LossyArray<LoggedExercise>.self, from: data(json)).elements
        #expect(logged.map(\.exerciseID) == ["bb-bench", "db-fly"])
        #expect(logged[0].sets.count == 3)
        #expect(logged[0].sets[1].reps == 0)
        #expect(logged[1].sets[0].isWarmup == false)
    }

    @Test func unknownExerciseIsAPlaceholderNotACrash() {
        let e = Catalog.exercise("zercher-good-morning")
        #expect(e.name == "Zercher Good Morning")
        #expect(Catalog.exercise("bb-bench").name == "Barbell Bench Press")
        // The planner and recovery model must tolerate history containing it.
        let history = [WorkoutRecord(date: now.addingTimeInterval(-86_400), exercises: [LoggedExercise(exerciseID: e.id, sets: [LoggedSet(weight: 60, reps: 5)])])]
        _ = Recovery.compute(history: history, now: now)
        _ = Planner(plan: UserPlan(), gym: .commercial, history: history).generate(now: now)
    }
}
}

extension EngineTests {
@Suite struct CustomExerciseTests {
    let custom = Exercise(id: "custom-landmine-press", name: "Landmine Press", primary: [.shoulders], secondary: [.chest, .triceps],
                          equipment: [.barbell], pattern: .verticalPush, isCompound: true, starterOneRM: 40,
                          notes: "Wedge the bar in a corner.\nPress up and forward.")

    @Test func customExercisesJoinTheCatalogAndPlanner() {
        Catalog.setCustom([custom])
        defer { Catalog.setCustom([]) }
        #expect(Catalog.byID[custom.id]?.name == "Landmine Press")
        #expect(Catalog.exercise(custom.id).isCustom)
        let planner = Planner(plan: UserPlan(variability: .variable), gym: .commercial, history: [])
        #expect(planner.isEligible(custom))
        #expect(planner.alternatives(to: Catalog.byID["bb-ohp"]!).contains { $0.id == custom.id })
        #expect(Instructions.guide(for: custom)?.steps == ["Wedge the bar in a corner.", "Press up and forward."])
    }

    @Test func customOnlyAcceptsCustomIDs() {
        Catalog.setCustom([Exercise(id: "bb-bench", name: "Fake", primary: [.chest], equipment: [], pattern: .isolation, isCompound: false, starterOneRM: 0)])
        defer { Catalog.setCustom([]) }
        #expect(Catalog.byID["bb-bench"]?.name == "Barbell Bench Press")
    }

    @Test func customExerciseSurvivesStorageRoundTrip() throws {
        let back = try JSONDecoder().decode(Exercise.self, from: JSONEncoder().encode(custom))
        #expect(back == custom)
        let partial = try JSONDecoder().decode(Exercise.self, from: Data(#"{"id":"custom-x","name":"Thing","primary":["chest","wings"]}"#.utf8))
        #expect(partial.primary == [.chest] && partial.equipment.isEmpty && partial.notes == nil)
    }

    @Test func importUsesCustomExercisesAndManualMatches() throws {
        Catalog.setCustom([custom])
        defer { Catalog.setCustom([]) }
        let csv = """
        Date,Exercise,Reps,Weight(kg),isWarmup
        2026-10-01 18:00:00 +0000,Landmine Press,8,30,false
        2026-10-01 18:05:00 +0000,Zercher Good Morning,5,60,false
        """
        let auto = try HistoryImport.parse(csv, defaultPounds: false)
        #expect(auto.workouts[0].exercises.map(\.exerciseID) == ["custom-landmine-press"])
        #expect(auto.unmatched["Zercher Good Morning"] == 1)
        let manual = try HistoryImport.parse(csv, defaultPounds: false, manualMatches: ["Zercher Good Morning": "bb-rdl"])
        #expect(manual.unmatched.isEmpty)
        #expect(manual.workouts[0].exercises.map(\.exerciseID).contains("bb-rdl"))
    }

    @Test func everyBuiltInHasInstructions() {
        let missing = Catalog.builtIn.filter { Instructions.guide(for: $0) == nil }.map(\.id)
        #expect(missing.isEmpty, "missing: \(missing)")
    }

    @Test func starterSuggestionUsesSimilarExercises() {
        let dbShoulder = Catalog.suggestedStarterOneRM(primary: [.shoulders], equipment: [.dumbbell], isCompound: false)
        #expect(dbShoulder > 5 && dbShoulder < 20)
        #expect(Catalog.suggestedStarterOneRM(primary: [.quads], equipment: [.barbell, .squatRack], isCompound: true) > 50)
    }
}
}
