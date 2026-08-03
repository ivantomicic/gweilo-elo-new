import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculateEloChange } from "@/lib/elo";
import { createAdminClient } from "@/lib/supabase/admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type SessionMatch = {
	id: string;
	match_type: "singles" | "doubles";
	player_ids: string[];
	team_1_id: string | null;
	team_2_id: string | null;
};

type EloSidePrediction = {
	rating: number;
	win: number;
	draw: number;
	loss: number;
};

function numericValue(value: number | string | null | undefined, fallback = 1500) {
	if (value === null || value === undefined) return fallback;
	const parsed = typeof value === "number" ? value : Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function makeSidePrediction(
	rating: number,
	opponentRating: number,
	matchCount: number,
): EloSidePrediction {
	return {
		rating,
		win: calculateEloChange(rating, opponentRating, "win", matchCount),
		draw: calculateEloChange(rating, opponentRating, "draw", matchCount),
		loss: calculateEloChange(rating, opponentRating, "lose", matchCount),
	};
}

export async function GET(
	request: NextRequest,
	{ params }: { params: { sessionId: string } },
) {
	try {
		if (!supabaseUrl || !supabaseAnonKey) {
			return NextResponse.json(
				{ error: "Server configuration is incomplete" },
				{ status: 500 },
			);
		}

		const authHeader = request.headers.get("authorization");
		if (!authHeader?.startsWith("Bearer ")) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const token = authHeader.slice("Bearer ".length);
		const supabase = createClient(supabaseUrl, supabaseAnonKey, {
			global: {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		});

		const { data, error } = await supabase
			.from("session_matches")
			.select("id, match_type, player_ids, team_1_id, team_2_id")
			.eq("session_id", params.sessionId)
			.eq("is_rated", true);

		if (error) {
			return NextResponse.json(
				{ error: "Failed to load session matches", detail: error.message },
				{ status: 500 },
			);
		}

		const matches = (data || []) as SessionMatch[];
		const playerIds = Array.from(
			new Set(matches.flatMap((match) => match.player_ids)),
		);
		const teamIds = Array.from(
			new Set(
				matches.flatMap((match) =>
					[match.team_1_id, match.team_2_id].filter(
						(teamId): teamId is string => Boolean(teamId),
					),
				),
			),
		);

		const admin = createAdminClient();
		const [playerRatingResult, teamRatingResult] = await Promise.all([
			playerIds.length > 0
				? admin
						.from("player_ratings")
						.select("player_id, elo, wins, losses, draws")
						.in("player_id", playerIds)
				: Promise.resolve({ data: [], error: null }),
			teamIds.length > 0
				? admin
						.from("double_team_ratings")
						.select("team_id, elo")
						.in("team_id", teamIds)
				: Promise.resolve({ data: [], error: null }),
		]);

		if (playerRatingResult.error || teamRatingResult.error) {
			return NextResponse.json(
				{
					error: "Failed to load Elo prediction inputs",
					detail:
						playerRatingResult.error?.message ||
						teamRatingResult.error?.message,
				},
				{ status: 500 },
			);
		}

		const singlesRatingsByPlayerId = new Map(
			(playerRatingResult.data || []).map((rating) => [
				rating.player_id,
				numericValue(rating.elo),
			]),
		);
		const matchCountsByPlayerId = new Map(
			(playerRatingResult.data || []).map((rating) => [
				rating.player_id,
				(rating.wins || 0) + (rating.losses || 0) + (rating.draws || 0),
			]),
		);
		const teamRatingsById = new Map(
			(teamRatingResult.data || []).map((rating) => [
				rating.team_id,
				numericValue(rating.elo),
			]),
		);

		const predictions = matches.map((match) => {
			const isSingles = match.match_type === "singles";
			const teamOnePlayerIds = isSingles
				? match.player_ids.slice(0, 1)
				: match.player_ids.slice(0, 2);
			const teamTwoPlayerIds = isSingles
				? match.player_ids.slice(1, 2)
				: match.player_ids.slice(2, 4);

			const averageMatchCount = (ids: string[]) => {
				if (ids.length === 0) return 0;
				const total = ids.reduce(
					(sum, playerId) =>
						sum + (matchCountsByPlayerId.get(playerId) || 0),
					0,
				);
				return Math.round(total / ids.length);
			};

			const teamOneRating = isSingles
				? (singlesRatingsByPlayerId.get(teamOnePlayerIds[0]) ?? 1500)
				: match.team_1_id
					? (teamRatingsById.get(match.team_1_id) ?? 1500)
					: 1500;
			const teamTwoRating = isSingles
				? (singlesRatingsByPlayerId.get(teamTwoPlayerIds[0]) ?? 1500)
				: match.team_2_id
					? (teamRatingsById.get(match.team_2_id) ?? 1500)
					: 1500;

			return {
				matchId: match.id,
				ratingType: isSingles ? "singles" : "team",
				team1: makeSidePrediction(
					teamOneRating,
					teamTwoRating,
					averageMatchCount(teamOnePlayerIds),
				),
				team2: makeSidePrediction(
					teamTwoRating,
					teamOneRating,
					averageMatchCount(teamTwoPlayerIds),
				),
			};
		});

		return NextResponse.json({ predictions });
	} catch (error) {
		console.error("Unexpected Elo prediction error:", error);
		return NextResponse.json(
			{ error: "Failed to calculate Elo predictions" },
			{ status: 500 },
		);
	}
}
