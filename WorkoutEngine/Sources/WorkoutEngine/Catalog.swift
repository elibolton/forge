import Foundation

/// Hand-tagged starter catalog. Dumbbell and kettlebell loads are per hand.
public enum Catalog {
    /// Exercises shipped with the app.
    public static let builtIn: [Exercise] = chest + shoulders + arms + back + legs + core

    /// Built-in plus the user's custom exercises.
    public static var all: [Exercise] { state.read().all }
    public static var byID: [String: Exercise] { state.read().byID }
    public static var custom: [Exercise] { state.read().custom }

    public static let customPrefix = "custom-"

    /// Called by the app whenever its saved custom exercises change.
    public static func setCustom(_ exercises: [Exercise]) {
        let valid = exercises.filter { $0.id.hasPrefix(customPrefix) }
        state.write(Snapshot(builtIn: builtIn, custom: valid))
    }

    struct Snapshot {
        let custom: [Exercise]
        let all: [Exercise]
        let byID: [String: Exercise]

        init(builtIn: [Exercise], custom: [Exercise]) {
            self.custom = custom
            all = builtIn + custom
            byID = Dictionary(all.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        }
    }

    private static let state = Locked(Snapshot(builtIn: builtIn, custom: []))

    /// Never fails: an ID that's no longer in the catalog (renamed, removed, or from a newer version)
    /// becomes a neutral placeholder so saved workouts still display instead of crashing.
    public static func exercise(_ id: String) -> Exercise {
        byID[id] ?? Exercise(id: id, name: placeholderName(id), primary: [], equipment: [],
                             pattern: .isolation, isCompound: false, starterOneRM: 0)
    }

    static func placeholderName(_ id: String) -> String {
        id.split(separator: "-").map { $0.capitalized }.joined(separator: " ")
    }

    private static func ex(_ id: String, _ name: String, _ primary: [Muscle], _ secondary: [Muscle] = [],
                           _ equipment: Set<Equipment>, _ pattern: MovementPattern, compound: Bool,
                           level: Level = .beginner, oneRM: Double, joints: Set<Joint> = [], timed: Bool = false) -> Exercise {
        Exercise(id: id, name: name, primary: primary, secondary: secondary, equipment: equipment,
                 pattern: pattern, isCompound: compound, level: level, starterOneRM: oneRM, jointsStressed: joints, isTimed: timed)
    }

    static let chest: [Exercise] = [
        ex("bb-bench", "Barbell Bench Press", [.chest], [.triceps, .shoulders], [.barbell, .bench, .squatRack], .horizontalPush, compound: true, oneRM: 70, joints: [.shoulder, .elbow, .wrist]),
        ex("bb-incline-bench", "Incline Barbell Bench Press", [.chest], [.shoulders, .triceps], [.barbell, .bench, .squatRack], .horizontalPush, compound: true, oneRM: 60, joints: [.shoulder, .elbow, .wrist]),
        ex("db-bench", "Dumbbell Bench Press", [.chest], [.triceps, .shoulders], [.dumbbell, .bench], .horizontalPush, compound: true, oneRM: 28, joints: [.shoulder, .elbow]),
        ex("db-incline-bench", "Incline Dumbbell Bench Press", [.chest], [.shoulders, .triceps], [.dumbbell, .bench], .horizontalPush, compound: true, oneRM: 24, joints: [.shoulder, .elbow]),
        ex("machine-chest-press", "Machine Chest Press", [.chest], [.triceps, .shoulders], [.chestPressMachine], .horizontalPush, compound: true, oneRM: 70, joints: [.shoulder]),
        ex("smith-bench", "Smith Machine Bench Press", [.chest], [.triceps, .shoulders], [.smithMachine, .bench], .horizontalPush, compound: true, oneRM: 65, joints: [.shoulder, .elbow]),
        ex("push-up", "Push Up", [.chest], [.triceps, .shoulders, .abs], [], .horizontalPush, compound: true, oneRM: 0, joints: [.shoulder, .wrist]),
        ex("dip", "Dip", [.chest, .triceps], [.shoulders], [.dipStation], .verticalPush, compound: true, level: .intermediate, oneRM: 0, joints: [.shoulder, .elbow]),
        ex("cable-fly", "Cable Fly", [.chest], [.shoulders], [.cable], .isolation, compound: false, oneRM: 30, joints: [.shoulder]),
        ex("db-fly", "Dumbbell Fly", [.chest], [.shoulders], [.dumbbell, .bench], .isolation, compound: false, oneRM: 16, joints: [.shoulder]),
    ]

