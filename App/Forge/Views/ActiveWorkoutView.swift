import SwiftData
import SwiftUI
import WorkoutEngine

/// The workout logger: one exercise per page, the current set front and center.
struct ActiveWorkoutView: View {
    let profile: Profile
    @Environment(WorkoutSession.self) private var session
    @Environment(ToastCenter.self) private var toasts
    @Environment(\.modelContext) private var context
    @Environment(HistoryStore.self) private var history

    @State private var adding = false
    @State private var showingOverview = false
    @State private var reviewing = false

    private var units: WeightUnits { profile.units }


    private var currentIndex: Binding<Int> {
        Binding(get: { session.state?.currentIndex ?? 0 },
                set: { new in withAnimation(Motion.snappy) { session.state?.currentIndex = new } })
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if let state = session.state {
                    ProgressStrip(exercises: state.exercises, current: currentIndex)
                        .padding(.horizontal)
                        .padding(.vertical, 10)
                    if state.exercises.isEmpty {
                        emptyState
                    } else {
                        let lastSets = history.lastWorkingSets
                        TabView(selection: currentIndex) {
                            ForEach(Array(state.exercises.enumerated()), id: \.element.id) { index, exercise in
                                if let binding = binding(for: exercise.id) {
                                    ExerciseFocusPage(exercise: binding,
                                                      lastSets: lastSets[exercise.exerciseID] ?? [],
                                                      units: units,
                                                      weightStep: profile.weightStep(for: exercise.exercise),
                                                      nextName: state.exercises.indices.contains(index + 1) ? state.exercises[index + 1].exercise.name : nil,
                                                      onLog: { session.logSet($0, in: exercise.id) },
                                                      onNext: { currentIndex.wrappedValue = index + 1 },
                                                      onFinish: { reviewing = true })
                                        .tag(index)
                                }
                            }
                        }
                        .tabViewStyle(.page(indexDisplayMode: .never))
                    }
                }
            }
            .background(Theme.background)
            .navigationTitle(session.state?.title ?? session.state?.focus.map { "\($0.title) Day" } ?? "Workout")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { session.isExpanded = false } label: {
                        Image(systemName: "chevron.down")
                    }
                    .accessibilityLabel("Minimize workout")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("All Exercises", systemImage: "list.bullet") { showingOverview = true }
                        Button("Add Exercise", systemImage: "plus") { adding = true }
                        Divider()
                        Button("Discard Workout", systemImage: "trash", role: .destructive, action: discard)
                    } label: {
                        Image(systemName: "ellipsis")
                    }
                    .accessibilityLabel("Workout options")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Finish") { reviewing = true }
                        .fontWeight(.bold)
                        .buttonStyle(.borderedProminent)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil) }
                }
            }
            .safeAreaInset(edge: .bottom) { RestTimerBar() }
            .sheet(isPresented: $reviewing) {
                FinishReview(profile: profile) {
                    reviewing = false
                    let ref = session.state?.program
                    let loggedAny = session.state?.exercises.contains { $0.sets.contains { $0.done && !$0.isWarmup } } ?? false
                    session.finish(context: context, bestOneRM: history.bestOneRM)
                    if let ref, loggedAny { profile.completeProgramDay(ref) }
                }
            }
            .sheet(isPresented: $showingOverview) {
                WorkoutOverview(onAdd: { showingOverview = false; adding = true })
            }
            .sheet(isPresented: $adding) {
                ExercisePicker(title: "Add Exercise", exercises: Catalog.all.filter(profile.planner(history: history.records).isEligible),
                               profile: profile) { exercise in
                    let planned = profile.planner(history: history.records).prescribe(exercise)
                    session.state?.exercises.append(SessionExercise(planned))
                    currentIndex.wrappedValue = (session.state?.exercises.count ?? 1) - 1
                }
            }
        }
        .toastHost()
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No exercises yet", systemImage: "dumbbell")
        } description: {
            Text("Add exercises to build this workout as you go.")
        } actions: {
            Button("Add Exercise") { adding = true }.buttonStyle(.borderedProminent)
        }
        .frame(maxHeight: .infinity)
    }

    private func binding(for id: UUID) -> Binding<SessionExercise>? {
        guard let initial = session.state?.exercises.first(where: { $0.id == id }) else { return nil }
        return Binding(
            get: { session.state?.exercises.first(where: { $0.id == id }) ?? initial },
            set: { new in
                if let i = session.state?.exercises.firstIndex(where: { $0.id == id }) { session.state?.exercises[i] = new }
            })
    }

    private func discard() {
        guard let snapshot = session.state else { return }
        session.discard()
        toasts.show("Workout discarded") { session.restore(snapshot) }
    }
}

