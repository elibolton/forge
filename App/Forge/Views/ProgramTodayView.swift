import SwiftData
import SwiftUI
import WorkoutEngine

/// Today while a program is active: the next session in the program, with this week's targets,
/// suggested loads and the reasons for them.
struct ProgramTodayView: View {
    @Bindable var profile: Profile
    let onUseGenerator: () -> Void
    @Environment(WorkoutSession.self) private var session
    @Environment(ToastCenter.self) private var toasts
    @Environment(HistoryStore.self) private var history
    @Query(sort: \WorkoutLog.date, order: .reverse) private var logs: [WorkoutLog]
    @Environment(\.dynamicTypeSize) private var typeSize

    /// Bumped after day-of edits so the plan re-reads them.
    @State private var editsRevision = 0
    @State private var replacing: ProgramDayItem?
    @State private var checkInWeek: Int?
    @State private var trainOnRestDay = false

    private var trainedToday: WorkoutLog? {
        logs.first.flatMap { Calendar.current.isDateInToday($0.date) ? $0 : nil }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                if let active = profile.activeProgram {
                    let program = active.program, progress = active.progress
                    let _ = editsRevision
                    let plan = ProgramDayPlan.make(program: program, progress: progress, history: history.records, profile: profile)
                    VStack(alignment: .leading, spacing: 20) {
                        if let done = trainedToday, !session.isActive { trainedCard(done) }
                        if let week = progress.checkInDue(in: program) { checkInPrompt(week) }
                        if progress.deloadNext { deloadPendingBanner }
                        if let plan {
                            header(plan)
                            weekNotes(plan)
                            if isRestDay(program), trainedToday == nil, !trainOnRestDay {
                                restDayCard(plan)
                            } else {
                                exerciseList(plan)
                            }
                        }
                    }
                    .padding(.horizontal)
                    .padding(.bottom, 110)
                }
            }
            .background(Theme.background)
            .overlay(alignment: .bottom) {
                if let active = profile.activeProgram, !session.isActive,
                   !(isRestDay(active.program) && trainedToday == nil && !trainOnRestDay),
                   let plan = ProgramDayPlan.make(program: active.program, progress: active.progress, history: history.records, profile: profile) {
                    FloatingActionButton(title: "Start \(plan.session.day.title)", systemImage: "play.fill") { start(plan) }
                        .padding(.bottom, 12)
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        if let active = profile.activeProgram {
                            NavigationLink {
                                ProgramDetailView(profile: profile, program: active.program)
                            } label: {
                                Label("Program Details", systemImage: "list.bullet.rectangle")
                            }
                        }
                        Button("Skip This Day", systemImage: "forward.end") { skipDay() }
                        Button("Use Generator Today", systemImage: "wand.and.stars", action: onUseGenerator)
                        Button("Empty Workout", systemImage: "square.and.pencil") { session.startEmpty() }
                    } label: {
                        Image(systemName: "ellipsis")
                    }
                    .accessibilityLabel("Workout options")
                }
            }
            .sheet(item: $replacing) { item in
                let planner = profile.planner(history: history.records)
                ExercisePicker(title: "Swap \(item.exercise.name)",
                               exercises: planner.alternatives(to: item.exercise)) { swap(item, to: $0) }
            }
            .sheet(item: Binding(get: { checkInWeek.map(CheckInTarget.init) }, set: { checkInWeek = $0?.week })) { target in
                FatigueCheckInSheet(profile: profile, week: target.week)
            }
        }
    }

    // MARK: Sections

    private func header(_ plan: ProgramDayPlan) -> some View {
        let rule = plan.session.rule
        return VStack(alignment: .leading, spacing: 12) {
            NavigationLink {
                ProgramDetailView(profile: profile, program: plan.program)
            } label: {
                HStack(spacing: 4) {
                    Text(plan.program.name).font(.subheadline.weight(.semibold))
                    Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(Theme.accent)
                        .accessibilityHidden(true)
                }
                .foregroundStyle(Theme.muted)
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens the program")

            VStack(alignment: .leading, spacing: 4) {
                if trainedToday != nil {
                    Text("NEXT UP").font(.caption.weight(.heavy)).foregroundStyle(Theme.accent)
                }
                Text("\(plan.session.day.title) Day").displayFont(30).accessibilityAddTraits(.isHeader)
                Text("Week \(plan.session.week) of \(plan.program.weeks) · \(plan.items.count) exercises · ~\(plan.estimatedMinutes) min")
                    .font(.subheadline).foregroundStyle(Theme.muted)
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { chips(rule) }
                VStack(alignment: .leading, spacing: 8) { chips(rule) }
            }
        }
        .padding(.top, 4)
    }

    @ViewBuilder private func chips(_ rule: WeekRule) -> some View {
        if rule.isDeload {
            Chip(highlighted: true) { Label("Deload week", systemImage: "bed.double") }
        }
        if let c = rule.compoundRIR { Chip { Text("Compounds RIR \(c.text)") } }
        if let i = rule.isolationRIR { Chip { Text("Isolations RIR \(i.text)") } }
        if rule.compoundRIR == nil && rule.isolationRIR == nil { Chip { Text("Base RIR targets") } }
    }

    @ViewBuilder private func weekNotes(_ plan: ProgramDayPlan) -> some View {
        let notes = plan.session.rule.notes
        if !notes.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(notes, id: \.self) { note in
                    Label(note, systemImage: "info.circle").font(.subheadline)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .card(padding: 14)
        }
    }

    private func trainedCard(_ log: WorkoutLog) -> some View {
        HStack(spacing: 14) {
            Image(systemName: "checkmark.seal.fill").font(.title).foregroundStyle(Theme.fresh).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("Trained today").font(.headline)
                Text((log.program.flatMap { ref in Programs.byID[ref.programID]?.day(ref.dayID).map { "Week \(ref.week) · \($0.title). " } } ?? "")
                     + "Recover well; here's what's next.")
                    .font(.subheadline).foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 0)
        }
        .card(padding: 14)
        .accessibilityElement(children: .combine)
    }

    private func restDayCard(_ plan: ProgramDayPlan) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Rest day", systemImage: "moon.zzz.fill").font(.headline)
            Text("The schedule has today off. Next session: \(plan.session.day.title).")
                .font(.subheadline).foregroundStyle(Theme.muted)
            Button("Train Anyway") { withAnimation(Motion.snappy) { trainOnRestDay = true } }
                .buttonStyle(.bordered)
                .font(.subheadline.weight(.semibold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }

    private func checkInPrompt(_ week: Int) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Week \(week) check-in", systemImage: "heart.text.square").font(.subheadline.bold())
            Text("Four quick fatigue flags. Two or more and it's time to deload early.")
                .font(.caption).foregroundStyle(Theme.muted)
            HStack(spacing: 10) {
                Button("Check In") { checkInWeek = week }.buttonStyle(.borderedProminent)
                Button("Skip") { saveCheckIn(FatigueCheckIn(), week: week) }.buttonStyle(.bordered)
            }
            .font(.subheadline.weight(.semibold))
        }
        .card(padding: 14)
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Theme.accent.opacity(0.4)))
    }

    private var deloadPendingBanner: some View {
        Label("Deload starts after this week", systemImage: "bed.double")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Theme.recovering)
            .frame(maxWidth: .infinity, alignment: .leading)
            .card(padding: 14)
    }

    private func exerciseList(_ plan: ProgramDayPlan) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(plan.items.enumerated()), id: \.element.id) { index, item in
                if index > 0 { Divider().padding(.leading, 88) }
                row(item)
            }
            ForEach(plan.removed) { p in
                Divider().padding(.leading, 88)
                HStack {
                    Text("Skipped: \(p.exercise.name)").font(.subheadline).foregroundStyle(Theme.muted)
                    Spacer()
                    Button("Restore") { restore(p.slot.id) }.font(.subheadline.weight(.semibold))
                }
                .padding(.vertical, 12)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 4)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func row(_ item: ProgramDayItem) -> some View {
        let p = item.prescription, s = item.suggestion
        let missing = !p.exercise.equipment.isSubset(of: profile.activeGym.equipment)
        return HStack(alignment: .top, spacing: 14) {
            NavigationLink {
                ExerciseDetailView(profile: profile, exercise: item.exercise)
            } label: {
                HStack(alignment: .top, spacing: 14) {
                    ExerciseThumb(exercise: item.exercise)
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 6) {
                            if let label = p.slot.label {
                                Text(label.uppercased()).font(.caption2.weight(.heavy)).foregroundStyle(Theme.accent)
                            }
                            if p.slot.supersetGroup != nil {
                                Text("SUPERSET").font(.caption2.weight(.heavy)).foregroundStyle(Theme.accent)
                            }
                            if p.slot.isOptional {
                                Text("OPTIONAL").font(.caption2.weight(.heavy)).foregroundStyle(Theme.muted)
                            }
                        }
                        Text(item.exercise.name).font(.headline).lineLimit(typeSize.isAccessibilitySize ? nil : 2)
                        Text("\(p.setsText) · \(p.effortText)").font(.subheadline.monospacedDigit()).foregroundStyle(Theme.muted)
                        Text("Rest \(p.restText)").font(.caption).foregroundStyle(Theme.muted)
                        Text(suggestionText(s)).font(.subheadline.weight(.semibold).monospacedDigit())
                        Text(s.reason).font(.caption).foregroundStyle(Theme.muted)
                        if let note = p.lastSetNote {
                            Label(note, systemImage: "flame.fill").font(.caption).foregroundStyle(Theme.recovering)
                        }
                        ForEach(p.slot.notes + [p.weekNote].compactMap { $0 }, id: \.self) { note in
                            Text("• \(note)").font(.caption).foregroundStyle(Theme.muted)
                        }
                        if missing {
                            Label("\(profile.activeGym.name) doesn't list all the equipment", systemImage: "exclamationmark.triangle")
                                .font(.caption).foregroundStyle(Theme.recovering)
                        }
                        if item.isSwapped {
                            Text("Swapped for today").font(.caption).foregroundStyle(Theme.muted)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityActions {
                Button("Swap Exercise") { replacing = item }
                Button("Skip Today") { remove(item) }
            }

            Menu {
                Button("Swap Exercise", systemImage: "arrow.triangle.2.circlepath") { replacing = item }
                Button("Skip Today", systemImage: "forward") { remove(item) }
                if s.action == .dropSet {
                    Button("Drop a Set (Stalled)", systemImage: "minus.circle") { dropSet(item) }
                }
                if (profile.programProgress?.setAdjustments[p.slot.id] ?? 0) != 0 {
                    Button("Restore Set Count", systemImage: "arrow.uturn.backward") { restoreSets(item) }
                }
            } label: {
                Image(systemName: "ellipsis").font(.body.bold()).foregroundStyle(Theme.muted)
                    .frame(width: 32, height: 44)
            }
            .accessibilityLabel("\(item.exercise.name) options")
        }
        .padding(.vertical, 12)
    }

    private func suggestionText(_ s: ProgressionSuggestion) -> String {
        let reps = "\(s.reps)+ reps"
        guard let w = s.weight else { return "Target: \(reps)" }
        return "Target: \(profile.units.format(w)) × \(reps)"
    }

    // MARK: Actions

    private func isRestDay(_ program: WorkoutProgram) -> Bool {
        program.scheduled(on: .now) == .rest
    }

    private func start(_ plan: ProgramDayPlan) {
        let (state, progress) = plan.start(profile: profile, history: history.records)
        profile.programProgress = progress
        session.start(state)
    }

    private func skipDay() {
        guard let active = profile.activeProgram, let day = active.progress.nextDayID(in: active.program) else { return }
        let program = active.program, progress = active.progress
        let before = progress
        var p = progress
        p.skip(day, in: program)
        profile.programProgress = p
        toasts.show("Skipped \(program.day(day)?.title ?? "day")") { profile.programProgress = before }
    }

    private func editToday(_ change: (inout ProgramDayEdits) -> Void) {
        guard let active = profile.activeProgram, let day = active.progress.nextDayID(in: active.program) else { return }
        let program = active.program, progress = active.progress
        var edits = ProgramDayEditsStore.load(key: ProgramDayEdits.key(programID: program.id, week: progress.week, dayID: day))
        change(&edits)
        ProgramDayEditsStore.save(edits)
        withAnimation(Motion.snappy) { editsRevision += 1 }
    }

    private func swap(_ item: ProgramDayItem, to exercise: Exercise) {
        editToday { $0.swaps[item.id] = exercise.id }
    }

    private func remove(_ item: ProgramDayItem) {
        editToday { if !$0.removed.contains(item.id) { $0.removed.append(item.id) } }
        toasts.show("Skipping \(item.exercise.name) today") { restore(item.id) }
    }

    private func restore(_ slotID: String) {
        editToday { $0.removed.removeAll { $0 == slotID }; $0.swaps[slotID] = nil }
    }

    private func dropSet(_ item: ProgramDayItem) {
        guard var p = profile.programProgress else { return }
        p.setAdjustments[item.id] = -1
        profile.programProgress = p
        toasts.show("\(item.exercise.name): one set fewer from now on") { restoreSets(item) }
    }

    private func restoreSets(_ item: ProgramDayItem) {
        guard var p = profile.programProgress else { return }
        p.setAdjustments[item.id] = nil
        profile.programProgress = p
    }

    private func saveCheckIn(_ checkIn: FatigueCheckIn, week: Int) {
        guard var p = profile.programProgress else { return }
        p.checkIns[week] = checkIn
        profile.programProgress = p
    }
}

private struct CheckInTarget: Identifiable {
    let week: Int
    var id: Int { week }
}

/// The weekly fatigue check: one flag from the logs, three from you.
struct FatigueCheckInSheet: View {
    @Bindable var profile: Profile
    let week: Int
    @Environment(HistoryStore.self) private var history
    @Environment(\.dismiss) private var dismiss
    @State private var checkIn = FatigueCheckIn()

    private var dropped: [String] {
        guard let id = profile.programProgress?.programID else { return [] }
        return ProgramProgression.repsDropped(history: history.records, programID: id, week: week)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Reps dropped at the same load", value: dropped.count >= 2 ? "Yes (\(dropped.count))" : "No")
                } header: {
                    Text("From your logs")
                } footer: {
                    Text("Counts as a flag when it happened on 2 or more exercises compared with the week before.")
                }
                Section("This week") {
                    Toggle("Persistent joint pain", isOn: $checkIn.jointPain)
                    Toggle("A muscle was still sore when due again", isOn: $checkIn.stillSore)
                    Toggle("Poor sleep or low motivation", isOn: $checkIn.poorSleepOrMotivation)
                }
                Section {
                    let total = resolved.flagCount
                    Label("\(total) of 4 flags", systemImage: total >= 2 ? "exclamationmark.triangle.fill" : "checkmark.circle")
                        .foregroundStyle(total >= 2 ? Theme.recovering : Theme.fresh)
                    if resolved.suggestsDeload {
                        Button("Save and Deload Now") { save(deload: true) }.fontWeight(.semibold)
                        Button("Save and Keep Going") { save(deload: false) }
                    } else {
                        Button("Save") { save(deload: false) }.fontWeight(.semibold)
                    }
                } footer: {
                    Text("Two or more flags: deload early. The deload week runs next, then the block is done.")
                }
            }
            .navigationTitle("Week \(week) Check-In")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
    }

    private var resolved: FatigueCheckIn {
        var c = checkIn
        c.repsDropped = dropped.count >= 2
        return c
    }

    private func save(deload: Bool) {
        guard var p = profile.programProgress, let program = p.program else { return dismiss() }
        p.checkIns[week] = resolved
        if deload {
            // Nothing logged yet this week: start the deload now. Otherwise after this week.
            if (p.completed[p.week] ?? []).isEmpty { p.deloadNow(in: program) } else { p.deloadNext = true }
        }
        profile.programProgress = p
        dismiss()
    }
}
