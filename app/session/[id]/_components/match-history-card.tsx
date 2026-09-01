"use client";

import {
	SessionScoreboardMatch,
	type SessionDetailPlayer,
} from "@/components/sessions/session-detail";
import { t } from "@/lib/i18n";

type Player = {
	id: string;
	name: string;
	avatar: string | null;
	elo?: number;
};

type MatchHistoryCardProps = {
	matchId?: string;
	roundNumber?: number;
	matchType: "singles" | "doubles";
	team1Players: Player[];
	team2Players: Player[];
	team1Score: number | null;
	team2Score: number | null;
	pairedFirstHalfScore?: {
		roundNumber: number;
		team1Score: number;
		team2Score: number;
	};
	team1EloChange?: number;
	team2EloChange?: number;
	onClick?: () => void;
	hasVideo?: boolean;
	isRated?: boolean;
};

function toSessionPlayers(players: Player[]): SessionDetailPlayer[] {
	return players.map((player) => ({
		id: player.id,
		name: player.name,
		avatar: player.avatar,
	}));
}

export function MatchHistoryCard({
	matchId,
	roundNumber = 0,
	matchType,
	team1Players,
	team2Players,
	team1Score,
	team2Score,
	pairedFirstHalfScore,
	team1EloChange,
	team2EloChange,
	onClick,
	hasVideo,
	isRated = true,
}: MatchHistoryCardProps) {
	return (
		<SessionScoreboardMatch
			match={{
				id: matchId ?? `${roundNumber}-${team1Players.map((player) => player.id).join("-")}`,
				roundNumber,
				matchType,
				teamOne: toSessionPlayers(team1Players),
				teamTwo: toSessionPlayers(team2Players),
				teamOneScore: team1Score,
				teamTwoScore: team2Score,
				isRated,
				pairedFirstHalfLabel: pairedFirstHalfScore
					? t.sessions.session.pairedFirstHalfScore(
							pairedFirstHalfScore.roundNumber,
							pairedFirstHalfScore.team1Score,
							pairedFirstHalfScore.team2Score,
						)
					: undefined,
				teamOneEloChange: team1EloChange,
				teamTwoEloChange: team2EloChange,
				onActivate: onClick,
				hasVideo,
			}}
		/>
	);
}
