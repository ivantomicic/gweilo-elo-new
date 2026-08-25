import Observation
import SwiftUI

@Observable
@MainActor
private final class AdminActivityModel {
    private(set) var visits: [AdminActivityVisit] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    @ObservationIgnored
    private let client: AdminActivityClient

    init(client: AdminActivityClient) {
        self.client = client
    }

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            visits = try await client.activity()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private enum ActivityScope: Hashable {
    case otherUsers
    case everyone
    case currentUser
    case anonymous
    case user(UUID)
}

struct AdminActivityView: View {
    let currentUserID: UUID
    @State private var model: AdminActivityModel
    @State private var scope = ActivityScope.otherUsers
    @State private var searchText = ""

    init(
        configuration: AppConfiguration,
        accessToken: String,
        currentUserID: UUID
    ) {
        self.currentUserID = currentUserID
        _model = State(
            initialValue: AdminActivityModel(
                client: AdminActivityClient(
                    configuration: configuration,
                    accessToken: accessToken
                )
            )
        )
    }

    private var userOptions: [AdminUser] {
        let users = model.visits.compactMap(\.user)
        return Dictionary(grouping: users, by: \.id)
            .compactMap(\.value.first)
            .sorted {
                $0.name.localizedStandardCompare($1.name)
                    == .orderedAscending
            }
    }

    private var visibleVisits: [AdminActivityVisit] {
        let query = searchText.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        return model.visits.filter { visit in
            let matchesScope: Bool = switch scope {
            case .otherUsers:
                visit.userID != currentUserID
            case .everyone:
                true
            case .currentUser:
                visit.userID == currentUserID
            case .anonymous:
                visit.userID == nil
            case let .user(userID):
                visit.userID == userID
            }
            return matchesScope
                && (
                    query.isEmpty
                        || visit.searchableText.localizedStandardContains(query)
                )
        }
    }

    var body: some View {
        ZStack {
            ArenaBackground()

            if model.isLoading && model.visits.isEmpty {
                GweiloFullScreenLoadingView(
                    "Učitavam aktivnost…",
                    size: 172
                )
            } else {
                List {
                    if let errorMessage = model.errorMessage {
                        Section {
                            Label(
                                errorMessage,
                                systemImage: "exclamationmark.triangle.fill"
                            )
                            .foregroundStyle(GweiloTheme.coral)
                        }
                    }

                    ForEach(visibleVisits) { visit in
                        ActivityVisitCard(visit: visit)
                            .listRowInsets(
                                EdgeInsets(
                                    top: 6,
                                    leading: 16,
                                    bottom: 6,
                                    trailing: 16
                                )
                            )
                            .listRowSeparator(.hidden)
                            .listRowBackground(Color.clear)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .overlay {
                    if visibleVisits.isEmpty {
                        ContentUnavailableView(
                            searchText.isEmpty
                                ? "Nema aktivnosti"
                                : "Nema odgovarajuće aktivnosti",
                            systemImage: "clock.badge.questionmark",
                            description: Text(
                                searchText.isEmpty
                                    ? "Nijedna poseta ne odgovara izabranom opsegu."
                                    : "Pokušaj sa drugom pretragom ili opsegom aktivnosti."
                            )
                        )
                    }
                }
                .refreshable {
                    await model.load()
                }
            }
        }
        .navigationTitle("Aktivnost")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(
            text: $searchText,
            prompt: "Korisnik, događaj ili stranica"
        )
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                activityScopeMenu
            }
        }
        .task {
            if model.visits.isEmpty {
                await model.load()
            }
        }
    }

    private var activityScopeMenu: some View {
        Menu {
            scopeButton("Drugi korisnici", scope: .otherUsers)
            scopeButton("Svi", scope: .everyone)
            scopeButton("Moja aktivnost", scope: .currentUser)
            scopeButton("Anonimni", scope: .anonymous)

            if !userOptions.isEmpty {
                Divider()
                ForEach(userOptions) { user in
                    scopeButton(user.name, scope: .user(user.id))
                }
            }
        } label: {
            Label("Opseg aktivnosti", systemImage: "line.3.horizontal.decrease")
        }
        .accessibilityLabel("Filtriraj aktivnost")
    }

