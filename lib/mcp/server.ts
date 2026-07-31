import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
	getGeneralSinglesStatistics,
	getOwnHeadToHead,
	getOwnHeadToHeadByName,
	getOwnPerformanceSummary,
	getOwnRecentMatches,
	McpTableTennisError,
} from "@/lib/mcp/table-tennis";
import { MCP_TOOL_SECURITY_SCHEMES } from "@/lib/mcp/oauth";

const readOnlyAnnotations = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false,
};

const oauthToolMetadata = {
	securitySchemes: MCP_TOOL_SECURITY_SCHEMES,
};

function toolResult(data: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
		structuredContent: data as Record<string, unknown>,
	};
}

function toolError(error: unknown) {
	if (!(error instanceof McpTableTennisError)) {
		console.error("Unexpected Gweilo MCP tool error:", error);
	}

	const message =
		error instanceof McpTableTennisError
			? error.message
			: "The requested table-tennis data is temporarily unavailable.";

	return {
		isError: true,
		content: [{ type: "text" as const, text: message }],
	};
}

export function createGweiloMcpServer(userId: string) {
	const server = new McpServer(
		{
			name: "gweilo-table-tennis",
			version: "0.1.0",
		},
		{
			capabilities: {
				tools: {},
			},
			instructions:
				"Read-only Gweilo singles statistics. Personal tools are scoped to the authenticated player. For questions about how that player performed against a named opponent, call head_to_head with opponent_name. For aggregate questions, call general_statistics. Use win_rate with minimum_matches 3 for 'best performance'. Use draws, wins, losses, or matches_played with minimum_matches 1 for count-based superlatives. Use elo_points_gained for total positive Elo earned and net_elo_change for signed Elo movement over the selected period.",
		},
	);

	server.registerTool(
		"recent_matches",
		{
			title: "My Recent Matches",
			description:
				"Return the authenticated player's most recent completed singles matches. Opponent IDs from this result can be used with head_to_head.",
			inputSchema: z.object({
				limit: z
					.number()
					.int()
					.min(1)
					.max(20)
					.default(10)
					.describe("Number of recent matches to return (1-20)."),
			}),
			annotations: readOnlyAnnotations,
			_meta: oauthToolMetadata,
		},
		async ({ limit }) => {
			try {
				return toolResult(await getOwnRecentMatches(userId, limit));
			} catch (error) {
				return toolError(error);
			}
		},
	);

	server.registerTool(
		"player_performance",
		{
			title: "My Player Performance",
			description:
				"Return the authenticated player's all-time singles wins, losses, draws, win rate, and latest match outcomes.",
			inputSchema: z.object({
				recent_limit: z
					.number()
					.int()
					.min(1)
					.max(10)
					.default(5)
					.describe("Number of recent outcomes to include (1-10)."),
			}),
			annotations: readOnlyAnnotations,
			_meta: oauthToolMetadata,
		},
		async ({ recent_limit: recentLimit }) => {
			try {
				return toolResult(
					await getOwnPerformanceSummary(userId, recentLimit),
				);
			} catch (error) {
				return toolError(error);
			}
		},
	);

	server.registerTool(
		"general_statistics",
		{
			title: "General Singles Statistics",
			description:
				"Rank Gweilo players using aggregate completed-singles statistics and committed Elo changes over a rolling period. Use win_rate for best performance, sets_won for most sets won, elo_points_gained for most positive Elo earned, net_elo_change for overall Elo movement, draws for most draws, wins for most wins, or matches_played for most active. Returns display names and aggregates only, never contact or authentication data.",
			inputSchema: z.object({
				days: z
					.number()
					.int()
					.min(1)
					.max(365)
					.default(30)
					.describe(
						"Rolling number of days to include. Use 30 for 'last month'.",
					),
				sort_by: z
					.enum([
						"win_rate",
						"wins",
						"draws",
						"losses",
						"matches_played",
						"sets_won",
						"sets_lost",
						"set_difference",
						"elo_points_gained",
						"elo_points_lost",
						"net_elo_change",
					])
					.default("win_rate")
					.describe(
						"Statistic used to rank players. Elo metrics come from committed match history, not recalculation.",
					),
				minimum_matches: z
					.number()
					.int()
					.min(1)
					.max(100)
					.default(3)
					.describe(
						"Minimum completed singles matches in the period. The default avoids ranking tiny one-match samples as best.",
					),
				limit: z
					.number()
					.int()
					.min(1)
					.max(20)
					.default(10)
					.describe("Maximum number of ranked players to return."),
			}),
			annotations: readOnlyAnnotations,
			_meta: oauthToolMetadata,
		},
		async ({ days, sort_by: sortBy, minimum_matches, limit }) => {
			try {
				return toolResult(
					await getGeneralSinglesStatistics({
						days,
						sortBy,
						minimumMatches: minimum_matches,
						limit,
					}),
				);
			} catch (error) {
				return toolError(error);
			}
		},
	);

	server.registerTool(
		"head_to_head",
		{
			title: "My Head-to-Head",
			description:
				"Return the authenticated player's singles record against a named opponent, including wins, losses, win rate, sets, and recent meetings. For natural-language questions such as 'How did I play against Andrej?', pass opponent_name. An opponent_id from recent_matches is also accepted.",
			inputSchema: z
				.object({
					opponent_name: z
						.string()
						.trim()
						.min(1)
						.max(100)
						.optional()
						.describe(
							"The opponent's display name, first name, or other unambiguous name from the authenticated player's own match history.",
						),
					opponent_id: z
						.string()
						.uuid()
						.optional()
						.describe(
							"Optional Gweilo player ID previously returned by recent_matches.",
						),
					recent_limit: z
						.number()
						.int()
						.min(1)
						.max(20)
						.default(10)
						.describe(
							"Number of recent meetings to return (1-20).",
						),
				})
				.refine(
					({ opponent_id: opponentId, opponent_name: opponentName }) =>
						Boolean(opponentId) !== Boolean(opponentName),
					{
						message:
							"Provide exactly one of opponent_name or opponent_id.",
					},
				),
			annotations: readOnlyAnnotations,
			_meta: oauthToolMetadata,
		},
		async ({
			opponent_name: opponentName,
			opponent_id: opponentId,
			recent_limit: recentLimit,
		}) => {
			try {
				if (opponentName) {
					return toolResult(
						await getOwnHeadToHeadByName(
							userId,
							opponentName,
							recentLimit,
						),
					);
				}

				if (!opponentId) {
					throw new McpTableTennisError(
						"Provide an opponent name or opponent ID.",
						"INVALID_OPPONENT",
					);
				}

				return toolResult(
					await getOwnHeadToHead(userId, opponentId, recentLimit),
				);
			} catch (error) {
				return toolError(error);
			}
		},
	);

	return server;
}
