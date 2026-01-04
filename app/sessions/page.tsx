"use client";

import { useEffect, useState, useCallback } from "react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { Stack } from "@/components/ui/stack";
import { InfiniteScroll } from "@/components/ui/infinite-scroll";
import { supabase } from "@/lib/supabase/client";
import { createClient } from "@supabase/supabase-js";
import { SessionCard } from "./_components/session-card";
import { SessionsLayout, SessionsState } from "./_components/sessions-layout";
import { t } from "@/lib/i18n";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type BestWorstPlayer = {
	best_player_id: string | null;
	best_player_display_name: string | null;
	best_player_delta: number | null;
	worst_player_id: string | null;
	worst_player_display_name: string | null;
	worst_player_delta: number | null;
};

type Session = {
	id: string;
	player_count: number;
	created_at: string;
	status: "active" | "completed";
	completed_at?: string | null;
	singles_match_count: number;
	doubles_match_count: number;
	best_worst_player?: BestWorstPlayer | null;
};

const PAGE_SIZE = 5;

function SessionsPageContent() {
	const [sessions, setSessions] = useState<Session[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [hasMore, setHasMore] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Fetch sessions with pagination
	const fetchSessions = useCallback(
		async (offset: number = 0, append: boolean = false) => {
			try {
				if (append) {
					setLoadingMore(true);
				} else {
					setLoading(true);
				}
				setError(null);

				const {
					data: { session: authSession },
				} = await supabase.auth.getSession();

				if (!authSession) {
					setError(t.sessions.error.notAuthenticated);
					return;
				}

				const supabaseClient = createClient(
					supabaseUrl,
					supabaseAnonKey,
					{
						global: {
							headers: {
								Authorization: `Bearer ${authSession.access_token}`,
							},
						},
					}
				);

				const {
					data: { user: currentUser },
				} = await supabaseClient.auth.getUser();

				if (!currentUser) {
					setError(t.sessions.error.notAuthenticated);
					return;
				}

				// Fetch paginated sessions
				const { data: sessionsData, error: sessionsError } =
					await supabaseClient
						.from("sessions")
						.select("*")
						.eq("created_by", currentUser.id)
						.order("created_at", { ascending: false })
						.range(offset, offset + PAGE_SIZE - 1);

				if (sessionsError) {
					console.error("Error fetching sessions:", sessionsError);
					setError(t.sessions.error.fetchFailed);
					return;
				}

				const newSessions = sessionsData || [];

				// If no sessions, skip match count fetching
				if (newSessions.length === 0) {
					if (append) {
						setSessions((prev) => [...prev, ...newSessions]);
					} else {
						setSessions(newSessions);
					}
					setHasMore(false);
					return;
				}

				// Batch fetch match counts for all sessions
				const sessionIds = newSessions.map((s) => s.id);

				// Fetch match counts grouped by session_id and match_type
				// Using a single query with filters for efficiency
				const { data: matchCounts, error: matchCountsError } =
					await supabaseClient
						.from("session_matches")
						.select("session_id, match_type")
						.in("session_id", sessionIds)
						.eq("status", "completed");

				if (matchCountsError) {
					console.error(
						"Error fetching match counts:",
						matchCountsError
					);
					// Non-fatal: continue with zero counts
				}

				// Aggregate match counts by session_id and match_type
				const countsMap = new Map<
					string,
					{ singles: number; doubles: number }
				>();

				// Initialize all sessions with zero counts
				sessionIds.forEach((sessionId) => {
					countsMap.set(sessionId, { singles: 0, doubles: 0 });
				});

				// Aggregate counts from query results
				if (matchCounts) {
					matchCounts.forEach((match) => {
						const counts = countsMap.get(match.session_id) || {
							singles: 0,
							doubles: 0,
						};
						if (match.match_type === "singles") {
							counts.singles += 1;
						} else if (match.match_type === "doubles") {
							counts.doubles += 1;
						}
						countsMap.set(match.session_id, counts);
					});
				}

				// Merge match counts into sessions
				const sessionsWithCounts = newSessions.map((session) => {
					const counts = countsMap.get(session.id) || {
						singles: 0,
						doubles: 0,
					};
					return {
						...session,
						singles_match_count: counts.singles,
						doubles_match_count: counts.doubles,
					};
				});

				// Fetch best/worst player data for completed sessions
				const completedSessions = sessionsWithCounts.filter(
					(s) => s.status === "completed"
				);

				// Batch fetch best/worst player data in parallel
				const bestWorstPromises = completedSessions.map(
					async (session) => {
						try {
							const response = await fetch(
								`/api/sessions/${session.id}/best-worst-player`,
								{
									headers: {
										Authorization: `Bearer ${authSession.access_token}`,
									},
								}
							);

							if (!response.ok) {
								console.error(
									`Failed to fetch best/worst for session ${session.id}`
								);
								return { sessionId: session.id, data: null };
							}

							const data = await response.json();
							return { sessionId: session.id, data };
						} catch (err) {
							console.error(
								`Error fetching best/worst for session ${session.id}:`,
								err
							);
							return { sessionId: session.id, data: null };
						}
					}
				);

				const bestWorstResults = await Promise.all(bestWorstPromises);

				// Create map of sessionId -> best/worst data
				const bestWorstMap = new Map<string, BestWorstPlayer | null>();
				bestWorstResults.forEach((result) => {
					bestWorstMap.set(result.sessionId, result.data);
				});

				// Merge best/worst player data into sessions
				const sessionsWithAllData = sessionsWithCounts.map(
					(session) => ({
						...session,
						best_worst_player: bestWorstMap.get(session.id) || null,
					})
				);

				if (append) {
					setSessions((prev) => [...prev, ...sessionsWithAllData]);
				} else {
					setSessions(sessionsWithAllData);
				}

				// Check if there are more items to load
				setHasMore(newSessions.length === PAGE_SIZE);
			} catch (err) {
				console.error("Error fetching sessions:", err);
				setError(t.sessions.error.fetchFailed);
			} finally {
				setLoading(false);
				setLoadingMore(false);
			}
		},
		[]
	);

	// Initial load
	useEffect(() => {
		fetchSessions(0, false);
	}, [fetchSessions]);

	// Load more handler
	const handleLoadMore = useCallback(() => {
		if (!loadingMore && hasMore) {
			fetchSessions(sessions.length, true);
		}
	}, [fetchSessions, loadingMore, hasMore, sessions.length]);

	// Date formatting helpers (Serbian locale)
	const formatDateWeekday = useCallback((dateString: string) => {
		return new Date(dateString).toLocaleDateString("sr-Latn-RS", {
			weekday: "long",
		});
	}, []);

	const formatDateDay = useCallback((dateString: string) => {
		return new Date(dateString).toLocaleDateString("sr-Latn-RS", {
			month: "short",
			day: "numeric",
		});
	}, []);

	const formatDateYear = useCallback((dateString: string) => {
		return new Date(dateString).toLocaleDateString("sr-Latn-RS", {
			year: "numeric",
		});
	}, []);

	if (loading) {
		return <SessionsState message={t.sessions.loading} variant="loading" />;
	}

	if (error) {
		return <SessionsState message={error} variant="error" />;
	}

	return (
		<SessionsLayout>
			{sessions.length === 0 ? (
				<SessionsState
					message={t.sessions.noSessions}
					variant="empty"
				/>
			) : (
				<InfiniteScroll
					hasMore={hasMore}
					loading={loadingMore}
					onLoadMore={handleLoadMore}
				>
					<Stack direction="column" spacing={4}>
						{sessions.map((session) => (
							<SessionCard
								key={session.id}
								session={session}
								formatDateWeekday={formatDateWeekday}
								formatDateDay={formatDateDay}
								formatDateYear={formatDateYear}
							/>
						))}
					</Stack>
				</InfiniteScroll>
			)}
		</SessionsLayout>
	);
}

export default function SessionsPage() {
	return (
		<AuthGuard>
			<SessionsPageContent />
		</AuthGuard>
	);
}
