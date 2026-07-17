import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	// Use the final request origin so Action calls do not cross a hostname
	// redirect and lose their Authorization header.
	const serverUrl = request.nextUrl.origin;

	return NextResponse.json(
		{
			openapi: "3.1.0",
				info: {
					title: "Gweilo Statistics API",
					version: "1.0.0",
					description:
						"Read-only access to Gweilo table-tennis ratings, Elo rules and scenarios, recent form, rivalries, and head-to-head statistics. Use these operations for every factual Gweilo answer and never invent missing data or calculate Elo independently.",
			},
			servers: [{ url: serverUrl }],
			security: [{ bearerAuth: [] }],
			paths: {
				"/api/gpt/leaderboard": {
					get: {
						operationId: "getGweiloLeaderboard",
						summary: "Get the current player leaderboard",
						description:
							"Returns ranked singles or doubles-player ratings with match records and win rates. Use the default minimum match threshold unless the user asks to include provisional players.",
						parameters: [
							{
								name: "mode",
								in: "query",
								required: false,
								schema: {
									type: "string",
									enum: ["singles", "doubles"],
									default: "singles",
								},
							},
							{
								name: "limit",
								in: "query",
								required: false,
								schema: {
									type: "integer",
									minimum: 1,
									maximum: 50,
									default: 20,
								},
							},
							{
								name: "minimum_matches",
								in: "query",
								required: false,
								description:
									"Override the ranked-player minimum. Use 0 only when the user asks for all or provisional players.",
								schema: {
									type: "integer",
									minimum: 0,
									maximum: 1000,
								},
							},
						],
						responses: {
							"200": { description: "Leaderboard statistics" },
							"401": { description: "Invalid API key" },
						},
					},
				},
				"/api/gpt/player": {
					get: {
						operationId: "getGweiloPlayerSummary",
						summary: "Get one player's singles and doubles summary",
						description:
							"Searches by display name. If a name is ambiguous, ask the user which returned player they mean.",
						parameters: [
							{
								name: "name",
								in: "query",
								required: true,
								schema: { type: "string", maxLength: 100 },
							},
						],
						responses: {
							"200": { description: "Player statistics" },
							"404": { description: "Player not found" },
							"409": { description: "Ambiguous player name" },
						},
					},
				},
				"/api/gpt/head-to-head": {
					get: {
						operationId: "getGweiloHeadToHead",
						summary: "Get all-time singles head-to-head statistics",
						description:
							"Returns the first named player's record against the opponent, plus the ten most recent match results.",
						parameters: [
							{
								name: "player",
								in: "query",
								required: true,
								schema: { type: "string", maxLength: 100 },
							},
							{
								name: "opponent",
								in: "query",
								required: true,
								schema: { type: "string", maxLength: 100 },
							},
						],
						responses: {
							"200": { description: "Head-to-head statistics" },
							"404": { description: "Player not found" },
							"409": { description: "Ambiguous player name" },
						},
					},
				},
				"/api/gpt/player-trend": {
					get: {
						operationId: "getGweiloPlayerTrend",
						summary: "Get a player's recent singles form and Elo trend",
						description:
							"Returns recent completed singles matches, opponents, results, Elo changes, current Elo, and career high and low Elo. Use this for recent-form and rating-history questions.",
						parameters: [
							{
								name: "name",
								in: "query",
								required: true,
								schema: { type: "string", maxLength: 100 },
							},
							{
								name: "limit",
								in: "query",
								required: false,
								schema: {
									type: "integer",
									minimum: 1,
									maximum: 100,
									default: 20,
								},
							},
						],
						responses: {
							"200": { description: "Player form and Elo trend" },
							"404": { description: "Player not found" },
							"409": { description: "Ambiguous player name" },
						},
					},
				},
				"/api/gpt/rivalries": {
					get: {
						operationId: "getGweiloPlayerRivalries",
						summary: "Get a player's most-played singles rivalries",
						description:
							"Returns the player's most-played singles opponents with all-time records, win rates, last-played dates, and current streaks.",
						parameters: [
							{
								name: "name",
								in: "query",
								required: true,
								schema: { type: "string", maxLength: 100 },
							},
							{
								name: "limit",
								in: "query",
								required: false,
								schema: {
									type: "integer",
									minimum: 1,
									maximum: 30,
									default: 10,
								},
							},
						],
						responses: {
							"200": { description: "Player rivalry statistics" },
							"404": { description: "Player not found" },
							"409": { description: "Ambiguous player name" },
						},
					},
				},
				"/api/gpt/elo-rules": {
					get: {
						operationId: "getGweiloEloRules",
						summary: "Get the official Gweilo Elo calculation rules",
						description:
							"Returns the starting rating, formula, actual scores, dynamic K-factors, decimal-precision behavior, leaderboard thresholds, and the separate singles and doubles systems. Use this operation instead of relying on general Elo knowledge.",
						responses: {
							"200": { description: "Official Gweilo Elo rules" },
							"401": { description: "Invalid API key" },
						},
					},
				},
				"/api/gpt/elo-scenario": {
					get: {
						operationId: "calculateGweiloSinglesEloScenario",
						summary: "Calculate exact singles Elo outcomes for a next match",
						description:
							"Uses the same calculation code as real Gweilo match updates. With an opponent, returns both players' projected Elo after a win, draw, or loss. With target_elo, reports which outcomes reach it. With target_player, reports which outcomes overtake that player's projected Elo, including when the target player is also the opponent. If the opponent is unknown, it reports the minimum opponent Elo needed. Use current data returned by this operation; never calculate the result yourself.",
						parameters: [
							{
								name: "player",
								in: "query",
								required: true,
								schema: { type: "string", maxLength: 100 },
							},
							{
								name: "opponent",
								in: "query",
								required: false,
								description:
									"The next opponent's Gweilo display name. Optional if a target is provided.",
								schema: { type: "string", maxLength: 100 },
							},
							{
								name: "target_player",
								in: "query",
								required: false,
								description:
									"Optional Gweilo display name of the player to overtake. Do not send this together with target_elo.",
								schema: { type: "string", maxLength: 100 },
							},
							{
								name: "target_elo",
								in: "query",
								required: false,
								description:
									"Optional singles Elo target the player wants to reach or exceed after the match.",
								schema: {
									type: "number",
									minimum: 500,
									maximum: 4000,
								},
							},
						],
						responses: {
							"200": { description: "Singles Elo scenario" },
							"400": { description: "Missing or invalid scenario input" },
							"404": { description: "Player not found" },
							"409": { description: "Ambiguous player name" },
						},
					},
				},
			},
			components: {
				schemas: {},
				securitySchemes: {
					bearerAuth: {
						type: "http",
						scheme: "bearer",
						description:
							"Use the private GPT_STATS_API_KEY configured on the Gweilo server.",
					},
				},
			},
		},
		{
			headers: {
				"Cache-Control": "public, max-age=300",
			},
		},
	);
}
