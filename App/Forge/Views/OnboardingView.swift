import SwiftData
import SwiftUI
import UserNotifications
import WorkoutEngine

/// First-run setup: one decision per page, every page pre-filled so Next always works.
struct OnboardingView: View {
    @Environment(\.modelContext) private var context
    @State private var page = Page.goal
    @State private var forward = true
    @State private var plan = UserPlan(split: OnboardingView.recommendedSplit(days: 3))
    @State private var daysPerWeek = 3
    @State private var gymPreset = 0
    @State private var gym = Self.presets[0].gym
    @State private var pounds = Locale.current.measurementSystem == .us
    @State private var notifications: UNAuthorizationStatus = .notDetermined
    @State private var editingGym = false
    @State private var notificationsLater = false

    enum Page: Int, CaseIterable { case goal, schedule, experience, gym, finish }

    static let presets: [(title: String, detail: String, symbol: String, gym: Gym)] = [
        ("Full Gym", "Barbells, racks, cables and machines", "building.2.fill", .commercial),
        ("Home Gym", "Dumbbells, bench, pull-up bar, bands", "house.fill", .home),
        ("No Equipment", "Bodyweight moves only", "figure.walk", .bodyweight),
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                header
                ScrollView {
                    Group {
                        switch page {
                        case .goal: goalPage
                        case .schedule: schedulePage
                        case .experience: experiencePage
                        case .gym: gymPage
                        case .finish: finishPage
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 24)
                    .id(page)
                    .transition(.asymmetric(insertion: .move(edge: forward ? .trailing : .leading).combined(with: .opacity),
                                            removal: .move(edge: forward ? .leading : .trailing).combined(with: .opacity)))
                }
                .scrollBounceBehavior(.basedOnSize)
                footer
            }
            .background(Theme.background)
            .toolbar {
                if page != .finish {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Skip") { go(to: .finish) }
                            .foregroundStyle(Theme.muted)
                    }
                }
            }
            .task { notifications = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus }
        }
    }

    // MARK: - Chrome

    private var header: some View {
        HStack(spacing: 8) {
            ForEach(Page.allCases, id: \.self) { p in
                Capsule()
                    .fill(p.rawValue <= page.rawValue ? Theme.accent : Theme.raised)
                    .frame(width: p == page ? 22 : 8, height: 8)
            }
        }
        .animation(.snappy, value: page)
        .padding(.vertical, 12)
        .accessibilityElement()
        .accessibilityLabel("Step \(page.rawValue + 1) of \(Page.allCases.count)")
    }

    private var footer: some View {
        HStack {
            if page != .goal {
                Button {
                    go(to: Page(rawValue: page.rawValue - 1)!)
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.headline)
                        .frame(width: 54, height: 54)
                        .background(Theme.raised, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Back")
            }
            Spacer()
            if page == .finish {
                FloatingActionButton(title: "Build My First Workout", systemImage: "bolt.fill", action: finish)
            } else {
                FloatingActionButton(title: "Next", systemImage: "chevron.right") {
                    go(to: Page(rawValue: page.rawValue + 1)!)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }

    private func go(to p: Page) {
        forward = p.rawValue > page.rawValue
        withAnimation(.snappy) { page = p }
    }

    // MARK: - Pages

    private var goalPage: some View {
        VStack(alignment: .leading, spacing: 12) {
            PageTitle(title: "What's your goal?", subtitle: "Forge builds every workout around it. You can change this anytime in You.")
            ForEach(Goal.allCases, id: \.self) { g in
                OptionCard(title: g.title, detail: g.blurb, symbol: g.symbol, selected: plan.goal == g) { plan.goal = g }
            }
        }
        .sensoryFeedback(.selection, trigger: plan.goal)
    }

    private var schedulePage: some View {
        VStack(alignment: .leading, spacing: 20) {
            PageTitle(title: "Your schedule", subtitle: "How often and how long you can train.")

            VStack(alignment: .leading, spacing: 14) {
                Text("Days per week").font(.headline)
                HStack(spacing: 8) {
                    ForEach(2...6, id: \.self) { n in
                        Button {
                            daysPerWeek = n
                            plan.split = Self.recommendedSplit(days: n)
                        } label: {
                            Text("\(n)")
                                .font(.title3.weight(.bold).monospacedDigit())
                                .frame(maxWidth: .infinity, minHeight: 48)
                                .background(daysPerWeek == n ? Theme.accent : Theme.raised,
                                            in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                .foregroundStyle(daysPerWeek == n ? .white : .primary)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(n) days")
                        .accessibilityAddTraits(daysPerWeek == n ? .isSelected : [])
                    }
                }
            }
            .card()
            .sensoryFeedback(.selection, trigger: daysPerWeek)

            VStack(alignment: .leading, spacing: 12) {
                Text("Split").font(.headline)
                Text("We recommend \(Self.recommendedSplit(days: daysPerWeek).title) for \(daysPerWeek) days a week.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
                FlowChips {
                    ForEach(Split.allCases, id: \.self) { s in
                        Button { plan.split = s } label: {
                            Chip(highlighted: plan.split == s) { Text(s.title) }
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(plan.split == s ? .isSelected : [])
                    }
                }
                Text(plan.split.blurb)
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }
            .card()
            .sensoryFeedback(.selection, trigger: plan.split)

            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Session length").font(.headline)
                    Spacer()
                    Text("\(plan.sessionMinutes) min")
                        .displayFont(22, monospacedDigits: true)
                        .foregroundStyle(Theme.accent)
                }
                Slider(value: Binding(get: { Double(plan.sessionMinutes) }, set: { plan.sessionMinutes = Int($0) }),
                       in: 15...90, step: 5) {
                    Text("Session length")
                } minimumValueLabel: {
                    Text("15").font(.caption).foregroundStyle(Theme.muted)
                } maximumValueLabel: {
                    Text("90").font(.caption).foregroundStyle(Theme.muted)
                }
                .accessibilityValue("\(plan.sessionMinutes) minutes")
            }
            .card()
            .sensoryFeedback(.selection, trigger: plan.sessionMinutes)
        }
    }

    private var experiencePage: some View {
        VStack(alignment: .leading, spacing: 12) {
            PageTitle(title: "How experienced are you?", subtitle: "Sets starting volume and how hard Forge pushes progression.")
            ForEach(Level.all, id: \.self) { l in
                OptionCard(title: l.title, detail: l.blurb, symbol: l.symbol, selected: plan.experience == l) { plan.experience = l }
            }
        }
        .sensoryFeedback(.selection, trigger: plan.experience)
    }

    private var gymPage: some View {
        VStack(alignment: .leading, spacing: 12) {
            PageTitle(title: "Where do you train?", subtitle: "Forge only suggests exercises you have the equipment for.")
            ForEach(Self.presets.indices, id: \.self) { i in
                let p = Self.presets[i]
                OptionCard(title: p.title, detail: p.detail, symbol: p.symbol, selected: gymPreset == i) {
                    gymPreset = i
                    gym = p.gym
                    gym.usesPounds = pounds
                }
            }
            .sensoryFeedback(.selection, trigger: gymPreset)

            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("Name").foregroundStyle(Theme.muted)
                    TextField("Name", text: $gym.name, prompt: Text(Self.presets[gymPreset].gym.name))
                        .textInputAutocapitalization(.words)
                        .multilineTextAlignment(.trailing)
                }
                .padding(.vertical, 12)
                Divider()
                Button {
                    editingGym = true
                } label: {
                    HStack {
                        Label("Customize equipment", systemImage: "slider.horizontal.3")
                        Spacer()
                        Text("\(gym.equipment.count)")
                            .foregroundStyle(Theme.muted)
                            .monospacedDigit()
                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Theme.muted)
                    }
                    .padding(.vertical, 12)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .sheet(isPresented: $editingGym) {
                NavigationStack {
                    GymEditor(gym: $gym)
                        .toolbar {
                            ToolbarItem(placement: .confirmationAction) { Button("Done") { editingGym = false } }
                        }
                }
            }

            // Units live in their own card, well away from the gym choices.
            VStack(alignment: .leading, spacing: 12) {
                Text("Units").font(.headline)
                Text("Used for your weights and plate math.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
                Picker("Units", selection: $pounds) {
                    Text("Pounds").tag(true)
                    Text("Kilograms").tag(false)
                }
                .pickerStyle(.segmented)
            }
            .card()
            .padding(.top, 20)
            .sensoryFeedback(.selection, trigger: pounds)
            .onChange(of: pounds) { _, new in
                // Increment overrides were in the old unit; drop them rather than misread them.
                gym.usesPounds = new
                gym.increments = [:]
            }
        }
        .onAppear { gym.usesPounds = pounds }
    }

    private var finishPage: some View {
        VStack(alignment: .leading, spacing: 16) {
            PageTitle(title: "You're all set", subtitle: summary)

            VStack(alignment: .leading, spacing: 12) {
                Label("Rest timer alerts", systemImage: "bell.badge.fill")
                    .font(.headline)
                Text("Forge can buzz you when your rest is up, even if you've switched to another app or locked your phone. That needs notification permission. Nothing else is ever sent.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
                switch notifications {
                case .notDetermined where notificationsLater:
                    Text("No problem. Forge will ask again when you start your first rest timer.")
                        .font(.subheadline.weight(.semibold))
                case .notDetermined:
                    HStack(spacing: 10) {
                        Button(action: requestNotifications) {
                            Text("Allow notifications")
                                .font(.subheadline.weight(.semibold))
                                .padding(.horizontal, 16)
                                .padding(.vertical, 10)
                                .background(Theme.accent, in: Capsule())
                                .foregroundStyle(.white)
                        }
                        Button { notificationsLater = true } label: {
                            Chip { Text("Not now") }
                        }
                    }
                    .buttonStyle(.plain)
                case .denied:
                    Text("Notifications are off for Forge. You can turn them on in Settings.")
                        .font(.subheadline.weight(.semibold))
                    Link("Open Settings", destination: URL(string: UIApplication.openNotificationSettingsURLString)!)
                        .font(.subheadline.weight(.semibold))
                default:
                    Label("Notifications on", systemImage: "checkmark.circle.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.fresh)
                }
            }
            .card()
            .sensoryFeedback(.success, trigger: notifications) { _, new in new == .authorized }

            Label {
                Text("Coming from another app? Import your workout history from You → Data after setup.")
            } icon: {
                Image(systemName: "square.and.arrow.down")
            }
            .font(.footnote)
            .foregroundStyle(Theme.muted)
            .padding(.horizontal, 4)
        }
    }

    private var gymName: String {
        let name = gym.name.trimmingCharacters(in: .whitespaces)
        return name.isEmpty ? Self.presets[gymPreset].gym.name : name
    }

    private var summary: String {
        "\(plan.goal.title) · \(plan.split.title) · \(plan.sessionMinutes) min · \(plan.experience.title) · \(gymName)"
    }

    private func requestNotifications() {
        Task {
            _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
            notifications = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        }
    }

    static func recommendedSplit(days: Int) -> Split {
        switch days {
        case ...3: .fullBody
        case 4: .upperLower
        default: .pushPullLegs
        }
    }

    private func finish() {
        var gym = gym
        gym.id = UUID()
        gym.usesPounds = pounds
        gym.name = gymName
        context.insert(Profile(plan: plan, gyms: [gym], usesPounds: pounds))
        try? context.save()
    }
}

// MARK: - Building blocks

private struct PageTitle: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .displayFont(30)
                .fixedSize(horizontal: false, vertical: true)
            Text(subtitle)
                .foregroundStyle(Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 4)
        .padding(.bottom, 8)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// Large tappable choice with an icon, title and one-line explanation.
private struct OptionCard: View {
    let title: String
    let detail: String
    let symbol: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: symbol)
                    .font(.title3.weight(.semibold))
                    .frame(width: 44, height: 44)
                    .background(selected ? Theme.accent : Theme.raised, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .foregroundStyle(selected ? .white : Theme.accent)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.headline)
                    Text(detail)
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(selected ? Theme.accent : Theme.muted)
            }
            .multilineTextAlignment(.leading)
            .card()
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(selected ? Theme.accent : .clear, lineWidth: 2)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// Wraps chips onto as many lines as they need, so long labels never clip at large text sizes.
private struct FlowChips: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        return CGSize(width: proposal.width ?? rows.map(\.width).max() ?? 0,
                      height: rows.last.map { $0.y + $0.height } ?? 0)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for i in row.items {
                let size = subviews[i].sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
                subviews[i].place(at: CGPoint(x: x, y: bounds.minY + row.y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
        }
    }

    private struct Row { var items: [Int] = []; var y: CGFloat = 0; var width: CGFloat = 0; var height: CGFloat = 0 }

    private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows = [Row()]
        for i in subviews.indices {
            let size = subviews[i].sizeThatFits(ProposedViewSize(width: width, height: nil))
            if !rows[rows.count - 1].items.isEmpty, rows[rows.count - 1].width + spacing + size.width > width {
                let last = rows[rows.count - 1]
                rows.append(Row(y: last.y + last.height + spacing))
            }
            var row = rows[rows.count - 1]
            row.width += (row.items.isEmpty ? 0 : spacing) + size.width
            row.height = max(row.height, size.height)
            row.items.append(i)
            rows[rows.count - 1] = row
        }
        return rows
    }
}

// MARK: - Onboarding copy

private extension Goal {
    var blurb: String {
        switch self {
        case .buildMuscle: "Add size with moderate weights and plenty of volume."
        case .getLean: "Keep your muscle while you lose fat."
        case .getStronger: "Lift heavier with lower reps and longer rests."
        case .reduceBodyweight: "Burn more with circuits and shorter rests."
        case .improveFitness: "All-round strength, stamina and movement."
        case .powerlifting: "Peak your squat, bench press and deadlift."
        }
    }

    var symbol: String {
        switch self {
        case .buildMuscle: "figure.strengthtraining.traditional"
        case .getLean: "flame.fill"
        case .getStronger: "scalemass.fill"
        case .reduceBodyweight: "figure.run"
        case .improveFitness: "heart.fill"
        case .powerlifting: "trophy.fill"
        }
    }
}

private extension Level {
    var blurb: String {
        switch self {
        case .beginner: "New to lifting, or back after a long break."
        case .intermediate: "Training consistently for 6 months or more."
        case .advanced: "Years of structured training; you know your lifts."
        }
    }

    var symbol: String {
        switch self {
        case .beginner: "leaf.fill"
        case .intermediate: "chart.line.uptrend.xyaxis"
        case .advanced: "bolt.fill"
        }
    }
}

private extension Split {
    var blurb: String {
        switch self {
        case .pushPullLegs: "Rotate pushing, pulling and leg days."
        case .upperLower: "Alternate upper-body and lower-body days."
        case .fullBody: "Hit every major muscle each session."
        case .freshMuscles: "No fixed plan: each day trains whatever has recovered most."
        }
    }
}
