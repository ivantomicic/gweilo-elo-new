import type {
	FourPlayerFormat,
	SessionRound,
	SixPlayerFormat,
} from "./schedule";
import { normalizePlayerID, normalizePlayerIDs } from "./player-id";

export type SessionCreationPlayer = {
	id: string;
	name: string;
	avatar: string | null;
};

export type SessionCreationBody = {
	playerCount?: number;
	players?: SessionCreationPlayer[];
	rounds?: SessionRound[];
	fourPlayerFormat?: FourPlayerFormat;
	sixPlayerFormat?: SixPlayerFormat;
	createdAt?: unknown;
};

export type AtomicSessionPlayer = {
	id: string;
	team: string | null;
};

export type AtomicSessionMatch = {
	roundNumber: number;
	matchType: "singles" | "doubles";
	matchOrder: number;
	playerIds: string[];
	team1Id: string | null;
	team2Id: string | null;
};

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidIdempotencyKey(value: string | null): value is string {
	return value !== null && UUID_PATTERN.test(value);
}

export function validateSessionCreation({
	players,
	rounds,
	playerCount,
}: {
	players: SessionCreationPlayer[];
	rounds: SessionRound[];
	playerCount: number;
}): string | null {
	if (playerCount < 2 || playerCount > 6) {
		return "Player count must be between 2 and 6";
	}
	if (players.length !== playerCount) {
		return "Player count mismatch";
	}
	if (
		players.some((player) => !UUID_PATTERN.test(player.id)) ||
		new Set(players.map((player) => normalizePlayerID(player.id))).size !==
			playerCount
	) {
		return "Each selected player must have a unique valid ID";
	}
	if (rounds.length === 0) {
		return "Schedule must contain at least one round";
	}

	const selectedPlayerIDs = new Set(
		players.map((player) => normalizePlayerID(player.id)),
	);
	const roundNumbers = new Set<number>();

	for (const round of rounds) {
		if (
			!Number.isInteger(round.roundNumber) ||
			round.roundNumber < 1 ||
			roundNumbers.has(round.roundNumber) ||
			round.matches.length === 0
		) {
			return "Schedule contains an invalid round";
		}
		roundNumbers.add(round.roundNumber);

		for (const match of round.matches) {
			const expectedPlayers = match.type === "singles" ? 2 : 4;
			const playerIDs = match.players.map((player) =>
				normalizePlayerID(player.id),
			);
			if (
				playerIDs.length !== expectedPlayers ||
				new Set(playerIDs).size !== expectedPlayers ||
				playerIDs.some((playerID) => !selectedPlayerIDs.has(playerID))
			) {
				return "Schedule contains an invalid match";
			}
		}
	}

	return null;
}

export async function buildAtomicSessionPayload({
	players,
	rounds,
	resolveTeam,
}: {
	players: SessionCreationPlayer[];
	rounds: SessionRound[];
	resolveTeam: (playerOneID: string, playerTwoID: string) => Promise<string>;
}): Promise<{
	players: AtomicSessionPlayer[];
	matches: AtomicSessionMatch[];
}> {
	const teamByPair = new Map<string, string>();
	const resolveCachedTeam = async (left: string, right: string) => {
		const pair = [left, right].sort();
		const key = pair.join(":");
		const cached = teamByPair.get(key);
		if (cached) return cached;
		const teamID = await resolveTeam(pair[0], pair[1]);
		teamByPair.set(key, teamID);
		return teamID;
	};

	const matches: AtomicSessionMatch[] = [];
	const hasDoubles = rounds.some((round) =>
		round.matches.some((match) => match.type === "doubles"),
	);
	for (const round of rounds) {
		for (const [matchOrder, match] of round.matches.entries()) {
			const playerIDs = normalizePlayerIDs(
				match.players.map((player) => player.id),
			);
			const isDoubles = match.type === "doubles";
			matches.push({
				roundNumber: round.roundNumber,
				matchType: match.type,
				matchOrder,
				playerIds: playerIDs,
				team1Id: isDoubles
					? await resolveCachedTeam(playerIDs[0], playerIDs[1])
					: null,
				team2Id: isDoubles
					? await resolveCachedTeam(playerIDs[2], playerIDs[3])
					: null,
			});
		}
	}

	return {
		players: players.map((player, index) => ({
			id: normalizePlayerID(player.id),
			team:
				players.length === 6 && hasDoubles
					? (["A", "B", "C"] as const)[Math.floor(index / 2)]
					: null,
		})),
		matches,
	};
}
