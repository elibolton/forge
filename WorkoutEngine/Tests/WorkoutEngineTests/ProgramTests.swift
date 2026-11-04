import Foundation
import Testing
@testable import WorkoutEngine

extension EngineTests {
@Suite struct ProgramTests {
    let program = Programs.pplul8

    func rx(_ slot: String, week: Int, adjustments: [String: Int] = [:]) -> ResolvedPrescription {
        let dayID = String(slot.split(separator: ".")[0])
        return program.session(dayID: dayID, week: week, setAdjustments: adjustments)!.exercises.first { $0.slot.id == slot }!
    }

    /// One logged program session for `slot` at `weight` with the given reps per set.
    func logged(_ slot: String, week: Int, weight: Double, reps: [Int], rir: Int? = nil, date: Date) -> WorkoutRecord {
        let p = rx(slot, week: week)
        let sets = reps.map { LoggedSet(weight: weight, reps: $0, rir: rir) }
        return WorkoutRecord(date: date, exercises: [LoggedExercise(exerciseID: p.exerciseID, sets: sets, targetReps: p.reps.lower,
                                                                   slotID: slot, repRange: p.reps, targetRIR: p.effort.rir?.low)],
                             program: ProgramRef(programID: program.id, week: week, dayID: p.slot.id.components(separatedBy: ".")[0],
                                                 isDeload: p.isDeload))
    }

    // MARK: Integrity

    @Test func everyProgramIsWellFormed() {
        for program in Programs.all {
            #expect(program.schedule.count == 7)
            #expect(program.weekRules.count == program.weeks)
            #expect(Set(program.dayOrder) == Set(program.days.map(\.id)))
            for day in program.days {
                for slot in day.exercises {
                    #expect(Catalog.builtIn.contains { $0.id == slot.exerciseID }, "\(slot.exerciseID) missing from catalog")
                }
                let groups = Dictionary(grouping: day.exercises.compactMap(\.supersetGroup), by: { $0 })
                #expect(groups.values.allSatisfy { $0.count == 2 })
                #expect(Set(groups.keys) == Set(day.supersets.map(\.group)))
            }
            let slotIDs = program.days.flatMap(\.exercises).map(\.id)
            #expect(Set(slotIDs).count == slotIDs.count)
        }
    }

    @Test func scheduleHasRestDays() {
        #expect(program.dayOrder == ["push", "pull", "legs", "upper", "lower"])
        var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: "UTC")!
        let monday = cal.date(from: DateComponents(year: 2026, month: 11, day: 2, hour: 12))!
        #expect(program.scheduled(on: monday, calendar: cal) == .day("push"))
        #expect(program.scheduled(on: monday.addingTimeInterval(3 * 86_400), calendar: cal) == .rest)
        #expect(program.scheduled(on: monday.addingTimeInterval(6 * 86_400), calendar: cal) == .rest)
        #expect(program.scheduled(on: monday.addingTimeInterval(5 * 86_400), calendar: cal) == .day("lower"))
    }

    // MARK: Resolver

    @Test func weekOneIsEasyAndCalibrates() {
        #expect(rx("push.1", week: 1).effort == .rir(RIRTarget(3)))
        #expect(rx("push.3", week: 1).effort == .rir(RIRTarget(2)))
        let push = program.session(dayID: "push", week: 1)!
        #expect(push.exercises.filter { $0.lastSetNote?.contains("Calibration") == true }.map(\.slot.id) == ["push.5"])
        let nordic = rx("legs.3", week: 1)
        #expect(nordic.sets == 2 && nordic.reps == RepRange(3, 5) && nordic.effort == .eccentricOnly)
    }

    @Test func middleWeeksUseBaseRIR() {
        #expect(rx("push.1", week: 3).effort == .rir(RIRTarget(1, 2)))
        #expect(rx("legs.1", week: 4).effort == .rir(RIRTarget(2)))
        #expect(rx("push.3", week: 3).effort == .rir(RIRTarget(0, 1)))
        #expect(rx("push.3", week: 3).lastSetNote == "Lengthened partials on the last set")
    }

    @Test func lateWeeksPushHarderExceptSquatAndRDL() {
        for week in 5...7 {
            #expect(rx("push.1", week: week).effort == .rir(RIRTarget(1)))
            #expect(rx("legs.1", week: week).effort == .rir(RIRTarget(1, 2)))
            #expect(rx("lower.1", week: week).effort == .rir(RIRTarget(1, 2)))
            let fly = rx("push.3", week: week)
            #expect(fly.effort == .rir(RIRTarget(0)))
            #expect(fly.lastSetNote?.contains("partials") == true)
            #expect(rx("legs.3", week: week).effort == .eccentricOnly)
        }
    }

