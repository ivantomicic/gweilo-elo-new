import Observation
import SwiftUI

@Observable
@MainActor
private final class EloCalculatorViewModel {
    private(set) var players: [EloCalculatorPlayer] = []
    private(set) var selectedPlayerID: UUID?
    private(set) var selectedOpponentIDs: [UUID] = []
    private(set) var predictedResults: [UUID: EloCalculatorResult] = [:]
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    var selectedPlayer: EloCalculatorPlayer? {
        players.first { $0.id == selectedPlayerID }
    }

    var availableOpponents: [EloCalculatorPlayer] {
        players.filter {
            $0.id != selectedPlayerID
                && !selectedOpponentIDs.contains($0.id)
        }
    }

    var selectedOpponents: [EloCalculatorPlayer] {
        let playersByID = Dictionary(
            uniqueKeysWithValues: players.map { ($0.id, $0) }
        )
        return selectedOpponentIDs.compactMap { playersByID[$0] }
    }

    var totalProjectedDelta: Double {
        guard let selectedPlayer else { return 0 }
        return selectedOpponents.reduce(into: 0) { total, opponent in
            total += EloCalculator.delta(
                playerElo: selectedPlayer.elo,
                opponentElo: opponent.elo,
                result: result(for: opponent.id),
                matchesPlayed: selectedPlayer.matchesPlayed
            )
        }
    }

