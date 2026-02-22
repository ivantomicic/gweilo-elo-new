"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AuthGuard } from "@/components/auth/auth-guard";
import { useAuth } from "@/lib/auth/useAuth";
import { Stack } from "@/components/ui/stack";
import { InfiniteScroll } from "@/components/ui/infinite-scroll";
import { supabase } from "@/lib/supabase/client";
import { SessionCard } from "./_components/session-card";
import { SessionsLayout, SessionsState } from "./_components/sessions-layout";
import { t } from "@/lib/i18n";

const listTransition = {
	duration: 0.2,
	ease: [0.25, 0.46, 0.45, 0.94] as const,
};

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
	const shouldReduceMotion = useReducedMotion();
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

				if (!authSession) {
					setError(t.sessions.error.notAuthenticated);
					return;
				}

				// Fetch paginated sessions (all sessions, not filtered by user)
				const { data: sessionsData, error: sessionsError } =
					await supabase
						.from("sessions")
						.select(
							"id, player_count, created_at, status, completed_at, best_player_id, best_player_display_name, best_player_delta, worst_player_id, worst_player_display_name, worst_player_delta",
						)
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
						if (!append) {
							setSessions([]);
						}
						setHasMore(false);
						return;
					}

				// Batch fetch match counts for all sessions
				const sessionIds = newSessions.map((s) => s.id);

				// Resolve latest player names for best/worst badges
				// Keep stored names only as fallback when profile lookup misses.
				const bestWorstPlayerIds = Array.from(
					new Set(
						newSessions
							.flatMap((session: any) => [
								session.best_player_id,
								session.worst_player_id,
							])
							.filter(Boolean),
					),
				) as string[];

				const [matchCountsResult, profilesResult] = await Promise.all([
					supabase
						.from("session_matches")
						.select("session_id, match_type")
						.in("session_id", sessionIds)
						.eq("status", "completed"),
					bestWorstPlayerIds.length > 0
						? supabase
								.from("profiles")
								.select("id, display_name")
								.in("id", bestWorstPlayerIds)
						: Promise.resolve({ data: [], error: null }),
				]);

				if (matchCountsResult.error) {
					console.error(
						"Error fetching match counts:",
						matchCountsResult.error,
					);
				}

				// Aggregate match counts by session_id and match_type
				const countsMap = new Map<
					string,
					{ singles: number; doubles: number }
				>();

				sessionIds.forEach((sessionId) => {
					countsMap.set(sessionId, { singles: 0, doubles: 0 });
				});

				(matchCountsResult.data || []).forEach((match) => {
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

				const bestWorstNameMap = new Map<string, string>();
				if (profilesResult.error) {
					console.error(
						"Error fetching best/worst player names:",
						profilesResult.error,
					);
				} else {
					(profilesResult.data || []).forEach((profile: any) => {
						bestWorstNameMap.set(
							profile.id,
							profile.display_name || "User",
						);
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
										(session.best_player_id
											? bestWorstNameMap.get(
													session.best_player_id,
												)
											: null) ||
										session.best_player_display_name ||
										null,
									best_player_delta: session.best_player_delta || null,
									worst_player_id: session.worst_player_id || null,
									worst_player_display_name:
										(session.worst_player_id
											? bestWorstNameMap.get(
													session.worst_player_id,
												)
											: null) ||
										session.worst_player_display_name ||
										null,
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
		[authSession]
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
				<motion.div
					initial={
						shouldReduceMotion ? false : { opacity: 0, y: 8 }
					}
					animate={{ opacity: 1, y: 0 }}
					transition={listTransition}
				>
					<SessionsState message={t.sessions.loading} variant="loading" />
				</motion.div>
			</SessionsLayout>
		);
	}

	if (error) {
		return (
			<SessionsLayout>
				<motion.div
					initial={
						shouldReduceMotion ? false : { opacity: 0, y: 8 }
					}
					animate={{ opacity: 1, y: 0 }}
					transition={listTransition}
				>
					<SessionsState message={error} variant="error" />
				</motion.div>
			</SessionsLayout>
		);
	}

	return (
		<SessionsLayout>
			{sessions.length === 0 ? (
				<motion.div
					initial={
						shouldReduceMotion ? false : { opacity: 0, y: 8 }
					}
					animate={{ opacity: 1, y: 0 }}
					transition={listTransition}
				>
					<SessionsState
						message={t.sessions.noSessions}
						variant="empty"
					/>
				</motion.div>
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
								initial={
									shouldReduceMotion
										? false
										: { opacity: 0, y: 12 }
								}
								animate={{ opacity: 1, y: 0 }}
								transition={{
									...listTransition,
									delay: shouldReduceMotion ? 0 : index * 0.03,
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
