import Charts
import SwiftData
import SwiftUI
import WorkoutEngine

struct ProgressScreen: View {
    @Bindable var profile: Profile
    @Environment(HistoryStore.self) private var history
    private var logs: [WorkoutRecord] { history.records }
    @State private var adjusting: Muscle?
    /// Capped so the recovery grid keeps two columns at accessibility sizes.
    @ScaledMetric(relativeTo: .caption) private var scaledTileWidth: CGFloat = 98
    private var tileMinWidth: CGFloat { min(scaledTileWidth, 150) }
    @ScaledMetric(relativeTo: .subheadline) private var muscleNameWidth: CGFloat = 96
    @ScaledMetric(relativeTo: .subheadline) private var setCountWidth: CGFloat = 26

    private static let benchmarks = ["bb-squat", "bb-bench", "bb-deadlift", "bb-ohp"]

    var body: some View {
        let planner = profile.planner(history: logs)
        let recovery = Recovery.compute(history: logs, overrides: profile.overrides, now: .now)
        let weekly = planner.weeklySets()

        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    stats(recovery: recovery)

                    section("Calendar", footer: nil) {
                        VStack(spacing: 10) {
                            WorkoutCalendar(profile: profile)
                            NavigationLink {
                                HistoryView(profile: profile)
                            } label: {
                                HStack {
                                    Label("All Workouts", systemImage: "list.bullet")
                                    Spacer()
                                    Text("\(logs.count)").foregroundStyle(Theme.muted)
                                    Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(Theme.muted)
                                        .accessibilityHidden(true)
                                }
                                .font(.subheadline.weight(.semibold))
                                .card(padding: 14)
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    section("Muscle Recovery", footer: "Tap a muscle if it feels more or less sore than shown.") {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: tileMinWidth), spacing: 10)], spacing: 10) {
                            ForEach(Muscle.allCases.sorted { (recovery[$0] ?? 1) < (recovery[$1] ?? 1) }, id: \.self) { m in
                                Button { adjusting = m } label: {
                                    MuscleRecoveryTile(muscle: m, value: recovery[m] ?? 1, fillsWidth: true)
                                }
                                .buttonStyle(.plain)
                                .accessibilityHint("Adjusts how sore this muscle feels")
                            }
                        }
                    }

                    section("Sets This Week", footer: "Target \(Int(planner.weeklySetTarget)) working sets per muscle.") {
                        VStack(spacing: 12) {
                            let trained = Muscle.allCases.filter { (weekly[$0] ?? 0) > 0 }.sorted { weekly[$0]! > weekly[$1]! }
                            if trained.isEmpty {
                                Text("No sets logged this week yet.").foregroundStyle(Theme.muted).frame(maxWidth: .infinity, alignment: .leading)
                            }
                            ForEach(trained, id: \.self) { m in
                                let sets = weekly[m] ?? 0
                                HStack(spacing: 12) {
                                    Text(m.displayName).font(.subheadline).frame(width: muscleNameWidth, alignment: .leading)
                                    GeometryReader { geo in
                                        ZStack(alignment: .leading) {
                                            Capsule().fill(Theme.raised)
                                            Capsule().fill(Theme.accent).frame(width: geo.size.width * min(1, sets / planner.weeklySetTarget))
                                        }
                                    }
                                    .frame(height: 8)
                                    .accessibilityHidden(true)
                                    Text("\(Int(sets.rounded()))").font(.subheadline.bold().monospacedDigit()).frame(width: setCountWidth, alignment: .trailing)
                                }
                                .accessibilityElement(children: .ignore)
                                .accessibilityLabel(m.displayName)
                                .accessibilityValue("\(Int(sets.rounded())) of \(Int(planner.weeklySetTarget)) sets")
                            }
                        }
                        .card()
                    }

                    section("Strength", footer: nil) {
                        VStack(alignment: .leading, spacing: 16) {
                            let points = oneRMPoints
                            if points.isEmpty {
                                Text("Log squat, bench, deadlift or overhead press to see your estimated 1RM trend.")
                                    .font(.subheadline).foregroundStyle(Theme.muted)
                            } else {
                                Chart(points) { p in
                                    LineMark(x: .value("Date", p.date), y: .value(profile.units.symbol, profile.units.display(p.oneRM)))
                                        .foregroundStyle(by: .value("Lift", p.name))
                                        .interpolationMethod(.catmullRom)
                                    PointMark(x: .value("Date", p.date), y: .value(profile.units.symbol, profile.units.display(p.oneRM)))
                                        .foregroundStyle(by: .value("Lift", p.name))
                                }
                                .frame(height: 200)
                                .accessibilityLabel("Estimated one rep max trend")
                            }
                            ForEach(Self.benchmarks.compactMap { Catalog.byID[$0] }) { e in
                                NavigationLink {
                                    ExerciseDetailView(profile: profile, exercise: e)
                                } label: {
                                    HStack(spacing: 12) {
                                        ExerciseThumb(exercise: e, size: 40)
                                        Text(e.name).font(.subheadline.weight(.semibold))
                                        Spacer()
                                        Text(bestOneRM(e.id).map { profile.units.format($0) } ?? "–")
                                            .font(.subheadline.bold().monospacedDigit())
                                            .accessibilityLabel(bestOneRM(e.id).map { "Best estimated one rep max \(profile.units.format($0))" } ?? "Not logged")
                                        Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(Theme.muted)
                                            .accessibilityHidden(true)
                                    }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .card()
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 24)
            }
            .background(Theme.background)
            .navigationTitle("Progress")
            .sheet(item: $adjusting) { m in
                RecoveryAdjustSheet(muscle: m, current: recovery[m] ?? 1) { value in
                    var overrides = profile.overrides.filter { $0.muscle != m }
                    overrides.append(RecoveryOverride(muscle: m, recovery: value, date: .now))
                    profile.overrides = overrides
                }
            }
        }
    }

