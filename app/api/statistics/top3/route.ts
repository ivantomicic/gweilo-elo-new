import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getLatestTwoCompletedSessions } from "@/lib/elo/rank-movements";
import {
	MAX_SINGLES_INACTIVITY_DAYS,
	MIN_SINGLES_MATCHES,
} from "@/lib/statistics/min-matches";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProviderAvatarFromMetadata } from "@/lib/profile-avatar";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const dynamic = "force-dynamic";

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

type RecentSessionRecord = {
	id: string;
};

type RecentSinglesMatchRecord = {
	player_ids: string[] | null;
};

type SinglesRatingRecord = {
	player_id: string;
	matches_played: number | null;
	elo: number | null;
};

type SessionSnapshotRecord = {
	entity_id: string;
	matches_played: number | null;
	elo: number | string | null;
};

function toNumber(value: unknown, fallback = 0): number {
	if (typeof value === "number") {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	}

	return fallback;
}

/**
 * GET /api/statistics/top3
 *
 * Lightweight endpoint to fetch top 3 players by Elo (singles only)
 * Optimized for dashboard widget - no rank movements, no doubles, minimal data fetching
 *
 * Security:
 * - Requires authentication
 * - Returns only top 3 players with basic info
 */
export async function GET(request: NextRequest) {
	try {
		// Get JWT token from Authorization header
		const authHeader = request.headers.get("authorization");
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 }
			);
		}

		const token = authHeader.replace("Bearer ", "");

		// Create Supabase client with user's JWT token (so RLS works correctly)
		const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
			global: {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		});

		// Verify user is authenticated
		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser(token);

		if (userError || !user) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 }
			);
		}

		const adminClient = createAdminClient();
		const cutoffDate = new Date(
			Date.now() - MAX_SINGLES_INACTIVITY_DAYS * 24 * 60 * 60 * 1000,
		).toISOString();

		const { data: recentSessions, error: sessionsError } = await adminClient
			.from("sessions")
			.select("id")
			.eq("status", "completed")
			.gte("completed_at", cutoffDate);

		if (sessionsError) {
			console.error(
				"Error fetching recent completed sessions for top 3:",
				sessionsError,
			);
			return NextResponse.json(
				{ error: "Failed to fetch top players" },
				{ status: 500 },
			);
		}

		const sessionIds = ((recentSessions || []) as RecentSessionRecord[]).map(
			(session) => session.id,
		);

		if (sessionIds.length === 0) {
			return NextResponse.json({ data: [] });
		}

		const { data: recentSinglesMatches, error: matchesError } = await adminClient
			.from("session_matches")
			.select("player_ids")
			.eq("match_type", "singles")
			.eq("status", "completed")
			.in("session_id", sessionIds);

		if (matchesError) {
			console.error(
				"Error fetching recent singles matches for top 3:",
				matchesError,
			);
			return NextResponse.json(
				{ error: "Failed to fetch top players" },
				{ status: 500 },
			);
		}

		const activePlayerIds = new Set<string>();
		for (const match of (recentSinglesMatches ||
			[]) as RecentSinglesMatchRecord[]) {
			const playerIds = match.player_ids || [];
			for (const playerId of playerIds.slice(0, 2)) {
				if (playerId) {
					activePlayerIds.add(playerId);
				}
			}
		}

		if (activePlayerIds.size === 0) {
			return NextResponse.json({ data: [] });
		}

		const [latestSessionId] = await getLatestTwoCompletedSessions();
		let sourceRows: SinglesRatingRecord[] = [];

		if (latestSessionId) {
			const { data: snapshotRows, error: snapshotError } = await adminClient
				.from("session_rating_snapshots")
				.select("entity_id, matches_played, elo")
				.eq("session_id", latestSessionId)
				.eq("entity_type", "player_singles")
				.order("elo", { ascending: false });

			if (snapshotError) {
				console.error(
					"Error fetching top 3 singles snapshots:",
					snapshotError,
				);
				return NextResponse.json(
					{ error: "Failed to fetch top players" },
					{ status: 500 },
				);
			}

			sourceRows = ((snapshotRows || []) as SessionSnapshotRecord[]).map(
				(row) => ({
					player_id: row.entity_id,
					matches_played: row.matches_played,
					elo: toNumber(row.elo, 1500),
				}),
			);
		}

		if (sourceRows.length === 0) {
			const { data: singlesRatings, error: singlesError } = await adminClient
				.from("player_ratings")
				.select("player_id, elo, matches_played")
				.order("elo", { ascending: false });

			if (singlesError) {
				console.error("Error fetching top 3 players:", singlesError);
				return NextResponse.json(
					{ error: "Failed to fetch top players" },
					{ status: 500 },
				);
			}

			sourceRows = (singlesRatings || []) as SinglesRatingRecord[];
		}

		const topSinglesRatings = sourceRows
			.filter(
				(rating) =>
					(rating.matches_played ?? 0) >= MIN_SINGLES_MATCHES &&
					activePlayerIds.has(rating.player_id),
			)
			.sort(
				(a, b) =>
					toNumber(b.elo, 1500) - toNumber(a.elo, 1500) ||
					a.player_id.localeCompare(b.player_id),
			)
			.slice(0, 3);

		if (topSinglesRatings.length === 0) {
			return NextResponse.json({ data: [] });
		}

		// Get player IDs
		const playerIds = topSinglesRatings.map((r) => r.player_id);

		// Fetch user profiles from database (fast!) instead of Auth Admin API (slow!)
		const { data: profiles, error: profilesError } = await adminClient
			.from("profiles")
			.select("id, display_name, avatar_url")
			.in("id", playerIds);

		if (profilesError) {
			console.error("Error fetching profiles:", profilesError);
		}

		// Create lookup map
		const profilesMap = new Map(
			(profiles || []).map((p) => [p.id, p])
		);
		const missingAvatarIds = playerIds.filter(
			(playerId) => !profilesMap.get(playerId)?.avatar_url,
		);
		const authUsersById = new Map<
			string,
			{ user_metadata?: Record<string, unknown> | null }
		>();

		if (missingAvatarIds.length > 0) {
			const authUsers = await Promise.all(
				missingAvatarIds.map(async (playerId) => {
					const { data, error } =
						await adminClient.auth.admin.getUserById(playerId);

					if (error || !data.user) {
						console.error(
							`Error fetching top 3 avatar fallback for ${playerId}:`,
							error,
						);
						return null;
					}

					return data.user;
				}),
			);

			authUsers.forEach((authUser) => {
				if (authUser) {
					authUsersById.set(authUser.id, authUser);
				}
			});
		}

		// Build response with top 3 players
		const top3Stats = topSinglesRatings.map((rating) => {
			const profile = profilesMap.get(rating.player_id);
			const authUser = authUsersById.get(rating.player_id);
			return {
				player_id: rating.player_id,
				display_name: profile?.display_name || "User",
				avatar:
					profile?.avatar_url ||
					getProviderAvatarFromMetadata(authUser?.user_metadata) ||
					null,
				elo: toNumber(rating.elo, 1500),
			};
		});

		return NextResponse.json({ data: top3Stats });
	} catch (error) {
		console.error("Unexpected error in GET /api/statistics/top3:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
