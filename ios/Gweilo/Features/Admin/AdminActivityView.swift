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
    let visit: AdminActivityVisit
    let journeySteps: [ActivityJourneyStep]
    let systemEvents: [AdminActivityEvent]

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

    init(visit: AdminActivityVisit) {
        self.visit = visit
        systemEvents = visit.events.filter(\.isSystemEvent)
        journeySteps = ActivityJourneyStep.grouped(
            events: visit.events.filter { !$0.isSystemEvent }
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                ActivityUserAvatar(visit: visit)

                VStack(alignment: .leading, spacing: 3) {
                    Text(visit.userName)
                        .font(.headline)
                        .lineLimit(1)

                    Text(visit.user?.email ?? userSubtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            HStack(spacing: 6) {
                Label(
                    Self.dateFormatter.string(from: visit.startedAt),
                    systemImage: "calendar"
                )

                Text("·")

                Label(timeRange, systemImage: "clock")
                    .foregroundStyle(.primary)

                Text("·")
                Text(durationText)
                Text("·")
                Text("\(visit.events.count) događaja")
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .minimumScaleFactor(0.75)

            if !systemEvents.isEmpty {
                Label(systemEventsSummary, systemImage: "gearshape")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .accessibilityLabel(
                        "Sistemski događaji: \(systemEventsSummary)"
                    )
            }

            if !journeySteps.isEmpty {
                ActivityFlowLayout(
                    horizontalSpacing: 7,
                    verticalSpacing: 7
                ) {
                    ForEach(journeySteps) { step in
                        ActivityJourneyChip(
                            step: step,
                            timeFormatter: Self.timeFormatter
                        )
                    }
                }
            }
        }
        .padding(16)
        .background(
            GweiloTheme.surface,
            in: .rect(cornerRadius: 14)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .stroke(GweiloTheme.hairline)
        }
        .accessibilityElement(children: .contain)
    }

    private var userSubtitle: String {
        visit.userID == nil
            ? "Korisnik nije prijavljen"
            : visit.userID?.uuidString ?? ""
    }

    private var timeRange: String {
        let start = Self.timeFormatter.string(from: visit.startedAt)
        let end = Self.timeFormatter.string(from: visit.endedAt)
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

    private var systemEventsSummary: String {
        systemEvents.map {
            "\(Self.timeFormatter.string(from: $0.createdAt)) \($0.readableLabel)"
        }
        .joined(separator: " · ")
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

private struct ActivityJourneyChip: View {
    let step: ActivityJourneyStep
    let timeFormatter: DateFormatter

    var body: some View {
        HStack(spacing: 6) {
            Text(timeText)
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)

            Image(systemName: "chevron.right")
                .font(.caption2.weight(.bold))
                .foregroundStyle(GweiloTheme.accentBright)
                .accessibilityHidden(true)

            Text(step.label)
                .font(.caption.weight(.medium))
                .foregroundStyle(.primary)
                .lineLimit(1)

            if step.count > 1 {
                Text("×\(step.count)")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(GweiloTheme.lime)
            }
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 7)
        .background(
            GweiloTheme.background.opacity(0.52),
            in: .rect(cornerRadius: 9)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 9)
                .stroke(GweiloTheme.hairline)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    private var timeText: String {
        let start = timeFormatter.string(from: step.startedAt)
        let end = timeFormatter.string(from: step.endedAt)
        return start == end ? start : "\(start)–\(end)"
    }

    private var accessibilityText: String {
        step.count == 1
            ? "\(step.label), \(timeText)"
            : "\(step.label), \(step.count) događaja, \(timeText)"
    }
}

private struct ActivityFlowLayout: Layout {
    let horizontalSpacing: CGFloat
    let verticalSpacing: CGFloat

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) -> CGSize {
        let availableWidth = proposal.width ?? .infinity
        var rowWidth: CGFloat = 0
        var rowHeight: CGFloat = 0
        var totalWidth: CGFloat = 0
        var totalHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            let nextWidth = rowWidth == 0
                ? size.width
                : rowWidth + horizontalSpacing + size.width

            if rowWidth > 0, nextWidth > availableWidth {
                totalWidth = max(totalWidth, rowWidth)
                totalHeight += rowHeight + verticalSpacing
                rowWidth = size.width
                rowHeight = size.height
            } else {
                rowWidth = nextWidth
                rowHeight = max(rowHeight, size.height)
            }
        }

        totalWidth = max(totalWidth, rowWidth)
        totalHeight += rowHeight
        return CGSize(
            width: proposal.width ?? totalWidth,
            height: totalHeight
        )
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + verticalSpacing
                rowHeight = 0
            }

            subview.place(
                at: CGPoint(x: x, y: y),
                anchor: .topLeading,
                proposal: ProposedViewSize(size)
            )
            x += size.width + horizontalSpacing
            rowHeight = max(rowHeight, size.height)
        }
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