    private func section<Content: View>(_ title: String, footer: String?, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.title3.bold()).accessibilityAddTraits(.isHeader)
            content()
            if let footer { Text(footer).font(.caption).foregroundStyle(Theme.muted) }
        }
    }

    private func stats(recovery: [Muscle: Double]) -> some View {
        let fresh = Planner.freshGroupNames(recovery: recovery)
        return LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            statTile(daysSinceLast.map(String.init) ?? "–", daysSinceLast == 1 ? "day since your\nlast workout" : "days since your\nlast workout", Theme.accent)
            statTile("\(fresh.count)", fresh.count == 1 ? "fresh muscle\ngroup" : "fresh muscle\ngroups", Theme.fresh)
            statTile("\(workoutsThisWeek)", "workouts\nthis week", .primary)
            statTile("\(weekStreak)", weekStreak == 1 ? "week\nstreak" : "weeks\nstreak", Theme.recovering)
        }
    }

    private func statTile(_ value: String, _ label: String, _ color: Color) -> some View {
        // Number above label, so long numbers (a 210-week streak) never squeeze the label mid-word.
        VStack(alignment: .leading, spacing: 4) {
            Text(value).displayFont(34, monospacedDigits: true).foregroundStyle(color)
                .lineLimit(1).minimumScaleFactor(0.5)
            Text(label.replacingOccurrences(of: "\n", with: " ").uppercased())
                .font(.caption2.weight(.bold)).foregroundStyle(Theme.muted)
                .lineLimit(2, reservesSpace: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(padding: 14)
        .accessibilityElement(children: .combine)
    }

    private var daysSinceLast: Int? {
        logs.first.map { Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: $0.date), to: Calendar.current.startOfDay(for: .now)).day ?? 0 }
    }

    private var workoutsThisWeek: Int {
        let start = Calendar.current.dateInterval(of: .weekOfYear, for: .now)?.start ?? .now
        return logs.filter { $0.date >= start }.count
    }

    /// Consecutive weeks (including this one or last) with at least one workout.
    private var weekStreak: Int {
        let cal = Calendar.current
        let weeks = Set(logs.compactMap { cal.dateInterval(of: .weekOfYear, for: $0.date)?.start })
        guard var week = cal.dateInterval(of: .weekOfYear, for: .now)?.start else { return 0 }
        if !weeks.contains(week) { week = cal.date(byAdding: .weekOfYear, value: -1, to: week)! }
        var streak = 0
        while weeks.contains(week) {
            streak += 1
            week = cal.date(byAdding: .weekOfYear, value: -1, to: week)!
        }
        return streak
    }

    private func bestOneRM(_ id: String) -> Double? { history.bestOneRM[id] }

    private var oneRMPoints: [OneRMPoint] {
        Self.benchmarks.flatMap { id in
            (history.sessions[id] ?? []).compactMap { session -> OneRMPoint? in
                let best = session.logged.workingSets.filter { $0.weight > 0 }
                    .map { Strength.oneRM(weight: $0.weight, reps: $0.reps, rir: $0.rir) }.max()
                return best.map { OneRMPoint(date: session.date, name: Catalog.exercise(id).name, oneRM: $0) }
            }
        }
    }
}

struct OneRMPoint: Identifiable {
    let id = UUID()
    let date: Date
    let name: String
    let oneRM: Double
}

extension Muscle: @retroactive Identifiable {
    public var id: String { rawValue }
}

struct RecoveryAdjustSheet: View {
    let muscle: Muscle
    @State var current: Double
    let onSave: (Double) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 28) {
                RecoveryRing(value: current, size: 140, lineWidth: 12)
                    .animation(Motion.snappy, value: current)
                Slider(value: $current, in: 0...1, step: 0.05)
                    .accessibilityLabel("Recovery")
                    .accessibilityValue(RecoveryRing.spoken(current))
                HStack {
                    Text("Very sore")
                    Spacer()
                    Text("Fresh")
                }
                .font(.caption)
                .foregroundStyle(Theme.muted)
                Spacer()
            }
            .padding()
            .navigationTitle(muscle.displayName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { onSave(current); dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
    }
}
