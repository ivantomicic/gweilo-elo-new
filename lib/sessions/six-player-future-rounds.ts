export type SixPlayerScheduleMatch = {
	id: string;
	round_number: number;
	match_type: "singles" | "doubles";
	player_ids: string[];
	status: "pending" | "completed";
};

export type FutureRoundMatchUpdate = {
	match_id: string;
	round_number: number;
	player_ids: string[];
	team_1_id: string | null;
	team_2_id: string | null;
	is_rated: boolean;
};

/**
 * Round 5's result determines both remaining six-player rounds. Build the
 * entire mutation before settlement so the database can commit it atomically.
 */
export async function buildSixPlayerFutureRoundPlan({
	matches,
	doublesTeamOneScore,
	doublesTeamTwoScore,
	placeholderIds,
	resolveDoublesTeam,
}: {
	matches: SixPlayerScheduleMatch[];
	doublesTeamOneScore: number;
	doublesTeamTwoScore: number;
	placeholderIds: Set<string>;
	resolveDoublesTeam: (playerOneId: string, playerTwoId: string) => Promise<string>;
}): Promise<FutureRoundMatchUpdate[]> {
	const onlyMatch = (roundNumber: number, type: "singles" | "doubles") => {
		const found = matches.filter(
			(match) => match.round_number === roundNumber && match.match_type === type,
		);
		if (found.length !== 1) {
			throw new Error(`Expected one ${type} match in Round ${roundNumber}`);
		}
		return found[0];
	};

	const roundFiveDoubles = onlyMatch(5, "doubles");
	const roundFiveSingles = onlyMatch(5, "singles");
	if (roundFiveDoubles.player_ids.length !== 4 || roundFiveSingles.player_ids.length !== 2) {
		throw new Error("Invalid six-player Round 5 matchups");
	}
	const [firstOne, firstTwo, secondOne, secondTwo] = roundFiveDoubles.player_ids;
	const winners = doublesTeamOneScore > doublesTeamTwoScore
		? [firstOne, firstTwo]
		: [secondOne, secondTwo];
	const losers = doublesTeamOneScore > doublesTeamTwoScore
		? [secondOne, secondTwo]
		: [firstOne, firstTwo];
	const singlesPlayers = roundFiveSingles.player_ids;

	const assignments: Array<{
		roundNumber: number;
		type: "singles" | "doubles";
		players: string[];
	}> = [
		{ roundNumber: 6, type: "doubles", players: [...winners, ...singlesPlayers] },
		{ roundNumber: 6, type: "singles", players: losers },
		{ roundNumber: 7, type: "doubles", players: [...losers, ...singlesPlayers] },
		{ roundNumber: 7, type: "singles", players: winners },
	];

	const teamIds = new Map<string, string>();
	const resolveTeam = async (first: string, second: string) => {
		const key = [first, second].sort().join(":");
		if (teamIds.has(key)) return teamIds.get(key)!;
		const id = await resolveDoublesTeam(first, second);
		teamIds.set(key, id);
		return id;
	};

	const updates: FutureRoundMatchUpdate[] = [];
	for (const assignment of assignments) {
		const match = onlyMatch(assignment.roundNumber, assignment.type);
		if (match.status !== "pending") {
			throw new Error(`Round ${assignment.roundNumber} is no longer pending`);
		}
		const isRated = assignment.players.every((id) => !placeholderIds.has(id));
		updates.push({
			match_id: match.id,
			round_number: assignment.roundNumber,
			player_ids: assignment.players,
			team_1_id: assignment.type === "doubles" && isRated
				? await resolveTeam(assignment.players[0], assignment.players[1])
				: null,
			team_2_id: assignment.type === "doubles" && isRated
				? await resolveTeam(assignment.players[2], assignment.players[3])
				: null,
			is_rated: isRated,
		});
	}
	return updates;
}
