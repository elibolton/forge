import SwiftData
import SwiftUI
import WorkoutEngine

@main
struct ForgeApp: App {
    @State private var session = WorkoutSession()
    @State private var toasts = ToastCenter()
    @State private var history = HistoryStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(toasts)
                .environment(history)
                .preferredColorScheme(.dark)
                .tint(Theme.accent)
        }
        .modelContainer(for: [Profile.self, WorkoutLog.self])
    }
}

struct RootView: View {
    @Query(sort: \Profile.createdAt) private var profiles: [Profile]

    var body: some View {
        if let profile = profiles.first {
            MainTabs(profile: profile)
        } else {
            OnboardingView()
        }
    }
}

struct MainTabs: View {
    @Bindable var profile: Profile
    @Environment(WorkoutSession.self) private var session
    @Environment(HistoryStore.self) private var history
    @Query(sort: \WorkoutLog.date, order: .reverse) private var logs: [WorkoutLog]

    /// Changes whenever a workout is added, removed or edited, including edits that keep the same
    /// size (100 → 105 kg) or move an older workout's date. Hashing every log's bytes takes well under
    /// a millisecond even for years of history.
    private var logsSignature: Int {
        var hasher = Hasher()
        for log in logs {
            hasher.combine(log.date)
            hasher.combine(log.exercisesData)
        }
        return hasher.finalize()
    }

    init(profile: Profile) {
        self.profile = profile
        // Before anything plans or renders, so saved custom exercises resolve by id.
        Catalog.setCustom(profile.customExercises)
    }

    var body: some View {
        @Bindable var session = session
        TabView {
            Tab("Today", systemImage: "dumbbell.fill") { TodayView(profile: profile).workoutMiniBar() }
            Tab("Progress", systemImage: "chart.line.uptrend.xyaxis") { ProgressScreen(profile: profile).workoutMiniBar() }
            Tab("You", systemImage: "person.crop.circle") { PlanView(profile: profile).workoutMiniBar() }
        }
        // Dismissing the logger only minimizes it; discarding is an explicit action with Undo.
        .fullScreenCover(isPresented: Binding(get: { session.isActive && session.isExpanded },
                                              set: { session.isExpanded = $0 })) {
            ActiveWorkoutView(profile: profile)
        }
        .toastHost()
        .task(id: logsSignature) { history.sync(logs) }
        .sheet(item: $session.finished) { finished in
            FinishSummary(records: finished.records, units: profile.units)
        }
    }
}
