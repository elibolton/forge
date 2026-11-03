import SwiftData
import SwiftUI
import WorkoutEngine

/// Edits a saved workout as a draft: nothing is written until Save, and Save shows an Undo banner.
struct WorkoutLogEditor: View {
    let log: WorkoutLog
    let profile: Profile
    /// Called after the sheet is asked to close; the caller deletes once it's gone.
    let onDelete: () -> Void
    @Environment(\.modelContext) private var context
    @Environment(ToastCenter.self) private var toasts
    @Environment(HistoryStore.self) private var history
    @Environment(\.dismiss) private var dismiss

    @State private var date: Date
    @State private var exercises: [DraftExercise]
    /// The set whose steppers are open; one at a time keeps the list scannable.
    @State private var selectedSet: UUID?
    @State private var adding = false

    private var units: WeightUnits { profile.units }

    init(log: WorkoutLog, profile: Profile, onDelete: @escaping () -> Void) {
        self.log = log
        self.profile = profile
        self.onDelete = onDelete
        _date = State(initialValue: log.date)
        _exercises = State(initialValue: log.exercises.map(DraftExercise.init))
    }

    private var edited: [LoggedExercise] { exercises.compactMap(\.logged) }
    private var hasChanges: Bool { date != log.date || JSON.encode(edited) != log.exercisesData }
    private var hasSets: Bool { !edited.isEmpty }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    DatePicker("Date", selection: $date, in: ...Date.now)
                }

                ForEach($exercises) { $exercise in
                    exerciseSection($exercise)
                }

                Section {
                    Button("Add Exercise", systemImage: "plus") { adding = true }
                }

                Section {
                    Button("Delete Workout", systemImage: "trash", role: .destructive) {
                        dismiss()
                        onDelete()
                    }
                } footer: {
                    if !hasSets { Text("A workout needs at least one set. Add one, or delete the workout.") }
                }
            }
            .navigationTitle("Edit Workout")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save).fontWeight(.bold).disabled(!hasSets)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) }
                }
            }
            .sheet(isPresented: $adding) {
                ExercisePicker(title: "Add Exercise", exercises: Catalog.all, profile: profile) { add($0) }
            }
            .animation(Motion.snappy, value: selectedSet)
        }
        // Swiping the sheet away would silently lose edits; Cancel is the explicit way out.
        .interactiveDismissDisabled(hasChanges)
    }

    // MARK: Sections

    private func exerciseSection(_ exercise: Binding<DraftExercise>) -> some View {
        let e = exercise.wrappedValue.exercise
        return Section {
            ForEach(exercise.sets) { $set in
                setRow($set, label: label(for: set.id, in: exercise.wrappedValue), exercise: e)
            }
            .onDelete { exercise.wrappedValue.sets.remove(atOffsets: $0) }

            Button("Add Set", systemImage: "plus") { addSet(to: exercise) }
                .font(.subheadline.weight(.semibold))
        } header: {
            HStack {
                Text(e.name).accessibilityAddTraits(.isHeader)
                Spacer()
                Menu {
                    Button("Remove Exercise", systemImage: "trash", role: .destructive) {
                        removeExercise(exercise.wrappedValue.id)
                    }
                } label: {
                    Image(systemName: "ellipsis.circle").font(.body)
                }
                .accessibilityLabel("\(e.name) options")
            }
        }
    }

    private func setRow(_ set: Binding<DraftSet>, label: String, exercise: Exercise) -> some View {
        let isSelected = selectedSet == set.wrappedValue.id
        return VStack(spacing: 12) {
            Button {
                selectedSet = isSelected ? nil : set.wrappedValue.id
            } label: {
                SetSummaryLine(set: set.wrappedValue.set, label: label, exercise: exercise, units: units, isSelected: isSelected)
            }
            .buttonStyle(.plain)

            if isSelected {
                SetFields(set: set, exercise: exercise, units: units, weightStep: profile.weightStep(for: exercise))
                    .transition(Motion.transition(.opacity.combined(with: .move(edge: .top))))
            }
        }
    }

    private func label(for id: UUID, in exercise: DraftExercise) -> String {
        guard let set = exercise.sets.first(where: { $0.id == id }) else { return "" }
        if set.set.isWarmup { return "W" }
        return "\((exercise.sets.filter { !$0.set.isWarmup }.firstIndex { $0.id == id } ?? 0) + 1)"
    }

    // MARK: Edits

    private func addSet(to exercise: Binding<DraftExercise>) {
        let last = exercise.wrappedValue.sets.last { !$0.set.isWarmup }?.set
        let set = DraftSet(LoggedSet(weight: last?.weight ?? 0, reps: last?.reps ?? 10, rir: last?.rir))
        exercise.wrappedValue.sets.append(set)
        selectedSet = set.id
    }

    private func add(_ exercise: Exercise) {
        // Prefill from what Forge would prescribe now; usually close to what was actually lifted.
        let planned = profile.planner(history: history.records).prescribe(exercise)
        let first = planned.workingSets.first
        let set = DraftSet(LoggedSet(weight: first?.weight ?? 0, reps: first?.reps ?? 10))
        exercises.append(DraftExercise(id: UUID(), exerciseID: exercise.id, targetReps: nil, sets: [set]))
        selectedSet = set.id
    }

    private func removeExercise(_ id: UUID) {
        guard let index = exercises.firstIndex(where: { $0.id == id }) else { return }
        let removed = exercises.remove(at: index)
        toasts.show("Removed \(removed.exercise.name)") {
            exercises.insert(removed, at: min(index, exercises.count))
        }
    }

    private func save() {
        guard hasChanges else { return dismiss() }
        let oldDate = log.date, oldData = log.exercisesData
        log.date = date
        log.exercises = edited
        try? context.save()
        dismiss()
        toasts.show("Workout updated") { [log, context] in
            // Deleted since; its Undo banner restores it instead.
            guard log.modelContext != nil else { return }
            log.date = oldDate
            log.exercisesData = oldData
            try? context.save()
        }
    }
}

