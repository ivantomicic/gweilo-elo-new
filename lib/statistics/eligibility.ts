import {
	MAX_DOUBLES_PLAYER_INACTIVITY_DAYS,
	MAX_DOUBLES_TEAM_INACTIVITY_DAYS,
	MAX_SINGLES_INACTIVITY_DAYS,
	MIN_DOUBLES_PLAYER_MATCHES,
	MIN_DOUBLES_TEAM_MATCHES,
	MIN_SINGLES_MATCHES,
} from "./min-matches";

export const STATISTICS_ELIGIBILITY = {
	singles: {
		minimumMatches: MIN_SINGLES_MATCHES,
		maximumInactivityDays: MAX_SINGLES_INACTIVITY_DAYS,
	},
	doublesPlayers: {
		minimumMatches: MIN_DOUBLES_PLAYER_MATCHES,
		maximumInactivityDays: MAX_DOUBLES_PLAYER_INACTIVITY_DAYS,
	},
	doublesTeams: {
		minimumMatches: MIN_DOUBLES_TEAM_MATCHES,
		maximumInactivityDays: MAX_DOUBLES_TEAM_INACTIVITY_DAYS,
	},
} as const;

export function isRankingEligible({
	entityId,
	matchesPlayed,
	activeEntityIds,
	minimumMatches,
}: {
	entityId: string;
	matchesPlayed: number | null;
	activeEntityIds: ReadonlySet<string>;
	minimumMatches: number;
}) {
	return (
		(matchesPlayed ?? 0) >= minimumMatches &&
		activeEntityIds.has(entityId)
	);
}