    private func scopeButton(
        _ title: String,
        scope buttonScope: ActivityScope
    ) -> some View {
        Button {
            scope = buttonScope
        } label: {
            if scope == buttonScope {
                Label(title, systemImage: "checkmark")
            } else {
                Text(title)
            }
        }
    }
}

private struct ActivityVisitCard: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    let visit: AdminActivityVisit
    let journeySteps: [ActivityJourneyStep]

    @State private var showsDetails = false

    private static let collapsedStepCount = 4

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "dd.MM.yyyy"
        return formatter
    }()

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        return formatter
    }()

    private static let shortTimeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter
    }()

    init(visit: AdminActivityVisit) {
        self.visit = visit
        journeySteps = ActivityJourneyStep.grouped(events: visit.events)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header

            if journeySteps.count == 1, let step = journeySteps.first {
                ActivitySingleStep(
                    step: step,
                    timeFormatter: Self.timeFormatter
                )
            } else if !journeySteps.isEmpty {
                ActivityJourneyTimeline(
                    steps: visibleJourneySteps,
                    timeFormatter: Self.timeFormatter
                )
            }

            if canShowDetails {
                detailsButton
            }
        }
        .padding(16)
        .background(
            GweiloTheme.surface,
            in: .rect(cornerRadius: 18)
        )
        .accessibilityElement(children: .contain)
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            ActivityUserAvatar(visit: visit)

            VStack(alignment: .leading, spacing: 4) {
                Text(visit.userName)
                    .font(.headline)
                    .foregroundStyle(GweiloTheme.bone)
                    .lineLimit(1)

                Text("\(dayText) · \(shortTimeRange)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(GweiloTheme.muted)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 3) {
                Text(durationText)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(GweiloTheme.bone)

                Text(eventCountText)
                    .font(.caption2)
                    .foregroundStyle(GweiloTheme.muted)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var dayText: String {
        let calendar = Calendar.current
        if calendar.isDateInToday(visit.startedAt) {
            return "Danas"
        }
        if calendar.isDateInYesterday(visit.startedAt) {
            return "Juče"
        }
        return Self.dateFormatter.string(from: visit.startedAt)
    }

    private var shortTimeRange: String {
        let start = Self.shortTimeFormatter.string(from: visit.startedAt)
        let end = Self.shortTimeFormatter.string(from: visit.endedAt)
        return start == end ? start : "\(start)–\(end)"
    }

    private var durationText: String {
        let totalMinutes = Int(visit.duration) / 60
        if totalMinutes < 1 {
            return "<1 min"
        }
        if totalMinutes < 60 {
            return "\(totalMinutes) min"
        }
        let hours = totalMinutes / 60
        let minutes = totalMinutes % 60
        return minutes == 0
            ? "\(hours) č"
            : "\(hours) č \(minutes) min"
    }

    private var eventCountText: String {
        let count = journeySteps.reduce(0) { $0 + $1.count }
        return count == 1 ? "1 pregled" : "\(count) pregleda"
    }

    private var visibleJourneySteps: [ActivityJourneyStep] {
        if showsDetails {
            return journeySteps
        }
        return Array(journeySteps.prefix(Self.collapsedStepCount))
    }

    private var hiddenStepCount: Int {
        max(0, journeySteps.count - Self.collapsedStepCount)
    }

    private var canShowDetails: Bool {
        journeySteps.count > Self.collapsedStepCount
    }

    private var detailsButton: some View {
        Button {
            withAnimation(
                reduceMotion ? nil : .easeOut(duration: 0.2)
            ) {
                showsDetails.toggle()
            }
        } label: {
            HStack(spacing: 6) {
                Text(detailsButtonTitle)
                    .font(.caption.weight(.semibold))

                Image(
                    systemName: showsDetails
                        ? "chevron.up"
                        : "chevron.down"
                )
                .font(.caption2.weight(.bold))
            }
            .foregroundStyle(GweiloTheme.accentBright)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(ResponsiveButtonStyle())
        .accessibilityLabel(
            showsDetails
                ? "Sakrij detalje posete"
                : "Prikaži detalje posete"
        )
    }

    private var detailsButtonTitle: String {
        if showsDetails {
            return "Sakrij detalje"
        }
        if hiddenStepCount == 1 {
            return "Prikaži još 1 korak"
        }
        if hiddenStepCount > 1 {
            return "Prikaži još \(hiddenStepCount) koraka"
        }
        return "Prikaži detalje"
    }
}

private struct ActivityJourneyStep: Identifiable {
    let id: UUID
    let label: String
    let startedAt: Date
    let endedAt: Date
    let count: Int

    static func grouped(
        events: [AdminActivityEvent]
    ) -> [ActivityJourneyStep] {
        var steps: [ActivityJourneyStep] = []

        for event in events {
            if let previous = steps.last, previous.label == event.readableLabel {
                steps[steps.count - 1] = ActivityJourneyStep(
                    id: previous.id,
                    label: previous.label,
                    startedAt: previous.startedAt,
                    endedAt: event.createdAt,
                    count: previous.count + 1
                )
            } else {
                steps.append(
                    ActivityJourneyStep(
                        id: event.id,
                        label: event.readableLabel,
                        startedAt: event.createdAt,
                        endedAt: event.createdAt,
                        count: 1
                    )
                )
            }
        }

        return steps
    }
}

private struct ActivitySingleStep: View {
    let step: ActivityJourneyStep
    let timeFormatter: DateFormatter

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "arrow.turn.down.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(GweiloTheme.accentBright)
                .frame(width: 28, height: 28)
                .background(
                    GweiloTheme.accent.opacity(0.14),
                    in: .circle
                )
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(step.label)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(GweiloTheme.bone)
                    .lineLimit(2)

                Text("Otvoreno u \(timeText)")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(GweiloTheme.muted)
            }
        }
        .padding(.leading, 7)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(step.label), otvoreno u \(timeText)")
    }

    private var timeText: String {
        let start = timeFormatter.string(from: step.startedAt)
        let end = timeFormatter.string(from: step.endedAt)
        return start == end ? start : "\(start)–\(end)"
    }
}

