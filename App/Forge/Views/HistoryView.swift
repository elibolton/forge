import Charts
import SwiftData
import SwiftUI
import WorkoutEngine

/// Every workout as a list; pushed from Progress.
struct HistoryView: View {
    let profile: Profile
    @Environment(\.modelContext) private var context
    @Environment(ToastCenter.self) private var toasts
    @Query(sort: \WorkoutLog.date, order: .reverse) private var logs: [WorkoutLog]

    var body: some View {
            List {
                if logs.isEmpty {
                    ContentUnavailableView("No workouts yet", systemImage: "calendar",
                                           description: Text("Finished workouts show up here."))
                }
                ForEach(logs) { log in
                    NavigationLink {
                        WorkoutLogDetail(log: log, profile: profile)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(log.focus?.title ?? "Workout").font(.headline)
                                Spacer()
                                Text(log.date, format: .dateTime.weekday().month().day()).foregroundStyle(.secondary)
                            }
                            Text(WorkoutSummary.text(log, units: profile.units))
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                }
                .onDelete { offsets in
                    for i in offsets { WorkoutSummary.delete(logs[i], context: context, toasts: toasts) }
                }
            }
            .navigationTitle("All Workouts")
            .navigationBarTitleDisplayMode(.inline)
    }
}

/// A saved workout. Edit opens a draft editor; deleting pops back here first, then removes it with Undo.
struct WorkoutLogDetail: View {
    let log: WorkoutLog
    let profile: Profile
    @Environment(\.modelContext) private var context
    @Environment(ToastCenter.self) private var toasts
    @Environment(\.dismiss) private var dismiss
    @State private var editing = false
    @State private var deleteRequested = false

    var body: some View {
        // A deleted log can't be read; this screen is on its way out by then.
        if log.modelContext == nil {
            Color.clear
        } else {
            content
        }
    }

    private var content: some View {
        let units = profile.units
        return List {
            Section {
                LabeledContent("Date", value: log.date.formatted(date: .complete, time: .shortened))
                if log.durationSeconds > 0 {
                    LabeledContent("Duration", value: "\(max(1, log.durationSeconds / 60)) min")
                }
                if log.volume > 0 { LabeledContent("Volume", value: units.format(log.volume)) }
            }
            ForEach(Array(log.exercises.enumerated()), id: \.offset) { _, logged in
                let e = Catalog.exercise(logged.exerciseID)
                Section {
                    ForEach(Array(logged.sets.enumerated()), id: \.offset) { i, set in
                        let number = logged.sets[..<i].filter { !$0.isWarmup }.count + 1
                        SetSummaryLine(set: set, label: set.isWarmup ? "W" : "\(number)", exercise: e, units: units)
                    }
                } header: {
                    NavigationLink(e.name) { ExerciseDetailView(profile: profile, exercise: e) }
                        .accessibilityAddTraits(.isHeader)
                }
            }
        }
        .navigationTitle(log.focus.map { "\($0.title) Day" } ?? "Workout")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Edit") { editing = true }
            }
        }
        .sheet(isPresented: $editing, onDismiss: deleteIfRequested) {
            WorkoutLogEditor(log: log, profile: profile) { deleteRequested = true }
        }
    }

    /// Runs after the editor is gone: leave this screen, then delete so nothing reads the removed log.
    private func deleteIfRequested() {
        guard deleteRequested else { return }
        deleteRequested = false
        dismiss()
        Task {
            try? await Task.sleep(for: .milliseconds(400))
            WorkoutSummary.delete(log, context: context, toasts: toasts)
        }
    }
}

struct ExerciseDetailView: View {
    @Bindable var profile: Profile
    let initial: Exercise
    @Environment(HistoryStore.self) private var history
    @Environment(ToastCenter.self) private var toasts
    @Environment(\.dismiss) private var dismiss
    @State private var editing = false

    init(profile: Profile, exercise: Exercise) {
        self.profile = profile
        initial = exercise
    }

