import Foundation

/// Reads workout-history CSV exports (Fitbod, Strong, Hevy and similar) into workout records.
///
/// Columns are found by header name rather than position, so small format differences don't break it.
/// Rows are grouped into one workout per calendar day.
public enum HistoryImport {
    public struct Result: Sendable {
        public var workouts: [WorkoutRecord]
        /// Exercise names that couldn't be matched to the catalog, with how many sets were skipped.
        public var unmatched: [String: Int]
        public var setCount: Int { workouts.flatMap(\.exercises).flatMap(\.sets).count }
    }

    public enum ImportError: Error, LocalizedError {
        case missingColumns([String])
        case empty

        public var errorDescription: String? {
            switch self {
            case .missingColumns(let names): "Couldn't find these columns: \(names.joined(separator: ", "))."
            case .empty: "The file has no workout rows."
            }
        }
    }

    /// - Parameters:
    ///   - defaultPounds: unit to assume when the weight column doesn't say (Strong exports).
    ///   - manualMatches: exercise names from the file the user matched by hand, mapped to exercise IDs.
    public static func parse(_ text: String, defaultPounds: Bool, manualMatches: [String: String] = [:],
                             catalog: [Exercise] = Catalog.all,
                             calendar: Calendar = .current) throws -> Result {
        let rows = CSV.parse(text)
        guard let header = rows.first, rows.count > 1 else { throw ImportError.empty }
        let columns = header.map { $0.lowercased().trimmingCharacters(in: .whitespaces) }

        func column(_ test: (String) -> Bool) -> Int? { columns.firstIndex(where: test) }
        let date = column { $0 == "date" || $0 == "start_time" || $0 == "start time" || $0 == "workout date" }
        let name = column { $0 == "exercise" || $0 == "exercise name" || $0 == "exercise_title" || $0 == "exercise title" }
        let reps = column { $0 == "reps" }
        let weight = column { $0.hasPrefix("weight") }
        let seconds = column { $0.hasPrefix("duration(s") || $0 == "seconds" || $0 == "duration_seconds" }
        let warmup = column { $0 == "iswarmup" || $0 == "set_type" || $0 == "set order" }
        let rpe = column { $0 == "rpe" }

        var missing: [String] = []
        if date == nil { missing.append("Date") }
        if name == nil { missing.append("Exercise") }
        if reps == nil && seconds == nil { missing.append("Reps") }
        guard missing.isEmpty, let date, let name else { throw ImportError.missingColumns(missing) }

        let weightHeader = weight.map { columns[$0] } ?? ""
        let pounds = weightHeader.contains("lb") ? true : weightHeader.contains("kg") ? false : defaultPounds

        let matcher = NameMatcher(catalog: catalog)
        var unmatched: [String: Int] = [:]
        var byDay: [Date: (date: Date, exercises: [LoggedExercise])] = [:]

        for row in rows.dropFirst() where row.count >= columns.count / 2 {
            func value(_ i: Int?) -> String { i.flatMap { $0 < row.count ? row[$0] : nil }?.trimmingCharacters(in: .whitespaces) ?? "" }
            guard let when = Dates.parse(value(date)) else { continue }
            let rawName = value(name)
            guard !rawName.isEmpty else { continue }
            let manual = manualMatches[rawName].flatMap { id in catalog.first { $0.id == id } }
            guard let exercise = manual ?? matcher.match(rawName) else {
                unmatched[rawName, default: 0] += 1
                continue
            }

            let repCount = exercise.isTimed ? Int(Double(value(seconds)) ?? 0) : Int(Double(value(reps)) ?? 0)
            guard repCount > 0 else { continue }
            var kg = Double(value(weight)) ?? 0
            if pounds { kg /= Units.poundsPerKg }
            let flag = value(warmup).lowercased()
            let isWarmup: Bool = switch warmup.map({ columns[$0] }) {
            case "set order": flag == "w"                  // Strong: set number, or W for warm-up
            case "set_type": flag == "warmup"              // Hevy
            default: flag == "true" || flag == "1"         // Fitbod: isWarmup boolean
            }
            let rir = Double(value(rpe)).map { max(0, Int((10 - $0).rounded())) }

            let set = LoggedSet(weight: kg, reps: repCount, rir: rir, isWarmup: isWarmup)
            let day = calendar.startOfDay(for: when)
            var entry = byDay[day] ?? (when, [])
            entry.date = min(entry.date, when)
            if let i = entry.exercises.firstIndex(where: { $0.exerciseID == exercise.id }) {
                entry.exercises[i].sets.append(set)
            } else {
                entry.exercises.append(LoggedExercise(exerciseID: exercise.id, sets: [set]))
            }
            byDay[day] = entry
        }

        let workouts = byDay.values
            .map { WorkoutRecord(date: $0.date, focus: nil, exercises: $0.exercises) }
            .sorted { $0.date < $1.date }
        return Result(workouts: workouts, unmatched: unmatched)
    }
}

/// Fuzzy exercise-name matching against the catalog.
struct NameMatcher {
    let catalog: [Exercise]

    /// Common names that don't share enough words with the catalog name.
    static let aliases: [String: String] = [
        "bench press": "bb-bench", "back squat": "bb-squat", "squat": "bb-squat", "deadlift": "bb-deadlift",
        "overhead press": "bb-ohp", "military press": "bb-ohp", "shoulder press": "db-shoulder-press",
        "pullup": "pull-up", "pull up": "pull-up", "chinup": "chin-up", "chin up": "chin-up",
        "romanian deadlift": "bb-rdl", "rdl": "bb-rdl", "hip thrust": "hip-thrust", "lunge": "db-lunge",
        "bent over row": "bb-row", "barbell row": "bb-row", "seated row": "cable-row", "lat pulldown": "lat-pulldown",
        "triceps pushdown": "tricep-pushdown", "tricep pushdown": "tricep-pushdown", "leg press": "leg-press",
        "leg extension": "leg-extension", "leg curl": "leg-curl", "lateral raise": "db-lateral-raise",
        "face pull": "face-pull", "skullcrusher": "skull-crusher", "pushup": "push-up", "push up": "push-up",
    ]

