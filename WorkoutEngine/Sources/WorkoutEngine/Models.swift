import Foundation

// All loads inside the engine are kilograms. The app converts for display.

public enum Muscle: String, CaseIterable, Codable, Sendable {
    case chest, shoulders, triceps, biceps, forearms
    case lats, upperBack, lowerBack, abs
    case quads, hamstrings, glutes, calves, adductors, abductors

    public var displayName: String {
        switch self {
        case .upperBack: "Upper Back"
        case .lowerBack: "Lower Back"
        default: rawValue.capitalized
        }
    }
}

public enum Equipment: String, CaseIterable, Codable, Sendable {
    case barbell, ezBar, trapBar, dumbbell, kettlebell
    case bench, squatRack, pullUpBar, dipStation
    case cable, latPulldown, legPress, legCurl, legExtension
    case chestPressMachine, shoulderPressMachine, smithMachine
    case resistanceBand

    /// Default load step in kg when a gym doesn't specify one.
    public var defaultIncrement: Double {
        switch self {
        case .barbell, .ezBar, .trapBar, .smithMachine: 2.5
        case .dumbbell: 2.0
        case .kettlebell: 4.0
        default: 5.0
        }
    }

    /// Default load step in lb.
    public var defaultIncrementPounds: Double {
        switch self {
        case .barbell, .ezBar, .trapBar, .smithMachine, .dumbbell: 5
        case .kettlebell: 9
        default: 10
        }
    }

    /// Bar weight in kg, used for warm-ups and rounding.
    public var baseLoad: Double {
        switch self {
        case .barbell, .trapBar: 20
        case .ezBar: 10
        default: 0
        }
    }

    public var baseLoadPounds: Double {
        switch self {
        case .barbell, .trapBar: 45
        case .ezBar: 25
        default: 0
        }
    }
}

public enum MovementPattern: String, Codable, Sendable {
    case squat, hinge, lunge
    case horizontalPush, verticalPush, horizontalPull, verticalPull
    case isolation, core, carry
}

public enum Level: Int, Codable, Comparable, Sendable {
    case beginner = 0, intermediate, advanced
    public static func < (a: Level, b: Level) -> Bool { a.rawValue < b.rawValue }
}

public enum Joint: String, CaseIterable, Codable, Sendable {
    case shoulder, elbow, wrist, lowerBack, hip, knee, ankle, neck
}

public struct Exercise: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let primary: [Muscle]
    public let secondary: [Muscle]
    public let equipment: Set<Equipment>
    public let pattern: MovementPattern
    public let isCompound: Bool
    public let level: Level
    /// Rough starting 1RM (kg) for a new intermediate lifter; 0 = bodyweight.
    public let starterOneRM: Double
    public let jointsStressed: Set<Joint>
    /// Logged in seconds instead of reps (planks, carries).
    public let isTimed: Bool
    /// The user's own how-to notes; only custom exercises have them.
    public let notes: String?

    public var isBodyweight: Bool { starterOneRM == 0 }

    /// Created by the user rather than shipped in the catalog.
    public var isCustom: Bool { id.hasPrefix(Catalog.customPrefix) }

    /// The equipment that sets the load increment and bar weight.
    public var loadEquipment: Equipment? {
        let order: [Equipment] = [.barbell, .trapBar, .ezBar, .smithMachine, .dumbbell, .kettlebell,
                                  .cable, .latPulldown, .legPress, .legCurl, .legExtension,
                                  .chestPressMachine, .shoulderPressMachine]
        return order.first(where: equipment.contains)
    }

    public init(id: String, name: String, primary: [Muscle], secondary: [Muscle] = [],
                equipment: Set<Equipment>, pattern: MovementPattern, isCompound: Bool,
                level: Level = .beginner, starterOneRM: Double, jointsStressed: Set<Joint> = [], isTimed: Bool = false,
                notes: String? = nil) {
        self.id = id; self.name = name; self.primary = primary; self.secondary = secondary
        self.equipment = equipment; self.pattern = pattern; self.isCompound = isCompound
        self.level = level; self.starterOneRM = starterOneRM; self.jointsStressed = jointsStressed
        self.isTimed = isTimed
        self.notes = notes
    }
}

// MARK: - User plan

public enum Goal: String, CaseIterable, Codable, Sendable {
    case buildMuscle, getLean, getStronger, reduceBodyweight, improveFitness, powerlifting
}

public enum Split: String, CaseIterable, Codable, Sendable {
    case pushPullLegs, upperLower, fullBody, freshMuscles
}

