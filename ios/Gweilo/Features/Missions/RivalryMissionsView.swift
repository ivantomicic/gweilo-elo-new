import SwiftUI

struct RivalryMissionsSection: View {
    let snapshot: RivalryMissionSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                SectionHeading(title: "Moje misije")
                Spacer()
                Text("#\(snapshot.playerRank) · \(formattedElo) Elo")
                    .font(.caption.monospacedDigit().weight(.bold))
                    .foregroundStyle(.secondary)
            }

            RivalryMissionList(missions: snapshot.missions)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Moje misije")
    }

    private var formattedElo: String {
        Int(snapshot.playerElo.rounded()).formatted(
            .number.grouping(.never)
        )
    }
}

struct RivalryMissionList: View {
    let missions: [RivalryMission]

    var body: some View {
        VStack(spacing: 0) {
            Rectangle()
                .fill(GweiloTheme.hairline)
                .frame(height: 1)

            ForEach(
                Array(missions.enumerated()),
                id: \.element.id
            ) { index, mission in
                RivalryMissionRow(
                    number: index + 1,
                    mission: mission
                )

                if mission.id != missions.last?.id {
                    Rectangle()
                        .fill(GweiloTheme.hairline)
                        .frame(height: 1)
                }
            }

            Rectangle()
                .fill(GweiloTheme.hairline)
                .frame(height: 1)
        }
        .accessibilityElement(children: .contain)
    }
}

private struct RivalryMissionRow: View {
    @ScaledMetric(relativeTo: .title2) private var numberColumnWidth = 46.0

    let number: Int
    let mission: RivalryMission

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 7) {
                Text(formattedNumber)
                    .font(
                        GweiloTheme.displayFont(
                            size: 38,
                            relativeTo: .title2
                        )
                        .monospacedDigit()
                    )
                    .foregroundStyle(GweiloTheme.accentBright)

                Rectangle()
                    .fill(GweiloTheme.lime)
                    .frame(width: 21, height: 3)
            }
            .frame(width: numberColumnWidth, alignment: .leading)
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 7) {
                HStack(alignment: .top, spacing: 10) {
                    Text(mission.type.displayName.uppercased())
                        .font(
                            GweiloTheme.labelFont(
                                size: 10,
                                relativeTo: .caption2
                            )
                        )
                        .tracking(1)
                        .foregroundStyle(GweiloTheme.muted)

                    Spacer(minLength: 4)

                    if let metric {
                        MissionMetricView(metric: metric)
                    }
                }

                Text(mission.title)
                    .font(
                        GweiloTheme.displayFont(
                            size: 22,
                            relativeTo: .title3
                        )
                    )
                    .foregroundStyle(GweiloTheme.bone)
                    .fixedSize(horizontal: false, vertical: true)

                Text(mission.body)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 18)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "Misija \(number). \(mission.type.displayName). \(mission.title)"
        )
        .accessibilityValue(accessibilityValue)
    }

    private var formattedNumber: String {
        number.formatted(
            .number.precision(.integerLength(2))
        )
    }

    private var metric: MissionMetric? {
        switch mission.type {
        case .climbRank, .closeGap:
            mission.numberMetric("gapElo").map {
                MissionMetric(
                    value: "\(Int($0.rounded()))",
                    label: "ELO RAZLIKE"
                )
            }
        case .defendRank:
            mission.numberMetric("gapElo").map {
                MissionMetric(
                    value: "\(Int($0.rounded()))",
                    label: "ELO PREDNOSTI"
                )
            }
        case .settleScore:
            if let wins = mission.numberMetric("wins"),
               let losses = mission.numberMetric("losses") {
                MissionMetric(
                    value: "\(Int(wins.rounded()))–\(Int(losses.rounded()))",
                    label: "MEĐUSOBNO"
                )
            } else {
                nil
            }
        case .breakStreak:
            mission.numberMetric("lossStreak").map {
                MissionMetric(
                    value: "\(Int($0.rounded()))",
                    label: "PORAZA U NIZU"
                )
            }
        }
    }

    private var accessibilityValue: String {
        [mission.body, metric.map { "\($0.value), \($0.label.lowercased())" }]
            .compactMap { $0 }
            .joined(separator: ". ")
    }
}

private struct MissionMetricView: View {
    let metric: MissionMetric

    var body: some View {
        VStack(alignment: .trailing, spacing: 1) {
            Text(metric.value)
                .font(
                    GweiloTheme.displayFont(
                        size: 22,
                        relativeTo: .title3
                    )
                    .monospacedDigit()
                )
                .foregroundStyle(GweiloTheme.lime)

            Text(metric.label)
                .font(
                    GweiloTheme.labelFont(
                        size: 8,
                        relativeTo: .caption2
                    )
                )
                .tracking(0.7)
                .foregroundStyle(GweiloTheme.muted)
                .multilineTextAlignment(.trailing)
                .lineLimit(2)
        }
        .frame(maxWidth: 76, alignment: .trailing)
    }
}

private struct MissionMetric {
    let value: String
    let label: String
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
