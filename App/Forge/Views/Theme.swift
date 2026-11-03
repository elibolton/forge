import SwiftUI
import WorkoutEngine

/// App-wide look. The app always runs in dark mode; system grouped colors keep List screens consistent with custom ones.
enum Theme {
    static let background = Color(uiColor: .systemGroupedBackground)
    static let card = Color(uiColor: .secondarySystemGroupedBackground)
    static let raised = Color(uiColor: .tertiarySystemGroupedBackground)
    static let accent = Color(red: 1.0, green: 0.42, blue: 0.18)
    /// Secondary text. About 6:1 on cards; brighter still when Increase Contrast is on.
    static let muted = Color(uiColor: UIColor { traits in
        UIColor(white: 1, alpha: traits.accessibilityContrast == .high ? 0.75 : 0.55)
    })

    static let fresh = Color(red: 0.36, green: 0.86, blue: 0.62)
    static let recovering = Color(red: 1.0, green: 0.78, blue: 0.3)
    static let fatigued = Color(red: 1.0, green: 0.36, blue: 0.4)

    /// Wide, heavy display type for screen titles and big numbers. Prefer `.displayFont(_:)` in views,
    /// which also grows with Dynamic Type.
    static func display(_ size: CGFloat) -> Font {
        .system(size: size, weight: .heavy).width(.expanded)
    }

    /// How much display type grows per Dynamic Type size; capped so big numbers still fit on a phone.
    static func displayScale(_ typeSize: DynamicTypeSize) -> CGFloat {
        switch typeSize {
        case .xSmall: 0.85
        case .small: 0.9
        case .medium: 0.95
        case .large: 1
        case .xLarge: 1.1
        case .xxLarge: 1.2
        case .xxxLarge: 1.3
        case .accessibility1: 1.4
        case .accessibility2: 1.5
        default: 1.6
        }
    }

    static func recovery(_ value: Double) -> Color {
        switch Recovery.status(value) {
        case .fresh: fresh
        case .recovering: recovering
        case .fatigued: fatigued
        }
    }
}

/// Animations that respect Reduce Motion: springs become short fades and slides become cross-fades.
enum Motion {
    static var reduced: Bool { UIAccessibility.isReduceMotionEnabled }

    static var snappy: Animation { reduced ? .easeInOut(duration: 0.2) : .snappy }

    static func transition(_ full: AnyTransition) -> AnyTransition { reduced ? .opacity : full }
}

private struct DisplayFont: ViewModifier {
    let size: CGFloat
    let monospacedDigits: Bool
    @Environment(\.dynamicTypeSize) private var typeSize

    func body(content: Content) -> some View {
        let font = Theme.display(size * Theme.displayScale(typeSize))
        content.font(monospacedDigits ? font.monospacedDigit() : font)
    }
}

extension View {
    /// `Theme.display` scaled for the current Dynamic Type size.
    func displayFont(_ size: CGFloat, monospacedDigits: Bool = false) -> some View {
        modifier(DisplayFont(size: size, monospacedDigits: monospacedDigits))
    }
}

extension View {
    func card(padding: CGFloat = 16) -> some View {
        self.padding(padding)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

/// Pill-shaped control used for filters and quick settings.
struct Chip<Label: View>: View {
    var highlighted = false
    @ViewBuilder var label: Label

    var body: some View {
        label
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(highlighted ? AnyShapeStyle(Theme.accent.opacity(0.22)) : AnyShapeStyle(Theme.raised), in: Capsule())
            .foregroundStyle(highlighted ? Theme.accent : .primary)
    }
}

/// Stand-in for exercise photos: a tile tinted by body region with a movement icon.
struct ExerciseThumb: View {
    let exercise: Exercise
    var size: CGFloat = 60

    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.27, style: .continuous)
            .fill(LinearGradient(colors: [tint.opacity(0.9), tint.opacity(0.35)], startPoint: .topLeading, endPoint: .bottomTrailing))
            .frame(width: size, height: size)
            .overlay {
                Image(systemName: symbol)
                    .font(.system(size: size * 0.42, weight: .semibold))
                    .foregroundStyle(.white)
            }
            // Decorative: the exercise name is always next to it.
            .accessibilityHidden(true)
    }

