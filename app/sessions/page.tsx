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

type Session = {
	id: string;
	player_count: number;
	created_at: string;
	status: "active" | "completed";
	completed_at?: string | null;
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
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					setError("Not authenticated");
					return;
				}

				const supabaseClient = createClient(
					supabaseUrl,
					supabaseAnonKey,
					{
						global: {
							headers: {
								Authorization: `Bearer ${session.access_token}`,
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

				if (append) {
					setSessions((prev) => [...prev, ...newSessions]);
				} else {
					setSessions(newSessions);
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
