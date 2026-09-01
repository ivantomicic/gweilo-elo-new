import SwiftUI
import XCTest
@testable import Gweilo

final class RankingsEntrancePresentationTests: XCTestCase {
    @MainActor
    func testCadenceMatchesWebAndLongListsAreCapped() {
        XCTAssertEqual(RankingsEntranceSequence.rowLimit, 8)
        XCTAssertEqual(RankingsEntranceSequence.initialDelay, .milliseconds(80))
        XCTAssertEqual(RankingsEntranceSequence.rowDelay, .milliseconds(70))
        let entrance = RankingsEntranceSequence()
        XCTAssertFalse(entrance.isRevealed(id: UUID(), index: 0))
        XCTAssertTrue(entrance.isRevealed(id: UUID(), index: 8))
        XCTAssertTrue(entrance.isRevealed(id: UUID(), index: 100))
    }

    @MainActor
    func testEmptyLoadingStateDoesNotConsumeEntrance() async {
        let entrance = RankingsEntranceSequence()
        await entrance.run(entryIDs: [], skipMotion: false)
        XCTAssertFalse(entrance.hasStarted)
        let id = UUID()
        await entrance.run(entryIDs: [id], skipMotion: true)
        XCTAssertTrue(entrance.isRevealed(id: id, index: 0))
    }

    @MainActor
    func testReduceMotionOrVoiceOverShowsAllFinalValuesWithoutReplay() async {
        let entrance = RankingsEntranceSequence()
        let ids = (0..<12).map { _ in UUID() }
        await entrance.run(entryIDs: ids, skipMotion: true)
        XCTAssertTrue(entrance.suppressesMotion)
        XCTAssertTrue(entrance.hasCompleted)
        for (index, id) in ids.enumerated() {
            XCTAssertTrue(entrance.isRevealed(id: id, index: index))
        }
        await entrance.run(entryIDs: ids.reversed(), skipMotion: false)
        XCTAssertTrue(entrance.suppressesMotion)
        XCTAssertEqual(entrance.animatedIDs, Array(ids.prefix(8)))
    }

    @MainActor
    func testEntranceCompletesAndRefreshCannotRestartOrExtendIt() async {
        let entrance = RankingsEntranceSequence()
        let ids = (0..<10).map { _ in UUID() }
        await entrance.run(entryIDs: ids, skipMotion: false)
        XCTAssertEqual(entrance.animatedIDs, Array(ids.prefix(8)))
        XCTAssertEqual(entrance.revealedIDs, Set(ids.prefix(8)))
        XCTAssertTrue(entrance.hasCompleted)
        XCTAssertFalse(entrance.suppressesMotion)
        let newcomer = UUID()
        await entrance.run(entryIDs: [newcomer] + ids.reversed(), skipMotion: false)
        XCTAssertTrue(entrance.isRevealed(id: newcomer, index: 0))
        XCTAssertEqual(entrance.animatedIDs, Array(ids.prefix(8)))
    }

    @MainActor
    func testNewOrReorderedRowsDoNotInheritAnotherPlayersHiddenState() async throws {
        let entrance = RankingsEntranceSequence()
        let ids = (0..<10).map { _ in UUID() }
        let task = Task { await entrance.run(entryIDs: ids, skipMotion: false) }
        try await Task.sleep(for: .milliseconds(25))
        XCTAssertEqual(entrance.animatedIDs, Array(ids.prefix(8)))
        XCTAssertTrue(entrance.isRevealed(id: UUID(), index: 0))
        XCTAssertTrue(entrance.isRevealed(id: ids[9], index: 0))
        XCTAssertEqual(entrance.isRevealed(id: ids[0], index: 0), entrance.isRevealed(id: ids[0], index: 7))
        task.cancel()
        await task.value
        XCTAssertTrue(entrance.suppressesMotion)
    }

    @MainActor
    func testCancelledEntranceRevealsEveryRowAndDoesNotReplayOnReturn() async throws {
        let entrance = RankingsEntranceSequence()
        let ids = (0..<8).map { _ in UUID() }
        let task = Task { await entrance.run(entryIDs: ids, skipMotion: false) }
        try await Task.sleep(for: .milliseconds(25))
        task.cancel()
        await task.value
        XCTAssertTrue(entrance.hasCompleted)
        XCTAssertEqual(entrance.revealedIDs, Set(ids))
        await entrance.run(entryIDs: ids, skipMotion: false)
        XCTAssertTrue(entrance.suppressesMotion)
    }

    @MainActor
    func testInteractionBeforeDataArrivesConsumesEntrance() async {
        let entrance = RankingsEntranceSequence()
        entrance.finishImmediately()
        await entrance.run(entryIDs: [UUID()], skipMotion: false)
        XCTAssertTrue(entrance.suppressesMotion)
        XCTAssertTrue(entrance.animatedIDs.isEmpty)
        XCTAssertTrue(entrance.isRevealed(id: UUID(), index: 0))
    }

    @MainActor
    func testInteractionDuringEntranceFinishesPendingRows() async throws {
        let entrance = RankingsEntranceSequence()
        let ids = (0..<8).map { _ in UUID() }
        let task = Task { await entrance.run(entryIDs: ids, skipMotion: false) }
        try await Task.sleep(for: .milliseconds(25))
        entrance.finishImmediately()
        await task.value
        XCTAssertEqual(entrance.revealedIDs, Set(ids))
        XCTAssertTrue(entrance.suppressesMotion)
    }

    @MainActor
    func testNumberWidthAndRowHeightStayFixedDuringEntrance() async throws {
        for textSize in [DynamicTypeSize.large, .accessibility3] {
            let entrance = RankingsEntranceSequence()
            let id = UUID()
            func image() throws -> UIImage {
                let renderer = ImageRenderer(content:
                    RankingsEntranceNumber(value: 1_813, id: id, index: 0)
                        .font(GweiloTheme.displayFont(size: 19, relativeTo: .body).monospacedDigit())
                        .padding(.vertical, 13)
                        .modifier(RankingsEntranceModifier(id: id, index: 0))
                        .environment(entrance)
                        .environment(\.dynamicTypeSize, textSize)
                )
                return try XCTUnwrap(renderer.uiImage)
            }
            let before = try image()
            await entrance.run(entryIDs: [id], skipMotion: true)
            let after = try image()
            XCTAssertEqual(before.size.width, after.size.width, accuracy: 0.1)
            XCTAssertEqual(before.size.height, after.size.height, accuracy: 0.1)
            XCTAssertGreaterThan(after.size.width, 20)
            let attachment = XCTAttachment(image: after)
            attachment.name = "Ranking number final size \(textSize)"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
    }
}