    @Test func deloadHalvesSetsAndDropsNotes() {
        #expect(rx("push.1", week: 8).sets == 2)   // 3 → 2
        #expect(rx("pull.1", week: 8).sets == 2)   // 4 → 2
        #expect(rx("push.4", week: 8).sets == 3)   // 5 → 2–3
        #expect(rx("push.3", week: 8).sets == 1)   // 2 → 1
        let nordic = rx("legs.3", week: 8)
        #expect(nordic.sets == 1 && nordic.reps == RepRange(3, 3))
        let session = program.session(dayID: "upper", week: 8)!
        #expect(session.exercises.allSatisfy { $0.lastSetNote == nil && $0.isDeload })
        #expect(rx("push.1", week: 8).effort == .rir(RIRTarget(3, 4)))
    }

    @Test func supersetRests() {
        #expect(rx("upper.6a", week: 2).restSeconds == 90)
        #expect(rx("upper.6a", week: 2).supersetRestBetween == 90)
        #expect(rx("upper.6b", week: 2).restSeconds == 120)
    }

    @Test func restText() {
        #expect(rx("push.1", week: 1).restText == "3–4 min")
        #expect(rx("push.2", week: 1).restText == "2.5–3 min")
        #expect(rx("push.5", week: 1).restText == "90 s–2 min")
        #expect(rx("push.4", week: 1).restText == "~60–90 s, alternating sides")
        #expect(rx("legs.2", week: 1).restText == "60 s between sides · 2 min between rounds")
    }

    @Test func perSideAndOptional() {
        #expect(rx("legs.2", week: 2).slot.laterality == .perLeg)
        #expect(rx("legs.2", week: 2).setsText == "3 × 8–12 per leg")
        #expect(rx("pull.6", week: 2).slot.isOptional)
    }

    @Test func setAdjustmentsApplyButNotInDeload() {
        #expect(rx("pull.3", week: 3, adjustments: ["pull.3": -1]).sets == 2)
        #expect(rx("pull.3", week: 8, adjustments: ["pull.3": -1]).sets == 2)
    }

    // MARK: Progress

    @Test func advancesBySessionsNotCalendar() {
        var p = ProgramProgress(programID: program.id)
        #expect(p.nextDayID(in: program) == "push")
        p.complete("push", week: 1, in: program)
        #expect(p.nextDayID(in: program) == "pull")
        p.skip("pull", in: program)
        for day in ["legs", "upper"] { p.complete(day, week: 1, in: program) }
        #expect(p.week == 1)
        p.complete("lower", week: 1, in: program)
        #expect(p.week == 2)
        #expect(p.nextDayID(in: program) == "push")
        #expect(p.checkInDue(in: program) == 1)
    }

    @Test func earlyDeloadJumpsToDeloadThenFinishes() {
        var p = ProgramProgress(programID: program.id, week: 3)
        p.deloadNext = true
        for day in program.dayOrder { p.complete(day, week: 3, in: program) }
        #expect(p.week == 8)
        #expect(p.checkInDue(in: program) == nil)
        for day in program.dayOrder { p.complete(day, week: 8, in: program) }
        #expect(p.isFinished)
        #expect(p.nextDayID(in: program) == nil)

        var now = ProgramProgress(programID: program.id, week: 2)
        now.deloadNow(in: program)
        #expect(now.week == 8 && now.nextDayID(in: program) == "push")
    }

    @Test func progressDecodesPartialData() throws {
        let json = #"{"programID":"pplul-8wk-home","week":3,"completed":{"3":["push"]},"future":true}"#
        let p = try JSONDecoder().decode(ProgramProgress.self, from: Data(json.utf8))
        #expect(p.week == 3 && p.completed[3] == ["push"] && p.setAdjustments.isEmpty && !p.isFinished)
        let again = try JSONDecoder().decode(ProgramProgress.self, from: JSONEncoder().encode(p))
        #expect(again == p)
    }

    // MARK: Progression

    @Test func firstSessionStartsAtBottomOfRange() {
        let s = ProgramProgression.suggest(rx("push.1", week: 1), history: [], gym: .homeBarbell, now: now)
        #expect(s.reps == 5)
        #expect((s.weight ?? 0) >= 20)
        #expect(s.reason.contains("RIR 3"))
    }