    func load(
        from dataStore: AppDataStore,
        currentUserID: UUID,
        forceRefresh: Bool = false
    ) async {
        guard !isLoading else { return }
        if !players.isEmpty, !forceRefresh {
            return
        }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let loadedPlayers = try await dataStore.calculatorPlayers(
                forceRefresh: forceRefresh
            )
            players = loadedPlayers

            if selectedPlayerID == nil
                || !loadedPlayers.contains(where: {
                    $0.id == selectedPlayerID
                }) {
                selectedPlayerID = loadedPlayers.first {
                    $0.id == currentUserID
                }?.id ?? loadedPlayers.first?.id
                clearOpponents()
            } else {
                selectedOpponentIDs = selectedOpponentIDs.filter { id in
                    loadedPlayers.contains {
                        $0.id == id && $0.id != selectedPlayerID
                    }
                }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func selectPlayer(_ playerID: UUID) {
        guard selectedPlayerID != playerID else { return }
        selectedPlayerID = playerID
        clearOpponents()
    }

    func addOpponent(_ opponentID: UUID) {
        guard opponentID != selectedPlayerID,
              !selectedOpponentIDs.contains(opponentID) else {
            return
        }
        selectedOpponentIDs.append(opponentID)
        predictedResults[opponentID] = .draw
    }

    func removeOpponent(_ opponentID: UUID) {
        selectedOpponentIDs.removeAll { $0 == opponentID }
        predictedResults[opponentID] = nil
    }

    func setResult(
        _ result: EloCalculatorResult,
        for opponentID: UUID
    ) {
        guard selectedOpponentIDs.contains(opponentID) else { return }
        predictedResults[opponentID] = result
    }

    func result(for opponentID: UUID) -> EloCalculatorResult {
        predictedResults[opponentID] ?? .draw
    }

    func delta(
        against opponent: EloCalculatorPlayer,
        result: EloCalculatorResult
    ) -> Double {
        guard let selectedPlayer else { return 0 }
        return EloCalculator.delta(
            playerElo: selectedPlayer.elo,
            opponentElo: opponent.elo,
            result: result,
            matchesPlayed: selectedPlayer.matchesPlayed
        )
    }

    private func clearOpponents() {
        selectedOpponentIDs = []
        predictedResults = [:]
    }
}

struct EloCalculatorView: View {
    let dataStore: AppDataStore
    @State private var model = EloCalculatorViewModel()

    var body: some View {
        ZStack {
            ArenaBackground()

            if model.isLoading, model.players.isEmpty {
                GweiloFullScreenLoadingView(
                    "Učitavanje Elo kalkulatora"
                )
            } else if let errorMessage = model.errorMessage,
                      model.players.isEmpty {
                calculatorError(message: errorMessage)
            } else if let selectedPlayer = model.selectedPlayer {
                calculatorContent(selectedPlayer: selectedPlayer)
            } else {
                ContentUnavailableView(
                    "Nema igrača",
                    systemImage: "person.2.slash",
                    description: Text(
                        "Trenutno nema dostupnih igrača za kalkulator."
                    )
                )
            }
        }
        .navigationTitle("Kalkulator")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Osveži", systemImage: "arrow.clockwise") {
                    Task {
                        await model.load(
                            from: dataStore,
                            currentUserID: dataStore.currentUserID,
                            forceRefresh: true
                        )
                    }
                }
                .disabled(model.isLoading)
            }
        }
        .task {
            await model.load(
                from: dataStore,
                currentUserID: dataStore.currentUserID
            )
        }
    }

    private func calculatorContent(
        selectedPlayer: EloCalculatorPlayer
    ) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 28) {
                CalculatorHeader()

                CalculatorBasePlayerPicker(
                    player: selectedPlayer,
                    players: model.players,
                    selectPlayer: model.selectPlayer
                )

                CalculatorOpponentPicker(
                    opponents: model.availableOpponents,
                    selectedCount: model.selectedOpponentIDs.count
                ) { opponentID in
                    withAnimation(.snappy(duration: 0.26)) {
                        model.addOpponent(opponentID)
                    }
                }

                if model.selectedOpponents.isEmpty {
                    CalculatorEmptySelection()
                        .transition(.opacity)
                } else {
                    CalculatorProjectionSummary(
                        player: selectedPlayer,
                        opponentCount: model.selectedOpponents.count,
                        totalDelta: model.totalProjectedDelta
                    )

                    LazyVStack(spacing: 14) {
                        ForEach(model.selectedOpponents) { opponent in
                            CalculatorOpponentProjection(
                                opponent: opponent,
                                selectedResult: model.result(
                                    for: opponent.id
                                ),
                                delta: { result in
                                    model.delta(
                                        against: opponent,
                                        result: result
                                    )
                                },
                                selectResult: { result in
                                    model.setResult(
                                        result,
                                        for: opponent.id
                                    )
                                },
                                remove: {
                                    withAnimation(
                                        .snappy(duration: 0.24)
                                    ) {
                                        model.removeOpponent(opponent.id)
                                    }
                                }
                            )
                            .transition(
                                .opacity.combined(
                                    with: .move(edge: .trailing)
                                )
                            )
                        }
                    }
                }

                Text(
                    "Ovo je procena. Kalkulator ne čuva rezultat i ne menja Elo."
                )
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .center)
                .multilineTextAlignment(.center)
                .padding(.top, 2)
            }
            .padding(.horizontal, 20)
            .padding(.top, 22)
            .padding(.bottom, 40)
        }
        .scrollIndicators(.hidden)
        .floatingTabBarAccessory(
            isPresented: !model.selectedOpponents.isEmpty
        ) {
            CalculatorFloatingProjectionSummary(
                opponentCount: model.selectedOpponents.count,
                totalDelta: model.totalProjectedDelta
            )
        }
        .refreshable {
            await model.load(
                from: dataStore,
                currentUserID: dataStore.currentUserID,
                forceRefresh: true
            )
        }
    }

    private func calculatorError(message: String) -> some View {
        ContentUnavailableView {
            Label("Kalkulator nije učitan", systemImage: "wifi.exclamationmark")
        } description: {
            Text(message)
        } actions: {
            Button("Pokušaj ponovo") {
                Task {
                    await model.load(
                        from: dataStore,
                        currentUserID: dataStore.currentUserID,
                        forceRefresh: true
                    )
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(GweiloTheme.lime)
        }
    }
}

private struct CalculatorFloatingProjectionSummary: View {
    let opponentCount: Int
    let totalDelta: Double

    var body: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 2) {
                Text("PROJEKTOVANA PROMENA")
                    .font(
                        GweiloTheme.labelFont(
                            size: 12,
                            relativeTo: .caption
                        )
                    )
                    .tracking(1.3)
                    .foregroundStyle(GweiloTheme.lime)

                Text("\(opponentCount) \(opponentLabel)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 12)

            Text("\(totalDelta.signedElo) Elo")
                .font(
                    GweiloTheme.displayFont(
                        size: 28,
                        relativeTo: .title2
                    )
                )
                .foregroundStyle(totalDelta.eloColor)
                .contentTransition(.numericText())
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .adaptiveSurface(in: Capsule())
        .animation(.snappy(duration: 0.22), value: totalDelta)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Projektovana promena Elo rejtinga")
        .accessibilityValue("\(totalDelta.signedElo) Elo")
    }

    private var opponentLabel: String {
        opponentCount == 1 ? "protivnik" : "protivnika"
    }
}

private struct CalculatorHeader: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("ŠTA AKO…")
                .font(
                    GweiloTheme.labelFont(
                        size: 13,
                        relativeTo: .caption
                    )
                )
                .tracking(2)
                .foregroundStyle(GweiloTheme.lime)

            Text("ELO KALKULATOR")
                .font(
                    GweiloTheme.displayFont(
                        size: 46,
                        relativeTo: .largeTitle
                    )
                )
                .foregroundStyle(GweiloTheme.bone)
                .minimumScaleFactor(0.78)
                .lineLimit(1)

            Text(
                "Izaberi protivnike i proveri kako bi svaki rezultat promenio rejting."
            )
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct CalculatorBasePlayerPicker: View {
    let player: EloCalculatorPlayer
    let players: [EloCalculatorPlayer]
    let selectPlayer: (UUID) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeading(title: "Računaj za")

            Menu {
                ForEach(players) { candidate in
                    Button {
                        selectPlayer(candidate.id)
                    } label: {
                        if candidate.id == player.id {
                            Label(
                                candidate.name,
                                systemImage: "checkmark"
                            )
                        } else {
                            Text(candidate.name)
                        }
                    }
                }
            } label: {
                HStack(spacing: 14) {
                    PlayerIdentityAvatar(
                        name: player.name,
                        initials: player.initials,
                        avatarURL: player.avatarURL,
                        size: 58
                    )

                    VStack(alignment: .leading, spacing: 3) {
                        Text(player.name)
                            .font(.title3.weight(.bold))
                            .foregroundStyle(GweiloTheme.bone)
                            .lineLimit(1)

                        Text(
                            "\(Int(player.elo.rounded())) Elo · \(player.matchesPlayed) mečeva"
                        )
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    }

                    Spacer(minLength: 8)

                    Image(systemName: "chevron.up.chevron.down")
                        .font(.caption.weight(.black))
                        .foregroundStyle(GweiloTheme.accentBright)
                }
                .padding(14)
                .contentShape(.rect)
                .flatSurface(cornerRadius: 18)
            }
            .buttonStyle(ResponsiveButtonStyle())
            .accessibilityLabel("Izaberi igrača za računanje")
            .accessibilityValue(player.name)
        }
    }
}

