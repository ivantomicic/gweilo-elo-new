import SwiftUI
import XCTest
@testable import Gweilo

final class PlayerProfilePresentationTests: XCTestCase {
    @MainActor
    func testFormPreservesFiveChronologicalSlotsAndPadsOnLeft() {
        let slots = PlayerProfileFormEntry.slots(deltas: [18, -4], scores: [0.8, -0.1])
        XCTAssertEqual(slots.count, 5)
        XCTAssertEqual(slots.map { $0?.delta }, [nil, nil, nil, 18, -4])
        XCTAssertEqual(slots.map { $0?.band }, [nil, nil, nil, .gain, .steady])
    }

    @MainActor
    func testFormUsesLatestFiveWithMatchingScoreIndexes() {
        let slots = PlayerProfileFormEntry.slots(
            deltas: [1, 2, 3, 4, 5, 6],
            scores: [0, -0.3, 0.3, -0.299, 0.299, 0.8]
        )
        XCTAssertEqual(slots.compactMap { $0?.delta }, [2, 3, 4, 5, 6])
        XCTAssertEqual(slots.compactMap { $0?.band }, [.loss, .gain, .steady, .steady, .gain])
    }

    @MainActor
    func testFormDoesNotInventResultsForEmptyOrNonfiniteData() {
        XCTAssertTrue(PlayerProfileFormEntry.slots(deltas: [], scores: nil).allSatisfy { $0 == nil })
        let slots = PlayerProfileFormEntry.slots(deltas: [.nan, .infinity, -.infinity, 4, -4], scores: nil)
        XCTAssertEqual(slots.map { $0?.delta }, [nil, nil, nil, 4, -4])
    }

    @MainActor
    func testFormFallsBackForMisalignedAndNonfiniteScores() {
        let misaligned = PlayerProfileFormEntry.slots(deltas: [4, 0, -4], scores: [1])
        let invalid = PlayerProfileFormEntry.slots(deltas: [4, 0, -4], scores: [.nan, .infinity, -.infinity])
        XCTAssertEqual(misaligned, invalid)
        XCTAssertEqual(misaligned.compactMap { $0?.band }, [.gain, .steady, .loss])
    }

    @MainActor
    func testDeltaLabelsKeepTheirSignAndDescribeFormWithoutColor() {
        let slots = PlayerProfileFormEntry.slots(deltas: [18, -4, 0], scores: [0.8, -0.1, -0.3])
        XCTAssertEqual(slots.compactMap { $0?.formattedDelta }, ["+18", "−4", "0"])
        XCTAssertEqual(slots[3]?.accessibilityDescription, "−4 Elo, stabilna forma")
    }

    @MainActor
    func testReducedMotionShowsFinalContentImmediatelyAndNeverReplays() async {
        let entrance = PlayerProfileEntranceSequence()
        await entrance.run(skipMotion: true)
        XCTAssertTrue(entrance.suppressesMotion)
        XCTAssertEqual(entrance.revealedStages, Set(PlayerProfileEntranceStage.allCases))
        await entrance.run(skipMotion: false)
        XCTAssertTrue(entrance.suppressesMotion)
        XCTAssertEqual(entrance.revealedStages.count, 7)
    }

    @MainActor
    func testEntranceCompletesInWebSectionOrderAndRefreshDoesNotRestartIt() async {
        XCTAssertEqual(PlayerProfileEntranceStage.allCases, [.portrait, .name, .elo, .form, .record, .chart, .matches])
        let entrance = PlayerProfileEntranceSequence()
        await entrance.run(skipMotion: false)
        XCTAssertFalse(entrance.suppressesMotion)
        XCTAssertEqual(entrance.revealedStages.count, 7)
        await entrance.run(skipMotion: false)
        XCTAssertEqual(entrance.revealedStages.count, 7)
        XCTAssertFalse(entrance.suppressesMotion)
    }

    @MainActor
    func testCancellationRevealsEverythingAndReturningDoesNotReplay() async throws {
        let entrance = PlayerProfileEntranceSequence()
        let task = Task { await entrance.run(skipMotion: false) }
        try await Task.sleep(for: .milliseconds(40))
        task.cancel()
        await task.value
        XCTAssertTrue(entrance.suppressesMotion)
        XCTAssertEqual(entrance.revealedStages.count, 7)
        await entrance.run(skipMotion: false)
        XCTAssertTrue(entrance.suppressesMotion)
    }

    @MainActor
    func testFinishingBeforeDataArrivesDoesNotConsumeTheEntrance() async {
        let entrance = PlayerProfileEntranceSequence()
        entrance.finishImmediately()
        XCTAssertFalse(entrance.hasStarted)
        XCTAssertTrue(entrance.revealedStages.isEmpty)
        await entrance.run(skipMotion: true)
        XCTAssertEqual(entrance.revealedStages.count, 7)
    }

    @MainActor
    func testRollingNumbersReserveTheirFinalSizeBeforeTheEntrance() async throws {
        let entrance = PlayerProfileEntranceSequence()
        func size() throws -> CGSize {
            let renderer = ImageRenderer(content:
                PlayerProfileAnimatedNumber(value: 1_813, stage: .elo)
                    .font(GweiloTheme.displayFont(size: 44, relativeTo: .largeTitle).monospacedDigit())
                    .environment(entrance)
            )
            return try XCTUnwrap(renderer.uiImage).size
        }
        let before = try size()
        await entrance.run(skipMotion: true)
        let after = try size()
        XCTAssertEqual(before.width, after.width, accuracy: 0.1)
        XCTAssertEqual(before.height, after.height, accuracy: 0.1)
        XCTAssertGreaterThan(before.width, 50)
    }

    @MainActor
    func testHeaderFitsSmallScreensLongNamesAndAccessibilityText() async throws {
        for (width, name, textSize) in [
            (390.0, "Ivan", DynamicTypeSize.large),
            (320.0, "Aleksandar Milosavljević", DynamicTypeSize.large),
            (390.0, "Aleksandar Milosavljević", DynamicTypeSize.accessibility3)
        ] {
            let entrance = PlayerProfileEntranceSequence()
            await entrance.run(skipMotion: true)
            let player = RankingEntry(
                id: UUID(), name: name, avatarURL: nil, elo: 1_813,
                matches: 257, wins: 166, losses: 81, draws: 10, rankDays: nil,
                recentForm: [18, -4, 36, 4, -43], recentFormScores: [0.8, -0.1, 0.9, 0.2, -1]
            )
            let renderer = ImageRenderer(content:
                PlayerProfileHeader(player: player, goBack: {})
                    .padding(.horizontal, 20)
                    .frame(width: width)
                    .background(GweiloTheme.background)
                    .environment(entrance)
                    .environment(\.dynamicTypeSize, textSize)
                    .environment(\.colorScheme, .dark)
            )
            let image = try XCTUnwrap(renderer.uiImage)
            XCTAssertEqual(image.size.width, width, accuracy: 0.1)
            XCTAssertGreaterThan(image.size.height, 300)
            XCTAssertLessThan(image.size.height, 1_400)
            let attachment = XCTAttachment(image: image)
            attachment.name = "Player profile \(Int(width))pt \(textSize)"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
    }
}