extension Profile {
    /// One loadable step for this exercise at the active gym, in display units.
    func weightStep(for exercise: Exercise) -> Double {
        let gym = activeGym
        guard let eq = exercise.loadEquipment else { return units.pounds ? 5 : 2.5 }
        let step = gym.increment(for: eq)
        if gym.usesPounds == units.pounds { return step }
        return units.pounds ? step * Units.poundsPerKg : step / Units.poundsPerKg
    }
}

// MARK: - Progress strip

private struct ProgressStrip: View {
    let exercises: [SessionExercise]
    @Binding var current: Int

    var body: some View {
        HStack(spacing: 4) {
            ForEach(Array(exercises.enumerated()), id: \.element.id) { index, exercise in
                Capsule()
                    .fill(color(exercise, index))
                    .frame(height: index == current ? 6 : 4)
                    .contentShape(Rectangle().inset(by: -10))
                    .onTapGesture { current = index }
                    .accessibilityLabel("\(exercise.exercise.name)\(exercise.isComplete ? ", done" : "")")
                    .accessibilityAddTraits(index == current ? [.isButton, .isSelected] : .isButton)
            }
        }
        .frame(height: 8)
    }

    private func color(_ exercise: SessionExercise, _ index: Int) -> Color {
        if exercise.isComplete { return Theme.fresh }
        if index == current { return Theme.accent }
        return Theme.raised
    }
}

// MARK: - Exercise page

private struct ExerciseFocusPage: View {
    @Binding var exercise: SessionExercise
    let lastSets: [LoggedSet]
    let units: WeightUnits
    let weightStep: Double
    let nextName: String?
    let onLog: (UUID) -> Void
    let onNext: () -> Void
    let onFinish: () -> Void

    /// A set the user tapped to edit; otherwise the first unlogged working set is active.
    @State private var editingID: UUID?
    @State private var showWarmups = false

    private var working: [SessionSet] { exercise.sets.filter { !$0.isWarmup } }
    private var warmups: [SessionSet] { exercise.sets.filter(\.isWarmup) }
    private var activeID: UUID? { editingID ?? working.first { !$0.done }?.id }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header

                if !warmups.isEmpty { warmupSection }

                if let id = activeID, let index = exercise.sets.firstIndex(where: { $0.id == id }) {
                    SetEditor(set: $exercise.sets[index],
                              number: workingNumber(of: id),
                              total: roundCount,
                              target: exercise.program.map { info in
                                  info.isEccentric ? "\(info.range.text) lowering reps" : "\(info.range.text) reps · \(info.effortText)"
                              },
                              lastSetNote: isLastRound(id) ? exercise.program?.lastSetNote : nil,
                              last: lastSet(for: id),
                              exercise: exercise.exercise,
                              units: units,
                              weightStep: weightStep,
                              isEditingDoneSet: exercise.sets[index].done) {
                        onLog(id)
                        withAnimation(Motion.snappy) { editingID = nil }
                    }
                    .transition(Motion.transition(.asymmetric(insertion: .scale(scale: 0.96).combined(with: .opacity), removal: .opacity)))
                } else if !working.isEmpty {
                    completionCard
                }

                setList

