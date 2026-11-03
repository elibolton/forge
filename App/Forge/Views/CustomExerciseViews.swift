import SwiftData
import SwiftUI
import WorkoutEngine

// MARK: - Editor

/// Create or edit a custom exercise. Only name and main muscle are required; the rest has sensible defaults.
struct CustomExerciseEditor: View {
    let profile: Profile
    /// nil when creating.
    let existing: Exercise?
    let onSave: (Exercise) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var movement: MovementPattern
    @State private var primary: Set<Muscle>
    @State private var secondary: Set<Muscle>
    @State private var equipment: Set<Equipment>
    @State private var tracking: Tracking
    @State private var notes: String

    enum Tracking: String, CaseIterable { case weight, bodyweight, time }

    init(profile: Profile, existing: Exercise? = nil, initialName: String = "", onSave: @escaping (Exercise) -> Void) {
        self.profile = profile
        self.existing = existing
        self.onSave = onSave
        _name = State(initialValue: existing?.name ?? initialName)
        _movement = State(initialValue: existing?.pattern ?? .isolation)
        _primary = State(initialValue: Set(existing?.primary ?? []))
        _secondary = State(initialValue: Set(existing?.secondary ?? []))
        _equipment = State(initialValue: existing?.equipment ?? [.dumbbell])
        _tracking = State(initialValue: existing.map { $0.isTimed ? .time : $0.isBodyweight ? .bodyweight : .weight } ?? .weight)
        _notes = State(initialValue: existing?.notes ?? "")
    }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canSave: Bool { !trimmedName.isEmpty && !primary.isEmpty }

    /// Another exercise already uses this name; allowed, but worth pointing out.
    private var duplicate: Exercise? {
        Catalog.all.first { $0.id != existing?.id && $0.name.caseInsensitiveCompare(trimmedName) == .orderedSame }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                        .font(.headline)
                } footer: {
                    if let duplicate {
                        Text("\(duplicate.name) already exists\(duplicate.isCustom ? "" : " in the library"). You can still save this one.")
                    }
                }

                Section("What it trains") {
                    NavigationLink {
                        MuscleSelection(title: "Main Muscles", selection: $primary, excluded: [])
                    } label: {
                        LabeledContent("Main muscles", value: summary(primary, empty: "Required"))
                    }
                    .foregroundStyle(primary.isEmpty ? Theme.accent : .primary)
                    NavigationLink {
                        MuscleSelection(title: "Also Works", selection: $secondary, excluded: primary)
                    } label: {
                        LabeledContent("Also works", value: summary(secondary, empty: "None"))
                    }
                    Picker("Movement", selection: $movement) {
                        ForEach(Self.movements, id: \.0) { pattern, title in Text(title).tag(pattern) }
                    }
                }

                Section {
                    Picker("Track", selection: $tracking) {
                        Text("Weight & reps").tag(Tracking.weight)
                        Text("Reps only").tag(Tracking.bodyweight)
                        Text("Time").tag(Tracking.time)
                    }
                    NavigationLink {
                        EquipmentSelection(selection: $equipment)
                    } label: {
                        LabeledContent("Equipment", value: equipment.isEmpty ? "None" : equipment.map(\.title).sorted().joined(separator: ", "))
                            .lineLimit(1)
                    }
                } footer: {
                    Text("Forge only suggests this exercise when your gym has all of the equipment listed.")
                }

                Section {
                    TextField("One cue per line, e.g. \"Keep elbows tucked\"", text: $notes, axis: .vertical)
                        .lineLimit(3...8)
                } header: {
                    Text("How to (optional)")
                }
            }
            .navigationTitle(existing == nil ? "New Exercise" : "Edit Exercise")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save).bold().disabled(!canSave)
                }
            }
            .onChange(of: primary) { _, new in secondary.subtract(new) }
        }
    }

    static let movements: [(MovementPattern, String)] = [
        (.isolation, "Isolation (one joint)"),
        (.horizontalPush, "Press forward"),
        (.verticalPush, "Press overhead"),
        (.horizontalPull, "Row"),
        (.verticalPull, "Pull-down / pull-up"),
        (.squat, "Squat"),
        (.hinge, "Hinge"),
        (.lunge, "Lunge / single leg"),
        (.core, "Core"),
        (.carry, "Carry"),
    ]

    private func summary(_ muscles: Set<Muscle>, empty: String) -> String {
        muscles.isEmpty ? empty : Muscle.allCases.filter(muscles.contains).map(\.displayName).joined(separator: ", ")
    }

    private func save() {
        let orderedPrimary = Muscle.allCases.filter(primary.contains)
        let isCompound = ![.isolation, .core].contains(movement)
        let starter = tracking == .weight
            ? (existing.flatMap { $0.isBodyweight ? nil : $0.starterOneRM }
               ?? Catalog.suggestedStarterOneRM(primary: orderedPrimary, equipment: equipment, isCompound: isCompound))
            : 0
        let exercise = Exercise(
            id: existing?.id ?? Self.makeID(trimmedName),
            name: trimmedName,
            primary: orderedPrimary,
            secondary: Muscle.allCases.filter(secondary.contains),
            equipment: equipment,
            pattern: movement,
            isCompound: isCompound,
            level: existing?.level ?? .beginner,
            starterOneRM: starter,
            jointsStressed: Self.likelyJoints(movement),
            isTimed: tracking == .time,
            notes: notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : notes)
        profile.saveCustomExercise(exercise)
        onSave(exercise)
        dismiss()
    }

    static func makeID(_ name: String) -> String {
        let slug = name.lowercased().map { $0.isLetter || $0.isNumber ? $0 : "-" }
            .split(separator: "-", omittingEmptySubsequences: true).joined(separator: "-")
        return "\(Catalog.customPrefix)\(slug.prefix(30))-\(UUID().uuidString.prefix(6).lowercased())"
    }

    /// So injury settings still apply to custom exercises.
    static func likelyJoints(_ pattern: MovementPattern) -> Set<Joint> {
        switch pattern {
        case .squat, .lunge: [.knee]
        case .hinge: [.lowerBack, .hip]
        case .verticalPush: [.shoulder]
        case .horizontalPush: [.shoulder, .elbow]
        default: []
        }
    }
}

