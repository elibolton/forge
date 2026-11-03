import SwiftData
import SwiftUI
import UniformTypeIdentifiers
import WorkoutEngine

/// Imports past workouts from a Fitbod, Strong or Hevy CSV export so recommendations start from real numbers.
struct ImportHistoryView: View {
    let profile: Profile
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query private var logs: [WorkoutLog]

    @State private var pounds: Bool
    @State private var picking = false
    @State private var result: HistoryImport.Result?
    @State private var fileText: String?
    @State private var error: String?
    @State private var imported: Int?
    @State private var parsing = false
    /// Names from the file the user matched by hand → exercise id.
    @State private var manualMatches: [String: String] = [:]
    @State private var matching: UnmatchedName?
    @State private var creatingFrom: UnmatchedName?

    init(profile: Profile) {
        self.profile = profile
        _pounds = State(initialValue: profile.usesPounds)
    }

    /// Imported days that aren't already in the log.
    private var newWorkouts: [WorkoutRecord] {
        let existing = Set(logs.map { Calendar.current.startOfDay(for: $0.date) })
        return (result?.workouts ?? []).filter { !existing.contains(Calendar.current.startOfDay(for: $0.date)) }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Export your history from Fitbod (Settings → Export Workout Data), Strong or Hevy, then pick the CSV file here.")
                        .font(.subheadline).foregroundStyle(Theme.muted)
                    Picker("Weights in file", selection: $pounds) {
                        Text("Pounds").tag(true)
                        Text("Kilograms").tag(false)
                    }
                    .onChange(of: pounds) { reparse() }
                    Button("Choose CSV File", systemImage: "doc.badge.plus") { picking = true }
                } footer: {
                    Text("The unit is only used when the file doesn't say (Fitbod and Hevy files do).")
                }

                if parsing {
                    Section {
                        HStack(spacing: 12) {
                            ProgressView()
                            Text("Reading file…").foregroundStyle(Theme.muted)
                        }
                    }
                }

                if let error {
                    Section { Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(Theme.fatigued) }
                }

                if let result {
                    Section("Found") {
                        LabeledContent("Workouts", value: "\(result.workouts.count)")
                        LabeledContent("Sets", value: "\(result.setCount)")
                        if let first = result.workouts.first?.date, let last = result.workouts.last?.date {
                            LabeledContent("Dates", value: "\(first.formatted(date: .abbreviated, time: .omitted)) – \(last.formatted(date: .abbreviated, time: .omitted))")
                        }
                        if imported == nil, newWorkouts.count < result.workouts.count {
                            LabeledContent("Already logged", value: "\(result.workouts.count - newWorkouts.count) days skipped")
                        }
                    }
                    if !result.unmatched.isEmpty {
                        Section {
                            ForEach(result.unmatched.sorted { $0.value > $1.value }, id: \.key) { name, count in
                                Menu {
                                    Button("Match to an Exercise…", systemImage: "link") { matching = UnmatchedName(name: name) }
                                    Button("Create as Custom Exercise", systemImage: "plus.square.dashed") { creatingFrom = UnmatchedName(name: name) }
                                } label: {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(name).foregroundStyle(.primary)
                                            Text("\(count) sets skipped").font(.caption).foregroundStyle(Theme.muted)
                                        }
                                        Spacer()
                                        Text("Fix").font(.subheadline.bold()).foregroundStyle(Theme.accent)
                                    }
                                }
                                .disabled(imported != nil)
                            }
                        } header: {
                            Text("Not recognized (\(result.unmatched.count))")
                        } footer: {
                            Text("Match each name to an exercise, or create it, to include those sets. Anything left here is skipped.")
                        }
                    }
                    Section {
                        if let imported {
                            Label("Imported \(imported) workouts", systemImage: "checkmark.circle.fill").foregroundStyle(Theme.fresh)
                        } else {
                            Button("Import \(newWorkouts.count) Workouts", action: save)
                                .bold()
                                .disabled(newWorkouts.isEmpty)
                        }
                    }
                }
            }
            .navigationTitle("Import History")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .sheet(item: $matching) { item in
                ExercisePicker(title: "Match “\(item.name)”", exercises: Catalog.all) { exercise in
                    manualMatches[item.name] = exercise.id
                    reparse()
                }
            }
            .sheet(item: $creatingFrom) { item in
                CustomExerciseEditor(profile: profile, initialName: item.name) { exercise in
                    manualMatches[item.name] = exercise.id
                    reparse()
                }
            }
            .fileImporter(isPresented: $picking, allowedContentTypes: [.commaSeparatedText, .plainText, .text]) { picked in
                load(picked)
            }
        }
    }

    private func load(_ picked: Result<URL, Error>) {
        imported = nil
        do {
            let url = try picked.get()
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            let data = try Data(contentsOf: url)
            fileText = String(decoding: data, as: UTF8.self)
            reparse()
        } catch {
            self.error = error.localizedDescription
            result = nil
        }
    }

    /// Parsing years of history takes seconds, so it runs off the main thread.
    private func reparse() {
        guard let fileText else { return }
        let pounds = pounds
        let manualMatches = manualMatches
        // The parser matches against the catalog, which may include just-created custom exercises.
        let catalog = Catalog.all
        parsing = true
        result = nil
        error = nil
        Task {
            let outcome = await Task.detached(priority: .userInitiated) {
                Result { try HistoryImport.parse(fileText, defaultPounds: pounds, manualMatches: manualMatches, catalog: catalog) }
            }.value
            parsing = false
            switch outcome {
            case .success(let parsed): result = parsed
            case .failure(let failure): error = failure.localizedDescription
            }
        }
    }

    private func save() {
        let workouts = newWorkouts
        for w in workouts {
            context.insert(WorkoutLog(date: w.date, focus: nil, durationSeconds: 0, exercises: w.exercises))
        }
        try? context.save()
        imported = workouts.count
    }
}

private struct UnmatchedName: Identifiable {
    var id: String { name }
    let name: String
}