// MARK: - Draft model

/// Logged sets have no identity of their own; drafts add one so rows can be edited and deleted.
struct DraftSet: Identifiable, Hashable {
    let id = UUID()
    var set: LoggedSet

    init(_ set: LoggedSet) { self.set = set }
}

struct DraftExercise: Identifiable, Hashable {
    let id: UUID
    let exerciseID: String
    let targetReps: Int?
    var sets: [DraftSet]

    var exercise: Exercise { Catalog.exercise(exerciseID) }

    init(id: UUID, exerciseID: String, targetReps: Int?, sets: [DraftSet]) {
        self.id = id; self.exerciseID = exerciseID; self.targetReps = targetReps; self.sets = sets
    }

    init(_ logged: LoggedExercise) {
        self.init(id: UUID(), exerciseID: logged.exerciseID, targetReps: logged.targetReps, sets: logged.sets.map(DraftSet.init))
    }

    /// Nil once every set is gone, so an emptied exercise isn't saved.
    var logged: LoggedExercise? {
        sets.isEmpty ? nil : LoggedExercise(exerciseID: exerciseID, sets: sets.map(\.set), targetReps: targetReps)
    }
}

// MARK: - Rows

/// One logged set as a line: number, load × reps and reps in reserve. Shared by the detail screen and the editor.
struct SetSummaryLine: View {
    let set: LoggedSet
    let label: String
    let exercise: Exercise
    let units: WeightUnits
    var isSelected = false

    var body: some View {
        HStack(spacing: 12) {
            Text(label)
                .font(.caption.bold())
                .frame(minWidth: 30, minHeight: 30)
                .background(isSelected ? Theme.accent : Theme.raised, in: Circle())
                .foregroundStyle(.white)
            // Show logged weight even for exercises no longer in the catalog.
            Text(load).font(.body.weight(.semibold).monospacedDigit())
            Spacer()
            if let rir = set.rir, !set.isWarmup {
                Text("RIR \(rir)").font(.caption.monospacedDigit()).foregroundStyle(Theme.muted)
            }
            if isSelected {
                Image(systemName: "chevron.up").font(.caption.bold()).foregroundStyle(Theme.accent)
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var reps: String { exercise.isTimed ? "\(set.reps)s" : "\(set.reps)" }

    private var load: String { self.set.weight > 0 ? "\(units.format(set.weight)) × \(reps)" : "BW × \(reps)" }

    private var spoken: String {
        var parts = [label == "W" ? "Warm-up set" : "Set \(label)"]
        if set.weight > 0 { parts.append(units.format(set.weight)) } else { parts.append("bodyweight") }
        parts.append(exercise.isTimed ? "\(set.reps) seconds" : "\(set.reps) reps")
        if let rir = set.rir, !set.isWarmup { parts.append(rir == 0 ? "to failure" : "\(rir) in reserve") }
        return parts.joined(separator: ", ")
    }
}

/// Weight and reps steppers (the logger's) plus reps in reserve, for one past set.
private struct SetFields: View {
    @Binding var set: DraftSet
    let exercise: Exercise
    let units: WeightUnits
    let weightStep: Double
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(spacing: 12) {
            let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 10)) : AnyLayout(HStackLayout(spacing: 10))
            layout {
                if !exercise.isBodyweight || set.set.weight > 0 {
                    ValueStepper(title: "Weight",
                                 value: Binding(get: { units.display(set.set.weight) }, set: { set.set.weight = max(0, units.kg($0)) }),
                                 step: weightStep, unit: units.symbol, decimals: true)
                }
                ValueStepper(title: exercise.isTimed ? "Time" : "Reps",
                             value: Binding(get: { Double(set.set.reps) }, set: { set.set.reps = max(0, Int($0.rounded())) }),
                             step: exercise.isTimed ? 5 : 1, unit: exercise.isTimed ? "sec" : "reps", decimals: false)
            }
            if !set.set.isWarmup && !exercise.isTimed {
                VStack(alignment: .leading, spacing: 6) {
                    Text("REPS IN RESERVE").font(.caption2.weight(.heavy)).foregroundStyle(Theme.muted)
                        .accessibilityHidden(true)
                    Picker("Reps in reserve", selection: $set.set.rir) {
                        Text("–").tag(Int?.none).accessibilityLabel("Not recorded")
                        ForEach(0...4, id: \.self) { value in
                            Text(value == 4 ? "4+" : "\(value)").tag(Int?.some(value))
                        }
                    }
                    .pickerStyle(.segmented)
                }
            }
        }
        .padding(.bottom, 4)
    }
}