    private var symbol: String {
        switch exercise.pattern {
        case .squat: "figure.strengthtraining.functional"
        case .hinge: "figure.strengthtraining.traditional"
        case .lunge: "figure.step.training"
        case .horizontalPush: "dumbbell.fill"
        case .verticalPush: "figure.arms.open"
        case .horizontalPull: "figure.rower"
        case .verticalPull: "figure.climbing"
        case .isolation: exercise.equipment.contains(.cable) ? "cable.connector" : "dumbbell.fill"
        case .core: "figure.core.training"
        case .carry: "figure.walk"
        }
    }

    private var tint: Color {
        switch exercise.primary.first ?? .chest {
        case .chest, .shoulders, .triceps: Color(red: 1.0, green: 0.45, blue: 0.25)
        case .lats, .upperBack, .biceps, .forearms: Color(red: 0.3, green: 0.55, blue: 1.0)
        case .quads, .hamstrings, .glutes, .calves, .adductors, .abductors: Color(red: 0.62, green: 0.4, blue: 1.0)
        case .abs, .lowerBack: Color(red: 0.2, green: 0.78, blue: 0.75)
        }
    }
}

/// Circular recovery gauge with the percentage inside.
struct RecoveryRing: View {
    let value: Double
    var size: CGFloat = 64
    var lineWidth: CGFloat = 6

    var body: some View {
        ZStack {
            Circle().stroke(Theme.raised, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: max(0.02, value))
                .stroke(Theme.recovery(value), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(Int((value * 100).rounded()))%")
                .font(.system(size: size * 0.24, weight: .bold).monospacedDigit())
        }
        .frame(width: size, height: size)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Recovery")
        .accessibilityValue(RecoveryRing.spoken(value))
    }

    static func spoken(_ value: Double) -> String { "\(Int((value * 100).rounded())) percent recovered" }
}

/// Muscle name under a ring, for horizontal strips and grids.
struct MuscleRecoveryTile: View {
    let muscle: Muscle
    let value: Double
    /// Fill the available width (grids) instead of hugging the content (horizontal strips).
    var fillsWidth = false
    /// Grows with Dynamic Type so long names ("Upper Back") and the percentage stay readable,
    /// capped so two tiles still fit side by side at the largest sizes.
    @ScaledMetric(relativeTo: .caption) private var scaledWidth: CGFloat = 86
    @ScaledMetric(relativeTo: .caption) private var scaledRing: CGFloat = 64
    private var width: CGFloat { min(scaledWidth, 130) }
    private var ringSize: CGFloat { min(scaledRing, 84) }

    var body: some View {
        VStack(spacing: 8) {
            RecoveryRing(value: value, size: ringSize)
            Text(muscle.displayName)
                .font(.caption.weight(.semibold))
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
        }
        .padding(.horizontal, 6)
        .frame(minWidth: width, maxWidth: fillsWidth ? .infinity : nil)
        .padding(.vertical, 12)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        // Reads as "Chest, 76 percent recovered".
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(muscle.displayName)
        .accessibilityValue(RecoveryRing.spoken(value))
    }
}

/// Wide accent button pinned over content.
struct FloatingActionButton: View {
    let title: String
    let systemImage: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.headline)
                .padding(.horizontal, 28)
                .padding(.vertical, 16)
                .background(Theme.accent, in: Capsule())
                .foregroundStyle(.white)
                .shadow(color: Theme.accent.opacity(0.45), radius: 18, y: 8)
        }
        .buttonStyle(.plain)
        // It floats over content, so it can't grow without covering it; long-press shows it large instead.
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .accessibilityShowsLargeContentViewer()
    }
}