                Button {
                    let last = working.last
                    if isPerSide {
                        for side in [Side.left, .right] {
                            exercise.sets.append(SessionSet(weight: last?.weight, reps: last?.reps ?? 10, isWarmup: false, isAMRAP: false, side: side))
                        }
                    } else {
                        exercise.sets.append(SessionSet(weight: last?.weight, reps: last?.reps ?? 10, isWarmup: false, isAMRAP: false))
                    }
                } label: {
                    Label("Add Set", systemImage: "plus").font(.subheadline.weight(.semibold))
                }
                .buttonStyle(.plain)
                .foregroundStyle(Theme.accent)
                .padding(.leading, 4)
            }
            .padding(.horizontal)
            .padding(.bottom, 40)
            .animation(Motion.snappy, value: exercise.sets)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 14) {
            ExerciseThumb(exercise: exercise.exercise, size: 56)
            VStack(alignment: .leading, spacing: 4) {
                Text(exercise.exercise.name).displayFont(22).minimumScaleFactor(0.8)
                    .accessibilityAddTraits(.isHeader)
                Text(exercise.exercise.primary.map(\.displayName).joined(separator: " · "))
                    .font(.subheadline).foregroundStyle(Theme.muted)
                if let info = exercise.program {
                    Text([info.label, info.setsText, info.effortText].compactMap { $0 }.joined(separator: " · "))
                        .font(.subheadline.weight(.semibold)).foregroundStyle(Theme.accent)
                    Text("Rest \(info.restText)\(info.isOptional ? " · optional" : "")").font(.caption).foregroundStyle(Theme.muted)
                    ForEach(info.notes, id: \.self) { note in
                        Label(note, systemImage: "info.circle").font(.caption).foregroundStyle(Theme.muted)
                    }
                }
                if let reason = exercise.reasons.dropFirst().first ?? exercise.reasons.first {
                    Text(reason).font(.caption).foregroundStyle(Theme.muted)
                }
            }
        }
        .padding(.top, 4)
    }

    private var warmupSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button { withAnimation(Motion.snappy) { showWarmups.toggle() } } label: {
                HStack {
                    Image(systemName: "flame").foregroundStyle(Theme.recovering)
                    Text("\(warmups.count) warm-up sets").font(.subheadline.weight(.semibold))
                    Text(warmups.compactMap(\.weight).map { units.format($0) }.joined(separator: " → "))
                        .font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                    Spacer()
                    Text("\(warmups.filter(\.done).count)/\(warmups.count)").font(.caption.monospacedDigit()).foregroundStyle(Theme.muted)
                    Image(systemName: "chevron.down").font(.caption.bold()).rotationEffect(.degrees(showWarmups ? 180 : 0))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityValue(showWarmups ? "Expanded" : "Collapsed")
            if showWarmups {
                ForEach(warmups) { set in
                    SetSummaryRow(set: set, label: "W", last: nil, exercise: exercise.exercise, units: units, isActive: false) {
                        toggle(set.id)
                    }
                }
            }
        }
        .card(padding: 14)
    }

    private var completionCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("All sets logged", systemImage: "checkmark.circle.fill")
                .font(.headline).foregroundStyle(Theme.fresh)
            if exercise.program?.isEccentric == true {
                Text("Lowering reps only, so there's no RIR to rate. Progress comes from more controlled reps.")
                    .font(.subheadline).foregroundStyle(Theme.muted)
            } else if !exercise.exercise.isTimed {
                VStack(alignment: .leading, spacing: 10) {
                    Text("How many more reps could you have done?").font(.subheadline.weight(.semibold))
                    HStack(spacing: 8) {
                        ForEach(0...4, id: \.self) { value in
                            Button { exercise.rir = value } label: {
                                Text(value == 4 ? "4+" : "\(value)")
                                    .font(.headline.monospacedDigit())
                                    .frame(maxWidth: .infinity, minHeight: 44)
                                    .background(exercise.rir == value ? Theme.accent : Theme.raised,
                                                in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                    .foregroundStyle(exercise.rir == value ? .white : .primary)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(value == 0 ? "None, went to failure" : "\(value) reps left")
                            .accessibilityAddTraits(exercise.rir == value ? .isSelected : [])
                        }
                    }
                    .sensoryFeedback(.selection, trigger: exercise.rir)
                    Text("This tunes how quickly Forge adds weight next time.").font(.caption).foregroundStyle(Theme.muted)
                }
            }
            Button(action: nextName == nil ? onFinish : onNext) {
                Label(nextName.map { "Next: \($0)" } ?? "Finish Workout",
                      systemImage: nextName == nil ? "flag.checkered" : "arrow.right")
                    .font(.headline)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(Theme.accent, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .foregroundStyle(.white)
            }
            .buttonStyle(.plain)
        }
        .card()
    }

    private var setList: some View {
        VStack(spacing: 6) {
            ForEach(working) { set in
                SetSummaryRow(set: set, label: "\(set.side?.letter ?? "")\(workingNumber(of: set.id))", last: lastSet(for: set.id),
                              exercise: exercise.exercise, units: units, isActive: set.id == activeID) {
                    withAnimation(Motion.snappy) { editingID = set.id == activeID ? nil : set.id }
                }
                .contextMenu {
                    if set.done {
                        Button("Mark Not Done", systemImage: "arrow.uturn.backward") { toggle(set.id) }
                    }
                    Button("Delete Set", systemImage: "trash", role: .destructive) { delete(set.id) }
                }
                // The context menu is long-press only; VoiceOver gets the same actions from the rotor.
                .accessibilityActions {
                    if set.done { Button("Mark Not Done") { toggle(set.id) } }
                    Button("Delete Set") { delete(set.id) }
                }
            }
        }
    }

    private var isPerSide: Bool { exercise.program?.laterality.isPerSide == true }

    /// Set number; for per-side work both sides of a round share it.
    private func workingNumber(of id: UUID) -> Int {
        let i = working.firstIndex { $0.id == id } ?? 0
        return isPerSide ? i / 2 + 1 : i + 1
    }

    private var roundCount: Int { isPerSide ? (working.count + 1) / 2 : working.count }

    private func isLastRound(_ id: UUID) -> Bool { workingNumber(of: id) == roundCount }

    private func lastSet(for id: UUID) -> LoggedSet? {
        guard let i = working.firstIndex(where: { $0.id == id }) else { return nil }
        return lastSets.indices.contains(i) ? lastSets[i] : lastSets.last
    }

    private func toggle(_ id: UUID) {
        guard let i = exercise.sets.firstIndex(where: { $0.id == id }) else { return }
        exercise.sets[i].done.toggle()
    }

    private func delete(_ id: UUID) {
        exercise.sets.removeAll { $0.id == id }
        if editingID == id { editingID = nil }
    }
}

