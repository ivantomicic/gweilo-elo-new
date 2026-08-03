import type { SupabaseClient } from "@supabase/supabase-js";
import type {
	SessionLiveActivityAttributes,
	SessionLiveActivityState,
} from "./types";

type SessionRow = {
	id: string;
	status: "active" | "completed";
	player_count: number;
	best_player_display_name: string | null;
	best_player_delta: number | string | null;
	worst_player_display_name: string | null;
	worst_player_delta: number | string | null;
};

type MatchRow = {
	round_number: number;
	match_order: number;
	match_type: "singles" | "doubles";
	player_ids: string[] | null;
	status: "pending" | "completed";
	team1_score: number | null;
	team2_score: number | null;
};

function sideNames(
	playerIDs: string[],
	names: Map<string, string>,
	start: number,
	count: number,
) {
	return playerIDs
		.slice(start, start + count)
		.map((id) => names.get(id.toLowerCase()) ?? "Igrač")
		.join(" & ");
}

function roundedDelta(value: number | string | null) {
	if (value === null) return null;
	const delta = Number(value);
	return Number.isFinite(delta) ? Math.round(delta) : null;
}

export async function buildSessionLiveActivitySnapshot(
	admin: SupabaseClient,
	sessionID: string,
): Promise<{
	attributes: SessionLiveActivityAttributes;
	state: SessionLiveActivityState;
}> {
	const [{ data: session, error: sessionError }, { data: rawMatches, error: matchError }] =
		await Promise.all([
			admin
				.from("sessions")
				.select(
					"id, status, player_count, best_player_display_name, best_player_delta, worst_player_display_name, worst_player_delta",
				)
				.eq("id", sessionID)
				.single(),
			admin
				.from("session_matches")
				.select(
					"round_number, match_order, match_type, player_ids, status, team1_score, team2_score",
				)
				.eq("session_id", sessionID)
				.order("round_number", { ascending: true })
				.order("match_order", { ascending: true }),
		]);
	if (sessionError || !session) throw sessionError ?? new Error("Session not found");
	if (matchError) throw matchError;

	const sessionRow = session as SessionRow;
	const matches = (rawMatches ?? []) as MatchRow[];
	const playerIDs = Array.from(
		new Set(
			matches.flatMap((match) =>
				(match.player_ids ?? []).map((id) => id.toLowerCase()),
			),
		),
	);
	const names = new Map<string, string>();
	if (playerIDs.length > 0) {
		const [profilesResult, placeholdersResult] = await Promise.all([
			admin.from("profiles").select("id, display_name").in("id", playerIDs),
			admin
				.from("session_placeholders")
				.select("id, display_name")
				.eq("session_id", sessionID),
		]);
		if (profilesResult.error || placeholdersResult.error) {
			throw profilesResult.error || placeholdersResult.error;
		}
		const profiles = profilesResult.data;
		for (const profile of profiles ?? []) {
			names.set(
				String(profile.id).toLowerCase(),
				String(profile.display_name ?? "Igrač"),
			);
		}
		for (const placeholder of placeholdersResult.data ?? []) {
			names.set(
				String(placeholder.id).toLowerCase(),
				String(placeholder.display_name),
			);
		}
	}

	const totalRounds = matches.reduce(
		(maximum, match) => Math.max(maximum, match.round_number),
		0,
	);
	const completed = matches.filter((match) => match.status === "completed");
	const pending = matches.filter((match) => match.status !== "completed");
	const currentRound =
		sessionRow.status === "completed"
			? totalRounds
			: (pending[0]?.round_number ?? Math.min(totalRounds, 1));
	const currentMatches = pending
		.filter((match) => match.round_number === currentRound);
	const nextRound = pending.find(
		(match) => match.round_number > currentRound,
	)?.round_number;
	const nextMatches =
		nextRound === undefined
			? []
			: pending.filter((match) => match.round_number === nextRound);
	const latest = completed.at(-1);
	const latestIDs = latest?.player_ids ?? [];
	const latestResult =
		latest &&
		latest.team1_score !== null &&
		latest.team2_score !== null
			? `${sideNames(latestIDs, names, 0, latest.match_type === "doubles" ? 2 : 1)} ${latest.team1_score}–${latest.team2_score} ${sideNames(latestIDs, names, latest.match_type === "doubles" ? 2 : 1, latest.match_type === "doubles" ? 2 : 1)}`
			: null;

	return {
		attributes: {
			sessionID,
			playerCount: sessionRow.player_count,
		},
		state: {
			currentRound,
			totalRounds,
			completedMatches: completed.length,
			totalMatches: matches.length,
			status: sessionRow.status,
			headline:
				sessionRow.status === "completed"
					? "Sesija je završena"
					: `Runda ${currentRound} je spremna`,
			matchups: currentMatches.map((match) => {
				const ids = match.player_ids ?? [];
				const sideSize = match.match_type === "doubles" ? 2 : 1;
				return {
					left: sideNames(ids, names, 0, sideSize),
					right: sideNames(ids, names, sideSize, sideSize),
					kind: match.match_type === "doubles" ? "DUBL" : "SINGL",
				};
			}),
			playerNames: playerIDs.map((id) => names.get(id) ?? "Igrač"),
			nextMatchups: nextMatches.map((match) => {
				const ids = match.player_ids ?? [];
				const sideSize = match.match_type === "doubles" ? 2 : 1;
				return {
					left: sideNames(ids, names, 0, sideSize),
					right: sideNames(ids, names, sideSize, sideSize),
					kind: match.match_type === "doubles" ? "DUBL" : "SINGL",
				};
			}),
			latestResult,
			bestPlayerName: sessionRow.best_player_display_name,
			bestPlayerDelta: roundedDelta(sessionRow.best_player_delta),
			worstPlayerName: sessionRow.worst_player_display_name,
			worstPlayerDelta: roundedDelta(sessionRow.worst_player_delta),
		},
	};
}