    /// Re-read so edits to a custom exercise show immediately.
    private var exercise: Exercise { Catalog.byID[initial.id] ?? initial }
    private var sessions: [(date: Date, logged: LoggedExercise)] { history.sessions[exercise.id] ?? [] }

    var body: some View {
        List {
            Section {
                HStack(spacing: 14) {
                    ExerciseThumb(exercise: exercise, size: 56)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(exercise.name).font(.title3.bold())
                        Text(exercise.isCustom ? "Custom exercise" : exercise.isCompound ? "Compound lift" : "Isolation")
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                }
                .listRowBackground(Color.clear)
            }

            if let guide = Instructions.guide(for: exercise) {
                Section("How To") { ExerciseGuideView(guide: guide) }
            } else if exercise.isCustom {
                Section("How To") {
                    Button("Add your own cues", systemImage: "square.and.pencil") { editing = true }
                }
            }

            Section {
                LabeledContent("Primary", value: exercise.primary.map(\.displayName).joined(separator: ", "))
                if !exercise.secondary.isEmpty {
                    LabeledContent("Secondary", value: exercise.secondary.map(\.displayName).joined(separator: ", "))
                }
                LabeledContent("Equipment", value: exercise.equipment.isEmpty ? "None" : exercise.equipment.map(\.title).sorted().joined(separator: ", "))
                Picker("Recommend", selection: Binding(
                    get: { profile.plan.preferences[exercise.id] },
                    set: { profile.plan.preferences[exercise.id] = $0 })) {
                    Text("Normally").tag(ExercisePreference?.none)
                    Text("More often").tag(ExercisePreference?.some(.more))
                    Text("Less often").tag(ExercisePreference?.some(.less))
                    Text("Never").tag(ExercisePreference?.some(.exclude))
                }
            }

            if !exercise.isBodyweight, !sessions.isEmpty {
                Section("Estimated 1RM") {
                    Chart(sessions.compactMap { s in best(s.logged).map { (s.date, $0) } }, id: \.0) { point in
                        LineMark(x: .value("Date", point.0), y: .value(profile.units.symbol, profile.units.display(point.1)))
                        PointMark(x: .value("Date", point.0), y: .value(profile.units.symbol, profile.units.display(point.1)))
                    }
                    .frame(height: 180)
                    if let top = sessions.compactMap({ best($0.logged) }).max() {
                        LabeledContent("Best", value: profile.units.format(top))
                    }
                }
            }

            Section("History") {
                if sessions.isEmpty { Text("Not logged yet.").foregroundStyle(.secondary) }
                ForEach(Array(sessions.enumerated()), id: \.offset) { _, s in
                    VStack(alignment: .leading) {
                        Text(s.date, format: .dateTime.month().day().year()).font(.subheadline.bold())
                        Text(s.logged.workingSets.map { set in
                            exercise.isBodyweight ? "\(set.reps)" : "\(profile.units.format(set.weight))×\(set.reps)"
                        }.joined(separator: ", "))
                        .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                    }
                }
            }

            if exercise.isCustom {
                Section {
                    Button("Edit Exercise", systemImage: "pencil") { editing = true }
                    Button(sessions.isEmpty ? "Delete Exercise" : "Hide from Recommendations",
                           systemImage: sessions.isEmpty ? "trash" : "eye.slash", role: .destructive) {
                        let deleting = sessions.isEmpty
                        CustomExerciseActions.remove(exercise, profile: profile, history: history, toasts: toasts)
                        if deleting { dismiss() }
                    }
                } footer: {
                    if !sessions.isEmpty {
                        Text("It's in your history, so it can't be deleted without losing those records.")
                    }
                }
            }
        }
        .navigationTitle(exercise.name)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $editing) {
            CustomExerciseEditor(profile: profile, existing: exercise) { _ in }
        }
    }

    private func best(_ logged: LoggedExercise) -> Double? {
        logged.workingSets.filter { $0.weight > 0 }.map { Strength.oneRM(weight: $0.weight, reps: $0.reps, rir: $0.rir) }.max()
    }
}

extension Exercise: @retroactive Identifiable {}