    static let shoulders: [Exercise] = [
        ex("bb-ohp", "Barbell Overhead Press", [.shoulders], [.triceps, .upperBack], [.barbell, .squatRack], .verticalPush, compound: true, oneRM: 45, joints: [.shoulder, .lowerBack, .elbow]),
        ex("db-shoulder-press", "Dumbbell Shoulder Press", [.shoulders], [.triceps], [.dumbbell, .bench], .verticalPush, compound: true, oneRM: 20, joints: [.shoulder, .elbow]),
        ex("machine-shoulder-press", "Machine Shoulder Press", [.shoulders], [.triceps], [.shoulderPressMachine], .verticalPush, compound: true, oneRM: 50, joints: [.shoulder]),
        ex("pike-push-up", "Pike Push Up", [.shoulders], [.triceps], [], .verticalPush, compound: true, oneRM: 0, joints: [.shoulder, .wrist]),
        ex("db-lateral-raise", "Dumbbell Lateral Raise", [.shoulders], [], [.dumbbell], .isolation, compound: false, oneRM: 12, joints: [.shoulder]),
        ex("cable-lateral-raise", "Cable Lateral Raise", [.shoulders], [], [.cable], .isolation, compound: false, oneRM: 10, joints: [.shoulder]),
        ex("db-rear-delt-fly", "Dumbbell Rear Delt Fly", [.shoulders], [.upperBack], [.dumbbell], .isolation, compound: false, oneRM: 10),
        ex("face-pull", "Cable Face Pull", [.shoulders, .upperBack], [], [.cable], .isolation, compound: false, oneRM: 35),
        ex("band-pull-apart", "Band Pull Apart", [.upperBack, .shoulders], [], [.resistanceBand], .isolation, compound: false, oneRM: 0),
    ]

    static let arms: [Exercise] = [
        ex("bb-curl", "Barbell Curl", [.biceps], [.forearms], [.barbell], .isolation, compound: false, oneRM: 40, joints: [.elbow, .wrist]),
        ex("ez-curl", "EZ Bar Curl", [.biceps], [.forearms], [.ezBar], .isolation, compound: false, oneRM: 38, joints: [.elbow]),
        ex("db-curl", "Dumbbell Curl", [.biceps], [.forearms], [.dumbbell], .isolation, compound: false, oneRM: 16, joints: [.elbow]),
        ex("db-hammer-curl", "Hammer Curl", [.biceps, .forearms], [], [.dumbbell], .isolation, compound: false, oneRM: 18, joints: [.elbow]),
        ex("cable-curl", "Cable Curl", [.biceps], [.forearms], [.cable], .isolation, compound: false, oneRM: 35, joints: [.elbow]),
        ex("band-curl", "Band Curl", [.biceps], [], [.resistanceBand], .isolation, compound: false, oneRM: 0),
        ex("tricep-pushdown", "Cable Tricep Pushdown", [.triceps], [], [.cable], .isolation, compound: false, oneRM: 40, joints: [.elbow]),
        ex("overhead-tricep-ext", "Dumbbell Overhead Tricep Extension", [.triceps], [], [.dumbbell], .isolation, compound: false, oneRM: 22, joints: [.elbow, .shoulder]),
        ex("skull-crusher", "EZ Bar Skull Crusher", [.triceps], [], [.ezBar, .bench], .isolation, compound: false, level: .intermediate, oneRM: 35, joints: [.elbow]),
        ex("close-grip-bench", "Close Grip Bench Press", [.triceps], [.chest, .shoulders], [.barbell, .bench, .squatRack], .horizontalPush, compound: true, level: .intermediate, oneRM: 60, joints: [.elbow, .wrist, .shoulder]),
        ex("bench-dip", "Bench Dip", [.triceps], [.chest], [.bench], .isolation, compound: false, oneRM: 0, joints: [.shoulder]),
        ex("wrist-curl", "Dumbbell Wrist Curl", [.forearms], [], [.dumbbell], .isolation, compound: false, oneRM: 14, joints: [.wrist]),
    ]

