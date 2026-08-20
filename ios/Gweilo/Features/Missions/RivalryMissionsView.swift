import SwiftUI

struct RivalryMissionsSection: View {
    let snapshot: RivalryMissionSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading(title: "Moje misije")
            RivalryMissionList(missions: snapshot.missions)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Moje misije")
    }
}

struct RivalryMissionList: View {
    let missions: [RivalryMission]
    let leadingContentMargin: CGFloat
    let trailingContentMargin: CGFloat

    init(
        missions: [RivalryMission],
        leadingContentMargin: CGFloat = 20,
        trailingContentMargin: CGFloat = 20
    ) {
        self.missions = missions
        self.leadingContentMargin = leadingContentMargin
        self.trailingContentMargin = trailingContentMargin
    }

    var body: some View {
        GweiloCardCarousel(
            itemCount: missions.count,
            leadingContentMargin: leadingContentMargin,
            trailingContentMargin: trailingContentMargin
        ) {
            ForEach(
                Array(missions.enumerated()),
                id: \.element.id
            ) { index, mission in
                RivalryMissionCard(
                    mission: mission,
                    style: cardStyle(at: index)
                )
                    .containerRelativeFrame(.horizontal) { length, _ in
                        min(length * 0.72, 272)
                    }
                    .id(index)
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func cardStyle(at index: Int) -> GweiloCardStyle {
        guard missions.count > 1 else { return .accent }

        switch index % 4 {
        case 0:
            return .accent
        case 1:
            return .tinted(GweiloTheme.cyan)
        case 2:
            return .tinted(GweiloTheme.amber)
        default:
            return .tinted(GweiloTheme.coral)
        }
    }
}

private struct RivalryMissionCard: View {
    let mission: RivalryMission
    let style: GweiloCardStyle

    var body: some View {
        GweiloCard(style: style, minHeight: 128) {
            VStack(alignment: .leading, spacing: 8) {
                Text(mission.type.displayName.uppercased())
                    .font(
                        GweiloTheme.labelFont(
                            size: 9,
                            relativeTo: .caption2
                        )
                    )
                    .tracking(1.2)
                    .foregroundStyle(GweiloTheme.bone.opacity(0.58))

                Text(mission.title)
                    .font(
                        GweiloTheme.headingFont(
                            size: 20,
                            relativeTo: .title3
                        )
                    )
                    .foregroundStyle(GweiloTheme.bone)
                    .fixedSize(horizontal: false, vertical: true)

                Text(mission.body)
                    .font(.caption)
                    .foregroundStyle(GweiloTheme.bone.opacity(0.58))
                    .fixedSize(horizontal: false, vertical: true)
                    .lineLimit(2)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(mission.type.displayName). \(mission.title)"
        )
        .accessibilityValue(mission.body)
    }
}

private extension RivalryMissionType {
    var displayName: String {
        switch self {
        case .climbRank: "Napredovanje"
        case .defendRank: "Odbrana pozicije"
        case .settleScore: "Međusobni duel"
        case .breakStreak: "Prekid niza"
        case .closeGap: "Elo izazov"
        }
    }
}
