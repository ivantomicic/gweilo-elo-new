import SwiftUI
import UIKit

struct ScoreEntryView: View {
    @AppStorage(GweiloPreferenceKey.hapticsEnabled)
    private var hapticsEnabled = true
    @AppStorage(GweiloPreferenceKey.confirmRoundSubmission)
    private var confirmsRoundSubmission = false

    let round: SessionRound
    let detail: SessionDetail
    let isSelected: Bool
    let roundNumbers: [Int]
    let onRoundSelected: ((Int) -> Void)?
    let submit: ([RoundMatchScoreSubmission]) async throws -> RoundSubmissionResult
    let onSubmitted: () async -> Void
    let onFocusedMatchChanged: (UUID) -> Void

    private let suppliedDraft: Binding<RoundScoreDraft>?
    @State private var ownedDraft = RoundScoreDraft(matches: [])
    @State private var showsSubmitConfirmation = false
    @State private var isSubmitting = false
    @State private var submissionSucceeded = false
    @State private var errorMessage: String?
    @FocusState private var focusedScore: ScoreField?

    init(
        round: SessionRound,
        detail: SessionDetail,
        draft: Binding<RoundScoreDraft>? = nil,
        isSelected: Bool = true,
        roundNumbers: [Int]? = nil,
        onRoundSelected: ((Int) -> Void)? = nil,
        submit: @escaping ([RoundMatchScoreSubmission]) async throws -> RoundSubmissionResult,
        onSubmitted: @escaping () async -> Void = {},
        onFocusedMatchChanged: @escaping (UUID) -> Void = { _ in }
    ) {
        self.round = round
        self.detail = detail
        suppliedDraft = draft
        self.isSelected = isSelected
        self.roundNumbers = roundNumbers
            ?? Array(1...max(detail.session.totalRounds, 1))
        self.onRoundSelected = onRoundSelected
        self.submit = submit
        self.onSubmitted = onSubmitted
        self.onFocusedMatchChanged = onFocusedMatchChanged
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            RoundHeader(
                round: round,
                detail: detail,
                roundNumbers: roundNumbers,
                selectRound: onRoundSelected
            )

            if let nextRound {
                NextRoundPreview(
                    round: nextRound,
                    detail: detail
                )
            }

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
                .id(match.id)
            }

            RestingLine(players: round.restingPlayers)

            if isSubmitting {
                RoundSavingStatus(
                    roundNumber: round.number,
                    submissionSucceeded: submissionSucceeded
                )
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }

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
            if suppliedDraft == nil {
                draft = RoundScoreDraft(matches: round.matches)
            }
            errorMessage = nil
            submissionSucceeded = false
            focusedScore = nil
        }
        .onChange(of: focusedScore?.matchID) { _, matchID in
            guard let matchID else { return }
            onFocusedMatchChanged(matchID)
        }
        .onChange(of: isSelected) { _, isSelected in
            if !isSelected {
                focusedScore = nil
            }
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Gotovo") {
                    focusedScore = nil
                }
            }
        }
        .alert(
            "Sačuvati rundu \(round.number)?",
            isPresented: $showsSubmitConfirmation
        ) {
            Button("Sačuvaj") {
                Task { await submitRound() }
            }
            Button("Odustani", role: .cancel) {}
        } message: {
            Text("Svi rezultati biće sačuvani odjednom.")
        }
    }

    private var nextRound: SessionRound? {
        detail.rounds
            .filter { $0.number > round.number }
            .min { $0.number < $1.number }
    }

    private var draft: RoundScoreDraft {
        get { suppliedDraft?.wrappedValue ?? ownedDraft }
        nonmutating set {
            if let suppliedDraft {
                suppliedDraft.wrappedValue = newValue
            } else {
                ownedDraft = newValue
            }
        }
    }

    private func scoreBinding(for matchID: UUID, team: Int) -> Binding<Int?> {
        let field = ScoreField(matchID: matchID, team: team)

        return Binding(
            get: { draft.score(for: matchID, team: team) },
            set: { newScore in
                let previousScore = draft.score(for: matchID, team: team)
                draft.setScore(newScore, for: matchID, team: team)
                errorMessage = nil

                guard previousScore == nil, newScore != nil else { return }
                advanceFocus(after: field)
            }
        )
    }

    private func advanceFocus(after completedField: ScoreField) {
        Task { @MainActor in
            await Task.yield()
            guard focusedScore == completedField else { return }
            focusedScore = nextEmptyField(after: completedField)
        }
    }

    private func nextEmptyField(after completedField: ScoreField) -> ScoreField? {
        let fields = round.matches.flatMap { match in
            [
                ScoreField(matchID: match.id, team: 1),
                ScoreField(matchID: match.id, team: 2)
            ]
        }
        guard let completedIndex = fields.firstIndex(of: completedField) else {
            return fields.first(where: isEmpty)
        }

        let followingFields = fields.dropFirst(completedIndex + 1)
        if let nextField = followingFields.first(where: isEmpty) {
            return nextField
        }

        return fields.prefix(completedIndex).first(where: isEmpty)
    }

    private func isEmpty(_ field: ScoreField) -> Bool {
        draft.score(for: field.matchID, team: field.team) == nil
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
            errorMessage = "Unesi oba rezultata za svaki meč."
            return
        }

        withAnimation(.snappy(duration: 0.24)) {
            isSubmitting = true
        }
        submissionSucceeded = false
        errorMessage = nil
        defer {
            withAnimation(.snappy(duration: 0.2)) {
                isSubmitting = false
            }
        }

        do {
            _ = try await submit(scores)
            submissionSucceeded = true
            if hapticsEnabled {
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
            try? await Task.sleep(for: .milliseconds(450))
            await onSubmitted()
        } catch {
            if hapticsEnabled {
                UINotificationFeedbackGenerator().notificationOccurred(.error)
            }
            errorMessage = error.localizedDescription
        }
    }

}

