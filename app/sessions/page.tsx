"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { AuthGuard } from "@/components/auth/auth-guard";
import { useAuth } from "@/lib/auth/useAuth";
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
	const { session: authSession } = useAuth();
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

				// Fetch paginated sessions (all sessions, not filtered by user)
				const { data: sessionsData, error: sessionsError } =
					await supabaseClient
						.from("sessions")
						.select("*")
						.order("created_at", { ascending: false })
						.range(offset, offset + PAGE_SIZE - 1);

				if (sessionsError) {
					console.error("Error fetching sessions:", sessionsError);
					console.error("User ID:", currentUser.id);
					setError(t.sessions.error.fetchFailed);
					return;
				}

				const newSessions = sessionsData || [];

				console.log(`[Sessions] Fetched ${newSessions.length} sessions for user ${currentUser.id}`);

				// If no sessions, skip match count fetching
				if (newSessions.length === 0) {
					console.log(`[Sessions] No sessions found for user ${currentUser.id}`);
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

				// Merge match counts and best/worst player data into sessions
				const sessionsWithCounts = newSessions.map((session: any) => {
					const counts = countsMap.get(session.id) || {
						singles: 0,
						doubles: 0,
					};
					
					// Map best/worst player data from database columns (if available)
					// Fallback to null if not in database (will calculate dynamically)
					const bestWorstPlayer =
						session.best_player_id ||
						session.worst_player_id
							? {
									best_player_id: session.best_player_id || null,
									best_player_display_name:
										session.best_player_display_name || null,
									best_player_delta: session.best_player_delta || null,
									worst_player_id: session.worst_player_id || null,
									worst_player_display_name:
										session.worst_player_display_name || null,
									worst_player_delta: session.worst_player_delta || null,
							  }
							: null;

					return {
						...session,
						singles_match_count: counts.singles,
						doubles_match_count: counts.doubles,
						best_worst_player: bestWorstPlayer,
					};
				});

				// Show sessions immediately (best/worst data from database if available)
				if (append) {
					setSessions((prev) => [...prev, ...sessionsWithCounts]);
				} else {
					setSessions(sessionsWithCounts);
				}

				// Fallback: Calculate best/worst dynamically for completed sessions without stored data
				const completedSessionsNeedingCalc = sessionsWithCounts.filter(
					(s) => s.status === "completed" && !s.best_worst_player
				);

				if (completedSessionsNeedingCalc.length > 0) {
					// Load best/worst data dynamically - update each session individually as data arrives
					completedSessionsNeedingCalc.forEach((session) => {
						fetch(`/api/sessions/${session.id}/best-worst-player`, {
							headers: {
								Authorization: `Bearer ${authSession.access_token}`,
							},
						})
							.then((response) => {
								if (!response.ok) {
									return null;
								}
								return response.json();
							})
							.then((data) => {
								// Update this specific session immediately when data arrives
								setSessions((prev) =>
									prev.map((s) =>
										s.id === session.id
											? { ...s, best_worst_player: data }
											: s
									)
								);
							})
							.catch((err) => {
								console.error(
									`Error fetching best/worst for session ${session.id}:`,
									err
								);
							});
					});
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

	// Initial load and refetch when user changes
	useEffect(() => {
		if (authSession?.user?.id) {
			// Reset state when user changes
			setSessions([]);
			setError(null);
			setHasMore(true);
			// Fetch sessions for new user
			fetchSessions(0, false);
		}
	}, [authSession?.user?.id, fetchSessions]);

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
		return (
			<SessionsLayout>
				<SessionsState message={t.sessions.loading} variant="loading" />
			</SessionsLayout>
		);
	}

	if (error) {
		return (
			<SessionsLayout>
				<SessionsState message={error} variant="error" />
			</SessionsLayout>
		);
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
						{sessions.map((session, index) => (
							<motion.div
								key={session.id}
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{
									duration: 0.3,
									delay: index * 0.1,
									ease: "easeOut",
								}}
							>
								<SessionCard
									session={session}
									formatDateWeekday={formatDateWeekday}
									formatDateDay={formatDateDay}
									formatDateYear={formatDateYear}
								/>
							</motion.div>
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
