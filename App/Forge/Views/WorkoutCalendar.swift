import SwiftData
import SwiftUI
import WorkoutEngine

/// Month grid with workout days marked; tapping a day lists what was done.
struct WorkoutCalendar: View {
    let profile: Profile
    @Environment(\.modelContext) private var context
    @Environment(ToastCenter.self) private var toasts
    @Query(sort: \WorkoutLog.date, order: .reverse) private var logs: [WorkoutLog]

    @State private var month = Calendar.current.dateInterval(of: .month, for: .now)?.start ?? .now
    @State private var selected = Calendar.current.startOfDay(for: .now)

    private let calendar = Calendar.current

    /// Only reads dates, so it stays cheap with years of history.
    private var logsByDay: [Date: [WorkoutLog]] {
        Dictionary(grouping: logs) { calendar.startOfDay(for: $0.date) }
    }

    var body: some View {
        let byDay = logsByDay
        VStack(alignment: .leading, spacing: 14) {
            header(byDay)
            grid(byDay)
            Divider()
            dayDetail(byDay[selected] ?? [])
        }
        .card()
        .animation(Motion.snappy, value: month)
        .animation(Motion.snappy, value: selected)
    }

    // MARK: Header

    private func header(_ byDay: [Date: [WorkoutLog]]) -> some View {
        let count = byDay.filter { calendar.isDate($0.key, equalTo: month, toGranularity: .month) }
            .reduce(0) { $0 + $1.value.count }
        let isCurrentMonth = calendar.isDate(month, equalTo: .now, toGranularity: .month)
        return HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(month, format: .dateTime.month(.wide).year()).font(.headline)
                    .accessibilityAddTraits(.isHeader)
                Text(count == 1 ? "1 workout" : "\(count) workouts").font(.caption).foregroundStyle(Theme.muted)
            }
            Spacer()
            Button { shiftMonth(-1) } label: { Image(systemName: "chevron.left").frame(width: 36, height: 36) }
                .accessibilityLabel("Previous month")
            Button { shiftMonth(1) } label: { Image(systemName: "chevron.right").frame(width: 36, height: 36) }
                .disabled(isCurrentMonth)
                .accessibilityLabel("Next month")
        }
        .font(.body.bold())
    }

    // MARK: Grid

    private func grid(_ byDay: [Date: [WorkoutLog]]) -> some View {
        let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)
        let symbols = calendar.veryShortStandaloneWeekdaySymbols
        let first = calendar.firstWeekday - 1
        let ordered = Array(symbols[first...] + symbols[..<first])
        let days = daysInMonth()
        let leading = (calendar.component(.weekday, from: month) - calendar.firstWeekday + 7) % 7

        return LazyVGrid(columns: columns, spacing: 6) {
            ForEach(Array(ordered.enumerated()), id: \.offset) { _, symbol in
                Text(symbol).font(.caption2.weight(.bold)).foregroundStyle(Theme.muted)
                    // Each day already says its weekday.
                    .accessibilityHidden(true)
            }
            ForEach(0..<leading, id: \.self) { _ in Color.clear.frame(height: 36) }
            ForEach(days, id: \.self) { day in
                dayCell(day, trained: byDay[day] != nil)
            }
        }
        // Seven columns can't grow much on a phone; VoiceOver and the day list below carry the details.
        .dynamicTypeSize(...DynamicTypeSize.xxLarge)
    }

    private func dayCell(_ day: Date, trained: Bool) -> some View {
        let isToday = calendar.isDateInToday(day)
        let isFuture = day > .now
        let isSelected = day == selected
        return Button { selected = day } label: {
            Text("\(calendar.component(.day, from: day))")
                .font(.subheadline.weight(trained || isToday ? .bold : .regular).monospacedDigit())
                .frame(width: 36, height: 36)
                .background(trained ? Theme.accent : .clear, in: Circle())
                .overlay(Circle().stroke(isSelected ? Color.primary : isToday ? Theme.accent : .clear, lineWidth: 2))
                .foregroundStyle(trained ? .white : isFuture ? Theme.muted.opacity(0.5) : .primary)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .disabled(isFuture)
        .accessibilityLabel(Text(day, format: .dateTime.weekday(.wide).month().day()) + Text(trained ? ", workout" : ""))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    // MARK: Selected day

    @ViewBuilder private func dayDetail(_ dayLogs: [WorkoutLog]) -> some View {
        Text(selected, format: .dateTime.weekday(.wide).month(.wide).day())
            .font(.subheadline.bold())
            .accessibilityAddTraits(.isHeader)
        if dayLogs.isEmpty {
            Text(calendar.isDateInToday(selected) ? "Nothing logged yet today." : "Rest day.")
                .font(.subheadline).foregroundStyle(Theme.muted)
        } else {
            ForEach(dayLogs) { log in
                NavigationLink {
                    WorkoutLogDetail(log: log, profile: profile)
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "dumbbell.fill")
                            .font(.system(size: 17))
                            .frame(width: 40, height: 40)
                            .background(Theme.accent.opacity(0.18), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .foregroundStyle(Theme.accent)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(log.focus.map { "\($0.title) Day" } ?? "Workout").font(.subheadline.bold())
                            Text(WorkoutSummary.text(log, units: profile.units)).font(.caption).foregroundStyle(Theme.muted)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(Theme.muted)
                            .accessibilityHidden(true)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .contextMenu {
                    Button("Delete Workout", systemImage: "trash", role: .destructive) {
                        WorkoutSummary.delete(log, context: context, toasts: toasts)
                    }
                }
                .accessibilityAction(named: "Delete Workout") {
                    WorkoutSummary.delete(log, context: context, toasts: toasts)
                }
            }
        }
    }

    // MARK: Helpers

    private func daysInMonth() -> [Date] {
        guard let range = calendar.range(of: .day, in: .month, for: month) else { return [] }
        return range.compactMap { calendar.date(byAdding: .day, value: $0 - 1, to: month) }
    }

    private func shiftMonth(_ delta: Int) {
        guard let next = calendar.date(byAdding: .month, value: delta, to: month) else { return }
        month = next
        // Keep the selection in view: today in the current month, else the 1st.
        selected = calendar.isDate(next, equalTo: .now, toGranularity: .month) ? calendar.startOfDay(for: .now) : next
    }
}

enum WorkoutSummary {
    static func text(_ log: WorkoutLog, units: WeightUnits) -> String {
        let count = log.exercises.count
        return [count == 1 ? "1 exercise" : "\(count) exercises",
                // Imported workouts have no duration.
                log.durationSeconds > 0 ? "\(max(1, log.durationSeconds / 60)) min" : nil,
                log.volume > 0 ? "\(units.format(log.volume)) moved" : nil]
            .compactMap { $0 }.joined(separator: " · ")
    }

    /// Deletes with an Undo banner that restores an identical workout.
    @MainActor
    static func delete(_ log: WorkoutLog, context: ModelContext, toasts: ToastCenter) {
        let date = log.date, focus = log.focus, duration = log.durationSeconds, exercises = log.exercises, program = log.program
        context.delete(log)
        try? context.save()
        toasts.show("Workout deleted") {
            context.insert(WorkoutLog(date: date, focus: focus, durationSeconds: duration, exercises: exercises, program: program))
            try? context.save()
        }
    }
}
