import Observation
import SwiftUI

struct WatchStartSessionLanding: View {
    let syncService: WatchWidgetSyncService

    var body: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(GweiloWatchTheme.accent.opacity(0.22))

                Image(systemName: "figure.table.tennis")
                    .font(.system(size: 30, weight: .semibold))
                    .foregroundStyle(GweiloWatchTheme.lime)
            }
            .frame(width: 60, height: 60)

            VStack(spacing: 3) {
                Text("NOVI TERMIN")
                    .font(.headline.weight(.black))
                    .foregroundStyle(GweiloWatchTheme.bone)

                Text("Izaberi ekipu i pokreni igru sa sata.")
                    .font(.caption2)
                    .foregroundStyle(GweiloWatchTheme.muted)
                    .multilineTextAlignment(.center)
            }

            Label(
                syncService.isPhoneReachable
                    ? "iPhone povezan"
                    : "Otvori Gweilo na iPhone-u",
                systemImage: syncService.isPhoneReachable
                    ? "iphone.radiowaves.left.and.right"
                    : "iphone.slash"
            )
            .font(.caption2.weight(.semibold))
            .foregroundStyle(
                syncService.isPhoneReachable
                    ? GweiloWatchTheme.lime
                    : GweiloWatchTheme.muted
            )

            NavigationLink {
                WatchSessionCreationView(syncService: syncService)
            } label: {
                Label("Pokreni", systemImage: "plus")
                    .font(.headline.weight(.bold))
            }
            .buttonStyle(.borderedProminent)
            .tint(GweiloWatchTheme.accent)
            .disabled(!syncService.isPhoneReachable)
            .accessibilityLabel("Pokreni novi termin")
        }
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

@Observable
final class WatchSessionCreationModel {
    var draft = SessionCreationDraft()
    private(set) var players: [SessionCreationPlayer] = []
    private(set) var preview: SessionSchedulePreview?
    private(set) var isLoadingPlayers = false
    private(set) var isPreparingSchedule = false
    private(set) var isCreating = false
    private(set) var createdSessionID: UUID?
    var errorMessage: String?

    var selectedPlaceholderPlayers: [SessionCreationPlayer] {
        draft.selectedPlayers.filter(\.isPlaceholder)
    }

