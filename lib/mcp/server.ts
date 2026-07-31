import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
	getCurrentSinglesLeaderboard,
	getGeneralSinglesStatistics,
	getOwnEloProjection,
	getOwnEloTrend,
	getOwnHeadToHead,
	getOwnHeadToHeadByName,
	getOwnPerformanceSummary,
	getOwnRecentMatches,
	getOwnRivalries,
	getSinglesEloRules,
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

const outcomeSchema = z.enum(["win", "loss", "draw"]);
const generalStatisticsSortSchema = z.enum([
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
]);
const rivalrySortSchema = z.enum([
	"total_matches",
	"closest_record",
	"elo_points_gained",
	"net_elo_change",
]);
const playerNameSchema = z.object({ display_name: z.string() });
const opponentSchema = z.object({
	id: z.string().uuid(),
	display_name: z.string(),
});
const matchSchema = z.object({
	played_at: z.string().nullable(),
	opponent: opponentSchema,
	result: outcomeSchema,
	sets_for: z.number(),
	sets_against: z.number(),
	elo_before: z.number().nullable(),
	elo_after: z.number().nullable(),
	elo_change: z.number().nullable(),
});
const periodSchema = z.object({
	type: z.literal("rolling_days"),
	days: z.number().int(),
	from: z.string(),
	to: z.string(),
});
const eligibilitySchema = z.object({
	minimum_matches: z.number().int(),
	maximum_inactivity_days: z.number().int(),
});
const eligibilityStatusSchema = z.object({
	has_minimum_matches: z.boolean(),
	is_recently_active: z.boolean(),
	matches_needed: z.number().int(),
});
const ratingStatsSchema = z.object({
	display_name: z.string(),
	current_elo: z.number(),
	matches_played: z.number().int(),
	wins: z.number().int(),
	losses: z.number().int(),
	draws: z.number().int(),
	win_rate_percent: z.number(),
	sets_won: z.number(),
	sets_lost: z.number(),
	set_difference: z.number(),
});
const aggregateStatsSchema = z.object({
	matches_played: z.number().int(),
	wins: z.number().int(),
	losses: z.number().int(),
	draws: z.number().int(),
	win_rate_percent: z.number(),
	sets_won: z.number(),
	sets_lost: z.number(),
	set_difference: z.number(),
});
const eloAggregateSchema = z.object({
	elo_points_gained: z.number(),
	elo_points_lost: z.number(),
	net_elo_change: z.number(),
	elo_matches_counted: z.number().int(),
	elo_history_complete: z.boolean(),
});

