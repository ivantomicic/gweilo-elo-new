export type AtomicSessionDeletionResult = {
	state:
		| "deletable"
		| "deleted"
		| "not_found"
		| "not_completed"
		| "not_latest"
		| "active_session_has_results"
		| "recalculation_running"
		| "rating_state_conflict"
		| "snapshot_incomplete"
		| "invalid_request";
	latestSessionId?: string | null;
	previousSessionId?: string | null;
	deletedSessionId?: string;
	deletedMatchCount?: number;
	restoredSinglesCount?: number;
	restoredDoublesPlayerCount?: number;
	restoredDoublesTeamCount?: number;
};

export function getSessionDeletionFailure(result: AtomicSessionDeletionResult): {
	status: number;
	error: string;
} | null {
	switch (result.state) {
		case "deletable":
		case "deleted":
			return null;
		case "not_found":
			return { status: 404, error: "Session not found" };
		case "not_completed":
			return { status: 400, error: "Only completed sessions can be deleted" };
		case "not_latest":
			return {
				status: 409,
				error: "Only the latest completed session can be deleted",
			};
		case "active_session_has_results":
			return {
				status: 409,
				error:
					"A currently active session already has submitted results. Finish or resolve it before deleting an earlier session.",
			};
		case "recalculation_running":
			return {
				status: 409,
				error: "This session is being recalculated. Wait for it to finish and try again.",
			};
		case "rating_state_conflict":
			return {
				status: 409,
				error:
					"Deletion was stopped because current ratings no longer match this session's saved snapshot.",
			};
		case "snapshot_incomplete":
			return {
				status: 409,
				error:
					"Deletion was stopped because the preceding session snapshot is incomplete.",
			};
		case "invalid_request":
			return { status: 400, error: "Session ID and administrator are required" };
	}
}
