import SwiftUI
import UIKit

struct ScoreEntryView: View {
    @Environment(\.dismiss) private var dismiss

    let round: SessionRound
    let detail: SessionDetail
    let submit: ([RoundMatchScoreSubmission]) async throws -> RoundSubmissionResult
    let onSubmitted: () async -> Void

    @State private var draft: RoundScoreDraft
    @State private var showsSubmitConfirmation = false
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @FocusState private var focusedScore: ScoreField?

    init(
        round: SessionRound,
        detail: SessionDetail,
        submit: @escaping ([RoundMatchScoreSubmission]) async throws -> RoundSubmissionResult,
        onSubmitted: @escaping () async -> Void
    ) {
        self.round = round
        self.detail = detail
        self.submit = submit
        self.onSubmitted = onSubmitted
        _draft = State(initialValue: RoundScoreDraft(matches: round.matches))
    }

    var body: some View {
        NavigationStack {
            ZStack {
                ArenaBackground()

                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 22) {
                        RoundHeader(round: round, detail: detail)

                        ForEach(round.matches) { match in
                            MatchScoreEditor(
                                match: match,
                                detail: detail,
                                teamOneScore: scoreBinding(for: match.id, team: 1),
                                teamTwoScore: scoreBinding(for: match.id, team: 2),
                                teamOneFocus: ScoreField(matchID: match.id, team: 1),
                                teamTwoFocus: ScoreField(matchID: match.id, team: 2),
                                focusedScore: $focusedScore,
                                adjustTeamOne: {
                                    adjust(matchID: match.id, team: 1, amount: $0)
                                },
                                adjustTeamTwo: {
                                    adjust(matchID: match.id, team: 2, amount: $0)
                                }
                            )
                        }

                        AtomicSubmissionNote()

                        if let errorMessage {
                            Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                                .font(.footnote)
                                .foregroundStyle(GweiloTheme.coral)
                                .padding(14)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(GweiloTheme.coral.opacity(0.10))
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 110)
                }
                .scrollDismissesKeyboard(.interactively)
                .scrollIndicators(.hidden)
            }
            .navigationTitle("Round \(round.number)")
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled(isSubmitting)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close", systemImage: "xmark") {
                        dismiss()
                    }
                    .disabled(isSubmitting)
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button("Reset", systemImage: "arrow.counterclockwise", action: reset)
                        .disabled(isSubmitting)
                }

                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") {
                        focusedScore = nil
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                SubmitRoundBar(
                    isReady: draft.isComplete,
                    isSubmitting: isSubmitting,
                    submit: requestSubmit
                )
            }
            .confirmationDialog(
                "Submit Round \(round.number)?",
                isPresented: $showsSubmitConfirmation,
                titleVisibility: .visible
            ) {
                Button("Submit all \(round.matches.count) matches") {
                    Task { await submitRound() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Every result is saved together. The server applies Elo exactly once.")
            }
        }
    }

    private func scoreBinding(for matchID: UUID, team: Int) -> Binding<Int?> {
        Binding(
            get: { draft.score(for: matchID, team: team) },
            set: {
                draft.setScore($0, for: matchID, team: team)
                errorMessage = nil
            }
        )
    }

    private func adjust(matchID: UUID, team: Int, amount: Int) {
        draft.adjustScore(for: matchID, team: team, amount: amount)
        errorMessage = nil
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    private func requestSubmit() {
        focusedScore = nil
        showsSubmitConfirmation = true
    }

    private func submitRound() async {
        guard
            !isSubmitting,
            let scores = draft.submissions(for: round.matches)
        else {
            errorMessage = "Enter both scores for every match."
            return
        }

        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }

        do {
            _ = try await submit(scores)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            await onSubmitted()
            dismiss()
        } catch {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            errorMessage = error.localizedDescription
        }
    }

    private func reset() {
        draft.reset()
        errorMessage = nil
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
    }
}

private struct ScoreField: Hashable {
    let matchID: UUID
    let team: Int
}

private struct RoundHeader: View {
    let round: SessionRound
    let detail: SessionDetail

    private var matchSummary: String {
        let singles = round.matches.filter { $0.type == .singles }.count
        let doubles = round.matches.count - singles
        return [
            doubles > 0 ? "\(doubles) doubles" : nil,
            singles > 0 ? "\(singles) singles" : nil
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            HStack {
                Text("\(detail.session.playerCount)-PLAYER SESSION")
                    .font(GweiloTheme.labelFont(size: 11, relativeTo: .caption2))
                    .tracking(1.6)
                    .foregroundStyle(GweiloTheme.lime)

                Spacer()

                Text("\(round.number) / \(detail.session.totalRounds)")
                    .font(.caption.monospacedDigit().weight(.bold))
            }
            .foregroundStyle(.secondary)

            Text("ENTER EVERY SCORE")
                .font(GweiloTheme.displayFont(size: 37, relativeTo: .title))
                .tracking(-0.3)
                .foregroundStyle(GweiloTheme.bone)

            HStack {
                Text(matchSummary)
                Spacer()
                Text(
                    round.restingPlayers.isEmpty
                        ? "All players active"
                        : "\(round.restingPlayers.count) resting"
                )
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 18)
        .padding(.horizontal, 17)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(GweiloTheme.raisedSurface)
        .overlay(alignment: .leading) {
            LinearGradient(
                colors: [GweiloTheme.accentBright, GweiloTheme.lime],
                startPoint: .top,
                endPoint: .bottom
            )
                .frame(width: 3)
        }
        .overlay {
            Rectangle()
                .stroke(GweiloTheme.accent.opacity(0.28), lineWidth: 0.8)
        }
        .padding(.top, 8)
    }
}

private struct MatchScoreEditor: View {
    let match: SessionMatch
    let detail: SessionDetail
    @Binding var teamOneScore: Int?
    @Binding var teamTwoScore: Int?
    let teamOneFocus: ScoreField
    let teamTwoFocus: ScoreField
    let focusedScore: FocusState<ScoreField?>.Binding
    let adjustTeamOne: (Int) -> Void
    let adjustTeamTwo: (Int) -> Void

