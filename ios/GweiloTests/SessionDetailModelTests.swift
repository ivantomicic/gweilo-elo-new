import XCTest
@testable import Gweilo

final class SessionDetailModelTests: XCTestCase {
    private let ivanID = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!
    private let garaID = UUID(uuidString: "00000000-0000-0000-0000-000000000002")!
    private let leoID = UUID(uuidString: "00000000-0000-0000-0000-000000000003")!
    private let miladinID = UUID(uuidString: "00000000-0000-0000-0000-000000000004")!

    @MainActor
    func testSinglesNamesFollowStoredPlayerOrder() {
        let detail = makeDetail()

        let names = detail.teamNames(for: [garaID, ivanID])

        XCTAssertEqual(names.0, "Gara")
        XCTAssertEqual(names.1, "Ivan")
    }

    @MainActor
    func testDoublesNamesPreserveStoredTeamPairings() {
        let detail = makeDetail()

        let names = detail.teamNames(
            for: [ivanID, garaID, leoID, miladinID]
        )

        XCTAssertEqual(names.0, "Ivan + Gara")
        XCTAssertEqual(names.1, "Leo + Miladin")
    }

    private func makeDetail() -> SessionDetail {
        SessionDetail(
            session: SessionSummary(
                id: UUID(),
                createdAt: .now,
                playerCount: 4,
                status: .completed,
                currentRound: nil,
                totalRounds: 1,
                singlesMatches: 0,
                doublesMatches: 1,
                bestPlayer: nil,
                bestDelta: nil,
                worstPlayer: nil,
                worstDelta: nil
            ),
            participants: [
                SessionParticipant(id: ivanID, name: "Ivan", avatarURL: nil, team: nil),
                SessionParticipant(id: garaID, name: "Gara", avatarURL: nil, team: nil),
                SessionParticipant(id: leoID, name: "Leo", avatarURL: nil, team: nil),
                SessionParticipant(id: miladinID, name: "Miladin", avatarURL: nil, team: nil)
            ],
            rounds: []
        )
    }
}
