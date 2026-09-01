"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { AuthGuard } from "@/components/auth/auth-guard";
import { useAuth } from "@/lib/auth/useAuth";
import { Stack } from "@/components/ui/stack";
import { InfiniteScroll } from "@/components/ui/infinite-scroll";
import { PageLoading } from "@/components/ui/loading";
import { supabase } from "@/lib/supabase/client";
import {
	SessionCard,
	type SessionCardSession,
} from "@/components/sessions/session-card";
import { SessionsLayout, SessionsState } from "./_components/sessions-layout";
import { t } from "@/lib/i18n";
import { readStaleCache, writeStaleCache } from "@/lib/client/stale-cache";
import { prefetchSessionSummary } from "@/app/session/[id]/_lib/session-summary-client";
import { useActiveSession } from "@/lib/client/use-active-session";

const listTransition = {
	duration: 0.2,
	ease: [0.25, 0.46, 0.45, 0.94] as const,
};

type Session = SessionCardSession & {
	completed_at?: string | null;
};

const PAGE_SIZE = 5;
const SESSIONS_REFRESH_INTERVAL_MS = 15_000;
// Version 4 adds native-parity round progress and performer avatars.
const SESSIONS_CACHE_VERSION = 4;
const SESSIONS_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

type SessionsCache = {
	sessions: Session[];
	hasMore: boolean;
};

const monthFormatter = new Intl.DateTimeFormat("sr-Latn-RS", {
	month: "long",
	year: "numeric",
});

function groupCompletedSessions(sessions: Session[]) {
	const groups = new Map<string, { title: string; sessions: Session[] }>();

	for (const session of sessions) {
		if (session.status !== "completed") continue;
		const date = new Date(session.created_at);
		const key = `${date.getFullYear()}-${date.getMonth()}`;
		const existing = groups.get(key);
		if (existing) {
			existing.sessions.push(session);
		} else {
			groups.set(key, {
				title: monthFormatter.format(date).toLocaleUpperCase("sr-Latn-RS"),
				sessions: [session],
			});
		}
	}

	return Array.from(groups.values());
}

function sessionCountLabel(count: number) {
	return `${count} ${count === 1 ? "termin" : "termina"}`;
}

function getSessionsCacheKey(userId: string) {
	return `sessions-page:${userId}`;
}

function readCachedSessions(userId: string | undefined) {
	if (!userId) {
		return null;
	}

	return readStaleCache<SessionsCache>(getSessionsCacheKey(userId), {
		maxAgeMs: SESSIONS_CACHE_MAX_AGE_MS,
		version: SESSIONS_CACHE_VERSION,
	});
}