const recentMatchesOutputSchema = z.object({
	mode: z.literal("singles"),
	returned_matches: z.number().int(),
	matches: z.array(matchSchema),
});
const performanceOutputSchema = z.object({
	mode: z.literal("singles"),
	player: playerNameSchema,
	rating_as_of: z.string().nullable(),
	current_elo: z.number(),
	rank: z.number().int().nullable(),
	ranking_eligible: z.boolean(),
	eligibility: eligibilitySchema,
	eligibility_status: eligibilityStatusSchema,
	matches_played: z.number().int(),
	wins: z.number().int(),
	losses: z.number().int(),
	draws: z.number().int(),
	win_rate_percent: z.number(),
	sets_won: z.number(),
	sets_lost: z.number(),
	set_difference: z.number(),
	recent_form: z.array(outcomeSchema),
	recent_elo_change: z.number(),
	recent_elo_history_complete: z.boolean(),
});
const leaderboardOutputSchema = z.object({
	mode: z.literal("singles"),
	generated_at: z.string(),
	rating_as_of: z.string().nullable(),
	eligibility: eligibilitySchema,
	total_ranked_players: z.number().int(),
	returned_players: z.number().int(),
	players: z.array(ratingStatsSchema.extend({ rank: z.number().int() })),
	authenticated_player: ratingStatsSchema.extend({
		rank: z.number().int().nullable(),
		ranking_eligible: z.boolean(),
		eligibility_status: eligibilityStatusSchema,
	}),
});
const generalStatisticsOutputSchema = z.object({
	mode: z.literal("singles"),
	period: periodSchema,
	sort_by: generalStatisticsSortSchema,
	minimum_matches: z.number().int(),
	returned_players: z.number().int(),
	total_eligible_players: z.number().int(),
	players: z.array(
		aggregateStatsSchema
			.merge(eloAggregateSchema)
			.extend({ rank: z.number().int(), display_name: z.string() }),
	),
});
const headToHeadOutputSchema = z.object({
	mode: z.literal("singles"),
	opponent: opponentSchema,
	total_matches: z.number().int(),
	wins: z.number().int(),
	losses: z.number().int(),
	draws: z.number().int(),
	win_rate_percent: z.number(),
	sets_won: z.number(),
	sets_lost: z.number(),
	set_difference: z.number(),
	recent_matches: z.array(matchSchema),
});
const eloTrendOutputSchema = z.object({
	mode: z.literal("singles"),
	player: playerNameSchema,
	period: periodSchema,
	current_elo: z.number(),
	starting_elo: z.number().nullable(),
	ending_elo: z.number().nullable(),
	net_elo_change: z.number(),
	elo_points_gained: z.number(),
	elo_points_lost: z.number(),
	period_high_elo: z.number().nullable(),
	period_low_elo: z.number().nullable(),
	total_matches: z.number().int(),
	elo_matches_counted: z.number().int(),
	elo_history_complete: z.boolean(),
	returned_matches: z.number().int(),
	matches: z.array(matchSchema),
});
const rivalryOutputSchema = z.object({
	mode: z.literal("singles"),
	sort_by: rivalrySortSchema,
	returned_rivalries: z.number().int(),
	total_opponents: z.number().int(),
	rivalries: z.array(
		aggregateStatsSchema.merge(eloAggregateSchema).extend({
			opponent: playerNameSchema,
			last_played_at: z.string().nullable(),
			current_streak: z
				.object({ result: outcomeSchema, matches: z.number().int() })
				.nullable(),
		}),
	),
});
const eloRulesOutputSchema = z.object({
	mode: z.literal("singles"),
	starting_elo: z.number(),
	formula: z.object({ expected_score: z.string(), new_elo: z.string() }),
	actual_scores: z.object({
		win: z.number(),
		draw: z.number(),
		loss: z.number(),
	}),
	k_factor_by_matches_before_match: z.array(
		z.object({ match_count: z.string(), k_factor: z.number() }),
	),
	ranking_eligibility: eligibilitySchema.extend({ note: z.string() }),
	precision: z.string(),
});
const eloProjectionOutputSchema = z.object({
	mode: z.literal("singles"),
	player: z.object({
		display_name: z.string(),
		current_elo: z.number(),
		matches_played: z.number().int(),
		k_factor: z.number(),
	}),
	opponent: z.object({
		display_name: z.string(),
		current_elo: z.number(),
		matches_played: z.number().int(),
		k_factor: z.number(),
	}),
	outcomes: z.array(
		z.object({
			result: outcomeSchema,
			expected_score: z.number(),
			elo_change: z.number(),
			projected_elo: z.number(),
			opponent_elo_change: z.number(),
			opponent_projected_elo: z.number(),
			would_overtake_opponent: z.boolean(),
		}),
	),
	note: z.string(),
});

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
	const code =
		error instanceof McpTableTennisError
			? error.code
			: "DATA_UNAVAILABLE";
	const structuredContent = { error: { code, message } };

	return {
		isError: true,
		content: [
			{
				type: "text" as const,
				text: JSON.stringify(structuredContent, null, 2),
			},
		],
		structuredContent,
	};
}

