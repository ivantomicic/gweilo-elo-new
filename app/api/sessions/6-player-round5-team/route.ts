import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthToken } from "../../_utils/auth";
import {
	getPreferredRound5SinglesTeam,
	loadRecentRound5SinglesPairs,
	type CandidateTeams,
} from "@/lib/sessions/round5-team";
import type { SixPlayerTeamKey } from "@/lib/sessions/schedule";
import { getManagedRoleFromAuthUser } from "@/lib/auth/roles";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

const TEAM_ORDER: SixPlayerTeamKey[] = ["A", "B", "C"];

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
		const role = getManagedRoleFromAuthUser(user);
		if (role !== "admin" && role !== "mod") {
			return NextResponse.json(
				{ error: "Only admins and mods can prepare sessions." },
				{ status: 403 },
			);
		}

		const body = (await request.json()) as {
			candidateTeams?: Partial<Record<SixPlayerTeamKey, string[]>>;
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

		const recentSinglesPairs = await loadRecentRound5SinglesPairs(
			supabase,
			user.id,
		);
		const preferredSinglesTeam = getPreferredRound5SinglesTeam(
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