private struct NextRoundPreview: View {
    let round: SessionRound
    let detail: SessionDetail

    var body: some View {
        GweiloCard(style: .neutral, contentPadding: 14) {
            VStack(alignment: .leading, spacing: 11) {
                HStack(spacing: 7) {
                    Image(systemName: "forward.fill")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(GweiloTheme.lime)

                    Text("SLEDEĆA")
                        .font(
                            GweiloTheme.labelFont(
                                size: 11,
                                relativeTo: .caption2
                            )
                        )
                        .tracking(1.1)
                        .foregroundStyle(GweiloTheme.lime)

                    Spacer()

                    Text("RUNDA \(round.number)")
                        .font(.caption2.monospacedDigit().weight(.semibold))
                        .foregroundStyle(.secondary)
                }

                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 12) {
                        ForEach(round.matches) { match in
                            NextRoundMatchup(match: match, detail: detail)
                        }
                    }

                    VStack(alignment: .leading, spacing: 7) {
                        ForEach(round.matches) { match in
                            NextRoundMatchup(match: match, detail: detail)
                        }
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Sledeća, runda \(round.number)")
    }
}

private struct NextRoundMatchup: View {
    let match: SessionMatch
    let detail: SessionDetail

    private var teamOne: String {
        shortTeamName(ids: teamOneIDs)
    }

    private var teamTwo: String {
        shortTeamName(ids: teamTwoIDs)
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
        VStack(spacing: 4) {
            if !match.isRated {
                Text("BEZ ELO-A")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.orange)
            }

            HStack(spacing: 5) {
                Text(teamOne)
                    .lineLimit(1)

                Text("VS")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(GweiloTheme.muted)

                Text(teamTwo)
                    .lineLimit(1)
            }
        }
        .font(.caption.weight(.medium))
        .foregroundStyle(GweiloTheme.bone)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(teamOne) protiv \(teamTwo)")
    }

    private func shortTeamName(ids: [UUID]) -> String {
        ids.map { id in
            let name = detail.participant(for: id)?.name ?? "?"
            return name.split(separator: " ").first.map(String.init) ?? name
        }
        .joined(separator: " & ")
    }
}

private struct RoundSavingStatus: View {
    let roundNumber: Int
    let submissionSucceeded: Bool

    @State private var isSyncing = false

    private var title: String {
        submissionSucceeded ? "Runda je sačuvana" : "Čuvam rundu \(roundNumber)"
    }

    private var detail: String {
        if submissionSucceeded {
            return "Rezultati i stanje termina su ažurirani."
        }
        return isSyncing
            ? "Ažuriram rezultate i sledeću rundu…"
            : "Proveravam rezultate…"
    }

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill((submissionSucceeded ? GweiloTheme.lime : GweiloTheme.accentBright).opacity(0.16))
                    .frame(width: 38, height: 38)

                if submissionSucceeded {
                    Image(systemName: "checkmark")
                        .font(.headline.weight(.bold))
                        .foregroundStyle(GweiloTheme.lime)
                        .transition(.scale.combined(with: .opacity))
                } else {
                    ProgressView()
                        .tint(GweiloTheme.accentBright)
                }
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(GweiloTheme.bone)

                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .contentTransition(.opacity)
            }

            Spacer(minLength: 0)
        }
        .padding(12)
        .background(GweiloTheme.raisedSurface, in: .rect(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .stroke(GweiloTheme.hairline, lineWidth: 0.8)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title). \(detail)")
        .task {
            guard !submissionSucceeded else { return }
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            withAnimation(.easeInOut(duration: 0.2)) {
                isSyncing = true
            }
        }
        .animation(Animation.snappy(duration: 0.24), value: submissionSucceeded)
    }
}