private struct MuscleSelection: View {
    let title: String
    @Binding var selection: Set<Muscle>
    let excluded: Set<Muscle>

    var body: some View {
        List(Muscle.allCases.filter { !excluded.contains($0) }) { muscle in
            Button {
                if selection.contains(muscle) { selection.remove(muscle) } else { selection.insert(muscle) }
            } label: {
                HStack {
                    Text(muscle.displayName).foregroundStyle(.primary)
                    Spacer()
                    if selection.contains(muscle) { Image(systemName: "checkmark").foregroundStyle(Theme.accent).bold() }
                }
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct EquipmentSelection: View {
    @Binding var selection: Set<Equipment>

    var body: some View {
        List {
            Section {
                Button {
                    selection.removeAll()
                } label: {
                    HStack {
                        Text("No equipment").foregroundStyle(.primary)
                        Spacer()
                        if selection.isEmpty { Image(systemName: "checkmark").foregroundStyle(Theme.accent).bold() }
                    }
                }
            }
            Section {
                ForEach(Equipment.allCases, id: \.self) { item in
                    Button {
                        if selection.contains(item) { selection.remove(item) } else { selection.insert(item) }
                    } label: {
                        HStack {
                            Text(item.title).foregroundStyle(.primary)
                            Spacer()
                            if selection.contains(item) { Image(systemName: "checkmark").foregroundStyle(Theme.accent).bold() }
                        }
                    }
                }
            }
        }
        .navigationTitle("Equipment")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - My Exercises

struct CustomExerciseList: View {
    @Bindable var profile: Profile
    @Environment(HistoryStore.self) private var history
    @Environment(ToastCenter.self) private var toasts
    @State private var creating = false

    var body: some View {
        let exercises = profile.customExercises.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
        List {
            if exercises.isEmpty {
                ContentUnavailableView {
                    Label("No custom exercises", systemImage: "plus.square.dashed")
                } description: {
                    Text("Add the movements your gym has that Forge's library doesn't. They're used in generated workouts like any other exercise.")
                } actions: {
                    Button("New Exercise") { creating = true }.buttonStyle(.borderedProminent)
                }
            }
            ForEach(exercises) { e in
                NavigationLink {
                    ExerciseDetailView(profile: profile, exercise: e)
                } label: {
                    HStack(spacing: 12) {
                        ExerciseThumb(exercise: e, size: 40)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(e.name)
                            Text(e.primary.map(\.displayName).joined(separator: ", ")).font(.caption).foregroundStyle(Theme.muted)
                        }
                    }
                }
            }
            .onDelete { offsets in
                for i in offsets { CustomExerciseActions.remove(exercises[i], profile: profile, history: history, toasts: toasts) }
            }
        }
        .navigationTitle("My Exercises")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            Button("New Exercise", systemImage: "plus") { creating = true }
        }
        .sheet(isPresented: $creating) {
            CustomExerciseEditor(profile: profile) { _ in }
        }
    }
}

enum CustomExerciseActions {
    /// Deletes an unused custom exercise (with Undo). One that appears in history is hidden from
    /// recommendations instead, so past workouts keep its name.
    @MainActor
    static func remove(_ exercise: Exercise, profile: Profile, history: HistoryStore, toasts: ToastCenter) {
        let uses = history.sessions[exercise.id]?.count ?? 0
        if uses > 0 {
            let previous = profile.plan.preferences[exercise.id]
            profile.plan.preferences[exercise.id] = .exclude
            toasts.show("Used in \(uses) workout\(uses == 1 ? "" : "s"), so it's hidden instead") {
                profile.plan.preferences[exercise.id] = previous
            }
            return
        }
        let before = profile.customExercises
        let todayBefore = TodayPlanStore.load()
        profile.customExercises = before.filter { $0.id != exercise.id }
        profile.plan.preferences[exercise.id] = nil
        // Don't leave it in today's saved workout.
        if var today = todayBefore {
            today.workout.exercises.removeAll { $0.exercise.id == exercise.id }
            TodayPlanStore.save(today)
        }
        toasts.show("Deleted \(exercise.name)") {
            profile.customExercises = before
            if let todayBefore { TodayPlanStore.save(todayBefore) }
        }
    }
}

// MARK: - How-to

/// Numbered cues plus the common mistake, shown on exercise detail.
struct ExerciseGuideView: View {
    let guide: ExerciseGuide

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(guide.steps.enumerated()), id: \.offset) { i, step in
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text("\(i + 1)")
                        .font(.caption.bold())
                        .frame(width: 22, height: 22)
                        .background(Theme.accent.opacity(0.2), in: Circle())
                        .foregroundStyle(Theme.accent)
                    Text(step).font(.subheadline)
                }
            }
            if let mistake = guide.mistake {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .frame(width: 22)
                        .foregroundStyle(Theme.recovering)
                    Text("Avoid: ").font(.subheadline.bold()) + Text(mistake).font(.subheadline)
                }
                .padding(.top, 2)
            }
        }
        .padding(.vertical, 4)
    }
}
