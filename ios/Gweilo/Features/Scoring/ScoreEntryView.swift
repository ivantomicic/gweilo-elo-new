import SwiftUI
import UIKit

struct ScoreEntryView: View {
    @AppStorage(GweiloPreferenceKey.hapticsEnabled)
    private var hapticsEnabled = true
    @AppStorage(GweiloPreferenceKey.confirmRoundSubmission)
    private var confirmsRoundSubmission = false

    let round: SessionRound
    let detail: SessionDetail
    let submit: ([RoundMatchScoreSubmission]) async throws -> RoundSubmissionResult
    let onSubmitted: () async -> Void

    @State private var draft = RoundScoreDraft(matches: [])
    @State private var showsSubmitConfirmation = false
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @FocusState private var focusedScore: ScoreField?

    init(
        round: SessionRound,
        detail: SessionDetail,
        submit: @escaping ([RoundMatchScoreSubmission]) async throws -> RoundSubmissionResult,
        onSubmitted: @escaping () async -> Void = {}
    ) {
        self.round = round
        self.detail = detail
        self.submit = submit
        self.onSubmitted = onSubmitted
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            RoundHeader(
                round: round,
                detail: detail,
                isSubmitting: isSubmitting,
                reset: reset
            )

            ForEach(round.matches) { match in
                MatchScoreEditor(
                    match: match,
                    detail: detail,
                    teamOneScore: scoreBinding(for: match.id, team: 1),
                    teamTwoScore: scoreBinding(for: match.id, team: 2),
                    teamOneFocus: ScoreField(matchID: match.id, team: 1),
                    teamTwoFocus: ScoreField(matchID: match.id, team: 2),
                    focusedScore: $focusedScore
                )
                .disabled(isSubmitting)
            }

            RestingLine(players: round.restingPlayers)

            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote)
                    .foregroundStyle(GweiloTheme.coral)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        GweiloTheme.coral.opacity(0.10),
                        in: .rect(cornerRadius: 7)
                    )
            }

            SubmitRoundBar(
                isReady: draft.isComplete,
                isSubmitting: isSubmitting,
                isFinalRound: round.number == detail.session.totalRounds,
                submit: requestSubmit
            )
        }
        .task(id: round.id) {
            draft = RoundScoreDraft(matches: round.matches)
            errorMessage = nil
            focusedScore = nil
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") {
                    focusedScore = nil
                }
            }
        }
        .confirmationDialog(
            "Save Round \(round.number)?",
            isPresented: $showsSubmitConfirmation,
            titleVisibility: .visible
        ) {
            Button("Save all \(round.matches.count) matches") {
                Task { await submitRound() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Every result is saved together. The server applies Elo exactly once.")
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

    private func requestSubmit() {
        focusedScore = nil
        if confirmsRoundSubmission {
            showsSubmitConfirmation = true
        } else {
            Task { await submitRound() }
        }
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
            if hapticsEnabled {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
            await onSubmitted()
        } catch {
            if hapticsEnabled {
                UINotificationFeedbackGenerator().notificationOccurred(.error)
            }
            errorMessage = error.localizedDescription
        }
    }

    private func reset() {
        draft.reset()
        errorMessage = nil
        if hapticsEnabled {
            UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        }
    }
}

private struct ScoreField: Hashable {
    let matchID: UUID
    let team: Int
}

private struct RoundHeader: View {
    let round: SessionRound
    let detail: SessionDetail
    let isSubmitting: Bool
    let reset: () -> Void

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
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(GweiloTheme.lime)
                            .frame(width: 7, height: 7)

                        Text("LIVE")
                            .font(GweiloTheme.labelFont(size: 10, relativeTo: .caption2))
                            .tracking(1.4)
                            .foregroundStyle(GweiloTheme.lime)
                    }

                    Text("Round \(round.number)")
                        .font(GweiloTheme.displayFont(size: 31, relativeTo: .title2))
                        .foregroundStyle(GweiloTheme.bone)
                }

                Spacer()

                Button(action: reset) {
                    Image(systemName: "arrow.counterclockwise")
                        .font(.subheadline.weight(.semibold))
                        .frame(width: 40, height: 40)
                        .background(
                            GweiloTheme.raisedSurface,
                            in: .rect(cornerRadius: 10)
                        )
                }
                .buttonStyle(ResponsiveButtonStyle())
                .foregroundStyle(GweiloTheme.accentBright)
                .disabled(isSubmitting)
                .accessibilityLabel("Reset round scores")
            }

            RoundProgress(
                currentRound: round.number,
                totalRounds: detail.session.totalRounds
            )

            HStack {
                Text(matchSummary)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                Spacer()

                Text("\(round.number) of \(detail.session.totalRounds)")
                    .font(.caption.monospacedDigit().weight(.semibold))
                    .foregroundStyle(.secondary)
            }
        }
    }
}