// MARK: - Set editor

private struct SetEditor: View {
    @Binding var set: SessionSet
    let number: Int
    let total: Int
    /// Program target, e.g. "8–12 reps · RIR 1".
    var target: String? = nil
    /// Shown on the last set only, e.g. "Lengthened partials on the last set".
    var lastSetNote: String? = nil
    let last: LoggedSet?
    let exercise: Exercise
    let units: WeightUnits
    let weightStep: Double
    let isEditingDoneSet: Bool
    let onLog: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    private var heading: String {
        if set.isAMRAP { return "SET \(number) · MAX EFFORT" }
        let side = set.side.map { $0 == .left ? " · LEFT" : " · RIGHT" } ?? ""
        return "SET \(number) OF \(total)\(side)"
    }

    var body: some View {
        VStack(spacing: 14) {
            HStack {
                Text(heading)
                    .font(.caption.weight(.heavy))
                    .foregroundStyle(set.isAMRAP ? Theme.accent : Theme.muted)
                Spacer()
                if let last {
                    Text("Last: \(lastText(last))").font(.caption.monospacedDigit()).foregroundStyle(Theme.muted)
                }
            }
            if let target {
                Text(target).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.accent)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let lastSetNote {
                Label(lastSetNote, systemImage: "flame.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.recovering)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(10)
                    .background(Theme.recovering.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            if set.isAMRAP {
                Text("As many good reps as you can on this set.").font(.caption).foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            // Side by side the big numbers get squeezed at accessibility sizes.
            let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 10)) : AnyLayout(HStackLayout(spacing: 10))
            layout {
                if !exercise.isBodyweight {
                    ValueStepper(title: "Weight",
                                 value: Binding(get: { units.display(set.weight ?? 0) }, set: { set.weight = units.kg($0) }),
                                 step: weightStep, unit: units.symbol, decimals: true)
                }
                ValueStepper(title: exercise.isTimed ? "Time" : "Reps",
                             value: Binding(get: { Double(set.reps) }, set: { set.reps = max(0, Int($0.rounded())) }),
                             step: exercise.isTimed ? 5 : 1, unit: exercise.isTimed ? "sec" : "reps", decimals: false)
            }
            Button(action: onLog) {
                Label(isEditingDoneSet ? "Update Set" : "Log Set", systemImage: "checkmark")
                    .font(.headline)
                    .frame(maxWidth: .infinity, minHeight: 56)
                    .background(Theme.accent, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .foregroundStyle(.white)
            }
            .buttonStyle(.plain)
            .sensoryFeedback(.success, trigger: set.done) { _, new in new }
        }
        .card()
    }

    private func lastText(_ s: LoggedSet) -> String {
        let reps = exercise.isTimed ? "\(s.reps)s" : "\(s.reps)"
        return exercise.isBodyweight || s.weight <= 0 ? "\(reps) reps" : "\(units.format(s.weight)) × \(reps)"
    }
}

/// Big number with − and + buttons; type to set it directly. Also used when editing past workouts.
struct ValueStepper: View {
    let title: String
    @Binding var value: Double
    let step: Double
    let unit: String
    let decimals: Bool

    var body: some View {
        VStack(spacing: 8) {
            Text(title.uppercased()).font(.caption2.weight(.heavy)).foregroundStyle(Theme.muted)
                .accessibilityHidden(true)
            TextField("0", value: $value, format: .number.precision(.fractionLength(0...(decimals ? 1 : 0))))
                .keyboardType(decimals ? .decimalPad : .numberPad)
                .displayFont(34, monospacedDigits: true)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.6)
                .accessibilityLabel(title)
                .accessibilityValue("\(value.formatted()) \(unit)")
            Text(unit).font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
                .accessibilityHidden(true)
            HStack(spacing: 8) {
                stepButton("minus") { value = max(0, value - step) }
                stepButton("plus") { value += step }
            }
            .sensoryFeedback(.selection, trigger: value)
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .background(Theme.raised, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(title)
    }

    private func stepButton(_ icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.title3.bold())
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(icon == "plus" ? "Increase \(title)" : "Decrease \(title)")
        .accessibilityValue("\(value.formatted()) \(unit)")
    }
}

private struct SetSummaryRow: View {
    let set: SessionSet
    let label: String
    let last: LoggedSet?
    let exercise: Exercise
    let units: WeightUnits
    let isActive: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                Text(label)
                    .font(.caption.bold())
                    .frame(width: 30, height: 30)
                    .background(set.done ? Theme.fresh : isActive ? Theme.accent : Theme.raised, in: Circle())
                    .foregroundStyle(set.done ? .black : .white)
                Text(text).font(.body.weight(.semibold).monospacedDigit())
                if let last, !set.done {
                    Text("last \(lastText(last))").font(.caption.monospacedDigit()).foregroundStyle(Theme.muted)
                }
                Spacer()
                Image(systemName: set.done ? "checkmark.circle.fill" : isActive ? "pencil.circle" : "circle")
                    .font(.title3)
                    .foregroundStyle(set.done ? Theme.fresh : isActive ? Theme.accent : Theme.muted)
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 12)
            .background(isActive ? Theme.accent.opacity(0.1) : Theme.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            // Dimmed, but muted text inside still needs to stay readable.
            .opacity(set.done && !isActive ? 0.85 : 1)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(label == "W" ? "Warm-up set" : "Set \(label)"), \(spokenText)\(set.done ? ", done" : "")")
        .accessibilityAddTraits(isActive ? .isSelected : [])
        .accessibilityHint(isActive ? "" : "Edits this set")
    }

    private var spokenText: String {
        let reps = exercise.isTimed ? "\(set.reps) seconds" : "\(set.reps) reps"
        return exercise.isBodyweight ? reps : "\(units.format(set.weight)), \(reps)"
    }

    private var text: String {
        let reps = exercise.isTimed ? "\(set.reps)s" : "\(set.reps)"
        return exercise.isBodyweight ? "\(reps) reps" : "\(units.format(set.weight)) × \(reps)"
    }

    private func lastText(_ s: LoggedSet) -> String {
        exercise.isBodyweight || s.weight <= 0 ? "\(s.reps)" : "\(units.format(s.weight).replacingOccurrences(of: " \(units.symbol)", with: ""))×\(s.reps)"
    }
}

// MARK: - Finish review

/// Shown before saving: what was done, and what to do with sets that weren't logged.
private struct FinishReview: View {
    let profile: Profile
    let onSave: () -> Void
    @Environment(WorkoutSession.self) private var session
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let state = session.state
        let done = state?.exercises.flatMap(\.sets).filter { !$0.isWarmup && $0.done } ?? []
        let pending = state?.pendingSetCount ?? 0
        let volume = done.reduce(0) { $0 + ($1.weight ?? 0) * Double($1.reps) }

        VStack(spacing: 18) {
            Text("Finish Workout").displayFont(22).padding(.top, 24)
                .accessibilityAddTraits(.isHeader)
            HStack(spacing: 0) {
                stat(state.map { "\(Int(Date.now.timeIntervalSince($0.startedAt) / 60)) min" } ?? "–", "duration")
                stat("\(done.count)", "sets logged")
                stat(volume > 0 ? profile.units.format(volume) : "–", "volume")
            }
            .card(padding: 14)

            if pending > 0 {
                VStack(alignment: .leading, spacing: 12) {
                    Label("\(pending) planned \(pending == 1 ? "set wasn't" : "sets weren't") logged", systemImage: "exclamationmark.circle")
                        .font(.headline).foregroundStyle(Theme.recovering)
                    Text("Did you do them? Logging them keeps your recovery and progression accurate.")
                        .font(.subheadline).foregroundStyle(Theme.muted)
                    Button {
                        session.logRemainingAsPlanned()
                        onSave()
                    } label: {
                        Text("I did them, log as planned").font(.headline).frame(maxWidth: .infinity, minHeight: 48)
                    }
                    .buttonStyle(.borderedProminent)
                    // A workout with no working sets would only add noise to history and recovery.
                    Button(action: onSave) {
                        Text(done.isEmpty ? "Nothing logged to save" : "Save without them")
                            .font(.headline).frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                    .disabled(done.isEmpty)
                }
                .card()
            } else {
                Button(action: onSave) {
                    Text("Save Workout").font(.headline).frame(maxWidth: .infinity, minHeight: 52)
                }
                .buttonStyle(.borderedProminent)
                .disabled(done.isEmpty)
            }
            Button("Keep Going") { dismiss() }.foregroundStyle(Theme.muted)
            Spacer(minLength: 0)
        }
        .padding(.horizontal)
        .presentationDetents([pending > 0 ? .large : .medium])
        .presentationBackground(Theme.background)
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.title3.bold().monospacedDigit()).lineLimit(1).minimumScaleFactor(0.7)
            Text(label).font(.caption).foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Overview

/// Every exercise at a glance: jump, reorder, remove (with Undo), add.
private struct WorkoutOverview: View {
    let onAdd: () -> Void
    @Environment(WorkoutSession.self) private var session
    @Environment(ToastCenter.self) private var toasts
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                ForEach(Array((session.state?.exercises ?? []).enumerated()), id: \.element.id) { index, exercise in
                    Button {
                        session.state?.currentIndex = index
                        dismiss()
                    } label: {
                        HStack(spacing: 12) {
                            ExerciseThumb(exercise: exercise.exercise, size: 44)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(exercise.exercise.name).foregroundStyle(.primary)
                                let working = exercise.sets.filter { !$0.isWarmup }
                                Text("\(working.filter(\.done).count)/\(working.count) sets")
                                    .font(.caption.monospacedDigit()).foregroundStyle(Theme.muted)
                            }
                            Spacer()
                            if exercise.isComplete {
                                Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.fresh)
                                    .accessibilityLabel("Done")
                            }
                        }
                    }
                }
                .onMove { session.state?.exercises.move(fromOffsets: $0, toOffset: $1) }
                .onDelete(perform: remove)
                Button("Add Exercise", systemImage: "plus", action: onAdd)
            }
            .navigationTitle("Exercises")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { EditButton() }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
        .toastHost()
    }

    private func remove(_ offsets: IndexSet) {
        guard let before = session.state?.exercises else { return }
        session.state?.exercises.remove(atOffsets: offsets)
        if let count = session.state?.exercises.count, (session.state?.currentIndex ?? 0) >= count {
            session.state?.currentIndex = max(0, count - 1)
        }
        let names = offsets.map { before[$0].exercise.name }
        toasts.show("Removed \(names.joined(separator: ", "))") { session.state?.exercises = before }
    }
}

