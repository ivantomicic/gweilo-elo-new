import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthToken } from "../../_utils/auth";
import {
	generateSchedule,
	getSixPlayerCandidateTeams,
	type FourPlayerFormat,
	type SessionPlayer,
} from "@/lib/sessions/schedule";
import {
	getPreferredRound5SinglesTeam,
	loadRecentRound5SinglesPairs,
} from "@/lib/sessions/round5-team";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

export async function POST(request: NextRequest) {
	try {
		const token = getAuthToken(request);
		if (!token) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
			global: { headers: { Authorization: `Bearer ${token}` } },
		});
		const {
			data: { user },
			error,
		} = await supabase.auth.getUser(token);

		if (error || !user) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const body = (await request.json()) as {
			players?: SessionPlayer[];
			fourPlayerFormat?: FourPlayerFormat;
		};
		const players = body.players ?? [];

		if (players.length < 2 || players.length > 6) {
			return NextResponse.json(
				{ error: "Select between 2 and 6 players" },
				{ status: 400 },
			);
		}

		if (new Set(players.map((player) => player.id)).size !== players.length) {
			return NextResponse.json(
				{ error: "Each selected player must be unique" },
				{ status: 400 },
			);
		}

		let sixPlayerRound5SinglesTeam;
		const candidateTeams = getSixPlayerCandidateTeams(players);
		if (candidateTeams) {
			const recentPairs = await loadRecentRound5SinglesPairs(
				supabase,
				user.id,
			);
			sixPlayerRound5SinglesTeam = getPreferredRound5SinglesTeam(
				candidateTeams,
				recentPairs,
			);
		}

		const rounds = generateSchedule(players, {
			fourPlayerFormat: body.fourPlayerFormat,
			sixPlayerRound5SinglesTeam,
		});

		return NextResponse.json({
			playerCount: players.length,
			players,
			rounds,
			fourPlayerFormat: body.fourPlayerFormat ?? "mixed",
		});
	} catch (error) {
		console.error("Unexpected error in POST /api/sessions/preview:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
