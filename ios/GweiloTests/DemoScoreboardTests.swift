import XCTest
@testable import Gweilo

final class DemoScoreboardTests: XCTestCase {
    @MainActor
    func testScoresNeverGoBelowZero() {
        let scoreboard = DemoScoreboard()

        scoreboard.decrementHome()
        scoreboard.decrementAway()

        XCTAssertEqual(scoreboard.homeScore, 0)
        XCTAssertEqual(scoreboard.awayScore, 0)
    }

    @MainActor
    func testEditingAfterSubmitReturnsToDraft() {
        let scoreboard = DemoScoreboard()
        scoreboard.incrementHome()
        scoreboard.submit()

        XCTAssertTrue(scoreboard.submitted)

        scoreboard.incrementAway()

        XCTAssertFalse(scoreboard.submitted)
    }

    @MainActor
    func testResetClearsTheScore() {
        let scoreboard = DemoScoreboard()
        scoreboard.incrementHome()
        scoreboard.incrementAway()

        scoreboard.reset()

        XCTAssertEqual(scoreboard.homeScore, 0)
        XCTAssertEqual(scoreboard.awayScore, 0)
        XCTAssertFalse(scoreboard.submitted)
    }

    @MainActor
    func testRoundScoreboardUpdatesOnlyTheSelectedMatch() {
        let scoreboard = DemoRoundScoreboard()
        let firstMatch = scoreboard.matches[0]
        let secondMatch = scoreboard.matches[1]

        scoreboard.adjust(matchID: firstMatch.id, team: 1, amount: 1)

        XCTAssertEqual(scoreboard.matches[0].teamOneScore, 1)
        XCTAssertEqual(scoreboard.matches[1].teamOneScore, 0)
        XCTAssertEqual(scoreboard.matches[1].id, secondMatch.id)
    }

    @MainActor
    func testRoundSubmissionReturnsToDraftAfterScoreChange() {
        let scoreboard = DemoRoundScoreboard()
        scoreboard.submit()

        XCTAssertTrue(scoreboard.submitted)

        scoreboard.adjust(
            matchID: scoreboard.matches[0].id,
            team: 2,
            amount: 1
        )

        XCTAssertFalse(scoreboard.submitted)
    }
}
