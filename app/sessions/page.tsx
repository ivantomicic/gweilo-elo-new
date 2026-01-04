"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { Box } from "@/components/ui/box";
import { Stack } from "@/components/ui/stack";
import { Icon } from "@/components/ui/icon";
import { InfiniteScroll } from "@/components/ui/infinite-scroll";
import { supabase } from "@/lib/supabase/client";
import { createClient } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";

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
	const router = useRouter();
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
					setError("Not authenticated");
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
					setError("Not authenticated");
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
					setError(
						`Failed to load sessions: ${
							sessionsError.message ||
							JSON.stringify(sessionsError)
						}`
					);
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
				setError("Failed to load sessions");
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

	// Format date helpers
	const formatDateWeekday = (dateString: string) => {
		const date = new Date(dateString);
		return date.toLocaleDateString("en-US", { weekday: "short" });
	};

	const formatDateDay = (dateString: string) => {
		const date = new Date(dateString);
		return date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		});
	};

	const formatDateYear = (dateString: string) => {
		const date = new Date(dateString);
		return date.toLocaleDateString("en-US", { year: "numeric" });
	};

	if (loading) {
		return (
			<SidebarProvider>
				<AppSidebar variant="inset" />
				<SidebarInset>
					<SiteHeader title="Sessions" />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
								<Box>
									<p className="text-muted-foreground">
										Loading sessions...
									</p>
								</Box>
							</div>
						</div>
					</div>
				</SidebarInset>
			</SidebarProvider>
		);
	}

	if (error) {
		return (
			<SidebarProvider>
				<AppSidebar variant="inset" />
				<SidebarInset>
					<SiteHeader title="Sessions" />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
								<Box>
									<p className="text-destructive">{error}</p>
								</Box>
							</div>
						</div>
					</div>
				</SidebarInset>
			</SidebarProvider>
		);
	}

	return (
		<>
			<SidebarProvider>
				<AppSidebar variant="inset" />
				<SidebarInset>
					<SiteHeader title="Sessions" />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
								{/* Sessions List */}
								{sessions.length === 0 && !loading ? (
									<Box>
										<p className="text-muted-foreground">
											No sessions found.
										</p>
									</Box>
								) : (
									<InfiniteScroll
										hasMore={hasMore}
										loading={loadingMore}
										onLoadMore={handleLoadMore}
									>
										<Stack direction="column" spacing={4}>
											{sessions.map((session) => {
												return (
													<Box
														key={session.id}
														onClick={() =>
															router.push(
																`/session/${session.id}`
															)
														}
														className="group relative bg-card rounded-[24px] border border-border/50 p-4 transition-all active:scale-[0.98] active:bg-accent/50 cursor-pointer shadow-sm hover:border-primary/30"
													>
														<Stack
															direction="row"
															alignItems="center"
															spacing={4}
														>
															{/* Left: Date */}
															<Box className="flex flex-col items-center justify-center min-w-[72px] border-r border-border/30 pr-4">
																<span className="text-[10px] font-bold text-primary uppercase tracking-wider mb-0.5">
																	{formatDateWeekday(
																		session.created_at
																	)}
																</span>
																<span className="text-xl font-bold font-heading">
																	{formatDateDay(
																		session.created_at
																	)}
																</span>
																<Stack
																	direction="row"
																	alignItems="center"
																	spacing={1}
																	className="mt-1 text-[10px] text-muted-foreground font-medium"
																>
																	<Icon
																		icon="solar:clock-circle-linear"
																		className="size-3"
																	/>
																	<span>
																		{formatDateYear(
																			session.created_at
																		)}
																	</span>
																</Stack>
															</Box>

															{/* Center: Stats */}
															<Box className="flex-1 min-w-0 py-1">
																<Stack
																	direction="column"
																	spacing={
																		1.5
																	}
																>
																	<Stack
																		direction="row"
																		alignItems="center"
																		spacing={
																			1.5
																		}
																	>
																		<Icon
																			icon="solar:users-group-two-rounded-bold-duotone"
																			className="size-4 text-muted-foreground"
																		/>
																		<span className="text-xs font-semibold">
																			{
																				session.player_count
																			}{" "}
																			<span className="text-muted-foreground font-normal">
																				Players
																			</span>
																		</span>
																	</Stack>
																	{((session.singles_match_count ??
																		0) >
																		0 ||
																		(session.doubles_match_count ??
																			0) >
																			0) && (
																		<Box className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground font-medium bg-secondary/30 w-fit px-2 py-1 rounded-lg">
																			{(session.singles_match_count ??
																				0) >
																				0 && (
																				<span>
																					Singles:{" "}
																					{session.singles_match_count ??
																						0}
																				</span>
																			)}
																			{(session.singles_match_count ??
																				0) >
																				0 &&
																				(session.doubles_match_count ??
																					0) >
																					0 && (
																					<span className="w-1 h-1 rounded-full bg-border" />
																				)}
																			{(session.doubles_match_count ??
																				0) >
																				0 && (
																				<span>
																					Doubles:{" "}
																					{session.doubles_match_count ??
																						0}
																				</span>
																			)}
																		</Box>
																	)}
																	{session.best_worst_player &&
																		(session
																			.best_worst_player
																			.best_player_delta !==
																			null ||
																			session
																				.best_worst_player
																				.worst_player_delta !==
																				null) && (
																			<Stack
																				direction="row"
																				alignItems="center"
																				spacing={
																					2
																				}
																				className="mt-2 flex-wrap"
																			>
																				{session
																					.best_worst_player
																					.best_player_delta !==
																					null && (
																					<Box className="flex items-center gap-1.5 text-[10px] bg-secondary/30 w-fit px-2 py-1 rounded-lg">
																						<Icon
																							icon="solar:star-bold"
																							className="size-3.5 text-yellow-400"
																						/>
																						<span className="text-foreground font-medium">
																							Best:{" "}
																							<span className="font-semibold">
																								{session
																									.best_worst_player
																									.best_player_display_name ||
																									"Unknown"}
																							</span>
																						</span>
																						<span className="text-emerald-400 font-semibold ml-1">
																							(+
																							{Number(
																								session
																									.best_worst_player
																									.best_player_delta
																							).toFixed(
																								2
																							)}

																							)
																						</span>
																					</Box>
																				)}
																				{session
																					.best_worst_player
																					.worst_player_delta !==
																					null && (
																					<Box className="flex items-center gap-1.5 text-[10px] bg-secondary/30 w-fit px-2 py-1 rounded-lg">
																						<Icon
																							icon="solar:arrow-down-bold"
																							className="size-3.5 text-red-400"
																						/>
																						<span className="text-foreground font-medium">
																							Worst:{" "}
																							<span className="font-semibold">
																								{session
																									.best_worst_player
																									.worst_player_display_name ||
																									"Unknown"}
																							</span>
																						</span>
																						<span className="text-red-400 font-semibold ml-1">
																							(
																							{Number(
																								session
																									.best_worst_player
																									.worst_player_delta
																							).toFixed(
																								2
																							)}

																							)
																						</span>
																					</Box>
																				)}
																			</Stack>
																		)}
																</Stack>
															</Box>

															{/* Right: Status & Actions */}
															<Stack
																direction="column"
																alignItems="end"
																spacing={2}
															>
																<Box
																	className={cn(
																		"text-[10px] font-bold px-2 py-1 rounded-full border",
																		session.status ===
																			"completed"
																			? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
																			: "bg-chart-2/10 text-chart-2 border-chart-2/20"
																	)}
																>
																	{session.status ===
																	"active"
																		? "ACTIVE"
																		: "COMPLETED"}
																</Box>
																<Icon
																	icon="solar:alt-arrow-right-linear"
																	className="size-4 text-muted-foreground/50"
																/>
															</Stack>
														</Stack>
													</Box>
												);
											})}
										</Stack>
									</InfiniteScroll>
								)}
							</div>
						</div>
					</div>
				</SidebarInset>
			</SidebarProvider>
		</>
	);
}

export default function SessionsPage() {
	return (
		<AuthGuard>
			<SessionsPageContent />
		</AuthGuard>
	);
}