private struct ActivityJourneyTimeline: View {
    let steps: [ActivityJourneyStep]
    let timeFormatter: DateFormatter

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
                ActivityJourneyTimelineRow(
                    step: step,
                    isLast: index == steps.count - 1,
                    timeFormatter: timeFormatter
                )
            }
        }
        .padding(.leading, 16)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Tok posete")
    }
}

private struct ActivityJourneyTimelineRow: View {
    let step: ActivityJourneyStep
    let isLast: Bool
    let timeFormatter: DateFormatter

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(GweiloTheme.accentBright)
                .frame(width: 8, height: 8)
                .frame(width: 10)
                .shadow(
                    color: GweiloTheme.accent.opacity(0.45),
                    radius: 4
                )
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                Text(step.label)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(GweiloTheme.bone)
                    .lineLimit(2)

                Text(metadataText)
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(GweiloTheme.muted)
            }
            .padding(.bottom, isLast ? 0 : 14)

            Spacer(minLength: 0)
        }
        .frame(minHeight: isLast ? 30 : 48, alignment: .top)
        .background(alignment: .topLeading) {
            if !isLast {
                Rectangle()
                    .fill(GweiloTheme.accent.opacity(0.34))
                    .frame(width: 1)
                    .frame(maxHeight: .infinity)
                    .offset(x: 4.5, y: 4)
                    .accessibilityHidden(true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    private var timeText: String {
        let start = timeFormatter.string(from: step.startedAt)
        let end = timeFormatter.string(from: step.endedAt)
        return start == end ? start : "\(start)–\(end)"
    }

    private var metadataText: String {
        step.count == 1
            ? timeText
            : "\(timeText) · \(step.count) pregleda"
    }

    private var accessibilityText: String {
        step.count == 1
            ? "\(step.label), \(timeText)"
            : "\(step.label), \(step.count) pregleda, \(timeText)"
    }
}

private struct ActivityUserAvatar: View {
    let visit: AdminActivityVisit

    var body: some View {
        CachedRemoteImage(
            url: DiceBearAvatar.resolvedURL(
                customURL: visit.user?.avatar,
                seed: visit.userName
            ),
            pointSize: 42
        ) { image in
            image.resizable().scaledToFill()
        } placeholder: {
            Text(initials)
                .font(.caption.weight(.bold))
                .foregroundStyle(GweiloTheme.bone)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(GweiloTheme.accent)
        }
        .frame(width: 42, height: 42)
        .clipShape(.circle)
        .overlay(Circle().stroke(GweiloTheme.hairline))
        .accessibilityHidden(true)
    }

    private var initials: String {
        let value = visit.user?.initials ?? "?"
        return value.isEmpty ? "?" : value
    }
}
