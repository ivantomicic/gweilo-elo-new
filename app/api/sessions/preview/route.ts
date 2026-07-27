import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthToken } from "../../_utils/auth";
import {
	generateSchedule,
	getSixPlayerCandidateTeams,
	type FourPlayerFormat,
	type SessionPlayer,
	type SixPlayerFormat,
} from "@/lib/sessions/schedule";
import {
	getPreferredRound5SinglesTeam,
	loadRecentRound5SinglesPairs,
} from "@/lib/sessions/round5-team";
import { getManagedRoleFromAuthUser } from "@/lib/auth/roles";

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
		const role = getManagedRoleFromAuthUser(user);
		if (role !== "admin" && role !== "mod") {
			return NextResponse.json(
				{ error: "Only admins and mods can prepare sessions." },
				{ status: 403 },
			);
		}

		const body = (await request.json()) as {
			players?: SessionPlayer[];
			fourPlayerFormat?: FourPlayerFormat;
			sixPlayerFormat?: SixPlayerFormat;
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
		const candidateTeams =
			body.sixPlayerFormat === "singles"
				? null
				: getSixPlayerCandidateTeams(players);
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
			sixPlayerFormat: body.sixPlayerFormat,
			sixPlayerRound5SinglesTeam,
		});

		return NextResponse.json({
			playerCount: players.length,
			players,
			rounds,
			fourPlayerFormat: body.fourPlayerFormat ?? "mixed",
			sixPlayerFormat: body.sixPlayerFormat ?? "mixed",
		});
	} catch (error) {
		console.error("Unexpected error in POST /api/sessions/preview:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
