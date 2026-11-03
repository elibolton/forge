import SwiftData
import SwiftUI
import WorkoutEngine

struct TodayView: View {
    @Bindable var profile: Profile
    @Environment(WorkoutSession.self) private var session
    @Environment(ToastCenter.self) private var toasts
    @Environment(\.scenePhase) private var scenePhase
    @Environment(HistoryStore.self) private var history
    @Query(sort: \WorkoutLog.date, order: .reverse) private var logs: [WorkoutLog]

    /// Today's workout. Only rebuilt on a new day, after a workout is logged, or when you ask.
    @State private var today: TodayPlan?
    @State private var replacing: PlannedExercise?
    @State private var adding = false
    @Environment(\.dynamicTypeSize) private var typeSize

    private var planner: Planner { profile.planner(history: history.records, minutes: today?.minutes) }
    private var chosenMinutes: Int { today?.minutes ?? profile.plan.sessionMinutes }
    private var trainedToday: WorkoutLog? {
        logs.first.flatMap { Calendar.current.isDateInToday($0.date) ? $0 : nil }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                if let today {
                    let workout = today.workout
                    VStack(alignment: .leading, spacing: 20) {
                        if let done = trainedToday, !session.isActive { trainedCard(done) }
                        header(workout)
                        if today.basis != profile.planBasis { settingsChangedBanner }
                        shortSessionHint(workout)
                        recoveryStrip(workout)
                        exerciseList(workout)
                    }
                    .padding(.horizontal)
                    .padding(.bottom, 110)
                }
            }
            .background(Theme.background)
            .overlay(alignment: .bottom) {
                // While a workout is minimized, the mini bar is the way back in.
                if let workout = today?.workout, !session.isActive {
                    FloatingActionButton(title: trainedToday == nil ? "Start Workout" : "Start Next Workout",
                                         systemImage: "play.fill") { session.start(workout) }
                        .padding(.bottom, 12)
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("New Variation", systemImage: "arrow.clockwise") {
                            rebuild(focus: today?.focus, minutes: today?.minutes, seed: (today?.seed ?? 0) &+ 1)
                        }
                        Button("Add Exercise", systemImage: "plus") { adding = true }
                        Button("Empty Workout", systemImage: "square.and.pencil") { session.startEmpty() }
                    } label: {
                        Image(systemName: "ellipsis")
                    }
                    .accessibilityLabel("Workout options")
                }
            }
            .task(id: history.revision) { refresh() }
            // Other screens can edit the saved plan (e.g. deleting a custom exercise).
            .onAppear { refresh() }
            .onChange(of: scenePhase) { _, phase in if phase == .active { refresh() } }
            .sheet(item: $replacing) { planned in
                ExercisePicker(title: "Swap \(planned.exercise.name)",
                               exercises: planner.alternatives(to: planned.exercise, excluding: Set(today?.workout.exercises.map(\.exercise.id) ?? []))) { replace(planned, with: $0) }
            }
            .sheet(isPresented: $adding) {
                ExercisePicker(title: "Add Exercise", exercises: Catalog.all.filter(planner.isEligible), profile: profile) { add($0) }
            }
        }
    }

    // MARK: Sections

    private func trainedCard(_ log: WorkoutLog) -> some View {
        let sets = log.exercises.flatMap(\.workingSets).count
        let count = sets > 0 ? sets : log.exercises.count
        let amount = "\(count) \(sets > 0 ? (count == 1 ? "set" : "sets") : (count == 1 ? "exercise" : "exercises"))"
        return HStack(spacing: 14) {
            Image(systemName: "checkmark.seal.fill").font(.title).foregroundStyle(Theme.fresh)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("Trained today").font(.headline)
                Text("\(log.focus.map { "\($0.title) · " } ?? "")\(max(1, log.durationSeconds / 60)) min · \(amount). Recover well; here's what's next.")
                    .font(.subheadline).foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 0)
        }
        .card(padding: 14)
        .accessibilityElement(children: .combine)
    }

    private func header(_ workout: PlannedWorkout) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            NavigationLink {
                PlanView(profile: profile, embedded: true)
            } label: {
                HStack(spacing: 4) {
                    Text("\(profile.plan.goal.title) · \(profile.plan.split.title)")
                        .font(.subheadline.weight(.semibold))
                    Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(Theme.accent)
                        .accessibilityHidden(true)
                }
                .foregroundStyle(Theme.muted)
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens your plan settings")
            // At accessibility sizes the chip goes under the title instead of squeezing it.
            let titleLayout = typeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
                : AnyLayout(HStackLayout(alignment: .firstTextBaseline))
            titleLayout {
                VStack(alignment: .leading, spacing: 4) {
                    if trainedToday != nil {
                        Text("NEXT UP").font(.caption.weight(.heavy)).foregroundStyle(Theme.accent)
                    }
                    Text(dayTitle(workout.focus))
                        .displayFont(30)
                        .accessibilityAddTraits(.isHeader)
                    Text("\(workout.exercises.count) exercises · \(workout.targetMuscles.count) muscles · ~\(Planner.estimatedMinutes(for: workout.exercises)) min")
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                }
                if !typeSize.isAccessibilitySize { Spacer() }
                switchMenu
            }
            // Chips wrap below each other once they no longer fit side by side.
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) {
                    durationMenu
                    gymMenu
                }
                VStack(alignment: .leading, spacing: 8) {
                    durationMenu
                    gymMenu
                }
            }
        }
        .padding(.top, 4)
    }

    private var settingsChangedBanner: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Your plan or recovery changed", systemImage: "arrow.triangle.2.circlepath")
                .font(.subheadline.bold())
            Text("This workout was built before the change. Update it, or keep it and your edits.")
                .font(.caption).foregroundStyle(Theme.muted)
            HStack(spacing: 10) {
                Button("Update Workout") { rebuild(focus: today?.focus, minutes: today?.minutes, seed: today?.seed) }
                    .buttonStyle(.borderedProminent)
                Button("Keep This One") {
                    guard var plan = today else { return }
                    plan.basis = profile.planBasis
                    update(plan)
                }
                .buttonStyle(.bordered)
            }
            .font(.subheadline.weight(.semibold))
        }
        .card(padding: 14)
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Theme.accent.opacity(0.4)))
    }

    /// Says so when the workout can't fill the chosen time, instead of a silent mismatch.
    @ViewBuilder private func shortSessionHint(_ workout: PlannedWorkout) -> some View {
        let estimate = Planner.estimatedMinutes(for: workout.exercises)
        if chosenMinutes - estimate >= 10, Double(estimate) < Double(chosenMinutes) * 0.8 {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "clock.badge.exclamationmark").foregroundStyle(Theme.recovering)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 6) {
                    Text("About \(estimate) of your \(chosenMinutes) min")
                        .font(.subheadline.bold())
                    Text("Only a few \(workout.focus.title.lowercased()) exercises suit \(profile.activeGym.name)'s equipment and today's recovery. Add one to use the time, or shorten today's session.")
                        .font(.caption).foregroundStyle(Theme.muted)
                    Button("Add an Exercise") { adding = true }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.accent)
                }
            }
            .card(padding: 14)
        }
    }

    private func recoveryStrip(_ workout: PlannedWorkout) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(workout.targetMuscles, id: \.self) { m in
                    MuscleRecoveryTile(muscle: m, value: workout.recovery[m] ?? 1)
                }
            }
        }
        .scrollClipDisabled()
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Target muscle recovery")
    }

    private func exerciseList(_ workout: PlannedWorkout) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(workout.exercises.enumerated()), id: \.element.exercise.id) { index, planned in
                if index > 0 { Divider().padding(.leading, 88) }
                exerciseRow(planned, isMainLift: index == 0 && planned.exercise.isCompound)
            }
            Divider().padding(.leading, 88)
            Button { adding = true } label: {
                HStack(spacing: 16) {
                    Image(systemName: "plus")
                        .font(.title3.bold())
                        .frame(width: 60, height: 60)
                        .accessibilityHidden(true)
                        .background(Theme.accent.opacity(0.15), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    Text("Add an Exercise").font(.headline)
                    Spacer()
                }
                .foregroundStyle(Theme.accent)
                .padding(.vertical, 12)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 4)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func exerciseRow(_ planned: PlannedExercise, isMainLift: Bool) -> some View {
        HStack(spacing: 14) {
            NavigationLink {
                ExerciseDetailView(profile: profile, exercise: planned.exercise)
            } label: {
                HStack(spacing: 14) {
                    ExerciseThumb(exercise: planned.exercise)
                    VStack(alignment: .leading, spacing: 3) {
                        if isMainLift {
                            Text("MAIN LIFT").font(.caption2.weight(.heavy)).foregroundStyle(Theme.recovering)
                                .accessibilityLabel("Main lift")
                        }
                        Text(planned.exercise.name).font(.headline).lineLimit(typeSize.isAccessibilitySize ? nil : 2)
                        Text(PlannedExerciseRow.summary(planned, units: profile.units))
                            .font(.subheadline.monospacedDigit())
                            .foregroundStyle(Theme.muted)
                        if let reason = planned.reasons.dropFirst().first ?? planned.reasons.first {
                            Text(reason).font(.caption).foregroundStyle(Theme.muted)
                                .lineLimit(typeSize.isAccessibilitySize ? nil : 2)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            // Same as the … menu, reachable from the VoiceOver actions rotor.
            .accessibilityActions {
                Button("Swap Exercise") { replacing = planned }
                Button("Remove") { remove(planned) }
            }

            Menu {
                Button("Swap Exercise", systemImage: "arrow.triangle.2.circlepath") { replacing = planned }
                Button("Remove", systemImage: "trash", role: .destructive) { remove(planned) }
                Section("Recommend") {
                    ForEach([ExercisePreference.more, .less, .exclude], id: \.self) { pref in
                        Button(pref.title) { setPreference(pref, for: planned) }
                    }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.body.bold())
                    .foregroundStyle(Theme.muted)
                    .frame(width: 32, height: 44)
            }
            .accessibilityLabel("\(planned.exercise.name) options")
        }
        .padding(.vertical, 12)
    }

    // MARK: Quick settings (today only; each rebuilds the workout because you asked for a different one)

    private var switchMenu: some View {
        Menu {
            Button("Follow My Plan") { rebuild(focus: nil, minutes: today?.minutes, seed: today?.seed) }
            ForEach(DayFocus.swappable, id: \.self) { f in
                Button(f.title) { rebuild(focus: f, minutes: today?.minutes, seed: today?.seed) }
            }
        } label: {
            Chip(highlighted: true) {
                Label("Switch", systemImage: "arrow.left.arrow.right")
            }
        }
        .accessibilityLabel("Switch workout focus")
    }

    private var durationMenu: some View {
        Menu {
            Picker("Duration", selection: Binding(get: { chosenMinutes },
                                                  set: { rebuild(focus: today?.focus, minutes: $0, seed: today?.seed) })) {
                ForEach([15, 20, 30, 45, 60, 75, 90], id: \.self) { Text("\($0) min").tag($0) }
            }
        } label: {
            Chip {
                HStack(spacing: 6) {
                    Image(systemName: "clock")
                    Text("\(chosenMinutes)m")
                    Image(systemName: "chevron.down").font(.caption2.bold())
                }
            }
        }
        .accessibilityLabel("Duration")
        .accessibilityValue("\(chosenMinutes) minutes")
    }

    private var gymMenu: some View {
        Menu {
            Picker("Gym", selection: Binding(get: { profile.activeGymID }, set: { id in
                profile.activeGymID = id
                rebuild(focus: today?.focus, minutes: today?.minutes, seed: today?.seed)
            })) {
                ForEach(profile.gyms) { Text($0.name).tag($0.id) }
            }
        } label: {
            Chip {
                HStack(spacing: 6) {
                    Image(systemName: "building.2")
                    Text(profile.activeGym.name).lineLimit(typeSize.isAccessibilitySize ? 2 : 1)
                    Image(systemName: "chevron.down").font(.caption2.bold())
                }
            }
        }
        .accessibilityLabel("Gym")
        .accessibilityValue(profile.activeGym.name)
    }

    private func dayTitle(_ focus: DayFocus) -> String {
        switch focus {
        case .recovered: "Fresh Muscles"
        case .upper, .lower, .fullBody: focus.title
        default: "\(focus.title) Day"
        }
    }

    // MARK: Plan lifecycle

    /// Keeps the saved plan if it's still today's and nothing was logged since; otherwise builds the next one.
    private func refresh() {
        // Planning against a history that hasn't loaded yet would build (and save) the wrong workout.
        guard history.isLoaded else { return }
        if let stored = TodayPlanStore.load(), stored.isCurrent(logCount: history.records.count) {
            today = stored
        } else {
            rebuild(focus: nil, minutes: nil, seed: nil)
        }
    }

    private func rebuild(focus: DayFocus?, minutes: Int?, seed: UInt64?) {
        let resolved = seed ?? UInt64(Calendar.current.ordinality(of: .day, in: .era, for: .now) ?? 0)
        let workout = profile.planner(history: history.records, minutes: minutes).generate(now: .now, seed: resolved, focus: focus)
        withAnimation(Motion.snappy) {
            update(TodayPlan(generatedAt: .now, basis: profile.planBasis, logCount: history.records.count,
                             seed: resolved, focus: focus, minutes: minutes, workout: workout))
        }
    }

    private func update(_ plan: TodayPlan) {
        today = plan
        TodayPlanStore.save(plan)
    }

    private func edit(_ change: (inout PlannedWorkout) -> Void) {
        guard var plan = today else { return }
        change(&plan.workout)
        withAnimation(Motion.snappy) { update(plan) }
    }

    // MARK: Edits (applied in place, never regenerate)

    private func remove(_ planned: PlannedExercise, announce: Bool = true) {
        guard let index = today?.workout.exercises.firstIndex(where: { $0.exercise.id == planned.exercise.id }) else { return }
        edit { _ = $0.exercises.remove(at: index) }
        if announce {
            toasts.show("Removed \(planned.exercise.name)") {
                edit { $0.exercises.insert(planned, at: min(index, $0.exercises.count)) }
            }
        }
    }

    private func replace(_ planned: PlannedExercise, with exercise: Exercise) {
        edit { workout in
            if let i = workout.exercises.firstIndex(where: { $0.exercise.id == planned.exercise.id }) {
                workout.exercises[i] = planner.prescribe(exercise)
            }
        }
    }

    private func add(_ exercise: Exercise) {
        edit { $0.exercises.append(planner.prescribe(exercise)) }
    }

    private func setPreference(_ pref: ExercisePreference, for planned: PlannedExercise) {
        let exercise = planned.exercise
        let previous = profile.plan.preferences[exercise.id]
        let index = today?.workout.exercises.firstIndex { $0.exercise.id == exercise.id }
        profile.plan.preferences[exercise.id] = pref
        // "Never" also takes it out of today's workout; Undo puts both back.
        if pref == .exclude { remove(planned, announce: false) }
        let message = switch pref {
        case .more: "You'll see \(exercise.name) more often"
        case .less: "You'll see \(exercise.name) less often"
        case .exclude: "\(exercise.name) won't be recommended"
        }
        toasts.show(message) {
            profile.plan.preferences[exercise.id] = previous
            if pref == .exclude, let index {
                edit { $0.exercises.insert(planned, at: min(index, $0.exercises.count)) }
            }
        }
    }
}

extension PlannedExercise: @retroactive Identifiable {
    public var id: String { exercise.id }
}

enum PlannedExerciseRow {
    static func summary(_ planned: PlannedExercise, units: WeightUnits) -> String {
        let working = planned.workingSets
        guard let first = working.first else { return "" }
        var parts = ["\(working.count) sets", planned.exercise.isTimed ? "\(first.reps)s" : "\(first.reps) reps"]
        if !planned.exercise.isBodyweight { parts.append(units.format(first.weight)) }
        if working.contains(where: \.isAMRAP) { parts.append("max effort") }
        return parts.joined(separator: " · ")
    }
}
