import Observation
import SwiftUI

/// Owned by the rankings screen, not its category page or individual rows.
@Observable
@MainActor
final class RankingsEntranceSequence {
    static let rowLimit = 8
    static let initialDelay: Duration = .milliseconds(80)
    static let rowDelay: Duration = .milliseconds(70)

    private(set) var hasStarted = false
    private(set) var hasCompleted = false
    private(set) var suppressesMotion = false
    private(set) var animatedIDs: [UUID] = []
    private(set) var revealedIDs: Set<UUID> = []

    func isRevealed(id: UUID, index: Int) -> Bool {
        if suppressesMotion || hasCompleted { return true }
        if !hasStarted { return index >= Self.rowLimit }
        // A refreshed/new entry must never inherit another player's hidden state.
        return !animatedIDs.contains(id) || revealedIDs.contains(id)
    }

    func run(entryIDs: [UUID], skipMotion: Bool) async {
        guard !hasStarted, !entryIDs.isEmpty else { return }
        hasStarted = true
        animatedIDs = Array(entryIDs.prefix(Self.rowLimit))
        guard !skipMotion, !Task.isCancelled else {
            finishImmediately()
            return
        }

        do {
            try await Task.sleep(for: Self.initialDelay)
            for (index, id) in animatedIDs.enumerated() {
                try Task.checkCancellation()
                guard !suppressesMotion else { return }
                revealedIDs.insert(id)
                if index < animatedIDs.count - 1 {
                    try await Task.sleep(for: Self.rowDelay)
                }
            }
            try await Task.sleep(for: .milliseconds(650))
            hasCompleted = true
        } catch {
            finishImmediately()
        }
    }

    /// Also consumes a pending entrance if the user interacts before data arrives.
    func finishImmediately() {
        guard !suppressesMotion else { return }
        hasStarted = true
        hasCompleted = true
        suppressesMotion = true
        revealedIDs = Set(animatedIDs)
    }
}

struct RankingsEntranceModifier: ViewModifier {
    @Environment(RankingsEntranceSequence.self) private var entrance
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOverEnabled
    let id: UUID
    let index: Int

    func body(content: Content) -> some View {
        let skip = entrance.suppressesMotion || reduceMotion || voiceOverEnabled
        let revealed = skip || entrance.isRevealed(id: id, index: index)
        content
            .opacity(revealed ? 1 : 0)
            .offset(y: revealed ? 0 : 6)
            .animation(skip ? nil : GweiloEntranceMotion.section, value: revealed)
    }
}

struct RankingsEntranceNumber: View {
    @Environment(RankingsEntranceSequence.self) private var entrance
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOverEnabled
    let value: Int
    let id: UUID
    let index: Int

    var body: some View {
        let skip = entrance.suppressesMotion || reduceMotion || voiceOverEnabled
        GweiloEntranceNumber(
            value: value,
            revealed: skip || entrance.isRevealed(id: id, index: index),
            suppressesMotion: skip
        )
    }
}