private struct ScoreField: Hashable {
    let matchID: UUID
    let team: Int
}

private struct RoundHeader: View {
    let round: SessionRound
    let detail: SessionDetail
    let roundNumbers: [Int]
    let selectRound: ((Int) -> Void)?

    private var matchSummary: String {
        let singles = round.matches.filter { $0.type == .singles }.count
        let doubles = round.matches.count - singles
        return [
            doubles > 0 ? "\(doubles) \(doubles == 1 ? "dubl" : "dubla")" : nil,
            singles > 0 ? "\(singles) \(singles == 1 ? "singl" : "singla")" : nil
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Runda \(round.number)")
                .font(GweiloTheme.displayFont(size: 31, relativeTo: .title2))
                .foregroundStyle(GweiloTheme.bone)

            RoundProgress(
                selectedRound: round.number,
                roundNumbers: roundNumbers,
                selectRound: selectRound
            )

            HStack {
                Text(matchSummary)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                Spacer()

                Text("\(round.number) od \(detail.session.totalRounds)")
                    .font(.caption.monospacedDigit().weight(.semibold))
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct RoundProgress: View {
    let selectedRound: Int
    let roundNumbers: [Int]
    let selectRound: ((Int) -> Void)?

    var body: some View {
        HStack(spacing: 4) {
            ForEach(roundNumbers, id: \.self) { roundNumber in
                Button {
                    selectRound?(roundNumber)
                } label: {
                    ZStack {
                        Color.clear

                        Capsule()
                            .fill(
                                roundNumber <= selectedRound
                                    ? GweiloTheme.accentBright
                                    : GweiloTheme.raisedSurface
                            )
                            .frame(height: 3)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .padding(.vertical, -20.5)
                .disabled(selectRound == nil)
                .accessibilityLabel("Prikaži rundu \(roundNumber)")
                .accessibilityAddTraits(
                    roundNumber == selectedRound ? .isSelected : []
                )
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Runda \(selectedRound) od \(roundNumbers.count)")
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
        GweiloCard(style: .neutral, contentPadding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                MatchSide(
                    name: names.0,
                    participants: teamOneParticipants,
                    prediction: match.eloPrediction?.team1,
                    score: $teamOneScore,
                    focus: teamOneFocus,
                    focusedScore: focusedScore
                )

                VersusDivider()

                MatchSide(
                    name: names.1,
                    participants: teamTwoParticipants,
                    prediction: match.eloPrediction?.team2,
                    score: $teamTwoScore,
                    focus: teamTwoFocus,
                    focusedScore: focusedScore
                )
            }
        }
    }
}

private struct MatchSide: View {
    let name: String
    let participants: [SessionParticipant]
    let prediction: EloSidePrediction?
    @Binding var score: Int?
    let focus: ScoreField
    let focusedScore: FocusState<ScoreField?>.Binding

    @ScaledMetric(relativeTo: .title2) private var scoreFieldSize = 58

    var body: some View {
        HStack(spacing: 12) {
            ScoreEntryAvatarStack(participants: participants)

            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(name)
                        .font(.headline)
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)

                    if let prediction {
                        Text("\(Int(prediction.rating.rounded())) Elo")
                            .font(.caption.monospacedDigit().weight(.semibold))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                if let prediction {
                    EloPredictionStrip(prediction: prediction)
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
                .accessibilityLabel("Rezultat za \(name)")
        }
        .accessibilityElement(children: .contain)
    }
}

private struct EloPredictionStrip: View {
    let prediction: EloSidePrediction

    var body: some View {
        HStack(spacing: 7) {
            PredictionDelta(label: "P", value: prediction.win, color: GweiloTheme.lime)
            PredictionDelta(label: "N", value: prediction.draw, color: GweiloTheme.amber)
            PredictionDelta(label: "I", value: prediction.loss, color: GweiloTheme.coral)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "Elo \(Int(prediction.rating.rounded())). "
                + "pobeda \(formatted(prediction.win)), "
                + "nerešeno \(formatted(prediction.draw)), "
                + "poraz \(formatted(prediction.loss)) Elo"
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
                    Text("Čuvam…")
                } else {
                    Text(
                        isReady
                            ? (isFinalRound ? "Završi termin" : "Sačuvaj i nastavi")
                            : "Unesi sve rezultate"
                    )
                    Spacer()
                    Image(systemName: isFinalRound ? "checkmark" : "arrow.right")
                }
            }
        }
        .buttonStyle(GweiloPrimaryButtonStyle())
        .disabled(!isReady || isSubmitting)
        .accessibilityHint(
            isReady
                ? "Čuva sve mečeve i prelazi na sledeću rundu"
                : "Prvo unesi oba rezultata za svaki meč"
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
                        message: "Runda je sačuvana",
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