// MARK: - Shared pieces

struct RestTimerBar: View {
    @Environment(WorkoutSession.self) private var session

    var body: some View {
        if let end = session.restEndsAt {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let remaining = max(0, Int(end.timeIntervalSince(context.date).rounded(.up)))
                let total = max(1, session.restTotal)
                HStack(spacing: 14) {
                    ZStack {
                        Circle().stroke(Theme.raised, lineWidth: 4)
                        Circle()
                            .trim(from: 0, to: Double(remaining) / Double(total))
                            .stroke(Theme.accent, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                            .animation(.linear(duration: 1), value: remaining)
                        Image(systemName: remaining > 0 ? "timer" : "checkmark").font(.caption.bold())
                    }
                    .frame(width: 36, height: 36)
                    .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(remaining > 0 ? Duration.seconds(remaining).formatted(.time(pattern: .minuteSecond)) : "Go!")
                            .font(.title3.bold().monospacedDigit())
                        Text(remaining > 0 ? "Resting" : "Rest complete").font(.caption).foregroundStyle(Theme.muted)
                    }
                    .accessibilityElement(children: .combine)
                    Spacer()
                    Button("+15s") { session.extendRest(by: 15) }
                        .buttonStyle(.bordered)
                        .accessibilityLabel("Add 15 seconds")
                    Button(remaining > 0 ? "Skip" : "Close") { session.skipRest() }
                        .buttonStyle(.borderedProminent)
                }
                .padding(14)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                .padding(.horizontal)
                .sensoryFeedback(.impact(weight: .heavy), trigger: remaining == 0)
            }
        }
    }
}