    @Test func addsRepsBeforeLoad() {
        let h = [logged("push.1", week: 1, weight: 80, reps: [8, 7, 6], date: daysAgo(7))]
        let s = ProgramProgression.suggest(rx("push.1", week: 2), history: h, gym: .homeBarbell, now: now)
        #expect(s.weight == 80)
        #expect(s.reps == 7)
        #expect(s.reason.contains("Add reps"))
    }

    @Test func addsLoadWhenEverySetHitsTheTop() {
        let gym = Gym.homeBarbell
        let bench = ProgramProgression.suggest(rx("push.1", week: 2), history: [logged("push.1", week: 1, weight: 80, reps: [8, 8, 8], date: daysAgo(7))], gym: gym, now: now)
        #expect(bench.weight == 82.5 && bench.reps == 5)
        let squat = ProgramProgression.suggest(rx("legs.1", week: 2), history: [logged("legs.1", week: 1, weight: 100, reps: [8, 8, 8, 8], date: daysAgo(7))], gym: gym, now: now)
        #expect(squat.weight == 105)
        let pulldown = ProgramProgression.suggest(rx("pull.1", week: 2), history: [logged("pull.1", week: 1, weight: 60, reps: [10, 10, 10, 10], date: daysAgo(7))], gym: gym, now: now)
        #expect(pulldown.weight == 65)

        var lb = Gym.homeBarbell; lb.usesPounds = true
        let kg100 = 225 / Units.poundsPerKg
        let squatLb = ProgramProgression.suggest(rx("legs.1", week: 2), history: [logged("legs.1", week: 1, weight: kg100, reps: [8, 8, 8, 8], date: daysAgo(7))], gym: lb, now: now)
        #expect(abs(squatLb.weight! * Units.poundsPerKg - 235) < 0.01)
    }

    @Test func oneShortSetMeansNoLoadYet() {
        let h = [logged("push.1", week: 1, weight: 80, reps: [8, 8, 7], date: daysAgo(7))]
        #expect(ProgramProgression.suggest(rx("push.1", week: 2), history: h, gym: .homeBarbell, now: now).weight == 80)
    }

    @Test func bigJumpExtendsTheRangeFirst() {
        // 8 kg lean-away lateral raise + 2 kg dumbbell step is 25%.
        let h = [logged("upper.5", week: 2, weight: 8, reps: Array(repeating: 20, count: 10), date: daysAgo(7))]
        let s = ProgramProgression.suggest(rx("upper.5", week: 3), history: h, gym: .homeBarbell, now: now)
        #expect(s.action == .extendRange(by: 4))
        #expect(s.weight == 8)
        #expect(s.range == RepRange(12, 24))

        var progress = ProgramProgress(programID: program.id, week: 4)
        progress.rangeExtensions["upper.5"] = 4
        let h2 = [logged("upper.5", week: 3, weight: 8, reps: Array(repeating: 24, count: 10), date: daysAgo(7))]
        let s2 = ProgramProgression.suggest(rx("upper.5", week: 4), progress: progress, history: h2, gym: .homeBarbell, now: now)
        #expect(s2.weight == 10)
        #expect(s2.action == .resetRange)
        #expect(s2.range == RepRange(12, 20))
    }

    @Test func stallSuggestsDroppingASet() {
        let h = [
            logged("pull.3", week: 3, weight: 50, reps: [11, 10, 10], date: daysAgo(7)),
            logged("pull.3", week: 2, weight: 50, reps: [11, 10, 10], date: daysAgo(14)),
            logged("pull.3", week: 1, weight: 50, reps: [11, 11, 10], date: daysAgo(21)),
        ]
        let s = ProgramProgression.suggest(rx("pull.3", week: 4), history: h, gym: .homeBarbell, now: now)
        #expect(s.action == .dropSet)
        var progress = ProgramProgress(programID: program.id, week: 4)
        progress.setAdjustments["pull.3"] = -1
        #expect(ProgramProgression.suggest(rx("pull.3", week: 4), progress: progress, history: h, gym: .homeBarbell, now: now).action == nil)
    }

    @Test func deloadKeepsLoadAndSkipsProgression() {
        let h = [logged("push.1", week: 7, weight: 90, reps: [8, 8, 8], date: daysAgo(7))]
        let s = ProgramProgression.suggest(rx("push.1", week: 8), history: h, gym: .homeBarbell, now: now)
        #expect(s.weight == 90 && s.action == nil)
        #expect(s.reason.contains("Deload"))
    }

    @Test func nordicsProgressByReps() {
        let s0 = ProgramProgression.suggest(rx("legs.3", week: 1), history: [], gym: .homeBarbell, now: now)
        #expect(s0.weight == nil && s0.reps == 3)
        let h = [logged("legs.3", week: 2, weight: 0, reps: [5, 4, 4], date: daysAgo(7))]
        let s = ProgramProgression.suggest(rx("legs.3", week: 3), history: h, gym: .homeBarbell, now: now)
        #expect(s.weight == nil && s.reps == 5)
    }