    func loadPlayers(using syncService: WatchWidgetSyncService) async {
        guard players.isEmpty, !isLoadingPlayers else { return }
        isLoadingPlayers = true
        defer { isLoadingPlayers = false }

        do {
            let payload = try await syncService.performSessionCommand(
                .loadPlayers
            )
            guard case let .players(players) = payload else {
                throw WatchSessionFlowError.unexpectedResponse
            }
            self.players = players
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func setPlayerCount(_ count: Int) {
        guard draft.playerCount != count else { return }
        draft.setPlayerCount(count)
        preview = nil
    }

    func setFormat(_ format: FourPlayerSessionFormat) {
        if draft.playerCount == 6 {
            guard draft.sixPlayerFormat != format else { return }
            draft.sixPlayerFormat = format
        } else {
            guard draft.fourPlayerFormat != format else { return }
            draft.fourPlayerFormat = format
        }
        preview = nil
    }

    func toggle(_ player: SessionCreationPlayer) {
        draft.toggle(player)
        preview = nil
    }

    func addPlaceholder(named name: String) {
        let selectionCount = draft.selectedPlayers.count
        draft.addPlaceholder(named: name)
        if draft.selectedPlayers.count != selectionCount {
            preview = nil
        }
    }

    func prepareSchedule(
        using syncService: WatchWidgetSyncService,
        randomizing: Bool = false
    ) async {
        guard draft.canPreview, !isPreparingSchedule else { return }
        isPreparingSchedule = true
        defer { isPreparingSchedule = false }

        do {
            let payload = try await syncService.performSessionCommand(
                .preview(
                    draft: draft,
                    currentPreview: preview,
                    randomizing: randomizing
                )
            )
            guard case let .preview(preview) = payload else {
                throw WatchSessionFlowError.unexpectedResponse
            }
            self.preview = preview
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func createSession(using syncService: WatchWidgetSyncService) async {
        guard let preview, !isCreating else { return }
        isCreating = true
        defer { isCreating = false }

        do {
            let payload = try await syncService.performSessionCommand(
                .create(draft: draft, preview: preview)
            )
            guard case let .created(sessionID) = payload else {
                throw WatchSessionFlowError.unexpectedResponse
            }
            createdSessionID = sessionID
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private enum WatchSessionFlowError: LocalizedError {
    case unexpectedResponse

    nonisolated var errorDescription: String? {
        "iPhone je vratio neočekivan odgovor. Pokušaj ponovo."
    }
}

private struct WatchSessionCreationView: View {
    @Environment(\.dismiss) private var dismiss
    let syncService: WatchWidgetSyncService
    @State private var model = WatchSessionCreationModel()

    var body: some View {
        WatchSessionSetupView(
            model: model,
            syncService: syncService
        )
        .navigationTitle("Novi termin")
        .task {
            await model.loadPlayers(using: syncService)
        }
        .onChange(of: model.createdSessionID) { _, sessionID in
            guard sessionID != nil else { return }
            WatchHaptics.play(.success)
            dismiss()
        }
        .alert("Nije moguće nastaviti", isPresented: errorBinding) {
            Button("U redu", role: .cancel) {}
        } message: {
            Text(model.errorMessage ?? "Pokušaj ponovo.")
        }
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { model.errorMessage != nil },
            set: { isPresented in
                if !isPresented {
                    model.errorMessage = nil
                }
            }
        )
    }
}

private struct WatchSessionSetupView: View {
    @Bindable var model: WatchSessionCreationModel
    let syncService: WatchWidgetSyncService

    var body: some View {
        List {
            Section {
                WatchSessionSetupHero(playerCount: model.draft.playerCount)
                    .listRowBackground(Color.clear)
            }

            Section("Broj igrača") {
                Picker("Broj igrača", selection: playerCount) {
                    ForEach(2...6, id: \.self) { count in
                        Text("\(count)").tag(count)
                    }
                }
                .pickerStyle(.wheel)
            }

            if model.draft.playerCount == 4
                || model.draft.playerCount == 6 {
                Section("Format") {
                    Picker("Format", selection: format) {
                        ForEach(FourPlayerSessionFormat.allCases) { format in
                            Text(format.label).tag(format)
                        }
                    }
                }
            }

            Section {
                NavigationLink {
                    WatchPlayerSelectionView(
                        model: model,
                        syncService: syncService
                    )
                } label: {
                    Label("Izaberi igrače", systemImage: "person.3.fill")
                }
            }
        }
        .tint(GweiloWatchTheme.accentBright)
    }

    private var playerCount: Binding<Int> {
        Binding(
            get: { model.draft.playerCount },
            set: model.setPlayerCount
        )
    }

    private var format: Binding<FourPlayerSessionFormat> {
        Binding(
            get: { model.draft.selectedFormat },
            set: model.setFormat
        )
    }
}

private struct WatchSessionSetupHero: View {
    let playerCount: Int

    var body: some View {
        VStack(spacing: 5) {
            Image(systemName: "figure.table.tennis")
                .font(.title2.weight(.semibold))
                .foregroundStyle(GweiloWatchTheme.lime)

            Text("SASTAVI EKIPU")
                .font(.headline.weight(.black))
                .foregroundStyle(GweiloWatchTheme.bone)

            Text("\(playerCount) igrača")
                .font(.caption.monospacedDigit().weight(.semibold))
                .foregroundStyle(GweiloWatchTheme.muted)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}

private struct WatchPlayerSelectionView: View {
    @Bindable var model: WatchSessionCreationModel
    let syncService: WatchWidgetSyncService

    var body: some View {
        List {
            Section {
                HStack {
                    Text("IZABRANO")
                        .font(.caption2.weight(.black))
                        .foregroundStyle(GweiloWatchTheme.accentBright)
                    Spacer()
                    Text(
                        "\(model.draft.selectedPlayers.count)/\(model.draft.playerCount)"
                    )
                    .font(.caption.monospacedDigit().weight(.bold))
                    .foregroundStyle(
                        model.draft.canPreview
                            ? GweiloWatchTheme.lime
                            : GweiloWatchTheme.bone
                    )
                }
            }

            if model.isLoadingPlayers {
                Section {
                    HStack {
                        Spacer()
                        ProgressView()
                            .tint(GweiloWatchTheme.accentBright)
                        Spacer()
                    }
                }
            } else if model.players.isEmpty {
                Section {
                    VStack(spacing: 6) {
                        Image(systemName: "iphone.and.arrow.forward")
                            .foregroundStyle(GweiloWatchTheme.accentBright)
                        Text("Nema učitanih igrača")
                            .font(.caption.weight(.semibold))
                        Button("Pokušaj ponovo", action: reloadPlayers)
                    }
                    .frame(maxWidth: .infinity)
                }
            } else {
                Section("Igrači") {
                    ForEach(model.players) { player in
                        WatchPlayerSelectionRow(
                            player: player,
                            selectionNumber: model.draft.selectionNumber(
                                for: player.id
                            ),
                            isSelectionFull: model.draft.canPreview,
                            select: { model.toggle(player) }
                        )
                    }
                }
            }

            if !model.selectedPlaceholderPlayers.isEmpty {
                Section("Gosti") {
                    ForEach(model.selectedPlaceholderPlayers) { player in
                        WatchPlayerSelectionRow(
                            player: player,
                            selectionNumber: model.draft.selectionNumber(
                                for: player.id
                            ),
                            isSelectionFull: model.draft.canPreview,
                            select: { model.toggle(player) }
                        )
                    }
                }
            }

            Section {
                NavigationLink {
                    WatchGuestPlayerView(model: model)
                } label: {
                    Label("Dodaj gosta", systemImage: "person.badge.plus")
                }
                .disabled(model.draft.canPreview)

                NavigationLink {
                    WatchSessionReviewView(
                        model: model,
                        syncService: syncService
                    )
                } label: {
                    Label("Napravi raspored", systemImage: "arrow.right")
                        .font(.headline.weight(.bold))
                }
                .disabled(!model.draft.canPreview)
            }
        }
        .navigationTitle("Igrači")
        .tint(GweiloWatchTheme.accentBright)
    }

    private func reloadPlayers() {
        Task { await model.loadPlayers(using: syncService) }
    }
}

private struct WatchPlayerSelectionRow: View {
    let player: SessionCreationPlayer
    let selectionNumber: Int?
    let isSelectionFull: Bool
    let select: () -> Void

    private var isSelected: Bool { selectionNumber != nil }

    var body: some View {
        Button(action: select) {
            HStack(spacing: 8) {
                WatchCreationPlayerAvatar(player: player)

                VStack(alignment: .leading, spacing: 1) {
                    Text(player.name)
                        .font(.body.weight(.semibold))
                        .lineLimit(1)

                    if let elo = player.elo {
                        Text("\(elo) ELO")
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(GweiloWatchTheme.muted)
                    } else if player.isPlaceholder {
                        Text("GOST")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(GweiloWatchTheme.muted)
                    }
                }

                Spacer(minLength: 2)

                if let selectionNumber {
                    Text("\(selectionNumber)")
                        .font(.caption.monospacedDigit().weight(.black))
                        .foregroundStyle(GweiloWatchTheme.background)
                        .frame(width: 24, height: 24)
                        .background(GweiloWatchTheme.lime, in: Circle())
                } else {
                    Image(systemName: "plus.circle")
                        .foregroundStyle(GweiloWatchTheme.accentBright)
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(isSelectionFull && !isSelected)
        .accessibilityLabel(
            isSelected
                ? "\(player.name), izabran kao broj \(selectionNumber ?? 0)"
                : "Izaberi \(player.name)"
        )
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

private struct WatchCreationPlayerAvatar: View {
    let player: SessionCreationPlayer

    var body: some View {
        AsyncImage(url: player.avatarURL) { phase in
            switch phase {
            case let .success(image):
                image
                    .resizable()
                    .scaledToFill()
            default:
                Circle()
                    .fill(GweiloWatchTheme.accent.opacity(0.45))
                    .overlay {
                        Text(player.initials)
                            .font(.caption2.weight(.black))
                            .foregroundStyle(GweiloWatchTheme.bone)
                    }
            }
        }
        .frame(width: 34, height: 34)
        .clipShape(.circle)
        .accessibilityHidden(true)
    }
}

private struct WatchGuestPlayerView: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var model: WatchSessionCreationModel
    @State private var name = ""

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        Form {
            Section {
                TextField("Ime gosta", text: $name)
            } footer: {
                Text("Gost ne utiče na ELO ili statistiku.")
            }

            Button("Dodaj", action: addGuest)
                .disabled(trimmedName.isEmpty || trimmedName.count > 80)
        }
        .navigationTitle("Gost")
    }

    private func addGuest() {
        model.addPlaceholder(named: trimmedName)
        dismiss()
    }
}

private struct WatchSessionReviewView: View {
    @Bindable var model: WatchSessionCreationModel
    let syncService: WatchWidgetSyncService

    var body: some View {
        List {
            if model.isPreparingSchedule || model.preview == nil {
                Section {
                    VStack(spacing: 8) {
                        ProgressView()
                            .tint(GweiloWatchTheme.accentBright)
                        Text("Pravim raspored…")
                            .font(.caption)
                            .foregroundStyle(GweiloWatchTheme.muted)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                }
            } else if let preview = model.preview {
                Section {
                    WatchScheduleSummary(preview: preview)
                }

                ForEach(preview.rounds) { round in
                    Section("Runda \(round.roundNumber)") {
                        WatchScheduleRoundRow(round: round)
                    }
                }

                Section {
                    Button(action: randomizeSchedule) {
                        Label("Promeni raspored", systemImage: "shuffle")
                    }
                    .disabled(model.isPreparingSchedule || model.isCreating)

                    Button(action: createSession) {
                        HStack {
                            if model.isCreating {
                                ProgressView()
                            }
                            Text(
                                model.isCreating
                                    ? "Pokrećem…"
                                    : "Pokreni termin"
                            )
                            .font(.headline.weight(.bold))
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(GweiloWatchTheme.accent)
                    .disabled(model.isCreating || model.isPreparingSchedule)
                }
            }
        }
        .navigationTitle("Raspored")
        .task {
            guard model.preview == nil else { return }
            await model.prepareSchedule(using: syncService)
        }
    }

    private func randomizeSchedule() {
        Task {
            await model.prepareSchedule(
                using: syncService,
                randomizing: true
            )
        }
    }

    private func createSession() {
        Task { await model.createSession(using: syncService) }
    }
}

private struct WatchScheduleSummary: View {
    let preview: SessionSchedulePreview

    private var matchCount: Int {
        preview.rounds.reduce(0) { $0 + $1.matches.count }
    }

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: "checkmark.circle.fill")
                .font(.title2)
                .foregroundStyle(GweiloWatchTheme.lime)

            Text("SPREMNO ZA IGRU")
                .font(.headline.weight(.black))
                .foregroundStyle(GweiloWatchTheme.bone)

            Text(
                "\(preview.playerCount) igrača · \(preview.rounds.count) rundi · \(matchCount) mečeva"
            )
            .font(.caption2.monospacedDigit())
            .foregroundStyle(GweiloWatchTheme.muted)
            .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}

private struct WatchScheduleRoundRow: View {
    let round: SessionScheduleRound

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            ForEach(round.matches, id: \.self) { match in
                Label(
                    matchupLabel(match),
                    systemImage: match.type == .doubles
                        ? "person.2.fill"
                        : "person.fill"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(GweiloWatchTheme.bone)
                .lineLimit(2)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func matchupLabel(_ match: SessionScheduleMatch) -> String {
        guard match.players.count > 2 else {
            return match.players
                .map(\.name)
                .joined(separator: " vs ")
        }
        let midpoint = match.players.count / 2
        let left = match.players[..<midpoint].map(\.name).joined(separator: " + ")
        let right = match.players[midpoint...].map(\.name).joined(separator: " + ")
        return "\(left) vs \(right)"
    }
}
