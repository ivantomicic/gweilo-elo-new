import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
	getOwnHeadToHead,
	getOwnPerformanceSummary,
	getOwnRecentMatches,
	McpTableTennisError,
} from "@/lib/mcp/table-tennis";

const readOnlyAnnotations = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false,
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
				"Read-only singles statistics for the authenticated Gweilo player. All results are scoped to that player; do not infer data for other players.",
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
		"head_to_head",
		{
			title: "My Head-to-Head",
			description:
				"Return the authenticated player's singles record against one opponent. Use an opponent ID previously returned by recent_matches.",
			inputSchema: z.object({
				opponent_id: z
					.string()
					.uuid()
					.describe("The selected opponent's Gweilo player ID."),
				recent_limit: z
					.number()
					.int()
					.min(1)
					.max(20)
					.default(10)
					.describe("Number of recent meetings to return (1-20)."),
			}),
			annotations: readOnlyAnnotations,
		},
		async ({
			opponent_id: opponentId,
			recent_limit: recentLimit,
		}) => {
			try {
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
