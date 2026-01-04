// TEMPORARY JSON IMPORT – safe to remove after migration

/**
 * JSON Session Parser
 * 
 * Parses and validates JSON session data for import.
 * Maps player names to user IDs and validates match structure.
 */

export type JsonSessionMatch = {
	type: "singles" | "doubles";
	// Singles format
	playerA?: string;
	playerB?: string;
	scoreA?: number;
	scoreB?: number;
	// Doubles format
	team1?: string[];
	team2?: string[];
	team1Score?: number;
	team2Score?: number;
	// Match index for ordering
	match_index?: number;
};

export type JsonSession = {
	started_at: string;
	ended_at: string;
	matches: JsonSessionMatch[];
};

export type PlayerMapping = {
	id: string;
	name: string;
};

export type ParsedMatch = {
	type: "singles" | "doubles";
	playerIds: string[];
	score1: number;
	score2: number;
	matchIndex: number;
	roundNumber: number;
	matchOrder: number;
};

export type ParsedSession = {
	startedAt: string;
	endedAt: string;
	matches: ParsedMatch[];
	playerCount: number;
};

export type ValidationError = {
	field: string;
	message: string;
};

/**
 * Normalize player name for matching (case-insensitive, trimmed)
 */
function normalizeName(name: string): string {
	return name.trim().toLowerCase();
}

/**
 * Find player ID by name (case-insensitive matching)
 */
export function findPlayerByName(
	playerName: string,
	playerMappings: PlayerMapping[]
): string | null {
	const normalized = normalizeName(playerName);
	
	for (const player of playerMappings) {
		if (normalizeName(player.name) === normalized) {
			return player.id;
		}
	}
	
	return null;
}

/**
 * Validate JSON session structure
 */
export function validateJsonSession(
	json: unknown
): { valid: true; data: JsonSession } | { valid: false; errors: ValidationError[] } {
	const errors: ValidationError[] = [];

	if (!json || typeof json !== "object") {
		return {
			valid: false,
			errors: [{ field: "root", message: "Invalid JSON: must be an object" }],
		};
	}

	const session = json as Record<string, unknown>;

	// Validate started_at
	if (!session.started_at || typeof session.started_at !== "string") {
		errors.push({
			field: "started_at",
			message: "started_at is required and must be a string (ISO date)",
		});
	}

	// Validate ended_at
	if (!session.ended_at || typeof session.ended_at !== "string") {
		errors.push({
			field: "ended_at",
			message: "ended_at is required and must be a string (ISO date)",
		});
	}

	// Validate matches array
	if (!session.matches || !Array.isArray(session.matches)) {
		errors.push({
			field: "matches",
			message: "matches is required and must be an array",
		});
		return { valid: false, errors };
	}

	// Validate each match
	const matches = session.matches as unknown[];
	matches.forEach((match, index) => {
		if (!match || typeof match !== "object") {
			errors.push({
				field: `matches[${index}]`,
				message: "Match must be an object",
			});
			return;
		}

		const matchObj = match as Record<string, unknown>;

		// Validate type
		if (matchObj.type !== "singles" && matchObj.type !== "doubles") {
			errors.push({
				field: `matches[${index}].type`,
				message: "type must be 'singles' or 'doubles'",
			});
		}

		if (matchObj.type === "singles") {
			// Validate singles match
			if (!matchObj.playerA || typeof matchObj.playerA !== "string") {
				errors.push({
					field: `matches[${index}].playerA`,
					message: "playerA is required for singles matches",
				});
			}
			if (!matchObj.playerB || typeof matchObj.playerB !== "string") {
				errors.push({
					field: `matches[${index}].playerB`,
					message: "playerB is required for singles matches",
				});
			}
			if (
				matchObj.scoreA === undefined ||
				typeof matchObj.scoreA !== "number"
			) {
				errors.push({
					field: `matches[${index}].scoreA`,
					message: "scoreA is required and must be a number",
				});
			}
			if (
				matchObj.scoreB === undefined ||
				typeof matchObj.scoreB !== "number"
			) {
				errors.push({
					field: `matches[${index}].scoreB`,
					message: "scoreB is required and must be a number",
				});
			}
		} else if (matchObj.type === "doubles") {
			// Validate doubles match
			if (!Array.isArray(matchObj.team1) || matchObj.team1.length !== 2) {
				errors.push({
					field: `matches[${index}].team1`,
					message: "team1 is required and must be an array of 2 player names",
				});
			}
			if (!Array.isArray(matchObj.team2) || matchObj.team2.length !== 2) {
				errors.push({
					field: `matches[${index}].team2`,
					message: "team2 is required and must be an array of 2 player names",
				});
			}
			if (
				matchObj.team1Score === undefined ||
				typeof matchObj.team1Score !== "number"
			) {
				errors.push({
					field: `matches[${index}].team1Score`,
					message: "team1Score is required and must be a number",
				});
			}
			if (
				matchObj.team2Score === undefined ||
				typeof matchObj.team2Score !== "number"
			) {
				errors.push({
					field: `matches[${index}].team2Score`,
					message: "team2Score is required and must be a number",
				});
			}
		}

		// Validate match_index (optional but recommended)
		if (
			matchObj.match_index !== undefined &&
			typeof matchObj.match_index !== "number"
		) {
			errors.push({
				field: `matches[${index}].match_index`,
				message: "match_index must be a number if provided",
			});
		}
	});

	if (errors.length > 0) {
		return { valid: false, errors };
	}

	return {
		valid: true,
		data: session as JsonSession,
	};
}