public enum Variability: String, Codable, Sendable { case consistent, balanced, variable }

public enum ExercisePreference: String, Codable, Sendable { case more, less, exclude }

public enum DayFocus: String, Codable, Sendable {
    case push, pull, legs, upper, lower, fullBody, recovered

    public var muscles: Set<Muscle> {
        switch self {
        case .push: [.chest, .shoulders, .triceps]
        case .pull: [.lats, .upperBack, .biceps, .forearms]
        case .legs: [.quads, .hamstrings, .glutes, .calves, .adductors, .abductors, .lowerBack]
        case .upper: DayFocus.push.muscles.union(DayFocus.pull.muscles)
        case .lower: DayFocus.legs.muscles.union([.abs])
        case .fullBody, .recovered: Set(Muscle.allCases)
        }
    }
}

public struct Gym: Codable, Hashable, Identifiable, Sendable {
    public var id: UUID
    public var name: String
    public var equipment: Set<Equipment>
    /// Plates and dumbbells are in pounds; increments below are then in lb too.
    public var usesPounds: Bool
    /// Overrides for load steps, in the gym's unit.
    public var increments: [Equipment: Double]

    public init(id: UUID = UUID(), name: String, equipment: Set<Equipment>, usesPounds: Bool = false,
                increments: [Equipment: Double] = [:]) {
        self.id = id; self.name = name; self.equipment = equipment
        self.usesPounds = usesPounds; self.increments = increments
    }

    /// Load step in the gym's unit.
    public func increment(for e: Equipment) -> Double {
        increments[e] ?? (usesPounds ? e.defaultIncrementPounds : e.defaultIncrement)
    }

    /// Load step in kg.
    public func incrementKg(for e: Equipment) -> Double {
        usesPounds ? increment(for: e) / Units.poundsPerKg : increment(for: e)
    }

    /// Rounds a kg load to something loadable in this gym, returned in kg.
    public func round(_ kg: Double, for e: Equipment) -> Double {
        if usesPounds {
            return Strength.round(kg * Units.poundsPerKg, increment: increment(for: e), base: e.baseLoadPounds) / Units.poundsPerKg
        }
        return Strength.round(kg, increment: increment(for: e), base: e.baseLoad)
    }

    public func baseLoadKg(for e: Equipment) -> Double {
        usesPounds ? e.baseLoadPounds / Units.poundsPerKg : e.baseLoad
    }

    public static let commercial = Gym(name: "Commercial Gym", equipment: Set(Equipment.allCases))
    public static let home = Gym(name: "Home", equipment: [.dumbbell, .bench, .pullUpBar, .resistanceBand, .kettlebell])
    public static let bodyweight = Gym(name: "Bodyweight", equipment: [])
}

public struct UserPlan: Codable, Sendable {
    public var goal: Goal
    public var experience: Level
    public var split: Split
    public var sessionMinutes: Int
    public var variability: Variability
    public var warmUpSets: Bool
    public var preferences: [String: ExercisePreference]
    public var injuries: Set<Joint>

    public init(goal: Goal = .buildMuscle, experience: Level = .intermediate, split: Split = .pushPullLegs,
                sessionMinutes: Int = 60, variability: Variability = .balanced, warmUpSets: Bool = true,
                preferences: [String: ExercisePreference] = [:], injuries: Set<Joint> = []) {
        self.goal = goal; self.experience = experience; self.split = split
        self.sessionMinutes = sessionMinutes; self.variability = variability; self.warmUpSets = warmUpSets
        self.preferences = preferences; self.injuries = injuries
    }
}

// MARK: - History

public struct LoggedSet: Codable, Hashable, Sendable {
    public var weight: Double
    public var reps: Int
    public var rir: Int?
    public var isWarmup: Bool

    public init(weight: Double, reps: Int, rir: Int? = nil, isWarmup: Bool = false) {
        self.weight = weight; self.reps = reps; self.rir = rir; self.isWarmup = isWarmup
    }
}

public struct LoggedExercise: Codable, Hashable, Sendable {
    public var exerciseID: String
    public var sets: [LoggedSet]
    /// What was prescribed, so progression can tell a hit from a miss.
    public var targetReps: Int?

    public init(exerciseID: String, sets: [LoggedSet], targetReps: Int? = nil) {
        self.exerciseID = exerciseID; self.sets = sets; self.targetReps = targetReps
    }

    public var workingSets: [LoggedSet] { sets.filter { !$0.isWarmup && $0.reps > 0 } }
}

public struct WorkoutRecord: Codable, Sendable {
    public var date: Date
    public var focus: DayFocus?
    public var exercises: [LoggedExercise]

