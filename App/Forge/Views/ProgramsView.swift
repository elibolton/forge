import SwiftUI
import WorkoutEngine

/// Built-in multi-week programs: browse, start, and manage the active one.
struct ProgramListView: View {
    @Bindable var profile: Profile

    var body: some View {
        List {
            Section {
                ForEach(Programs.all) { program in
                    NavigationLink {
                        ProgramDetailView(profile: profile, program: program)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(program.name).font(.headline)
                                if profile.programProgress?.programID == program.id {
                                    Text(profile.programProgress?.isFinished == true ? "DONE" : "ACTIVE")
                                        .font(.caption2.weight(.heavy)).foregroundStyle(Theme.accent)
                                }
                            }
                            Text("\(program.weeks) weeks · \(program.dayOrder.count) days a week")
                                .font(.subheadline).foregroundStyle(Theme.muted)
                            Text(program.summary).font(.caption).foregroundStyle(Theme.muted)
                        }
                        .padding(.vertical, 4)
                    }
                }
            } footer: {
                Text("While a program is active, Today shows its next session instead of a generated workout.")
            }
        }
        .navigationTitle("Programs")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct ProgramDetailView: View {
    @Bindable var profile: Profile
    let program: WorkoutProgram
    @Environment(ToastCenter.self) private var toasts
    @State private var week: Int
    @State private var confirmingEnd = false

    init(profile: Profile, program: WorkoutProgram) {
        self.profile = profile
        self.program = program
        let progress = profile.programProgress
        _week = State(initialValue: progress?.programID == program.id ? min(progress?.week ?? 1, program.weeks) : 1)
    }

    private var progress: ProgramProgress? {
        profile.programProgress.flatMap { $0.programID == program.id ? $0 : nil }
    }

    var body: some View {
        Form {
            Section {
                Text(program.summary).font(.subheadline)
                LabeledContent("Schedule", value: scheduleText)
                    .font(.subheadline)
            }

            actions

            Section {
                Picker("Week", selection: $week) {
                    ForEach(1...program.weeks, id: \.self) { w in
                        Text(program.rule(week: w).isDeload ? "Week \(w) · Deload" : "Week \(w)").tag(w)
                    }
                }
                let rule = program.rule(week: week)
                ForEach(rule.notes, id: \.self) { Label($0, systemImage: "info.circle").font(.caption) }
            } header: {
                Text("Prescription")
            }

            ForEach(program.dayOrder, id: \.self) { dayID in
                if let session = program.session(dayID: dayID, week: week, setAdjustments: progress?.setAdjustments ?? [:]) {
                    Section {
                        ForEach(session.exercises) { p in
                            ProgramPrescriptionRow(prescription: p)
                        }
                    } header: {
                        HStack {
                            Text(session.day.title)
                            if progress?.week == week, progress?.isDone(dayID) == true {
                                Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.fresh)
                                    .accessibilityLabel("Done")
                            }
                        }
                    }
                }
            }

            Section("Progression") {
                ForEach(program.progressionNotes, id: \.self) { Text($0).font(.caption) }
            }
        }
        .navigationTitle(program.name)
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("End this program?", isPresented: $confirmingEnd, titleVisibility: .visible) {
            Button("End Program", role: .destructive) { end() }
        } message: {
            Text("Today goes back to generated workouts. Your logged workouts stay in history.")
        }
    }

    @ViewBuilder private var actions: some View {
        if let progress {
            Section {
                if progress.isFinished {
                    Label("Program complete", systemImage: "checkmark.seal.fill").foregroundStyle(Theme.fresh)
                    Button("Start Again", systemImage: "arrow.counterclockwise") { start(week: 1) }
                } else {
                    LabeledContent("Current week", value: "\(progress.week) of \(program.weeks)")
                    if let deload = program.deloadWeek, progress.week != deload {
                        if progress.deloadNext {
                            Button("Cancel Early Deload") { update { $0.deloadNext = false } }
                        } else {
                            Button("Deload Next Week", systemImage: "arrow.down.right") { update { $0.deloadNext = true } }
                        }
                        Button("Deload Now", systemImage: "bed.double") { update { $0.deloadNow(in: program) } }
                    }
                    Menu("Jump to Week…") {
                        ForEach(1...program.weeks, id: \.self) { w in
                            Button("Week \(w)") { update { $0.week = w; $0.isFinished = false } }
                        }
                    }
                }
                Button("End Program", role: .destructive) { confirmingEnd = true }
            }
        } else {
            Section {
                Button("Start Program", systemImage: "play.fill") { start(week: 1) }
                    .fontWeight(.semibold)
                Menu("Start at Week…") {
                    ForEach(1...program.weeks, id: \.self) { w in Button("Week \(w)") { start(week: w) } }
                }
            } footer: {
                if profile.programProgress != nil {
                    Text("Starting this replaces your current program.")
                }
            }
        }
    }

    private var scheduleText: String {
        let names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        return zip(names, program.schedule).map { name, slot in
            "\(name) \(slot.dayID.flatMap { program.day($0)?.title } ?? "Rest")"
        }.joined(separator: " · ")
    }

    private func start(week: Int) {
        profile.programProgress = ProgramProgress(programID: program.id, week: week)
        self.week = week
        toasts.show("\(program.name) started")
    }

    private func update(_ change: (inout ProgramProgress) -> Void) {
        guard var p = progress else { return }
        change(&p)
        profile.programProgress = p
        week = min(p.week, program.weeks)
    }

    private func end() {
        let before = profile.programProgress
        profile.programProgress = nil
        toasts.show("Program ended") { profile.programProgress = before }
    }
}

/// One prescription line: sets × reps · RIR · rest, cues and flags.
struct ProgramPrescriptionRow: View {
    let prescription: ResolvedPrescription

    var body: some View {
        let p = prescription
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                if let label = p.slot.label {
                    Text(label).font(.caption.bold()).foregroundStyle(Theme.accent)
                }
                Text(p.exercise.name).font(.subheadline.weight(.semibold))
                if p.slot.isOptional {
                    Text("OPTIONAL").font(.caption2.weight(.heavy)).foregroundStyle(Theme.muted)
                }
            }
            Text("\(p.setsText) · \(p.effortText) · \(p.restText)")
                .font(.caption.monospacedDigit()).foregroundStyle(Theme.muted)
            if let note = p.lastSetNote {
                Label(note, systemImage: "flame.fill").font(.caption).foregroundStyle(Theme.recovering)
            }
            if let note = p.weekNote {
                Text(note).font(.caption).foregroundStyle(Theme.muted)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