    static let synonyms: [String: String] = [
        "db": "dumbbell", "dumbbells": "dumbbell", "bb": "barbell", "kb": "kettlebell", "ez": "ez",
        "triceps": "tricep", "rows": "row", "presses": "press", "curls": "curl", "raises": "raise",
        "extensions": "extension", "pulldowns": "pulldown", "lunges": "lunge", "squats": "squat",
        "deadlifts": "deadlift", "crunches": "crunch", "flyes": "fly", "flies": "fly", "pushups": "pushup",
        "pullups": "pullup", "chinups": "chinup",
    ]

    static let equipmentWords: Set<String> = ["barbell", "dumbbell", "cable", "machine", "kettlebell", "smith", "band", "ez"]

    static func tokens(_ name: String) -> Set<String> {
        let cleaned = name.lowercased().map { $0.isLetter || $0.isNumber ? $0 : " " }
        return Set(String(cleaned).split(separator: " ").map { synonyms[String($0)] ?? String($0) })
    }

    func match(_ name: String) -> Exercise? {
        let words = Self.tokens(name)
        let byID = Dictionary(uniqueKeysWithValues: catalog.map { ($0.id, $0) })
        // "Bench Press (Barbell)" → "bench press" alias when the equipment agrees.
        let bare = words.subtracting(Self.equipmentWords).sorted().joined(separator: " ")
        for (alias, id) in Self.aliases where Self.tokens(alias).sorted().joined(separator: " ") == bare {
            if let e = byID[id], equipmentAgrees(words, e) { return e }
        }

        // Compare movement words only; equipment was already checked.
        let movement = words.subtracting(Self.equipmentWords)
        var best: (Exercise, Double)?
        for e in catalog {
            let target = Self.tokens(e.name).subtracting(Self.equipmentWords)
            guard equipmentAgrees(words, e), !movement.isEmpty else { continue }
            let score = Double(movement.intersection(target).count) / Double(movement.union(target).count)
            if score > (best?.1 ?? 0) { best = (e, score) }
        }
        return best.flatMap { $0.1 >= 0.5 ? $0.0 : nil }
    }

    /// If the imported name names equipment, the catalog exercise must use it.
    private func equipmentAgrees(_ words: Set<String>, _ e: Exercise) -> Bool {
        let named = words.intersection(Self.equipmentWords)
        guard !named.isEmpty else { return true }
        let target = Self.tokens(e.name).intersection(Self.equipmentWords)
        let uses: Set<String> = Set(e.equipment.compactMap { eq -> String? in
            switch eq {
            case .barbell: "barbell"
            case .dumbbell: "dumbbell"
            case .cable, .latPulldown: "cable"
            case .kettlebell: "kettlebell"
            case .smithMachine: "smith"
            case .resistanceBand: "band"
            case .ezBar: "ez"
            case .legPress, .legCurl, .legExtension, .chestPressMachine, .shoulderPressMachine: "machine"
            default: nil
            }
        }).union(target)
        return named.isSubset(of: uses)
    }
}

enum CSV {
    /// RFC 4180-ish: quoted fields, doubled quotes, commas or semicolons as separators.
    static func parse(_ text: String) -> [[String]] {
        let firstLine = text.prefix { $0 != "\n" }
        let separator: Character = firstLine.filter { $0 == ";" }.count > firstLine.filter { $0 == "," }.count ? ";" : ","
        var rows: [[String]] = []
        var row: [String] = []
        var field = ""
        var quoted = false
        var chars = Array(text.replacingOccurrences(of: "\r\n", with: "\n"))
        if chars.first == "\u{FEFF}" { chars.removeFirst() }
        var i = 0
        while i < chars.count {
            let c = chars[i]
            if quoted {
                if c == "\"" {
                    if i + 1 < chars.count, chars[i + 1] == "\"" { field.append("\""); i += 1 } else { quoted = false }
                } else {
                    field.append(c)
                }
            } else if c == "\"" {
                quoted = true
            } else if c == separator {
                row.append(field); field = ""
            } else if c == "\n" {
                row.append(field); field = ""
                if !(row.count == 1 && row[0].isEmpty) { rows.append(row) }
                row = []
            } else {
                field.append(c)
            }
            i += 1
        }
        if !field.isEmpty || !row.isEmpty { row.append(field); rows.append(row) }
        return rows
    }
}

enum Dates {
    nonisolated(unsafe) static let formatters: [DateFormatter] = [
        "yyyy-MM-dd HH:mm:ss Z", "yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd'T'HH:mm:ssZ", "yyyy-MM-dd'T'HH:mm:ss",
        "d MMM yyyy, HH:mm", "dd MMM yyyy, HH:mm", "yyyy-MM-dd HH:mm", "yyyy-MM-dd", "MM/dd/yyyy HH:mm", "MM/dd/yyyy",
    ].map { format in
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = format
        return f
    }

    static func parse(_ text: String) -> Date? {
        if let d = ISO8601DateFormatter().date(from: text) { return d }
        for f in formatters { if let d = f.date(from: text) { return d } }
        return nil
    }
}