    static let back: [Exercise] = [
        ex("pull-up", "Pull Up", [.lats], [.biceps, .upperBack], [.pullUpBar], .verticalPull, compound: true, level: .intermediate, oneRM: 0, joints: [.shoulder, .elbow]),
        ex("chin-up", "Chin Up", [.lats, .biceps], [.upperBack], [.pullUpBar], .verticalPull, compound: true, oneRM: 0, joints: [.shoulder, .elbow]),
        ex("lat-pulldown", "Lat Pulldown", [.lats], [.biceps, .upperBack], [.latPulldown], .verticalPull, compound: true, oneRM: 70, joints: [.shoulder]),
        ex("bb-row", "Barbell Bent Over Row", [.upperBack, .lats], [.biceps, .lowerBack], [.barbell], .horizontalPull, compound: true, level: .intermediate, oneRM: 65, joints: [.lowerBack]),
        ex("db-row", "Single Arm Dumbbell Row", [.lats, .upperBack], [.biceps], [.dumbbell, .bench], .horizontalPull, compound: true, oneRM: 32),
        ex("cable-row", "Seated Cable Row", [.upperBack, .lats], [.biceps], [.cable], .horizontalPull, compound: true, oneRM: 65),
        ex("inverted-row", "Inverted Row", [.upperBack, .lats], [.biceps], [.squatRack], .horizontalPull, compound: true, oneRM: 0),
        ex("band-row", "Resistance Band Row", [.upperBack], [.lats, .biceps], [.resistanceBand], .horizontalPull, compound: true, oneRM: 0),
        ex("db-shrug", "Dumbbell Shrug", [.upperBack], [.forearms], [.dumbbell], .isolation, compound: false, oneRM: 40, joints: [.neck]),
        ex("straight-arm-pulldown", "Straight Arm Pulldown", [.lats], [], [.cable], .isolation, compound: false, oneRM: 35, joints: [.shoulder]),
        ex("back-extension", "Back Extension", [.lowerBack], [.glutes, .hamstrings], [.bench], .hinge, compound: false, oneRM: 0, joints: [.lowerBack]),
    ]

    static let legs: [Exercise] = [
        ex("bb-squat", "Barbell Back Squat", [.quads, .glutes], [.hamstrings, .lowerBack, .adductors], [.barbell, .squatRack], .squat, compound: true, oneRM: 90, joints: [.knee, .hip, .lowerBack]),
        ex("bb-front-squat", "Barbell Front Squat", [.quads], [.glutes, .abs], [.barbell, .squatRack], .squat, compound: true, level: .advanced, oneRM: 75, joints: [.knee, .wrist]),
        ex("goblet-squat", "Goblet Squat", [.quads, .glutes], [.adductors, .abs], [.dumbbell], .squat, compound: true, oneRM: 36, joints: [.knee]),
        ex("leg-press", "Leg Press", [.quads, .glutes], [.hamstrings, .adductors], [.legPress], .squat, compound: true, oneRM: 160, joints: [.knee]),
        ex("smith-squat", "Smith Machine Squat", [.quads, .glutes], [.hamstrings], [.smithMachine], .squat, compound: true, oneRM: 85, joints: [.knee]),
        ex("air-squat", "Bodyweight Squat", [.quads, .glutes], [], [], .squat, compound: true, oneRM: 0, joints: [.knee]),
        ex("bb-deadlift", "Barbell Deadlift", [.hamstrings, .glutes, .lowerBack], [.upperBack, .forearms, .quads], [.barbell], .hinge, compound: true, oneRM: 110, joints: [.lowerBack, .hip]),
        ex("trap-bar-deadlift", "Trap Bar Deadlift", [.glutes, .quads, .hamstrings], [.lowerBack, .upperBack, .forearms], [.trapBar], .hinge, compound: true, oneRM: 115, joints: [.lowerBack, .hip, .knee]),
        ex("bb-rdl", "Barbell Romanian Deadlift", [.hamstrings, .glutes], [.lowerBack], [.barbell], .hinge, compound: true, oneRM: 85, joints: [.lowerBack]),
        ex("db-rdl", "Dumbbell Romanian Deadlift", [.hamstrings, .glutes], [.lowerBack], [.dumbbell], .hinge, compound: true, oneRM: 34, joints: [.lowerBack]),
        ex("kb-swing", "Kettlebell Swing", [.glutes, .hamstrings], [.lowerBack, .abs], [.kettlebell], .hinge, compound: true, oneRM: 40, joints: [.lowerBack]),
        ex("hip-thrust", "Barbell Hip Thrust", [.glutes], [.hamstrings], [.barbell, .bench], .hinge, compound: true, oneRM: 100, joints: [.hip]),
        ex("glute-bridge", "Glute Bridge", [.glutes], [.hamstrings], [], .hinge, compound: false, oneRM: 0),
        ex("db-lunge", "Dumbbell Lunge", [.quads, .glutes], [.hamstrings, .adductors], [.dumbbell], .lunge, compound: true, oneRM: 26, joints: [.knee]),
        ex("bulgarian-split-squat", "Dumbbell Bulgarian Split Squat", [.quads, .glutes], [.adductors], [.dumbbell, .bench], .lunge, compound: true, level: .intermediate, oneRM: 24, joints: [.knee]),
        ex("bw-lunge", "Bodyweight Lunge", [.quads, .glutes], [.hamstrings], [], .lunge, compound: true, oneRM: 0, joints: [.knee]),
        ex("step-up", "Dumbbell Step Up", [.quads, .glutes], [], [.dumbbell, .bench], .lunge, compound: true, oneRM: 22, joints: [.knee]),
        ex("leg-extension", "Leg Extension", [.quads], [], [.legExtension], .isolation, compound: false, oneRM: 70, joints: [.knee]),
        ex("leg-curl", "Lying Leg Curl", [.hamstrings], [.calves], [.legCurl], .isolation, compound: false, oneRM: 55, joints: [.knee]),
        ex("nordic-curl", "Nordic Hamstring Curl", [.hamstrings], [], [], .isolation, compound: false, level: .advanced, oneRM: 0, joints: [.knee]),
        ex("standing-calf-raise", "Standing Calf Raise", [.calves], [], [.smithMachine], .isolation, compound: false, oneRM: 100, joints: [.ankle]),
        ex("db-calf-raise", "Dumbbell Calf Raise", [.calves], [], [.dumbbell], .isolation, compound: false, oneRM: 30, joints: [.ankle]),
        ex("bw-calf-raise", "Bodyweight Calf Raise", [.calves], [], [], .isolation, compound: false, oneRM: 0, joints: [.ankle]),
        ex("cable-hip-adduction", "Cable Hip Adduction", [.adductors], [], [.cable], .isolation, compound: false, oneRM: 30, joints: [.hip]),
        ex("cable-hip-abduction", "Cable Hip Abduction", [.abductors], [.glutes], [.cable], .isolation, compound: false, oneRM: 25, joints: [.hip]),
        ex("band-lateral-walk", "Band Lateral Walk", [.abductors, .glutes], [], [.resistanceBand], .isolation, compound: false, oneRM: 0, joints: [.hip]),
        ex("copenhagen-plank", "Copenhagen Plank", [.adductors], [.abs], [.bench], .core, compound: false, level: .intermediate, oneRM: 0, joints: [.hip], timed: true),
    ]