    private var names: (String, String) {
        detail.teamNames(for: match.playerIDs)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 17) {
            HStack {
                Text(match.type.label)
                    .font(GweiloTheme.labelFont(size: 11, relativeTo: .caption2))
                    .tracking(1.1)
                    .foregroundStyle(GweiloTheme.accentBright)

                Spacer()

                Text(match.type == .doubles ? "TEAM + PLAYER ELO" : "SINGLES ELO")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            MatchSide(
                name: names.0,
                score: $teamOneScore,
                focus: teamOneFocus,
                focusedScore: focusedScore,
                adjust: adjustTeamOne
            )

            Divider()

            MatchSide(
                name: names.1,
                score: $teamTwoScore,
                focus: teamTwoFocus,
                focusedScore: focusedScore,
                adjust: adjustTeamTwo
            )
        }
        .padding(17)
        .flatSurface(cornerRadius: 8)
    }
}

private struct MatchSide: View {
    let name: String
    @Binding var score: Int?
    let focus: ScoreField
    let focusedScore: FocusState<ScoreField?>.Binding
    let adjust: (Int) -> Void

    var body: some View {
        HStack(spacing: 10) {
            Text(name)
                .font(.headline)
                .lineLimit(2)
                .minimumScaleFactor(0.78)

            Spacer(minLength: 6)

            ScoreAdjustmentButton(
                symbol: "minus",
                label: "Decrease \(name) score",
                disabled: score == nil || score == 0,
                action: { adjust(-1) }
            )

            TextField("—", value: $score, format: .number)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)
                .font(GweiloTheme.displayFont(size: 31, relativeTo: .title2).monospacedDigit())
                .foregroundStyle(GweiloTheme.bone)
                .frame(width: 54, height: 46)
                .background(GweiloTheme.raisedSurface)
                .overlay {
                    RoundedRectangle(cornerRadius: 7)
                        .stroke(
                            focusedScore.wrappedValue == focus
                                ? GweiloTheme.lime
                                : GweiloTheme.accent.opacity(0.34),
                            lineWidth: focusedScore.wrappedValue == focus ? 2 : 1
                        )
                }
                .focused(focusedScore, equals: focus)
                .accessibilityLabel("\(name) score")

            ScoreAdjustmentButton(
                symbol: "plus",
                label: "Increase \(name) score",
                disabled: score == 999,
                action: { adjust(1) }
            )
        }
        .accessibilityElement(children: .contain)
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
                .foregroundStyle(
                    symbol == "plus"
                        ? GweiloTheme.accentBright
                        : GweiloTheme.muted
                )
                .frame(width: 38, height: 38)
                .background(GweiloTheme.raisedSurface)
                .overlay {
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(GweiloTheme.hairline, lineWidth: 0.8)
                }
                .contentShape(.rect)
        }
        .buttonStyle(ResponsiveButtonStyle())
        .disabled(disabled)
        .opacity(disabled ? 0.42 : 1)
        .accessibilityLabel(label)
    }
}

private struct AtomicSubmissionNote: View {
    var body: some View {
        Label(
            "All matches are committed in one protected transaction. Elo is calculated by the server.",
            systemImage: "lock.shield"
        )
        .font(.caption)
        .foregroundStyle(GweiloTheme.muted)
        .tint(GweiloTheme.lime)
        .accessibilityElement(children: .combine)
    }
}

private struct SubmitRoundBar: View {
    let isReady: Bool
    let isSubmitting: Bool
    let submit: () -> Void

    var body: some View {
        Button(action: submit) {
            HStack {
                if isSubmitting {
                    ProgressView()
                        .tint(GweiloTheme.background)
                    Text("Submitting round…")
                } else {
                    Text(isReady ? "Submit complete round" : "Enter all scores")
                    Spacer()
                    Image(systemName: "arrow.right")
                }
            }
            .font(GweiloTheme.labelFont(size: 17, relativeTo: .headline))
            .foregroundStyle(
                isReady ? GweiloTheme.background : GweiloTheme.muted
            )
            .padding(.horizontal, 18)
            .frame(height: 54)
            .background(
                isReady ? GweiloTheme.lime : GweiloTheme.raisedSurface,
                in: .rect(cornerRadius: 9)
            )
        }
        .buttonStyle(ResponsiveButtonStyle())
        .disabled(!isReady || isSubmitting)
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial)
    }
}

#if DEBUG
struct ScoreEntryPreviewScreen: View {
    private let detail = SessionDetail.preview

    var body: some View {
        if let round = detail.rounds.first(
            where: { $0.number == detail.session.currentRound }
        ) {
            ScoreEntryView(
                round: round,
                detail: detail,
                submit: { _ in
                    try await Task.sleep(for: .milliseconds(700))
                    return RoundSubmissionResult(
                        success: true,
                        message: "Round submitted",
                        ratingsDeferred: false,
                        ratingsApplied: true,
                        combinedWithRound: nil
                    )
                },
                onSubmitted: {}
            )
        }
    }
}
#endif
