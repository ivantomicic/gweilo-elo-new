import { NextRequest } from "next/server";
import {
	authorizeGptStatsRequest,
	gptStatsJson,
} from "@/lib/gpt-stats/auth";
import {
	getSinglesEloScenario,
	GptStatsError,
} from "@/lib/gpt-stats/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	const unauthorized = authorizeGptStatsRequest(request);
	if (unauthorized) return unauthorized;

	try {
		const player = request.nextUrl.searchParams.get("player")?.trim() || "";
		const opponent =
			request.nextUrl.searchParams.get("opponent")?.trim() || undefined;
		const targetPlayer =
			request.nextUrl.searchParams.get("target_player")?.trim() || undefined;
		const targetEloValue = request.nextUrl.searchParams.get("target_elo");
		const targetElo =
			targetEloValue === null ? undefined : Number(targetEloValue);

		if (!player || player.length > 100) {
			return gptStatsJson(
				{ error: "A player name between 1 and 100 characters is required." },
				400,
			);
		}
		if (opponent && opponent.length > 100) {
			return gptStatsJson(
				{ error: "Opponent name must be 100 characters or fewer." },
				400,
			);
		}
		if (targetPlayer && targetPlayer.length > 100) {
			return gptStatsJson(
				{ error: "Target player name must be 100 characters or fewer." },
				400,
			);
		}
		if (
			targetElo !== undefined &&
			(!Number.isFinite(targetElo) || targetElo < 500 || targetElo > 4000)
		) {
			return gptStatsJson(
				{ error: "target_elo must be between 500 and 4000." },
				400,
			);
		}
		if (targetElo !== undefined && targetPlayer) {
			return gptStatsJson(
				{ error: "Provide either target_elo or target_player, not both." },
				400,
			);
		}
		if (!opponent && targetElo === undefined && !targetPlayer) {
			return gptStatsJson(
				{
					error:
						"Provide an opponent, target_elo, target_player, or a valid combination.",
				},
				400,
			);
		}

		const data = await getSinglesEloScenario({
			playerName: player,
			opponentName: opponent,
			targetElo,
			targetPlayerName: targetPlayer,
		});
		return gptStatsJson({
			generated_at: new Date().toISOString(),
			...data,
		});
	} catch (error) {
		console.error("Unexpected error in GET /api/gpt/elo-scenario:", error);
		if (error instanceof GptStatsError) {
			return gptStatsJson(
				{ error: error.message, details: error.details },
				error.status,
			);
		}
		return gptStatsJson({ error: "Internal server error." }, 500);
	}
}