function SessionsPageContent() {
	const { session: authSession } = useAuth();
	const router = useRouter();
	const shouldReduceMotion = useReducedMotion();
	const {
		activeSession,
		loading: loadingActiveSession,
		error: activeSessionError,
	} = useActiveSession();
	const userId = authSession?.user.id;
	const cachedSessions = readCachedSessions(userId);
	const [sessions, setSessions] = useState<Session[]>(
		() => cachedSessions?.sessions ?? [],
	);
	const [loading, setLoading] = useState(() => !cachedSessions);
	const [loadingMore, setLoadingMore] = useState(false);
	const [hasMore, setHasMore] = useState(() => cachedSessions?.hasMore ?? true);
	const [error, setError] = useState<string | null>(null);
	const reconciledSessions =
		!loadingActiveSession && !activeSessionError
			? sessions.filter(
					(session) =>
						session.status !== "active" ||
						session.id === activeSession?.id,
			  )
			: sessions;
	const visibleSessions =
		activeSession &&
		!reconciledSessions.some((session) => session.id === activeSession.id)
			? [
					{
						...activeSession,
						best_player: null,
						worst_player: null,
					},
					...reconciledSessions,
			  ]
			: reconciledSessions;

	// Fetch sessions with pagination
	const fetchSessions = useCallback(
		async (
			offset: number = 0,
			append: boolean = false,
			options?: { showLoading?: boolean },
		) => {
			try {
				if (append) {
					setLoadingMore(true);
				} else if (options?.showLoading ?? true) {
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
				const nextHasMore = newSessions.length === PAGE_SIZE;

					// If no sessions, skip match count fetching
					if (newSessions.length === 0) {
						if (!append) {
							setSessions([]);
							if (userId) {
								writeStaleCache<SessionsCache>(
									getSessionsCacheKey(userId),
									{ sessions: [], hasMore: false },
									{ version: SESSIONS_CACHE_VERSION },
								);
							}
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

				const [matchSummaryResult, profilesResult] = await Promise.all([
					supabase
						.from("session_matches")
						.select("session_id, match_type, round_number, status")
						.in("session_id", sessionIds),
					bestWorstPlayerIds.length > 0
						? supabase
								.from("profiles")
								.select("id, display_name, avatar_url")
								.in("id", bestWorstPlayerIds)
						: Promise.resolve({ data: [], error: null }),
				]);

				if (matchSummaryResult.error) {
					console.error(
						"Error fetching session match summaries:",
						matchSummaryResult.error,
					);
				}

				// Mirror the native summary: all scheduled matches count, the current
				// round is the first pending round, and total rounds is the highest one.
				const countsMap = new Map<
					string,
					{
						singles: number;
						doubles: number;
						totalRounds: number;
						currentRound: number | null;
					}
				>();

				sessionIds.forEach((sessionId) => {
					countsMap.set(sessionId, {
						singles: 0,
						doubles: 0,
						totalRounds: 0,
						currentRound: null,
					});
				});

				(matchSummaryResult.data || []).forEach((match) => {
					const counts = countsMap.get(match.session_id) || {
						singles: 0,
						doubles: 0,
						totalRounds: 0,
						currentRound: null,
					};
					if (match.match_type === "singles") {
						counts.singles += 1;
					} else if (match.match_type === "doubles") {
						counts.doubles += 1;
					}
					counts.totalRounds = Math.max(
						counts.totalRounds,
						match.round_number ?? 0,
					);
					if (
						match.status !== "completed" &&
						(counts.currentRound === null ||
							match.round_number < counts.currentRound)
					) {
						counts.currentRound = match.round_number;
					}
					countsMap.set(match.session_id, counts);
				});

				const profileMap = new Map<
					string,
					{ name: string; avatar: string | null }
				>();
				if (profilesResult.error) {
					console.error(
						"Error fetching best/worst player names:",
						profilesResult.error,
					);
				} else {
					(profilesResult.data || []).forEach((profile: any) => {
						profileMap.set(
							profile.id,
							{
								name: profile.display_name || "User",
								avatar: profile.avatar_url || null,
							},
						);
					});
				}

				// Merge match counts and best/worst player data into sessions
				const sessionsWithCounts = newSessions.map((session: any) => {
					const counts = countsMap.get(session.id) || {
						singles: 0,
						doubles: 0,
						totalRounds: 0,
						currentRound: null,
					};
					const bestProfile = session.best_player_id
						? profileMap.get(session.best_player_id)
						: null;
					const worstProfile = session.worst_player_id
						? profileMap.get(session.worst_player_id)
						: null;

					return {
						...session,
						singles_match_count: counts.singles,
						doubles_match_count: counts.doubles,
						current_round:
							session.status === "active"
								? (counts.currentRound ?? (counts.totalRounds || 1))
								: null,
						total_rounds: counts.totalRounds,
						best_player:
							session.best_player_display_name || session.best_player_id
								? {
									id: session.best_player_id || null,
									name:
										bestProfile?.name ||
										session.best_player_display_name ||
										null,
									avatar: bestProfile?.avatar || null,
									delta: session.best_player_delta ?? null,
								}
								: null,
						worst_player:
							session.worst_player_display_name || session.worst_player_id
								? {
									id: session.worst_player_id || null,
									name:
										worstProfile?.name ||
										session.worst_player_display_name ||
										null,
									avatar: worstProfile?.avatar || null,
									delta: session.worst_player_delta ?? null,
								}
								: null,
					};
				});

				// Show sessions immediately (best/worst data from database if available)
				if (append) {
					setSessions((prev) => {
						const nextSessions = [...prev, ...sessionsWithCounts];
						if (userId) {
							writeStaleCache<SessionsCache>(
								getSessionsCacheKey(userId),
								{ sessions: nextSessions, hasMore: nextHasMore },
								{ version: SESSIONS_CACHE_VERSION },
							);
						}
						return nextSessions;
					});
				} else {
					setSessions(sessionsWithCounts);
					if (userId) {
						writeStaleCache<SessionsCache>(
							getSessionsCacheKey(userId),
							{ sessions: sessionsWithCounts, hasMore: nextHasMore },
							{ version: SESSIONS_CACHE_VERSION },
						);
					}
				}

				// Check if there are more items to load
				setHasMore(nextHasMore);
			} catch (err) {
				console.error("Error fetching sessions:", err);
				if (options?.showLoading !== false) {
					setError(t.sessions.error.fetchFailed);
				}
			} finally {
				setLoading(false);
				setLoadingMore(false);
			}
		},
		[authSession, userId]
	);

	// Initial load and refetch when user changes
	useEffect(() => {
		if (userId) {
			const cached = readCachedSessions(userId);
			if (cached) {
				setSessions(cached.sessions);
				setHasMore(cached.hasMore);
				setLoading(false);
			} else {
				setSessions([]);
				setHasMore(true);
				setLoading(true);
			}
			setError(null);
			fetchSessions(0, false, { showLoading: !cached });
		}
	}, [userId, fetchSessions]);

	// A database restore or a change from another client can invalidate the
	// hydrated list while this tab remains mounted. Refresh quietly whenever the
	// tab becomes visible and periodically while it stays visible.
	useEffect(() => {
		if (!userId) return;

		const refreshIfVisible = () => {
			if (document.visibilityState === "visible") {
				void fetchSessions(0, false, { showLoading: false });
			}
		};

		window.addEventListener("focus", refreshIfVisible);
		document.addEventListener("visibilitychange", refreshIfVisible);
		const intervalID = window.setInterval(
			refreshIfVisible,
			SESSIONS_REFRESH_INTERVAL_MS,
		);

		return () => {
			window.clearInterval(intervalID);
			window.removeEventListener("focus", refreshIfVisible);
			document.removeEventListener("visibilitychange", refreshIfVisible);
		};
	}, [fetchSessions, userId]);

	useEffect(() => {
		const latestSession = sessions[0];
		const accessToken = authSession?.access_token;
		if (!latestSession || !accessToken) {
			return;
		}

		router.prefetch(`/session/${latestSession.id}`);

		if (latestSession.status === "completed") {
			prefetchSessionSummary(latestSession.id, "singles", accessToken).catch(
				(error) => {
					console.error("Error prefetching latest session summary:", error);
				},
			);
		}
	}, [authSession?.access_token, router, sessions]);

	// Load more handler
	const handleLoadMore = useCallback(() => {
		if (!loadingMore && hasMore) {
			fetchSessions(sessions.length, true);
		}
	}, [fetchSessions, loadingMore, hasMore, sessions.length]);

	if (loading) {
		return (
			<SessionsLayout>
				<PageLoading label={t.sessions.loading} />
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
			{visibleSessions.length === 0 ? (
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
					<div className="mx-auto w-full max-w-3xl space-y-[30px]">
						{visibleSessions.some((session) => session.status === "active") && (
							<Stack direction="column" spacing={3}>
								{visibleSessions
									.filter((session) => session.status === "active")
									.map((session, index) => (
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
											<SessionCard session={session} />
										</motion.div>
									))}
							</Stack>
						)}

						{groupCompletedSessions(visibleSessions).map((group) => (
							<section key={group.title} className="space-y-3">
								<div className="flex items-baseline justify-between gap-4 px-0.5">
									<h2 className="font-session-label text-ios-label-13 font-semibold tracking-[0.138em] text-ds-section-accent">
										{group.title}
									</h2>
									<p className="text-ios-caption font-semibold tracking-wide text-ds-button-muted">
										{sessionCountLabel(group.sessions.length)}
									</p>
								</div>
								<Stack direction="column" spacing={3}>
									{group.sessions.map((session, index) => (
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
											<SessionCard session={session} />
										</motion.div>
									))}
								</Stack>
							</section>
						))}
					</div>
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