private struct CalculatorOpponentPicker: View {
    let opponents: [EloCalculatorPlayer]
    let selectedCount: Int
    let selectOpponent: (UUID) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                SectionHeading(title: "Izaberi protivnike")

                Spacer()

                Text("\(selectedCount) izabrano")
                    .font(.caption2.weight(.black))
                    .foregroundStyle(
                        selectedCount == 0
                            ? GweiloTheme.muted
                            : GweiloTheme.lime
                    )
                    .contentTransition(.numericText())
            }

            if opponents.isEmpty {
                Text("Svi dostupni protivnici su već izabrani.")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 18)
            } else {
                ZStack(alignment: .trailing) {
                    ScrollView(.horizontal) {
                        LazyHStack(spacing: 10) {
                            ForEach(opponents) { opponent in
                                Button {
                                    selectOpponent(opponent.id)
                                } label: {
                                    VStack(spacing: 7) {
                                        PlayerIdentityAvatar(
                                            name: opponent.name,
                                            initials: opponent.initials,
                                            avatarURL: opponent.avatarURL,
                                            size: 58
                                        )

                                        Text(opponent.name)
                                            .font(.caption.weight(.bold))
                                            .foregroundStyle(
                                                GweiloTheme.bone
                                            )
                                            .lineLimit(1)

                                        Text(
                                            "\(Int(opponent.elo.rounded()))"
                                        )
                                        .font(.caption2.weight(.bold))
                                        .foregroundStyle(.secondary)
                                    }
                                    .frame(width: 72)
                                }
                                .buttonStyle(ResponsiveButtonStyle())
                                .accessibilityLabel(
                                    "Dodaj protivnika \(opponent.name)"
                                )
                            }
                        }
                        .padding(.trailing, 24)
                    }
                    .scrollIndicators(.hidden)

                    LinearGradient(
                        colors: [
                            GweiloTheme.background.opacity(0),
                            GweiloTheme.background
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                    .frame(width: 28)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                }
                .frame(height: 102)
            }
        }
    }
}

private struct CalculatorProjectionSummary: View {
    let player: EloCalculatorPlayer
    let opponentCount: Int
    let totalDelta: Double

    private var projectedElo: Int {
        Int((player.elo + totalDelta).rounded())
    }

