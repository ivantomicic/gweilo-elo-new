import SwiftUI
import UIKit

struct ScoreEntryView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var scoreboard = DemoRoundScoreboard()
    @State private var showsSubmitConfirmation = false

    var body: some View {
        NavigationStack {
            ZStack {
                ArenaBackground()

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 22) {
                        RoundHeader()

                        ForEach(scoreboard.matches) { match in
                            MatchScoreEditor(
                                match: match,
                                adjustTeamOne: { amount in
                                    adjust(matchID: match.id, team: 1, amount: amount)
                                },
                                adjustTeamTwo: { amount in
                                    adjust(matchID: match.id, team: 2, amount: amount)
                                }
                            )
                        }

                        AtomicSubmissionNote()
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 110)
                }
                .scrollIndicators(.hidden)
            }
            .navigationTitle("Round 5")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close", systemImage: "xmark") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button("Reset", systemImage: "arrow.counterclockwise", action: reset)
                }
            }
            .safeAreaInset(edge: .bottom) {
                SubmitRoundBar(
                    isSubmitted: scoreboard.submitted,
                    submit: requestSubmit
                )
            }
            .confirmationDialog(
                "Submit Round 5?",
                isPresented: $showsSubmitConfirmation,
                titleVisibility: .visible
            ) {
                Button("Submit both matches", action: submit)
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Both results are committed together. Elo cannot be applied twice.")
            }
        }
    }

    private func adjust(matchID: UUID, team: Int, amount: Int) {
        scoreboard.adjust(matchID: matchID, team: team, amount: amount)
        UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
    }

    private func requestSubmit() {
        showsSubmitConfirmation = true
    }

    private func submit() {
        scoreboard.submit()
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    private func reset() {
        scoreboard.reset()
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
    }
}

private struct RoundHeader: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("6-PLAYER SESSION")
                    .font(.caption2.weight(.bold))
                    .tracking(1.2)

                Spacer()

                Text("5 / 7")
                    .font(.caption.monospacedDigit().weight(.bold))
            }
            .foregroundStyle(.white.opacity(0.72))

            Text("One doubles match.\nOne singles match.")
                .font(.title.weight(.bold))
                .tracking(-0.4)
                .foregroundStyle(.white)

            Text("All six players compete in this round.")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.72))
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [GweiloTheme.accent, Color(red: 0.23, green: 0.10, blue: 0.62)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: .rect(cornerRadius: 16)
        )
        .padding(.top, 10)
    }
}

private struct MatchScoreEditor: View {
    let match: DemoRoundMatch
    let adjustTeamOne: (Int) -> Void
    let adjustTeamTwo: (Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Text(match.type.rawValue)
                    .font(.caption2.weight(.bold))
                    .tracking(1.1)
                    .foregroundStyle(GweiloTheme.accent)

                Spacer()

                Text(match.type == .doubles ? "TEAM ELO + PLAYER ELO" : "SINGLES ELO")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            MatchSide(
                name: match.teamOne,
                score: match.teamOneScore,
                sideLabel: "Side one",
                adjust: adjustTeamOne
            )

            Divider()

            MatchSide(
                name: match.teamTwo,
                score: match.teamTwoScore,
                sideLabel: "Side two",
                adjust: adjustTeamTwo
            )
        }
        .padding(18)
        .flatSurface(cornerRadius: 14)
    }
}

private struct MatchSide: View {
    let name: String
    let score: Int
    let sideLabel: String
    let adjust: (Int) -> Void

    var body: some View {
        HStack(spacing: 12) {
            Text(name)
                .font(.headline)
                .lineLimit(1)
                .minimumScaleFactor(0.75)

            Spacer()

            ScoreAdjustmentButton(
                symbol: "minus",
                label: "Decrease \(name) score",
                disabled: score == 0,
                action: decrement
            )

            Text("\(score)")
                .font(.system(size: 34, weight: .bold))
                .monospacedDigit()
                .contentTransition(.numericText(value: Double(score)))
                .animation(.snappy(duration: 0.16), value: score)
                .frame(width: 44)

            ScoreAdjustmentButton(
                symbol: "plus",
                label: "Increase \(name) score",
                disabled: false,
                action: increment
            )
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(sideLabel), \(name)")
        .accessibilityValue("\(score)")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: increment()
            case .decrement: decrement()
            @unknown default: break
            }
        }
    }

    private func decrement() {
        adjust(-1)
    }

    private func increment() {
        adjust(1)
    }
}

private struct ScoreAdjustmentButton: View {
    let symbol: String
    let label: String
    let disabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.subheadline.weight(.bold))
                .frame(width: 40, height: 40)
                .contentShape(.rect)
        }
        .buttonStyle(.bordered)
        .buttonBorderShape(.roundedRectangle(radius: 10))
        .disabled(disabled)
        .accessibilityLabel(label)
    }
}

private struct AtomicSubmissionNote: View {
    var body: some View {
        Label(
            "The complete round is submitted as one protected transaction.",
            systemImage: "lock.shield"
        )
        .font(.caption)
        .foregroundStyle(.secondary)
        .accessibilityElement(children: .combine)
    }
}

private struct SubmitRoundBar: View {
    let isSubmitted: Bool
    let submit: () -> Void

    var body: some View {
        Button(action: submit) {
            HStack {
                Text(isSubmitted ? "Round submitted" : "Submit complete round")
                Spacer()
                Image(systemName: isSubmitted ? "checkmark" : "arrow.right")
            }
            .font(.headline)
            .foregroundStyle(.white)
            .padding(.horizontal, 18)
            .frame(height: 56)
            .background(GweiloTheme.accent, in: .rect(cornerRadius: 14))
        }
        .buttonStyle(ResponsiveButtonStyle())
        .disabled(isSubmitted)
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial)
    }
}
