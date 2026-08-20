import { NextRequest } from "next/server";
import { verifyAdmin, createAdminClient } from "@/lib/supabase/admin";
import { normalizePlayerIDs } from "@/lib/sessions/player-id";
import {
	currentPendingRoundNumber,
	displayMatchOrder,
	roundMatches,
	totalRoundCount,
	type ScorekeeperMatchRow,
} from "@/lib/sessions/scorekeeper";
import {
	scorekeeperOptions,
	scorekeeperResponse,
} from "@/lib/scorekeeper/http";

export const dynamic = "force-dynamic";

type SessionMatchRecord = ScorekeeperMatchRow & {
	match_type: "singles" | "doubles";
	player_ids: string[];
	is_rated: boolean;
};

export function OPTIONS(request: NextRequest) {
	return scorekeeperOptions(request);
}

export async function GET(request: NextRequest) {
	try {
		const adminUserID = await verifyAdmin(
			request.headers.get("authorization"),
		);
		if (!adminUserID) {
			return scorekeeperResponse(
				request,
				{ error: "Administrator access is required." },
				{ status: 403 },
			);
		}

		const admin = createAdminClient();
		const { data: session, error: sessionError } = await admin
			.from("sessions")
			.select("id, player_count, created_at, status")
			.eq("status", "active")
			.order("created_at", { ascending: false })
			.limit(1)
			.maybeSingle();

		if (sessionError) throw sessionError;
		if (!session) {
			return scorekeeperResponse(request, { session: null });
		}

		const { data: rawMatches, error: matchesError } = await admin
			.from("session_matches")
			.select(
				"id, round_number, match_order, match_type, player_ids, status, team1_score, team2_score, is_rated",
			)
			.eq("session_id", session.id)
			.order("round_number", { ascending: true })
			.order("match_order", { ascending: true });
		if (matchesError) throw matchesError;

		const matches = (rawMatches ?? []) as SessionMatchRecord[];
		const totalRounds = totalRoundCount(matches);
		const currentRound = currentPendingRoundNumber(matches);
		if (currentRound === null) {
			return scorekeeperResponse(request, {
				session,
				currentRound: null,
				totalRounds,
				matches: [],
				finalizing: true,
			});
		}

		const currentMatches = roundMatches(matches, currentRound).map(
			(match) => match as SessionMatchRecord,
		);
		const normalizedPlayersByMatch = new Map(
			currentMatches.map((match) => [
				match.id,
				normalizePlayerIDs(match.player_ids),
			]),
		);
		const participantIDs = Array.from(
			new Set(Array.from(normalizedPlayersByMatch.values()).flat()),
		);

		const [{ data: profiles, error: profilesError }, { data: placeholders, error: placeholdersError }] =
			await Promise.all([
				participantIDs.length > 0
					? admin
							.from("profiles")
							.select("id, display_name, avatar_url")
							.in("id", participantIDs)
					: Promise.resolve({ data: [], error: null }),
				admin
					.from("session_placeholders")
					.select("id, display_name")
					.eq("session_id", session.id),
			]);
		if (profilesError) throw profilesError;
		if (placeholdersError) throw placeholdersError;

		const participants = new Map<
			string,
			{ name: string; avatar: string | null }
		>();
		for (const profile of profiles ?? []) {
			participants.set(profile.id, {
				name: profile.display_name || "Igrač",
				avatar: profile.avatar_url || null,
			});
		}
		for (const placeholder of placeholders ?? []) {
			participants.set(placeholder.id, {
				name: placeholder.display_name || "Gost",
				avatar: null,
			});
		}

		return scorekeeperResponse(request, {
			session,
			currentRound,
			totalRounds,
			finalizing: false,
			matches: currentMatches.map((match) => {
				const playerIDs = normalizedPlayersByMatch.get(match.id) ?? [];
				const sideSize = match.match_type === "doubles" ? 2 : 1;
				const players = playerIDs.map((id) => {
					const participant = participants.get(id);
					return {
						id,
						name: participant?.name ?? "Igrač",
						avatar: participant?.avatar ?? null,
					};
				});

				return {
					id: match.id,
					roundNumber: match.round_number,
					order: displayMatchOrder(match.match_order),
					type: match.match_type,
					isRated: match.is_rated,
					teamOne: players.slice(0, sideSize),
					teamTwo: players.slice(sideSize, sideSize * 2),
					teamOneScore: match.team1_score,
					teamTwoScore: match.team2_score,
					isStaged:
						Number.isInteger(match.team1_score) &&
						Number.isInteger(match.team2_score),
				};
			}),
		});
	} catch (error) {
		console.error("Failed to load scorekeeper context:", error);
		return scorekeeperResponse(
			request,
			{ error: "Current matches could not be loaded." },
			{ status: 500 },
		);
	}
}