    static let core: [Exercise] = [
        ex("plank", "Plank", [.abs], [.shoulders], [], .core, compound: false, oneRM: 0, timed: true),
        ex("crunch", "Crunch", [.abs], [], [], .core, compound: false, oneRM: 0, joints: [.neck]),
        ex("hanging-leg-raise", "Hanging Leg Raise", [.abs], [.forearms], [.pullUpBar], .core, compound: false, level: .intermediate, oneRM: 0),
        ex("cable-crunch", "Kneeling Cable Crunch", [.abs], [], [.cable], .core, compound: false, oneRM: 45),
        ex("dead-bug", "Dead Bug", [.abs], [], [], .core, compound: false, oneRM: 0),
        ex("farmer-carry", "Dumbbell Farmer's Carry", [.forearms, .upperBack], [.abs, .glutes], [.dumbbell], .carry, compound: true, oneRM: 40, timed: true),
    ]
}

/// A value behind a lock, readable from any thread.
final class Locked<Value>: @unchecked Sendable {
    private var value: Value
    private let lock = NSLock()

    init(_ value: Value) { self.value = value }

    func read() -> Value { lock.withLock { value } }
    func write(_ newValue: Value) { lock.withLock { value = newValue } }
}

extension Catalog {
    /// A reasonable starting 1RM for a new custom exercise: the median of built-ins that share its
    /// main muscle and loading equipment, falling back to looser matches.
    public static func suggestedStarterOneRM(primary: [Muscle], equipment: Set<Equipment>, isCompound: Bool) -> Double {
        let probe = Exercise(id: "probe", name: "", primary: primary, equipment: equipment,
                             pattern: isCompound ? .squat : .isolation, isCompound: isCompound, starterOneRM: 1)
        let loaded = builtIn.filter { !$0.isBodyweight }
        let tiers: [(Exercise) -> Bool] = [
            { $0.primary.first == primary.first && $0.loadEquipment == probe.loadEquipment && $0.isCompound == isCompound },
            { $0.primary.first == primary.first && $0.loadEquipment == probe.loadEquipment },
            { $0.loadEquipment == probe.loadEquipment && $0.isCompound == isCompound },
        ]
        for match in tiers {
            let values = loaded.filter(match).map(\.starterOneRM).sorted()
            if !values.isEmpty { return values[values.count / 2] }
        }
        return isCompound ? 40 : 15
    }
}
