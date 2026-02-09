"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { Box } from "@/components/ui/box";
import { Loading } from "@/components/ui/loading";
import { PlayerNameCard } from "@/components/ui/player-name-card";
import { TeamNameCard } from "@/components/ui/team-name-card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase/client";
import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

const MotionTableRow = motion(TableRow);

const tableContentTransition = {
	duration: 0.2,
	ease: [0.25, 0.46, 0.45, 0.94] as const, // ease-out
};

type PlayerStats = {
	player_id: string;
	display_name: string;
	avatar: string | null;
	matches_played: number;
	wins: number;
	losses: number;
	draws: number;
	sets_won: number;
	sets_lost: number;
	elo: number;
	rank_movement?: number;
};

type TeamStats = {
	team_id: string;
	player1: {
		id: string;
		display_name: string;
		avatar: string | null;
	};
	player2: {
		id: string;
		display_name: string;
		avatar: string | null;
	};
	matches_played: number;
	wins: number;
	losses: number;
	draws: number;
	sets_won: number;
	sets_lost: number;
	elo: number;
	rank_movement?: number;
};

type StatisticsData = {
	singles: PlayerStats[];
	doublesPlayers: PlayerStats[];
	doublesTeams: TeamStats[];
};

function StatisticsPageContent() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const shouldReduceMotion = useReducedMotion();

	// Page-level view filter: 'singles' | 'doubles_player' | 'doubles_team'
	// URL uses hyphens: ?view=singles|doubles-player|doubles-team
	const urlView = searchParams.get("view");
	let activeView: "singles" | "doubles_player" | "doubles_team" = "singles";
	if (urlView === "doubles-player") {
		activeView = "doubles_player";
	} else if (urlView === "doubles-team") {
		activeView = "doubles_team";
	}

	const handleViewChange = (
		view: "singles" | "doubles_player" | "doubles_team"
	) => {
		const params = new URLSearchParams(searchParams.toString());
		if (view === "singles") {
			params.delete("view");
		} else if (view === "doubles_player") {
			params.set("view", "doubles-player");
		} else if (view === "doubles_team") {
			params.set("view", "doubles-team");
		}
		router.push(`?${params.toString()}`, { scroll: false });
	};

	const [statistics, setStatistics] = useState<StatisticsData>({
		singles: [],
		doublesPlayers: [],
		doublesTeams: [],
	});
	const [loading, setLoading] = useState<{
		singles: boolean;
		doublesPlayers: boolean;
		doublesTeams: boolean;
	}>({
		singles: true,
		doublesPlayers: false,
		doublesTeams: false,
	});
	const [loaded, setLoaded] = useState<{
		singles: boolean;
		doublesPlayers: boolean;
		doublesTeams: boolean;
	}>({
		singles: false,
		doublesPlayers: false,
		doublesTeams: false,
	});
	const [error, setError] = useState<string | null>(null);

	// Fetch statistics for a specific view
	const fetchStatistics = useCallback(async (
		view: "singles" | "doubles_player" | "doubles_team"
	) => {
		// Check if already loaded
		const viewKey =
			view === "singles"
				? "singles"
				: view === "doubles_player"
				? "doublesPlayers"
				: "doublesTeams";
		if (loaded[viewKey]) {
			return; // Already loaded, skip
		}

		try {
			setLoading((prev) => ({ ...prev, [viewKey]: true }));
			setError(null);

			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				setError(t.statistics.error.notAuthenticated);
				return;
			}

			// Map view to API parameter
			const apiView =
				view === "singles"
					? "singles"
					: view === "doubles_player"
					? "doubles_player"
					: "doubles_team";

			// Fetch statistics from API route with view parameter
			const response = await fetch(
				`/api/statistics?view=${encodeURIComponent(apiView)}`,
				{
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				}
			);

			if (!response.ok) {
				if (response.status === 401) {
					setError(t.statistics.error.unauthorized);
				} else {
					const errorData = await response.json();
					setError(
						errorData.error || t.statistics.error.fetchFailed
					);
				}
				return;
			}

			const data = await response.json();
			setStatistics((prev) => ({
				...prev,
				singles: data.singles || prev.singles,
				doublesPlayers: data.doublesPlayers || prev.doublesPlayers,
				doublesTeams: data.doublesTeams || prev.doublesTeams,
			}));
			setLoaded((prev) => ({ ...prev, [viewKey]: true }));
		} catch (err) {
			console.error("Error fetching statistics:", err);
			setError(t.statistics.error.fetchFailed);
		} finally {
			setLoading((prev) => ({ ...prev, [viewKey]: false }));
		}
	}, []);

	// Load initial statistics for active view
	useEffect(() => {
		fetchStatistics(activeView);
	}, [activeView, fetchStatistics]);

	const isLoading = loading.singles || loading.doublesPlayers || loading.doublesTeams;
	const isInitialLoading = loading.singles && !loaded.singles;

	if (isInitialLoading) {
		return (
			<SidebarProvider>
				<AppSidebar variant="inset" />
				<SidebarInset>
					<SiteHeader title={t.statistics.title} />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
								<Loading label={t.statistics.loading} />
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
					<SiteHeader title={t.statistics.title} />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
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
		<SidebarProvider>
			<AppSidebar variant="inset" />
			<SidebarInset>
				<SiteHeader title={t.statistics.title} />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
							{/* Page-level Navigation Tabs */}
							<Box className="mb-4">
								<Tabs
									value={
										activeView === "doubles_player"
											? "doubles-player"
											: activeView === "doubles_team"
											? "doubles-team"
											: "singles"
									}
									onValueChange={(value) => {
										if (value === "singles") {
											handleViewChange("singles");
										} else if (value === "doubles-player") {
											handleViewChange("doubles_player");
										} else if (value === "doubles-team") {
											handleViewChange("doubles_team");
										}
									}}
								>
									<TabsList>
										<TabsTrigger value="singles">
											{t.statistics.tabs.singles}
										</TabsTrigger>
										<TabsTrigger value="doubles-player">
											{t.statistics.tabs.doublesPlayers}
										</TabsTrigger>
										<TabsTrigger value="doubles-team">
											{t.statistics.tabs.doublesTeams}
										</TabsTrigger>
									</TabsList>
								</Tabs>
							</Box>

							{/* Statistics Table */}
							<Box>
								{(() => {
									// Determine current data and header label based on view
									// Check if current view is loading
									const currentViewLoading =
										activeView === "singles"
											? loading.singles
											: activeView === "doubles_player"
											? loading.doublesPlayers
											: loading.doublesTeams;

									const currentData: (
										| PlayerStats
										| TeamStats
									)[] =
										activeView === "singles"
											? statistics.singles
											: activeView === "doubles_player"
											? statistics.doublesPlayers
											: statistics.doublesTeams;

									const minMatches =
										activeView === "singles"
											? 15
											: activeView === "doubles_player"
											? 6
											: null;

									const filteredData =
										minMatches === null
											? currentData
											: currentData.filter(
													(item) =>
														"matches_played" in item &&
														item.matches_played >= minMatches,
											  );

									// Show loading state for current view if data is not loaded yet
									if (currentViewLoading && currentData.length === 0) {
										return (
											<AnimatePresence mode="wait">
												<motion.div
													key={activeView}
													initial={
														shouldReduceMotion
															? false
															: { opacity: 0, y: 8 }
													}
													animate={{ opacity: 1, y: 0 }}
													transition={tableContentTransition}
												>
													<Box className="bg-card rounded-lg border border-border/50 p-6">
														<Loading label={t.statistics.loading} />
													</Box>
												</motion.div>
											</AnimatePresence>
										);
									}

									const headerLabel =
										activeView === "doubles_team"
											? t.statistics.table.team
											: t.statistics.table.player;

									// Get rank color based on position
									const getRankColor = (index: number) => {
										if (index === 0)
											return "text-yellow-500";
										if (index === 1) return "text-zinc-400";
										if (index === 2)
											return "text-orange-700";
										return "text-muted-foreground";
									};

									return (
										<AnimatePresence mode="wait">
											<motion.div
												key={activeView}
												initial={
													shouldReduceMotion
														? false
														: { opacity: 0, y: 8 }
												}
												animate={{ opacity: 1, y: 0 }}
												exit={
													shouldReduceMotion
														? false
														: { opacity: 0, y: -6 }
												}
												transition={tableContentTransition}
												className="rounded-lg border border-border/50 overflow-hidden bg-card"
											>
											<Table>
												<TableHeader className="bg-muted/30">
													<TableRow>
														<TableHead className="text-left w-8">
															#
														</TableHead>
														<TableHead className="text-left">
															{headerLabel}
														</TableHead>
														<TableHead className="text-center hidden md:table-cell">
															{
																t.statistics
																	.table
																	.matches
															}
														</TableHead>
														<TableHead className="text-center hidden md:table-cell">
															{
																t.statistics
																	.table.wins
															}
														</TableHead>
														<TableHead className="text-center hidden md:table-cell">
															{
																t.statistics
																	.table
																	.losses
															}
														</TableHead>
														<TableHead className="text-center hidden md:table-cell">
															{
																t.statistics
																	.table.draws
															}
														</TableHead>
														<TableHead className="text-center">
															{
																t.statistics
																	.table.elo
															}
														</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{filteredData.map(
														(item, index) => {
															const isTeam =
																"team_id" in
																item;
															const key = isTeam
																? (
																		item as TeamStats
																  ).team_id
																: (
																		item as PlayerStats
																  ).player_id;

															if (isTeam) {
																const team =
																	item as TeamStats;
																return (
																	<MotionTableRow
																		key={
																			key
																		}
																		initial={
																			shouldReduceMotion
																				? false
																				: { opacity: 0, y: 6 }
																		}
																		animate={{ opacity: 1, y: 0 }}
																		transition={{
																			...tableContentTransition,
																			delay: shouldReduceMotion ? 0 : index * 0.02,
																		}}
																	>
																		<TableCell
																			className={cn(
																				"font-bold w-8",
																				getRankColor(
																					index
																				)
																			)}
																		>
																			{index +
																				1}
																		</TableCell>
																		<TableCell>
																			<div className="flex items-center gap-3">
																				<TeamNameCard
																					player1={{
																						name: team
																							.player1
																							.display_name,
																						avatar: team
																							.player1
																							.avatar,
																						id: team
																							.player1
																							.id,
																					}}
																					player2={{
																						name: team
																							.player2
																							.display_name,
																						avatar: team
																							.player2
																							.avatar,
																						id: team
																							.player2
																							.id,
																					}}
																					size="md"
																					addon={
																						<span className="text-[10px] font-mono font-semibold leading-tight md:hidden">
																							<span className="text-emerald-500">
																								{
																									team.wins
																								}
																							</span>
																							{
																								" / "
																							}
																							<span className="text-red-500">
																								{
																									team.losses
																								}
																							</span>
																							{
																								" / "
																							}
																							<span className="text-muted-foreground">
																								{
																									team.draws
																								}
																							</span>
																						</span>
																					}
																				/>
																				{team.rank_movement !==
																					undefined &&
																					team.rank_movement !==
																						0 && (
																						<>
																							{team.rank_movement >
																							0 ? (
																								<ArrowUp className="size-4 text-green-500" />
																							) : (
																								<ArrowDown className="size-4 text-red-500" />
																							)}
																						</>
																					)}
																			</div>
																		</TableCell>
																		<TableCell className="text-center font-medium hidden md:table-cell">
																			{
																				team.matches_played
																			}
																		</TableCell>
																		<TableCell className="text-center hidden md:table-cell">
																			<span className="font-medium text-green-500">
																				{
																					team.wins
																				}
																			</span>{" "}
																			<span className="text-xs font-medium text-muted-foreground">
																				(
																				{
																					team.sets_won
																				}

																				)
																			</span>
																		</TableCell>
																		<TableCell className="text-center hidden md:table-cell">
																			<span className="font-medium text-red-500">
																				{
																					team.losses
																				}
																			</span>{" "}
																			<span className="text-xs font-medium text-muted-foreground">
																				(
																				{
																					team.sets_lost
																				}

																				)
																			</span>
																		</TableCell>
																		<TableCell className="text-center hidden md:table-cell font-medium text-yellow-500">
																			{
																				team.draws
																			}
																		</TableCell>
																		<TableCell className="text-center font-bold">
																			{
																				team.elo
																			}
																		</TableCell>
																	</MotionTableRow>
																);
															}

															const player =
																item as PlayerStats;
															return (
																<MotionTableRow
																	key={key}
																	initial={
																		shouldReduceMotion
																			? false
																			: { opacity: 0, y: 6 }
																	}
																	animate={{ opacity: 1, y: 0 }}
																	transition={{
																		...tableContentTransition,
																		delay: shouldReduceMotion ? 0 : index * 0.02,
																	}}
																>
																	<TableCell
																		className={cn(
																			"font-bold w-8",
																			getRankColor(
																				index
																			)
																		)}
																	>
																		{index +
																			1}
																	</TableCell>
																	<TableCell>
																		<div className="flex items-center gap-3">
																			<Box
																				onClick={() =>
																					router.push(
																						`/player/${player.player_id}`
																					)
																				}
																				className="cursor-pointer hover:opacity-80 transition-opacity"
																			>
																				<PlayerNameCard
																					name={
																						player.display_name
																					}
																					avatar={
																						player.avatar
																					}
																					size="md"
																					addon={
																						<span className="text-[10px] font-mono font-semibold leading-tight md:hidden">
																							<span className="text-emerald-500">
																								{
																									player.wins
																								}
																							</span>
																							{
																								" / "
																							}
																							<span className="text-red-500">
																								{
																									player.losses
																								}
																							</span>
																							{
																								" / "
																							}
																							<span className="text-muted-foreground">
																								{
																									player.draws
																								}
																							</span>
																						</span>
																					}
																				/>
																			</Box>
																			{player.rank_movement !==
																				undefined &&
																				player.rank_movement !==
																					0 && (
																					<>
																						{player.rank_movement >
																						0 ? (
																							<ArrowUp className="size-4 text-green-500" />
																						) : (
																							<ArrowDown className="size-4 text-red-500" />
																						)}
																					</>
																				)}
																		</div>
																	</TableCell>
																	<TableCell className="text-center hidden md:table-cell font-medium">
																		{
																			player.matches_played
																		}
																	</TableCell>
																	<TableCell className="text-center hidden md:table-cell">
																		<span className="font-medium text-green-500">
																			{
																				player.wins
																			}
																		</span>{" "}
																		<span className="text-xs font-medium text-muted-foreground">
																			(
																			{
																				player.sets_won
																			}
																			)
																		</span>
																	</TableCell>
																	<TableCell className="text-center hidden md:table-cell">
																		<span className="font-medium text-red-500">
																			{
																				player.losses
																			}
																		</span>{" "}
																		<span className="text-xs font-medium text-muted-foreground">
																			(
																			{
																				player.sets_lost
																			}
																			)
																		</span>
																	</TableCell>
																	<TableCell className="text-center hidden md:table-cell font-medium text-yellow-500">
																		{
																			player.draws
																		}
																	</TableCell>
																	<TableCell className="text-center font-bold">
																		{
																			player.elo
																		}
																	</TableCell>
																</MotionTableRow>
															);
														}
													)}
												</TableBody>
											</Table>
											</motion.div>
										</AnimatePresence>
									);
								})()}
							</Box>
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

export default function StatisticsPage() {
	return (
		<AuthGuard>
			<StatisticsPageContent />
		</AuthGuard>
	);
}
