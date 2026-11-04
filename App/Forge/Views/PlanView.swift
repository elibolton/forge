import SwiftUI
import WorkoutEngine

struct PlanView: View {
    @Bindable var profile: Profile
    /// Pushed inside another NavigationStack rather than shown as its own tab.
    var embedded = false
    @State private var importing = false
    @Environment(ToastCenter.self) private var toasts

    var body: some View {
        if embedded {
            form
        } else {
            NavigationStack { form }
        }
    }

    private var form: some View {
        Form {
            Section("Training") {
                Picker("Goal", selection: $profile.plan.goal) {
                    ForEach(Goal.allCases, id: \.self) { Text($0.title) }
                }
                Picker("Experience", selection: $profile.plan.experience) {
                    ForEach(Level.all, id: \.self) { Text($0.title) }
                }
                Picker("Split", selection: $profile.plan.split) {
                    ForEach(Split.allCases, id: \.self) { Text($0.title) }
                }
                Stepper("Session: \(profile.plan.sessionMinutes) min", value: $profile.plan.sessionMinutes, in: 15...90, step: 5)
            }

            Section("Program") {
                NavigationLink {
                    ProgramListView(profile: profile)
                } label: {
                    LabeledContent("Program", value: programStatus)
                }
            }

            Section("Gyms") {
                Picker("Training At", selection: $profile.activeGymID) {
                    ForEach(profile.gyms) { Text($0.name).tag($0.id) }
                }
                ForEach($profile.gyms) { $gym in
                    NavigationLink {
                        GymEditor(gym: $gym)
                    } label: {
                        LabeledContent(gym.name, value: "\(gym.equipment.count) items")
                    }
                }
                .onDelete(perform: deleteGyms)
                Menu("Add Gym") {
                    Button("Full Gym") { addGym(.commercial, name: "New Gym") }
                    Button("Home Gym (Barbell + Cables)") { addGym(.homeBarbell, name: "Home Gym") }
                    Button("Home Gym") { addGym(.home, name: "Home") }
                    Button("No Equipment") { addGym(.bodyweight, name: "Travel") }
                }
            }

            Section("Units") {
                Picker("Weights", selection: Binding(get: { profile.usesPounds }, set: setPounds)) {
                    Text("Pounds").tag(true)
                    Text("Kilograms").tag(false)
                }
                .pickerStyle(.segmented)
            }

            // Set once, rarely revisited: kept a level down so the top stays simple.
            Section("Fine-Tuning") {
                NavigationLink {
                    WorkoutStyleSettings(profile: profile)
                } label: {
                    LabeledContent("Workout Style", value: profile.plan.variability.title)
                }
                NavigationLink {
                    InjurySettings(profile: profile)
                } label: {
                    LabeledContent("Injuries & Limitations",
                                   value: profile.plan.injuries.isEmpty ? "None" : "\(profile.plan.injuries.count)")
                }
                NavigationLink {
                    CustomExerciseList(profile: profile)
                } label: {
                    LabeledContent("My Exercises",
                                   value: profile.customExercises.isEmpty ? "None" : "\(profile.customExercises.count)")
                }
                NavigationLink {
                    PreferenceSettings(profile: profile)
                } label: {
                    LabeledContent("Exercise Preferences",
                                   value: profile.plan.preferences.isEmpty ? "None" : "\(profile.plan.preferences.count)")
                }
            }

            Section("Data") {
                Button("Import Workout History", systemImage: "square.and.arrow.down") { importing = true }
            }
        }
        .navigationTitle("You")
        .sheet(isPresented: $importing) { ImportHistoryView(profile: profile) }
    }

    private var programStatus: String {
        guard let progress = profile.programProgress, let program = progress.program else { return "None" }
        return progress.isFinished ? "Finished" : "Week \(progress.week) of \(program.weeks)"
    }

    private func deleteGyms(_ offsets: IndexSet) {
        // Always keep at least one gym.
        guard profile.gyms.count > offsets.count else {
            toasts.show("You need at least one gym")
            return
        }
        let before = profile.gyms
        let activeBefore = profile.activeGymID
        profile.gyms.remove(atOffsets: offsets)
        if !profile.gyms.contains(where: { $0.id == profile.activeGymID }) { profile.activeGymID = profile.gyms[0].id }
        toasts.show("Gym deleted") {
            profile.gyms = before
            profile.activeGymID = activeBefore
        }
    }

