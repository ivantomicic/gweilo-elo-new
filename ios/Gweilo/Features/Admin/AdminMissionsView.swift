import Observation
import SwiftUI

@Observable
@MainActor
final class AdminMissionsModel {
    private(set) var snapshots: [RivalryMissionSnapshot] = []
    private(set) var isLoading = false
    private(set) var isRegenerating = false
    private(set) var errorMessage: String?

    @ObservationIgnored
    private let client: RivalryMissionsClient

    init(client: RivalryMissionsClient) {
        self.client = client
    }

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            snapshots = try await client.adminSnapshots()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func regenerate() async {
        guard !isRegenerating else { return }
        isRegenerating = true
        errorMessage = nil
        defer { isRegenerating = false }

        do {
            snapshots = try await client.regenerateAdminSnapshots()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct AdminMissionsView: View {
    @State private var model: AdminMissionsModel

    init(configuration: AppConfiguration, accessToken: String) {
        _model = State(
            initialValue: AdminMissionsModel(
                client: RivalryMissionsClient(
                    configuration: configuration,
                    accessToken: accessToken
                )
            )
        )
    }

    var body: some View {
        ZStack {
            ArenaBackground()

            if model.isLoading && model.snapshots.isEmpty {
                GweiloFullScreenLoadingView(
                    "Učitavam misije…",
                    size: 172
                )
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 26) {
                        if let errorMessage = model.errorMessage {
                            Label(
                                errorMessage,
                                systemImage: "exclamationmark.triangle.fill"
                            )
                            .font(.footnote)
                            .foregroundStyle(GweiloTheme.coral)
                            .padding(.horizontal, 20)
                        }

                        GweiloCard(style: .neutral, contentPadding: 14) {
                            AdminMissionsSummary(snapshots: model.snapshots)
                        }
                        .padding(.horizontal, 20)

                        if !model.snapshots.isEmpty {
                            Text("IGRAČI")
                                .font(
                                    GweiloTheme.labelFont(
                                        size: 11,
                                        relativeTo: .caption2
                                    )
                                )
                                .tracking(1.4)
                                .foregroundStyle(.secondary)
                                .padding(.horizontal, 20)

                            ForEach(model.snapshots) { snapshot in
                                AdminPlayerMissionsSection(snapshot: snapshot)
                            }
                        }
                    }
                    .padding(.top, 12)
                    .padding(.bottom, 110)
                }
                .scrollIndicators(.hidden)
                .overlay {
                    if model.snapshots.isEmpty && model.errorMessage == nil {
                        ContentUnavailableView(
                            "Nema misija",
                            systemImage: "scope",
                            description: Text(
                                "Generiši misije za kvalifikovane igrače."
                            )
                        )
                    }
                }
                .refreshable {
                    await model.load()
                }
            }
        }
        .navigationTitle("Misije")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Generiši", systemImage: "arrow.clockwise") {
                    Task { await model.regenerate() }
                }
                .disabled(model.isLoading || model.isRegenerating)
            }
        }
        .overlay {
            if model.isRegenerating {
                GweiloLoadingView(
                    "Ponovo generišem misije…",
                    size: 108,
                    showsLabel: false
                )
                .padding(22)
                .background(.ultraThinMaterial, in: .rect(cornerRadius: 22))
                .accessibilityAddTraits(.updatesFrequently)
            }
        }
        .task {
            if model.snapshots.isEmpty {
                await model.load()
            }
        }
    }
}

private struct AdminMissionsSummary: View {
    let snapshots: [RivalryMissionSnapshot]

    private var missionCount: Int {
        snapshots.reduce(0) { $0 + $1.missions.count }
    }

    private var latestGeneration: Date? {
        snapshots.compactMap(\.generatedDate).max()
    }

    var body: some View {
        HStack(spacing: 14) {
            summaryValue("IGRAČA", value: snapshots.count)
            Divider()
            summaryValue("MISIJA", value: missionCount)
            Spacer()
            if let latestGeneration {
                VStack(alignment: .trailing, spacing: 3) {
                    Text("OSVEŽENO")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.secondary)
                    Text(latestGeneration, style: .relative)
                        .font(.caption.weight(.semibold))
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func summaryValue(_ label: String, value: Int) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(.caption2.weight(.bold))
                .foregroundStyle(.secondary)
            Text("\(value)")
                .font(.title2.monospacedDigit().weight(.black))
                .foregroundStyle(GweiloTheme.lime)
        }
    }
}

private struct AdminPlayerMissionsSection: View {
    let snapshot: RivalryMissionSnapshot

    private let avatarSize: CGFloat = 42
    private let headerSpacing: CGFloat = 12

    private var missionIndent: CGFloat {
        avatarSize + headerSpacing
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            AdminMissionPlayerHeader(
                snapshot: snapshot,
                avatarSize: avatarSize,
                spacing: headerSpacing
            )
            .padding(.horizontal, 20)

            if snapshot.missions.isEmpty {
                Label("Nema aktivnih misija", systemImage: "scope")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.leading, 20 + missionIndent)
                    .padding(.trailing, 20)
            } else {
                RivalryMissionList(
                    missions: snapshot.missions,
                    leadingContentMargin: 20 + missionIndent
                )
            }
        }
        .accessibilityElement(children: .contain)
    }
}

private struct AdminMissionPlayerHeader: View {
    let snapshot: RivalryMissionSnapshot
    let avatarSize: CGFloat
    let spacing: CGFloat

    var body: some View {
        HStack(spacing: spacing) {
            PlayerIdentityAvatar(
                name: snapshot.playerName,
                initials: initials,
                avatarURL: snapshot.playerAvatarUrl,
                size: avatarSize,
                showsBorder: true
            )

            VStack(alignment: .leading, spacing: 3) {
                Text(snapshot.playerName)
                    .font(.body.weight(.semibold))
                    .lineLimit(1)
                Text(
                    "#\(snapshot.playerRank) · \(Int(snapshot.playerElo.rounded())) Elo · \(snapshot.playerTier.displayName)"
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }

            Spacer(minLength: 8)

            Text("\(snapshot.missions.count)")
                .font(.caption.monospacedDigit().weight(.black))
                .foregroundStyle(GweiloTheme.background)
                .frame(width: 24, height: 24)
                .background(GweiloTheme.lime, in: .circle)
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(snapshot.playerName), rang \(snapshot.playerRank), "
                + "\(snapshot.missions.count) misija"
        )
    }

    private var initials: String {
        snapshot.playerName
            .split(separator: " ")
            .prefix(2)
            .compactMap(\.first)
            .map(String.init)
            .joined()
            .uppercased()
    }
}
