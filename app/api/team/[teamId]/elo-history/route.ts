import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, verifyUser } from "@/lib/supabase/admin";

type DoubleTeamRecord = {
	id: string;
	player_1_id: string;
	player_2_id: string;
};

type ProfileRecord = {
	id: string;
	display_name: string | null;
	avatar_url: string | null;
};

type MatchEloHistoryRecord = {
	match_id: string;
	team1_id: string | null;
	team2_id: string | null;
	team1_elo_after: number | string | null;
	team2_elo_after: number | string | null;
	team1_elo_delta: number | string | null;
	team2_elo_delta: number | string | null;
	created_at: string;
};

type SessionMatchRecord = {
	id: string;
	session_id: string | null;
	round_number: number | null;
	match_order: number | null;
	match_type: "singles" | "doubles";
};

type SessionRecord = {
	id: string;
	created_at: string;
};

function toNumber(value: unknown, fallback = 0): number {
	if (typeof value === "number") {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	}

	return fallback;
}

function buildProfilesMap(profiles: ProfileRecord[]) {
	return new Map(
		profiles.map((profile) => [
			profile.id,
			{
				display_name: profile.display_name || "User",
				avatar: profile.avatar_url || null,
			},
		]),
	);
}

function buildTeamName(
	team: DoubleTeamRecord | null | undefined,
	profilesMap: Map<string, { display_name: string; avatar: string | null }>,
) {
	if (!team) {
		return "Unknown";
	}

	const player1Name = profilesMap.get(team.player_1_id)?.display_name || "User";
	const player2Name = profilesMap.get(team.player_2_id)?.display_name || "User";
	return `${player1Name} & ${player2Name}`;
}