/**
 * Parse and map JSON session to internal format
 */
export function parseJsonSession(
	jsonSession: JsonSession,
	playerMappings: PlayerMapping[]
): { valid: true; session: ParsedSession } | { valid: false; errors: ValidationError[] } {
	const errors: ValidationError[] = [];
	const parsedMatches: ParsedMatch[] = [];

	// Process each match
	jsonSession.matches.forEach((match, index) => {
		const matchIndex = match.match_index ?? index;

		if (match.type === "singles") {
			// Map singles players
			const playerAId = findPlayerByName(match.playerA!, playerMappings);
			const playerBId = findPlayerByName(match.playerB!, playerMappings);

			if (!playerAId) {
				errors.push({
					field: `matches[${index}].playerA`,
					message: `Player "${match.playerA}" not found in system`,
				});
			}
			if (!playerBId) {
				errors.push({
					field: `matches[${index}].playerB`,
					message: `Player "${match.playerB}" not found in system`,
				});
			}

			if (playerAId && playerBId) {
				// Calculate round and order deterministically
				const roundNumber = Math.floor(matchIndex / 2);
				const matchOrder = matchIndex % 2;

				parsedMatches.push({
					type: "singles",
					playerIds: [playerAId, playerBId],
					score1: match.scoreA!,
					score2: match.scoreB!,
					matchIndex,
					roundNumber,
					matchOrder,
				});
			}
		} else if (match.type === "doubles") {
			// Map doubles teams
			const team1Player1Id = findPlayerByName(match.team1![0], playerMappings);
			const team1Player2Id = findPlayerByName(match.team1![1], playerMappings);
			const team2Player1Id = findPlayerByName(match.team2![0], playerMappings);
			const team2Player2Id = findPlayerByName(match.team2![1], playerMappings);

			if (!team1Player1Id) {
				errors.push({
					field: `matches[${index}].team1[0]`,
					message: `Player "${match.team1![0]}" not found in system`,
				});
			}
			if (!team1Player2Id) {
				errors.push({
					field: `matches[${index}].team1[1]`,
					message: `Player "${match.team1![1]}" not found in system`,
				});
			}
			if (!team2Player1Id) {
				errors.push({
					field: `matches[${index}].team2[0]`,
					message: `Player "${match.team2![0]}" not found in system`,
				});
			}
			if (!team2Player2Id) {
				errors.push({
					field: `matches[${index}].team2[1]`,
					message: `Player "${match.team2![1]}" not found in system`,
				});
			}

			if (
				team1Player1Id &&
				team1Player2Id &&
				team2Player1Id &&
				team2Player2Id
			) {
				// Calculate round and order deterministically
				const roundNumber = Math.floor(matchIndex / 2);
				const matchOrder = matchIndex % 2;

				parsedMatches.push({
					type: "doubles",
					playerIds: [
						team1Player1Id,
						team1Player2Id,
						team2Player1Id,
						team2Player2Id,
					],
					score1: match.team1Score!,
					score2: match.team2Score!,
					matchIndex,
					roundNumber,
					matchOrder,
				});
			}
		}
	});

	if (errors.length > 0) {
		return { valid: false, errors };
	}

	// Calculate unique player count
	const uniquePlayerIds = new Set<string>();
	parsedMatches.forEach((match) => {
		match.playerIds.forEach((id) => uniquePlayerIds.add(id));
	});

	return {
		valid: true,
		session: {
			startedAt: jsonSession.started_at,
			endedAt: jsonSession.ended_at,
			matches: parsedMatches.sort((a, b) => a.matchIndex - b.matchIndex),
			playerCount: uniquePlayerIds.size,
		},
	};
}