export function createGweiloMcpServer(userId: string) {
	const server = new McpServer(
		{
			name: "gweilo-table-tennis",
			version: "0.2.0",
		},
		{
			capabilities: {
				tools: {},
			},
			instructions:
				"Read-only Gweilo singles statistics. Personal tools are scoped to the authenticated player. Use recent_matches for individual results, player_performance for the player's current summary, current_leaderboard for the official current Elo table, and my_elo_trend for rating movement over time. For questions about how the player performed against a named opponent, call head_to_head with opponent_name. Use my_rivalries for recurring-opponent comparisons. For aggregate period questions, call general_statistics: use win_rate with minimum_matches 3 for 'best performance', count metrics with minimum_matches 1 for count-based superlatives, elo_points_gained for positive Elo earned, and net_elo_change for signed movement. Use elo_rules to explain the rating system and elo_projection for hypothetical win/draw/loss changes against a named past opponent.",
		},
	);

	server.registerTool(
		"recent_matches",
		{
			title: "My Recent Matches",
			description:
				"Return the authenticated player's most recent completed singles matches with opponent, result, sets, and exact committed Elo before, after, and change when available. Opponent IDs from this result can be used with head_to_head.",
			inputSchema: z.object({
				limit: z
					.number()
					.int()
					.min(1)
					.max(20)
					.default(10)
					.describe("Number of recent matches to return (1-20)."),
			}),
			outputSchema: recentMatchesOutputSchema,
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
				"Return the authenticated player's all-time singles record and sets, current Elo and official rank eligibility, recent form, and net Elo change across the returned recent matches.",
			inputSchema: z.object({
				recent_limit: z
					.number()
					.int()
					.min(1)
					.max(10)
					.default(5)
					.describe("Number of recent outcomes to include (1-10)."),
			}),
			outputSchema: performanceOutputSchema,
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
		"current_leaderboard",
		{
			title: "Current Singles Leaderboard",
			description:
				"Return the official current singles leaderboard ordered by Elo, including rank, current rating, record, sets, ranking eligibility rules, and the authenticated player's own position. Use this for 'Who is number one?', current-rank, and current-Elo questions; use general_statistics for a historical rolling period.",
			inputSchema: z.object({
				limit: z
					.number()
					.int()
					.min(1)
					.max(50)
					.default(20)
					.describe("Maximum number of ranked players to return (1-50)."),
			}),
			outputSchema: leaderboardOutputSchema,
			annotations: readOnlyAnnotations,
			_meta: oauthToolMetadata,
		},
		async ({ limit }) => {
			try {
				return toolResult(
					await getCurrentSinglesLeaderboard(userId, limit),
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
				sort_by: generalStatisticsSortSchema
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
			outputSchema: generalStatisticsOutputSchema,
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
		"my_elo_trend",
		{
			title: "My Elo Trend",
			description:
				"Return the authenticated player's Elo movement over a rolling period, including starting/current/ending Elo, high and low, points gained and lost, net change, and recent matches with their exact committed Elo changes.",
			inputSchema: z.object({
				days: z
					.number()
					.int()
					.min(1)
					.max(365)
					.default(30)
					.describe("Rolling number of days to include (1-365)."),
				limit: z
					.number()
					.int()
					.min(1)
					.max(50)
					.default(20)
					.describe(
						"Maximum number of individual matches to include (1-50).",
					),
			}),
			outputSchema: eloTrendOutputSchema,
			annotations: readOnlyAnnotations,
			_meta: oauthToolMetadata,
		},
		async ({ days, limit }) => {
			try {
				return toolResult(
					await getOwnEloTrend(userId, { days, limit }),
				);
			} catch (error) {
				return toolError(error);
			}
		},
	);

	server.registerTool(
		"my_rivalries",
		{
			title: "My Rivalries",
			description:
				"Compare the authenticated player's completed singles history across past opponents. Rank rivalries by meetings, closest win-loss record, Elo gained, or net Elo change, with sets and the current result streak for each opponent.",
			inputSchema: z.object({
				sort_by: rivalrySortSchema
					.default("total_matches")
					.describe("How to order the authenticated player's rivals."),
				limit: z
					.number()
					.int()
					.min(1)
					.max(20)
					.default(10)
					.describe("Maximum number of rivalries to return (1-20)."),
			}),
			outputSchema: rivalryOutputSchema,
			annotations: readOnlyAnnotations,
			_meta: oauthToolMetadata,
		},
		async ({ sort_by: sortBy, limit }) => {
			try {
				return toolResult(
					await getOwnRivalries(userId, { sortBy, limit }),
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
				"Return the authenticated player's singles record against a named opponent, including wins, losses, win rate, sets, and recent meetings with committed Elo changes. For natural-language questions such as 'How did I play against Andrej?', pass opponent_name. An opponent_id from recent_matches is also accepted.",
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
			outputSchema: headToHeadOutputSchema,
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

	server.registerTool(
		"elo_rules",
		{
			title: "Gweilo Elo Rules",
			description:
				"Explain the exact Gweilo singles Elo formula, result scores, experience-based K-factors, starting rating, precision, and official leaderboard eligibility. This tool does not read another player's private data.",
			inputSchema: z.object({}),
			outputSchema: eloRulesOutputSchema,
			annotations: readOnlyAnnotations,
			_meta: oauthToolMetadata,
		},
		async () => toolResult(getSinglesEloRules()),
	);

	server.registerTool(
		"elo_projection",
		{
			title: "My Elo Projection",
			description:
				"Project the authenticated player's and a named past opponent's Elo after a hypothetical win, draw, or loss using their current ratings and K-factors. The opponent name is resolved only from the authenticated player's completed singles history.",
			inputSchema: z.object({
				opponent_name: z
					.string()
					.trim()
					.min(1)
					.max(100)
					.describe(
						"A full or unambiguous name from the authenticated player's past opponents.",
					),
			}),
			outputSchema: eloProjectionOutputSchema,
			annotations: readOnlyAnnotations,
			_meta: oauthToolMetadata,
		},
		async ({ opponent_name: opponentName }) => {
			try {
				return toolResult(
					await getOwnEloProjection(userId, opponentName),
				);
			} catch (error) {
				return toolError(error);
			}
		},
	);

	return server;
}
