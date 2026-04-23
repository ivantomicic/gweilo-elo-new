import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthToken } from "../../_utils/auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

type TeamKey = "A" | "B" | "C";

const TEAM_ORDER: TeamKey[] = ["A", "B", "C"];

type CandidateTeams = Record<TeamKey, [string, string]>;

function normalizePair(playerIds: [string, string]): string {
	return [...playerIds].sort().join(":");
}

function countOverlap(
	candidatePair: [string, string],
	recentPairs: Array<[string, string]>,
): number {
	return recentPairs.reduce((total, recentPair) => {
		const recentSet = new Set(recentPair);
		return total + candidatePair.filter((playerId) => recentSet.has(playerId)).length;
	}, 0);
}

function countMostRecentOverlap(
	candidatePair: [string, string],
	mostRecentPair: [string, string] | null,
): number {
	if (!mostRecentPair) {
		return 0;
	}

	const recentSet = new Set(mostRecentPair);
	return candidatePair.filter((playerId) => recentSet.has(playerId)).length;
}

function hasExactRecentMatch(
	candidatePair: [string, string],
	recentPairs: Array<[string, string]>,
): boolean {
	const normalizedCandidate = normalizePair(candidatePair);
	return recentPairs.some(
		(recentPair) => normalizePair(recentPair) === normalizedCandidate,
	);
}

function getPreferredTeam(
	candidateTeams: CandidateTeams,
	recentPairs: Array<[string, string]>,
): TeamKey {
	const mostRecentPair = recentPairs[0] ?? null;
	const rankedTeams = TEAM_ORDER
		.map((teamKey) => {
			const pair = candidateTeams[teamKey];
			return {
				teamKey,
				totalOverlap: countOverlap(pair, recentPairs),
				mostRecentOverlap: countMostRecentOverlap(pair, mostRecentPair),
				hasExactRecentMatch: hasExactRecentMatch(pair, recentPairs),
			};
		})
		.sort((a, b) => {
			if (a.totalOverlap !== b.totalOverlap) {
				return a.totalOverlap - b.totalOverlap;
			}

			if (a.mostRecentOverlap !== b.mostRecentOverlap) {
				return a.mostRecentOverlap - b.mostRecentOverlap;
			}

			if (a.hasExactRecentMatch !== b.hasExactRecentMatch) {
				return a.hasExactRecentMatch ? 1 : -1;
			}

			return TEAM_ORDER.indexOf(a.teamKey) - TEAM_ORDER.indexOf(b.teamKey);
		});

	return rankedTeams[0]?.teamKey ?? "C";
}

/**
 * POST /api/sessions/6-player-round5-team
 *
 * Determine which current pair should play singles in Round 5 for the next
 * 6-player session, based on overlap with the current user's last two
 * 6-player Round 5 singles pairs.
 */
export async function POST(request: NextRequest) {
	try {
		const token = getAuthToken(request);
		if (!token) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 },
			);
		}

		const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
			global: {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		});

		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser(token);

		if (userError || !user) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 },
			);
		}

		const body = (await request.json()) as {
			candidateTeams?: Partial<Record<TeamKey, string[]>>;
		};
		const rawCandidateTeams = body.candidateTeams;

		if (!rawCandidateTeams) {
			return NextResponse.json(
				{ error: "candidateTeams is required" },
				{ status: 400 },
			);
		}

		const candidateTeams = {} as CandidateTeams;
		for (const teamKey of TEAM_ORDER) {
			const teamPlayers = rawCandidateTeams[teamKey];
			if (
				!Array.isArray(teamPlayers) ||
				teamPlayers.length !== 2 ||
				teamPlayers.some((playerId) => typeof playerId !== "string")
			) {
				return NextResponse.json(
					{ error: `candidateTeams.${teamKey} must be a 2-player string array` },
					{ status: 400 },
				);
			}

			candidateTeams[teamKey] = [teamPlayers[0], teamPlayers[1]];
		}

		const { data: sessions, error: sessionsError } = await supabase
			.from("sessions")
			.select("id")
			.eq("created_by", user.id)
			.eq("player_count", 6)
			.order("created_at", { ascending: false })
			.limit(6);

		if (sessionsError) {
			console.error(
				"Error fetching recent 6-player sessions:",
				sessionsError,
			);
			return NextResponse.json(
				{ error: "Failed to fetch recent sessions" },
				{ status: 500 },
			);
		}

		const recentSinglesPairs: Array<[string, string]> = [];

		for (const session of sessions || []) {
			const round5SinglesResult = await supabase
				.from("session_matches")
				.select("player_ids")
				.eq("session_id", session.id)
				.eq("round_number", 5)
				.eq("match_type", "singles")
				.limit(1)
				.maybeSingle();

			if (round5SinglesResult.error) {
				console.error(
					`Error fetching round 5 singles match for session ${session.id}:`,
					round5SinglesResult.error,
				);
				continue;
			}

			const singlesPlayerIds = round5SinglesResult.data?.player_ids as
				| string[]
				| undefined;

			if (!singlesPlayerIds || singlesPlayerIds.length !== 2) {
				continue;
			}

			recentSinglesPairs.push([singlesPlayerIds[0], singlesPlayerIds[1]]);

			if (recentSinglesPairs.length >= 2) {
				break;
			}
		}

		const preferredSinglesTeam = getPreferredTeam(
			candidateTeams,
			recentSinglesPairs,
		);

		return NextResponse.json({
			preferredSinglesTeam,
			recentSinglesPairs,
		});
	} catch (error) {
		console.error(
			"Unexpected error in POST /api/sessions/6-player-round5-team:",
			error,
		);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