private struct RoundProgress: View {
    let currentRound: Int
    let totalRounds: Int

    var body: some View {
        HStack(spacing: 4) {
            ForEach(1...max(totalRounds, 1), id: \.self) { round in
                Capsule()
                    .fill(
                        round <= currentRound
                            ? GweiloTheme.accentBright
                            : GweiloTheme.raisedSurface
                    )
                    .frame(maxWidth: .infinity)
                    .frame(height: 3)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Round \(currentRound) of \(totalRounds)")
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

    private var names: (String, String) {
        detail.teamNames(for: match.playerIDs)
    }

    private var teamOneParticipants: [SessionParticipant] {
        teamOneIDs.compactMap(detail.participant(for:))
    }

    private var teamTwoParticipants: [SessionParticipant] {
        teamTwoIDs.compactMap(detail.participant(for:))
    }

    private var teamOneIDs: [UUID] {
        match.type == .doubles
            ? Array(match.playerIDs.prefix(2))
            : Array(match.playerIDs.prefix(1))
    }

    private var teamTwoIDs: [UUID] {
        match.type == .doubles
            ? Array(match.playerIDs.dropFirst(2).prefix(2))
            : Array(match.playerIDs.dropFirst().prefix(1))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(match.type.label)
                    .font(GweiloTheme.labelFont(size: 11, relativeTo: .caption2))
                    .tracking(1.1)
                    .foregroundStyle(GweiloTheme.accentBright)

                Spacer()

                Text("MATCH \(match.order + 1)")
                    .font(.caption2.monospacedDigit().weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            MatchSide(
                name: names.0,
                participants: teamOneParticipants,
                prediction: match.eloPrediction?.team1,
                ratingLabel: match.type == .doubles ? "Team" : "Elo",
                score: $teamOneScore,
                focus: teamOneFocus,
                focusedScore: focusedScore
            )

            VersusDivider()

            MatchSide(
                name: names.1,
                participants: teamTwoParticipants,
                prediction: match.eloPrediction?.team2,
                ratingLabel: match.type == .doubles ? "Team" : "Elo",
                score: $teamTwoScore,
                focus: teamTwoFocus,
                focusedScore: focusedScore
            )
        }
        .padding(14)
        .background(GweiloTheme.surface, in: .rect(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .stroke(GweiloTheme.hairline, lineWidth: 0.8)
        }
    }
}

private struct MatchSide: View {
    let name: String
    let participants: [SessionParticipant]
    let prediction: EloSidePrediction?
    let ratingLabel: String
    @Binding var score: Int?
    let focus: ScoreField
    let focusedScore: FocusState<ScoreField?>.Binding

    @ScaledMetric(relativeTo: .title2) private var scoreFieldSize = 58

    var body: some View {
        HStack(spacing: 12) {
            ScoreEntryAvatarStack(participants: participants)

            VStack(alignment: .leading, spacing: 4) {
                Text(name)
                    .font(.headline)
                    .lineLimit(2)
                    .minimumScaleFactor(0.78)

                if let prediction {
                    EloPredictionStrip(
                        prediction: prediction,
                        ratingLabel: ratingLabel
                    )
                }
            }

            Spacer(minLength: 4)

            TextField("0", value: $score, format: .number)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)
                .font(GweiloTheme.displayFont(size: 31, relativeTo: .title2).monospacedDigit())
                .foregroundStyle(GweiloTheme.bone)
                .frame(width: scoreFieldSize, height: scoreFieldSize)
                .background(
                    GweiloTheme.raisedSurface,
                    in: .rect(cornerRadius: 11)
                )
                .overlay {
                    RoundedRectangle(cornerRadius: 11)
                        .stroke(
                            focusedScore.wrappedValue == focus
                                ? GweiloTheme.lime
                                : GweiloTheme.accent.opacity(0.34),
                            lineWidth: focusedScore.wrappedValue == focus ? 2 : 1
                        )
                }
                .focused(focusedScore, equals: focus)
                .accessibilityLabel("\(name) score")
        }
        .accessibilityElement(children: .contain)
    }
}

private struct EloPredictionStrip: View {
    let prediction: EloSidePrediction
    let ratingLabel: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(ratingLabel) \(Int(prediction.rating.rounded()))")
                .font(.caption2.monospacedDigit().weight(.semibold))
                .foregroundStyle(GweiloTheme.muted)

            HStack(spacing: 7) {
                PredictionDelta(label: "W", value: prediction.win, color: GweiloTheme.lime)
                PredictionDelta(label: "D", value: prediction.draw, color: GweiloTheme.amber)
                PredictionDelta(label: "L", value: prediction.loss, color: GweiloTheme.coral)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(ratingLabel) \(Int(prediction.rating.rounded())). "
                + "Win \(formatted(prediction.win)), "
                + "draw \(formatted(prediction.draw)), "
                + "loss \(formatted(prediction.loss)) Elo"
        )
    }

    private func formatted(_ value: Double) -> String {
        PredictionDelta.formatted(value)
    }
}

private struct PredictionDelta: View {
    let label: String
    let value: Double
    let color: Color

    var body: some View {
        Text("\(label) \(Self.formatted(value))")
            .font(.caption2.monospacedDigit().weight(.bold))
            .foregroundStyle(color)
    }

    static func formatted(_ value: Double) -> String {
        let rounded = (value * 100).rounded() / 100
        if rounded == rounded.rounded() {
            return String(format: "%+.0f", rounded)
        }
        var formatted = String(format: "%+.2f", rounded)
        while formatted.last == "0" {
            formatted.removeLast()
        }
        return formatted
    }
}

private struct ScoreEntryAvatarStack: View {
    let participants: [SessionParticipant]

    @ScaledMetric(relativeTo: .body) private var avatarSize = 40

    var body: some View {
        HStack(spacing: -10) {
            ForEach(participants) { participant in
                PlayerIdentityAvatar(
                    name: participant.name,
                    initials: participant.initials,
                    avatarURL: participant.avatarURL,
                    size: avatarSize
                )
                .overlay {
                    Circle()
                        .stroke(GweiloTheme.surface, lineWidth: 2)
                }
            }
        }
        .accessibilityHidden(true)
    }
}

private struct VersusDivider: View {
    var body: some View {
        HStack(spacing: 10) {
            Rectangle()
                .fill(GweiloTheme.hairline)
                .frame(height: 1)

            Text("VS")
                .font(.caption2.weight(.bold))
                .foregroundStyle(.secondary)

            Rectangle()
                .fill(GweiloTheme.hairline)
                .frame(height: 1)
        }
        .accessibilityHidden(true)
    }
}

private struct SubmitRoundBar: View {
    let isReady: Bool
    let isSubmitting: Bool
    let isFinalRound: Bool
    let submit: () -> Void

    var body: some View {
        Button(action: submit) {
            HStack {
                if isSubmitting {
                    ProgressView()
                        .tint(GweiloTheme.background)
                    Text("Saving…")
                } else {
                    Text(
                        isReady
                            ? (isFinalRound ? "Finish session" : "Save & next round")
                            : "Enter every score"
                    )
                    Spacer()
                    Image(systemName: isFinalRound ? "checkmark" : "arrow.right")
                }
            }
            .font(GweiloTheme.labelFont(size: 17, relativeTo: .headline))
            .foregroundStyle(
                isReady ? GweiloTheme.background : GweiloTheme.muted
            )
            .padding(.horizontal, 18)
            .frame(height: 54)
            .frame(maxWidth: .infinity)
            .background(
                isReady ? GweiloTheme.lime : GweiloTheme.raisedSurface,
                in: .rect(cornerRadius: 9)
            )
        }
        .buttonStyle(ResponsiveButtonStyle())
        .disabled(!isReady || isSubmitting)
        .accessibilityHint(
            isReady
                ? "Saves every match and advances to the next round"
                : "Enter both scores for every match first"
        )
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
