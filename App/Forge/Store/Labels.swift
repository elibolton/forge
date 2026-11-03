import SwiftUI
import WorkoutEngine

// Display names and colors for engine enums.

extension Goal {
    var title: String {
        switch self {
        case .buildMuscle: "Build Muscle"
        case .getLean: "Get Lean"
        case .getStronger: "Get Stronger"
        case .reduceBodyweight: "Reduce Bodyweight"
        case .improveFitness: "Improve Fitness"
        case .powerlifting: "Powerlifting"
        }
    }
}

extension Level {
    static let all: [Level] = [.beginner, .intermediate, .advanced]
    var title: String {
        switch self {
        case .beginner: "Beginner"
        case .intermediate: "Intermediate"
        case .advanced: "Advanced"
        }
    }
}

extension Split {
    var title: String {
        switch self {
        case .pushPullLegs: "Push / Pull / Legs"
        case .upperLower: "Upper / Lower"
        case .fullBody: "Full Body"
        case .freshMuscles: "Freshest Muscles"
        }
    }
}

extension Variability {
    static let all: [Variability] = [.consistent, .balanced, .variable]
    var title: String {
        switch self {
        case .consistent: "More Consistent"
        case .balanced: "Balanced"
        case .variable: "More Variety"
        }
    }
}

extension DayFocus {
    static let swappable: [DayFocus] = [.recovered, .push, .pull, .legs, .upper, .lower, .fullBody]
    var title: String {
        switch self {
        case .push: "Push"
        case .pull: "Pull"
        case .legs: "Legs"
        case .upper: "Upper Body"
        case .lower: "Lower Body"
        case .fullBody: "Full Body"
        case .recovered: "Recovered Muscles"
        }
    }
}

extension Equipment {
    var title: String {
        switch self {
        case .barbell: "Barbell"
        case .ezBar: "EZ Bar"
        case .trapBar: "Trap Bar"
        case .dumbbell: "Dumbbells"
        case .kettlebell: "Kettlebells"
        case .bench: "Bench"
        case .squatRack: "Squat Rack"
        case .pullUpBar: "Pull-Up Bar"
        case .dipStation: "Dip Station"
        case .cable: "Cable Machine"
        case .latPulldown: "Lat Pulldown"
        case .legPress: "Leg Press"
        case .legCurl: "Leg Curl"
        case .legExtension: "Leg Extension"
        case .chestPressMachine: "Chest Press Machine"
        case .shoulderPressMachine: "Shoulder Press Machine"
        case .smithMachine: "Smith Machine"
        case .resistanceBand: "Resistance Bands"
        }
    }
}

extension Joint {
    var title: String {
        switch self {
        case .lowerBack: "Lower Back"
        default: rawValue.capitalized
        }
    }
}

extension ExercisePreference {
    var title: String {
        switch self {
        case .more: "Recommend More"
        case .less: "Recommend Less"
        case .exclude: "Never Recommend"
        }
    }
}

enum RecoveryColor {
    static func color(_ value: Double) -> Color { Theme.recovery(value) }
}