export async function GET(
	request: NextRequest,
	{ params }: { params: { teamId: string } },
) {
	try {
		const authHeader = request.headers.get("authorization");
		const user = await verifyUser(authHeader);

		if (!user) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 },
			);
		}

		const adminClient = createAdminClient();
		const teamId = params.teamId;

		const [{ data: currentTeam, error: teamError }, { data: currentRating, error: ratingError }] =
			await Promise.all([
				adminClient
					.from("double_teams")
					.select("id, player_1_id, player_2_id")
					.eq("id", teamId)
					.single<DoubleTeamRecord>(),
				adminClient
					.from("double_team_ratings")
					.select("elo")
					.eq("team_id", teamId)
					.maybeSingle<{ elo: number | string | null }>(),
			]);

		if (teamError || !currentTeam) {
			console.error("Error fetching team for Elo history:", teamError);
			return NextResponse.json({ error: "Team not found" }, { status: 404 });
		}

		if (ratingError) {
			console.error("Error fetching current team rating:", ratingError);
			return NextResponse.json(
				{ error: "Failed to fetch team Elo history" },
				{ status: 500 },
			);
		}

		const { data: eloHistory, error: historyError } = await adminClient
			.from("match_elo_history")
			.select(
				"match_id, team1_id, team2_id, team1_elo_after, team2_elo_after, team1_elo_delta, team2_elo_delta, created_at",
			)
			.or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
			.order("created_at", { ascending: true });

		if (historyError) {
			console.error("Error fetching team Elo history:", historyError);
			return NextResponse.json(
				{ error: "Failed to fetch team Elo history" },
				{ status: 500 },
			);
		}

		const currentElo = toNumber(currentRating?.elo, 1500);
		const matchIds = (eloHistory || []).map((entry) => entry.match_id);

		const { data: matches, error: matchesError } =
			matchIds.length > 0
				? await adminClient
						.from("session_matches")
						.select("id, session_id, round_number, match_order, match_type")
						.in("id", matchIds)
				: { data: null, error: null };

		if (matchesError) {
			console.error("Error fetching team matches:", matchesError);
			return NextResponse.json(
				{ error: "Failed to fetch team Elo history" },
				{ status: 500 },
			);
		}

		const matchMap = new Map(
			(matches || []).map((match: SessionMatchRecord) => [match.id, match]),
		);

		const doublesEntries = ((eloHistory || []) as MatchEloHistoryRecord[]).filter(
			(entry) => matchMap.get(entry.match_id)?.match_type === "doubles",
		);

		const opponentTeamIds = new Set<string>([teamId]);
		for (const entry of doublesEntries) {
			if (entry.team1_id && entry.team1_id !== teamId) {
				opponentTeamIds.add(entry.team1_id);
			}
			if (entry.team2_id && entry.team2_id !== teamId) {
				opponentTeamIds.add(entry.team2_id);
			}
		}

		const { data: teams, error: teamsError } = await adminClient
			.from("double_teams")
			.select("id, player_1_id, player_2_id")
			.in("id", Array.from(opponentTeamIds));

		if (teamsError) {
			console.error("Error fetching opponent teams:", teamsError);
			return NextResponse.json(
				{ error: "Failed to fetch team Elo history" },
				{ status: 500 },
			);
		}

		const teamRows = (teams || []) as DoubleTeamRecord[];
		const teamMap = new Map(teamRows.map((team) => [team.id, team]));

		const profileIds = Array.from(
			new Set(
				teamRows.flatMap((team) => [team.player_1_id, team.player_2_id]),
			),
		);

		const { data: profiles, error: profilesError } =
			profileIds.length > 0
				? await adminClient
						.from("profiles")
						.select("id, display_name, avatar_url")
						.in("id", profileIds)
				: { data: null, error: null };

		if (profilesError) {
			console.error("Error fetching team profiles for history:", profilesError);
			return NextResponse.json(
				{ error: "Failed to fetch team Elo history" },
				{ status: 500 },
			);
		}

		const profilesMap = buildProfilesMap((profiles || []) as ProfileRecord[]);

		const sessionIds = Array.from(
			new Set(
				(matches || [])
					.map((match: SessionMatchRecord) => match.session_id)
					.filter((sessionId): sessionId is string => Boolean(sessionId)),
			),
		);

		const { data: sessions, error: sessionsError } =
			sessionIds.length > 0
				? await adminClient
						.from("sessions")
						.select("id, created_at")
						.in("id", sessionIds)
				: { data: null, error: null };

		if (sessionsError) {
			console.error("Error fetching sessions for team history:", sessionsError);
			return NextResponse.json(
				{ error: "Failed to fetch team Elo history" },
				{ status: 500 },
			);
		}

		const sessionDateMap = new Map(
			((sessions || []) as SessionRecord[]).map((session) => [
				session.id,
				session.created_at,
			]),
		);

		const sortedEntries = [...doublesEntries].sort((a, b) => {
			const matchA = matchMap.get(a.match_id);
			const matchB = matchMap.get(b.match_id);

			if (!matchA || !matchB) {
				return a.created_at.localeCompare(b.created_at);
			}

			if (matchA.session_id !== matchB.session_id) {
				const sessionDateA = matchA.session_id
					? sessionDateMap.get(matchA.session_id) || a.created_at
					: a.created_at;
				const sessionDateB = matchB.session_id
					? sessionDateMap.get(matchB.session_id) || b.created_at
					: b.created_at;
				return sessionDateA.localeCompare(sessionDateB);
			}

			const roundA = matchA.round_number ?? 0;
			const roundB = matchB.round_number ?? 0;
			if (roundA !== roundB) {
				return roundA - roundB;
			}

			return (matchA.match_order ?? 0) - (matchB.match_order ?? 0);
		});

		const dataPoints: Array<{
			match: number;
			elo: number;
			date: string;
			opponent: string;
			delta: number;
		}> = [];

		for (const entry of sortedEntries) {
			const isTeam1 = entry.team1_id === teamId;
			const eloAfter = isTeam1 ? entry.team1_elo_after : entry.team2_elo_after;
			const eloDelta = isTeam1 ? entry.team1_elo_delta : entry.team2_elo_delta;
			const opponentTeamId = isTeam1 ? entry.team2_id : entry.team1_id;
			const opponentName = buildTeamName(
				opponentTeamId ? teamMap.get(opponentTeamId) : null,
				profilesMap,
			);
			const match = matchMap.get(entry.match_id);
			const sessionDate = match?.session_id
				? sessionDateMap.get(match.session_id) || entry.created_at
				: entry.created_at;

			if (eloAfter === null || eloAfter === undefined) {
				continue;
			}

			dataPoints.push({
				match: dataPoints.length + 1,
				elo: toNumber(eloAfter, currentElo),
				date: sessionDate,
				opponent: opponentName,
				delta: toNumber(eloDelta, 0),
			});
		}

		if (dataPoints.length === 0) {
			return NextResponse.json({
				data: [
					{
						match: 0,
						elo: currentElo,
						date: new Date().toISOString(),
						opponent: buildTeamName(currentTeam, profilesMap),
						delta: 0,
					},
				],
				currentElo,
			});
		}

		return NextResponse.json({
			data: dataPoints,
			currentElo: dataPoints[dataPoints.length - 1]?.elo ?? currentElo,
		});
	} catch (error) {
		console.error(
			"Unexpected error in GET /api/team/[teamId]/elo-history:",
			error,
		);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
