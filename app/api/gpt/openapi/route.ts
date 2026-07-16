import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	const serverUrl = process.env.GPT_STATS_PUBLIC_URL || request.nextUrl.origin;

	return NextResponse.json(
		{
			openapi: "3.1.0",
			info: {
				title: "Gweilo Statistics API",
				version: "1.0.0",
				description:
					"Read-only access to Gweilo table-tennis ratings and head-to-head statistics. Never invent players or statistics; use these operations for factual answers.",
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
			},
			components: {
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
