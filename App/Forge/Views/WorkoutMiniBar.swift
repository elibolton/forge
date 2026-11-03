import SwiftUI
import WorkoutEngine

/// Shows the minimized workout above the tab bar; tap to reopen the logger.
private struct WorkoutMiniBar: View {
    @Environment(WorkoutSession.self) private var session
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        if let state = session.state, !session.isExpanded {
            let current = state.exercises.indices.contains(state.currentIndex) ? state.exercises[state.currentIndex] : nil
            Button { session.isExpanded = true } label: {
                HStack(spacing: 12) {
                    if let current {
                        ExerciseThumb(exercise: current.exercise, size: 40)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(current?.exercise.name ?? "Workout in progress").font(.subheadline.bold())
                            .lineLimit(typeSize.isAccessibilitySize ? 2 : 1)
                        TimelineView(.periodic(from: .now, by: 1)) { context in
                            Text(status(state: state, current: current, now: context.date))
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(session.restEndsAt.map { $0 > context.date } == true ? Theme.accent : Theme.muted)
                        }
                    }
                    Spacer()
                    Image(systemName: "chevron.up").font(.subheadline.bold()).foregroundStyle(Theme.muted)
                }
                .padding(12)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Theme.accent.opacity(0.35)))
                .padding(.horizontal)
                .padding(.bottom, 6)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Resume workout")
            .accessibilityValue(current?.exercise.name ?? "")
            .transition(Motion.transition(.move(edge: .bottom).combined(with: .opacity)))
        }
    }

    private func status(state: SessionState, current: SessionExercise?, now: Date) -> String {
        if let end = session.restEndsAt, end > now {
            return "Resting · \(Duration.seconds(Int(end.timeIntervalSince(now).rounded(.up))).formatted(.time(pattern: .minuteSecond)))"
        }
        let elapsed = Duration.seconds(Int(now.timeIntervalSince(state.startedAt))).formatted(.time(pattern: .minuteSecond))
        guard let current else { return elapsed }
        let working = current.sets.filter { !$0.isWarmup }
        let next = min(working.filter(\.done).count + 1, working.count)
        return "Set \(next) of \(working.count) · \(elapsed)"
    }
}

extension View {
    func workoutMiniBar() -> some View {
        safeAreaInset(edge: .bottom) { WorkoutMiniBar() }
    }
}