    public init(date: Date, focus: DayFocus? = nil, exercises: [LoggedExercise]) {
        self.date = date; self.focus = focus; self.exercises = exercises
    }
}

public struct ExternalActivity: Codable, Sendable {
    public var date: Date
    public var minutes: Double
    /// Muscles the activity loads (e.g. legs for running or cycling).
    public var muscles: [Muscle]

    public init(date: Date, minutes: Double, muscles: [Muscle] = [.quads, .hamstrings, .glutes, .calves]) {
        self.date = date; self.minutes = minutes; self.muscles = muscles
    }
}

public struct RecoveryOverride: Codable, Sendable {
    public var muscle: Muscle
    public var recovery: Double
    public var date: Date

    public init(muscle: Muscle, recovery: Double, date: Date) {
        self.muscle = muscle; self.recovery = recovery; self.date = date
    }
}

public enum Units {
    public static let poundsPerKg = 2.2046226218
}

// MARK: - Tolerant decoding
//
// These types are persisted by the app. Each decoder fills defaults for missing fields and ignores
// unknown values so data saved by an older or newer version still loads. Encoding stays synthesized,
// so the stored format is unchanged. When adding a stored field, give it a default here too.

extension UserPlan {
    private enum CodingKeys: String, CodingKey {
        case goal, experience, split, sessionMinutes, variability, warmUpSets, preferences, injuries
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = UserPlan()
        goal = c.value(.goal, or: d.goal)
        experience = c.value(.experience, or: d.experience)
        split = c.value(.split, or: d.split)
        sessionMinutes = c.value(.sessionMinutes, or: d.sessionMinutes)
        variability = c.value(.variability, or: d.variability)
        warmUpSets = c.value(.warmUpSets, or: d.warmUpSets)
        let rawPreferences: [String: String] = c.value(.preferences, or: [:])
        preferences = rawPreferences.compactMapValues(ExercisePreference.init(rawValue:))
        injuries = Set(c.knownCases(.injuries) as [Joint])
    }
}

extension Gym {
    private enum CodingKeys: String, CodingKey { case id, name, equipment, usesPounds, increments }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = c.value(.id, or: UUID())
        name = c.value(.name, or: "Gym")
        equipment = Set(c.knownCases(.equipment) as [Equipment])
        usesPounds = c.value(.usesPounds, or: false)
        increments = c.value(.increments, or: [:])
    }
}

extension LoggedSet {
    private enum CodingKeys: String, CodingKey { case weight, reps, rir, isWarmup }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        weight = c.value(.weight, or: 0)
        reps = c.value(.reps, or: 0)
        rir = c.value(.rir, or: nil)
        isWarmup = c.value(.isWarmup, or: false)
    }
}

extension LoggedExercise {
    private enum CodingKeys: String, CodingKey { case exerciseID, sets, targetReps }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        exerciseID = try c.decode(String.self, forKey: .exerciseID) // meaningless without it
        sets = c.lossyArray(.sets)
        targetReps = c.value(.targetReps, or: nil)
    }
}

extension WorkoutRecord {
    private enum CodingKeys: String, CodingKey { case date, focus, exercises }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        date = try c.decode(Date.self, forKey: .date)
        focus = c.value(.focus, or: nil)
        exercises = c.lossyArray(.exercises)
    }
}

extension RecoveryOverride {
    private enum CodingKeys: String, CodingKey { case muscle, recovery, date }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        muscle = try c.decode(Muscle.self, forKey: .muscle)
        recovery = c.value(.recovery, or: 1)
        date = c.value(.date, or: .distantPast)
    }
}

extension Exercise {
    private enum CodingKeys: String, CodingKey {
        case id, name, primary, secondary, equipment, pattern, isCompound, level, starterOneRM, jointsStressed, isTimed, notes
    }

    // Custom exercises are stored, so they get the same tolerant decoding as other saved data.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = c.value(.name, or: Catalog.placeholderName(id))
        primary = c.knownCases(.primary)
        secondary = c.knownCases(.secondary)
        equipment = Set(c.knownCases(.equipment) as [Equipment])
        pattern = c.value(.pattern, or: .isolation)
        isCompound = c.value(.isCompound, or: false)
        level = c.value(.level, or: .beginner)
        starterOneRM = c.value(.starterOneRM, or: 0)
        jointsStressed = Set(c.knownCases(.jointsStressed) as [Joint])
        isTimed = c.value(.isTimed, or: false)
        notes = c.value(.notes, or: nil)
    }
}