    var body: some View {
        HStack(alignment: .center, spacing: 18) {
            VStack(alignment: .leading, spacing: 4) {
                SectionHeading(title: "Projekcija")

                Text("\(opponentCount) \(opponentLabel)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text("\(projectedElo) Elo")
                    .font(
                        GweiloTheme.displayFont(
                            size: 29,
                            relativeTo: .title2
                        )
                    )
                    .foregroundStyle(GweiloTheme.bone)
                    .contentTransition(.numericText())

                Text(totalDelta.signedElo)
                    .font(.subheadline.weight(.black))
                    .foregroundStyle(totalDelta.eloColor)
                    .contentTransition(.numericText())
            }
        }
        .padding(.vertical, 4)
        .animation(.snappy(duration: 0.22), value: totalDelta)
    }

    private var opponentLabel: String {
        opponentCount == 1 ? "protivnik" : "protivnika"
    }
}

private struct CalculatorOpponentProjection: View {
    let opponent: EloCalculatorPlayer
    let selectedResult: EloCalculatorResult
    let delta: (EloCalculatorResult) -> Double
    let selectResult: (EloCalculatorResult) -> Void
    let remove: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            HStack(spacing: 12) {
                PlayerIdentityAvatar(
                    name: opponent.name,
                    initials: opponent.initials,
                    avatarURL: opponent.avatarURL,
                    size: 48
                )

                VStack(alignment: .leading, spacing: 2) {
                    Text("VS \(opponent.name)")
                        .font(.headline.weight(.bold))
                        .foregroundStyle(GweiloTheme.bone)
                        .lineLimit(1)

                    Text("\(Int(opponent.elo.rounded())) Elo")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 8)

                Text(delta(selectedResult).signedElo)
                    .font(
                        GweiloTheme.displayFont(
                            size: 26,
                            relativeTo: .title3
                        )
                    )
                    .foregroundStyle(delta(selectedResult).eloColor)
                    .contentTransition(.numericText())

                Button("Ukloni", systemImage: "xmark") {
                    remove()
                }
                .labelStyle(.iconOnly)
                .font(.caption.weight(.black))
                .foregroundStyle(.secondary)
                .frame(width: 32, height: 32)
                .background(
                    GweiloTheme.raisedSurface,
                    in: .circle
                )
            }

            HStack(spacing: 8) {
                ForEach(EloCalculatorResult.allCases, id: \.self) { result in
                    CalculatorResultButton(
                        result: result,
                        delta: delta(result),
                        isSelected: selectedResult == result
                    ) {
                        selectResult(result)
                    }
                }
            }
        }
        .padding(14)
        .flatSurface(cornerRadius: 18)
        .animation(.snappy(duration: 0.2), value: selectedResult)
    }
}

private struct CalculatorResultButton: View {
    let result: EloCalculatorResult
    let delta: Double
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 3) {
                Text(result.shortLabel)
                    .font(.caption.weight(.black))

                Text(delta.signedElo)
                    .font(.caption2.weight(.bold))
                    .monospacedDigit()
            }
            .foregroundStyle(isSelected ? GweiloTheme.background : result.color)
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .background(
                isSelected
                    ? result.color
                    : GweiloTheme.raisedSurface,
                in: .rect(cornerRadius: 12)
            )
            .overlay {
                RoundedRectangle(cornerRadius: 12)
                    .stroke(
                        isSelected
                            ? result.color
                            : GweiloTheme.hairline,
                        lineWidth: 0.8
                    )
            }
        }
        .buttonStyle(ResponsiveButtonStyle())
        .accessibilityLabel(result.label)
        .accessibilityValue(delta.signedElo)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

private struct CalculatorEmptySelection: View {
    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "figure.table.tennis")
                .font(.title2)
                .foregroundStyle(GweiloTheme.lime)

            VStack(alignment: .leading, spacing: 3) {
                Text("Dodaj prvog protivnika")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(GweiloTheme.bone)

                Text(
                    "Dodirni avatar iznad da vidiš mogući dobitak ili gubitak."
                )
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 8)
    }
}

private extension EloCalculatorResult {
    var color: Color {
        switch self {
        case .win: GweiloTheme.lime
        case .draw: GweiloTheme.amber
        case .loss: GweiloTheme.coral
        }
    }
}

private extension Double {
    var signedElo: String {
        let roundedValue = Int(rounded())
        return roundedValue > 0
            ? "+\(roundedValue)"
            : "\(roundedValue)"
    }

    var eloColor: Color {
        if self > 0.004 {
            GweiloTheme.lime
        } else if self < -0.004 {
            GweiloTheme.coral
        } else {
            GweiloTheme.amber
        }
    }
}