    private func addGym(_ preset: Gym, name: String) {
        var gym = preset
        gym.id = UUID()
        gym.name = name
        gym.usesPounds = profile.usesPounds
        profile.gyms.append(gym)
    }

    private func setPounds(_ pounds: Bool) {
        profile.usesPounds = pounds
        profile.gyms = profile.gyms.map { var g = $0; g.usesPounds = pounds; g.increments = [:]; return g }
    }
}

struct WorkoutStyleSettings: View {
    @Bindable var profile: Profile

    var body: some View {
        Form {
            Section {
                Picker("Exercise Variety", selection: $profile.plan.variability) {
                    ForEach(Variability.all, id: \.self) { Text($0.title) }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            } header: {
                Text("Exercise Variety")
            } footer: {
                Text("Consistent repeats the same lifts so progress is easy to track. More variety rotates exercises more often.")
            }
            Section {
                Toggle("Warm-Up Sets", isOn: $profile.plan.warmUpSets)
            } footer: {
                Text("Adds lighter ramp-up sets before heavy compound lifts.")
            }
        }
        .navigationTitle("Workout Style")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct InjurySettings: View {
    @Bindable var profile: Profile

    var body: some View {
        Form {
            Section {
                ForEach(Joint.allCases, id: \.self) { joint in
                    Toggle(joint.title, isOn: Binding(
                        get: { profile.plan.injuries.contains(joint) },
                        set: { if $0 { profile.plan.injuries.insert(joint) } else { profile.plan.injuries.remove(joint) } }))
                }
            } footer: {
                Text("Exercises that load these joints are left out. Not medical advice.")
            }
        }
        .navigationTitle("Injuries & Limitations")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct PreferenceSettings: View {
    @Bindable var profile: Profile

    var body: some View {
        let prefs = profile.plan.preferences.sorted { Catalog.exercise($0.key).name < Catalog.exercise($1.key).name }
        Form {
            if prefs.isEmpty {
                ContentUnavailableView("No preferences yet", systemImage: "hand.thumbsup",
                                       description: Text("Use the … menu on an exercise to recommend it more, less or never."))
            } else {
                Section {
                    ForEach(prefs, id: \.key) { id, pref in
                        LabeledContent(Catalog.exercise(id).name, value: pref.title)
                    }
                    .onDelete { offsets in
                        for i in offsets { profile.plan.preferences[prefs[i].key] = nil }
                    }
                } footer: {
                    Text("Swipe to remove a preference.")
                }
            }
        }
        .navigationTitle("Exercise Preferences")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct GymEditor: View {
    @Binding var gym: Gym

    private let groups: [(String, [Equipment])] = [
        ("Free Weights", [.barbell, .ezBar, .trapBar, .dumbbell, .kettlebell, .resistanceBand]),
        ("Stations", [.bench, .squatRack, .pullUpBar, .dipStation, .smithMachine]),
        ("Machines", [.cable, .latPulldown, .legPress, .legCurl, .legExtension, .chestPressMachine, .shoulderPressMachine]),
    ]

    var body: some View {
        Form {
            TextField("Name", text: $gym.name)
            ForEach(groups, id: \.0) { title, items in
                Section(title) {
                    ForEach(items, id: \.self) { e in
                        Toggle(e.title, isOn: Binding(
                            get: { gym.equipment.contains(e) },
                            set: { if $0 { gym.equipment.insert(e) } else { gym.equipment.remove(e) } }))
                    }
                }
            }
            Section {
                ForEach([Equipment.barbell, .dumbbell, .kettlebell, .cable], id: \.self) { e in
                    Stepper("\(e.title): \(gym.increment(for: e).formatted()) \(gym.usesPounds ? "lb" : "kg") steps",
                            value: Binding(get: { gym.increment(for: e) }, set: { gym.increments[e] = $0 }),
                            in: (gym.usesPounds ? 1 : 0.5)...(gym.usesPounds ? 20 : 10),
                            step: gym.usesPounds ? 2.5 : 0.5)
                }
            } header: {
                Text("Weight Steps")
            } footer: {
                Text("The smallest jump available, so suggested weights are ones you can actually load.")
            }
        }
        .navigationTitle(gym.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}