    // MARK: Fatigue

    @Test func repsDroppingOnTwoExercisesFlags() {
        let h = [
            logged("push.1", week: 3, weight: 80, reps: [7, 6, 6], date: daysAgo(2)),
            logged("push.2", week: 3, weight: 30, reps: [9, 8, 8], date: daysAgo(2)),
            logged("push.1", week: 2, weight: 80, reps: [8, 7, 7], date: daysAgo(9)),
            logged("push.2", week: 2, weight: 30, reps: [10, 9, 9], date: daysAgo(9)),
        ]
        #expect(ProgramProgression.repsDropped(history: h, programID: program.id, week: 3) == ["push.1", "push.2"])
        #expect(ProgramProgression.repsDroppedFlag(history: h, programID: program.id, week: 3))
        #expect(!ProgramProgression.repsDroppedFlag(history: Array(h.dropFirst()), programID: program.id, week: 3))
        #expect(FatigueCheckIn(jointPain: true, repsDropped: true).suggestsDeload)
        #expect(!FatigueCheckIn(stillSore: true).suggestsDeload)
    }

    // MARK: Storage

    @Test func loggedProgramFieldsRoundTripAndOldDataLoads() throws {
        let record = logged("legs.2", week: 2, weight: 20, reps: [10, 10], date: now)
        var withSide = record
        withSide.exercises[0].sets[0].side = .left
        let decoded = try JSONDecoder().decode(WorkoutRecord.self, from: JSONEncoder().encode(withSide))
        #expect(decoded.program == record.program)
        #expect(decoded.exercises[0].slotID == "legs.2" && decoded.exercises[0].repRange == RepRange(8, 12))
        #expect(decoded.exercises[0].sets[0].side == .left)

        let old = #"{"date":0,"exercises":[{"exerciseID":"bb-bench","sets":[{"weight":80,"reps":5}],"targetReps":5}]}"#
        let oldRecord = try JSONDecoder().decode(WorkoutRecord.self, from: Data(old.utf8))
        #expect(oldRecord.program == nil && oldRecord.exercises[0].slotID == nil && oldRecord.exercises[0].sets[0].side == nil)
    }

    // MARK: Simulation

    /// Follow Program 1 for 8 weeks, logging exactly the suggestion plus one rep (a lifter who's improving).
    @Test func simulatedBlock() {
        var progress = ProgramProgress(programID: program.id, startedAt: daysAgo(60))
        var history: [WorkoutRecord] = []
        var benchLoads: [Double] = []
        var weeklySets: [Int: Int] = [:]
        var day = 60.0
        while let session = progress.nextSession(in: program) {
            let date = daysAgo(day); day -= 1.4
            #expect(!session.exercises.isEmpty)
            var logged: [LoggedExercise] = []
            for p in session.exercises {
                let s = ProgramProgression.suggest(p, progress: progress, history: history, gym: .homeBarbell, now: date)
                if case .extendRange(let by) = s.action { progress.rangeExtensions[p.slot.id] = by }
                if s.action == .resetRange { progress.rangeExtensions[p.slot.id] = nil }
                let reps = min(s.range.upper, s.reps + 1)
                let count = p.sets * (p.slot.laterality.isPerSide ? 2 : 1)
                let sets = (0..<count).map { _ in LoggedSet(weight: s.weight ?? 0, reps: reps, rir: p.effort.rir?.low) }
                logged.append(LoggedExercise(exerciseID: p.exerciseID, sets: sets, targetReps: s.reps, slotID: p.slot.id,
                                             repRange: s.range, targetRIR: p.effort.rir?.low))
                if p.slot.id == "push.1" { benchLoads.append(s.weight ?? 0) }
                weeklySets[session.week, default: 0] += p.sets
            }
            history.append(WorkoutRecord(date: date, focus: session.day.focus, exercises: logged,
                                         program: ProgramRef(programID: program.id, week: session.week, dayID: session.day.id,
                                                             isDeload: session.rule.isDeload)))
            progress.complete(session.day.id, week: session.week, in: program)
            #expect(history.count <= 40)
        }
        #expect(progress.isFinished)
        #expect(history.count == 40)
        #expect(benchLoads.count == 8)
        #expect(benchLoads[6] > benchLoads[0])
        #expect(weeklySets[8]! < weeklySets[7]! * 2 / 3)
    }
}
}