struct FinishSummary: View {
    let records: [PersonalRecord]
    let units: WeightUnits
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 56))
                .foregroundStyle(Theme.fresh)
                .padding(.top, 28)
                .accessibilityHidden(true)
            Text("Workout Saved").displayFont(24)
                .accessibilityAddTraits(.isHeader)
            if records.isEmpty {
                Text("Recovery and your next workout have been updated.")
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    Label("New personal records", systemImage: "trophy.fill").font(.headline).foregroundStyle(Theme.recovering)
                    ForEach(records) { r in
                        HStack {
                            Text(r.exercise.name)
                            Spacer()
                            Text("\(units.format(r.oneRM)) est. 1RM").foregroundStyle(Theme.muted)
                        }
                        .font(.subheadline)
                    }
                }
                .card()
            }
            Spacer()
            Button { dismiss() } label: {
                Text("Done").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
        .presentationDetents([.medium])
        .presentationBackground(Theme.background)
    }
}

struct ExercisePicker: View {
    let title: String
    let exercises: [Exercise]
    /// When set, the list offers to create a custom exercise.
    var profile: Profile? = nil
    let onPick: (Exercise) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var search = ""
    @State private var muscle: Muscle?
    @State private var creating = false

    private var filtered: [Exercise] {
        exercises.filter { e in
            (search.isEmpty || e.name.localizedCaseInsensitiveContains(search))
                && (muscle.map { e.primary.contains($0) } ?? true)
        }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(filtered) { e in
                    Button {
                        onPick(e)
                        dismiss()
                    } label: {
                        HStack(spacing: 12) {
                            ExerciseThumb(exercise: e, size: 44)
                            VStack(alignment: .leading) {
                                Text(e.name).foregroundStyle(.primary)
                                Text(e.primary.map(\.displayName).joined(separator: ", ")).font(.caption).foregroundStyle(Theme.muted)
                            }
                            Spacer()
                            if e.isCustom { Text("Custom").font(.caption2.bold()).foregroundStyle(Theme.muted) }
                        }
                    }
                }
                if profile != nil {
                    Section {
                        Button {
                            creating = true
                        } label: {
                            Label(search.isEmpty ? "Create Custom Exercise" : "Create “\(search)”", systemImage: "plus.square.dashed")
                        }
                    } footer: {
                        Text("Can't find it? Add it once and Forge will use it like any other exercise.")
                    }
                }
            }
            .sheet(isPresented: $creating) {
                if let profile {
                    CustomExerciseEditor(profile: profile, initialName: search) { created in
                        onPick(created)
                        dismiss()
                    }
                }
            }
            .overlay {
                if filtered.isEmpty && profile == nil {
                    ContentUnavailableView(exercises.isEmpty ? "No alternatives" : "No matches",
                                           systemImage: "magnifyingglass",
                                           description: Text(exercises.isEmpty
                                                             ? "Nothing else fits these muscles with your gym's equipment."
                                                             : "Try a different name or muscle."))
                }
            }
            .searchable(text: $search)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button("All Muscles") { muscle = nil }
                        ForEach(Muscle.allCases, id: \.self) { m in Button(m.displayName) { muscle = m } }
                    } label: {
                        Label("Filter", systemImage: muscle == nil ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")
                    }
                }
            }
        }
    }
}
