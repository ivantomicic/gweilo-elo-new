"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useWebHaptics } from "web-haptics/react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Box } from "@/components/ui/box";
import { StateBlock } from "@/components/ui/state-block";
import {
	PlayerTableIdentity,
	RankCell,
	TeamTableIdentity,
} from "@/components/ui/stats-table-cells";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RivalriesTab } from "@/app/statistics/_components/rivalries-tab";
import { useAuth } from "@/lib/auth/useAuth";
import { t } from "@/lib/i18n";
import {
	MIN_DOUBLES_TEAM_MATCHES,
	MIN_DOUBLES_PLAYER_MATCHES,
	MIN_SINGLES_MATCHES,
} from "@/lib/statistics/min-matches";
import { readStaleCache, writeStaleCache } from "@/lib/client/stale-cache";

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
	rank_duration_days?: number | null;
	rank_duration_capped?: boolean;
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
	rank_duration_days?: number | null;
	rank_duration_capped?: boolean;
};

type StatisticsData = {
	singles: PlayerStats[];
	doublesPlayers: PlayerStats[];
	doublesTeams: TeamStats[];
};

type StatisticsRankingView = "singles" | "doubles_player" | "doubles_team";
type StatisticsView = StatisticsRankingView | "rivalries";

type StatisticsLoaded = {
	singles: boolean;
	doublesPlayers: boolean;
	doublesTeams: boolean;
};

type StatisticsCache = {
	statistics: StatisticsData;
	loaded: StatisticsLoaded;
};

const EMPTY_STATISTICS: StatisticsData = {
	singles: [],
	doublesPlayers: [],
	doublesTeams: [],
};

const EMPTY_LOADED: StatisticsLoaded = {
	singles: false,
	doublesPlayers: false,
	doublesTeams: false,
};

const STATISTICS_CACHE_VERSION = 3;
const STATISTICS_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const STATISTICS_VIEWS: StatisticsRankingView[] = [
	"singles",
	"doubles_player",
	"doubles_team",
];

function formatRankDuration(
	days: number | null | undefined,
	_capped: boolean | undefined
) {
	if (typeof days !== "number") {
		return "-";
	}

	const durationDays = Math.max(1, days);
	const usesSingularDay =
		durationDays % 10 === 1 && durationDays % 100 !== 11;

	return `${durationDays} ${
		usesSingularDay
			? t.statistics.table.day
			: t.statistics.table.days
	}`;
}

function getStatisticsCacheKey(userId: string) {
	return `statistics-page:${userId}`;
}

function readCachedStatistics(userId: string | undefined) {
	if (!userId) {
		return null;
	}

	return readStaleCache<StatisticsCache>(getStatisticsCacheKey(userId), {
		maxAgeMs: STATISTICS_CACHE_MAX_AGE_MS,
		version: STATISTICS_CACHE_VERSION,
	});
}

function getViewKey(view: StatisticsRankingView): keyof StatisticsLoaded {
	return view === "singles"
		? "singles"
		: view === "doubles_player"
		? "doublesPlayers"
		: "doublesTeams";
}

function StatisticsPageContent() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const { session } = useAuth();
	const accessToken = session?.access_token;
	const userId = session?.user.id;
	const shouldReduceMotion = useReducedMotion();
	const { trigger } = useWebHaptics();

	// Page-level view filter. URL uses hyphens for doubles views.
	const urlView = searchParams.get("view");
	let activeView: StatisticsView = "singles";
	if (urlView === "doubles-player") {
		activeView = "doubles_player";
	} else if (urlView === "doubles-team") {
		activeView = "doubles_team";
	} else if (urlView === "rivalries") {
		activeView = "rivalries";
	}

	const handleViewChange = (
		view: StatisticsView
	) => {
		const params = new URLSearchParams(searchParams.toString());
		if (view === "singles") {
			params.delete("view");
		} else if (view === "doubles_player") {
			params.set("view", "doubles-player");
		} else if (view === "doubles_team") {
			params.set("view", "doubles-team");
		} else if (view === "rivalries") {
			params.set("view", "rivalries");
		}
		router.push(`?${params.toString()}`, { scroll: false });
	};

	const handlePlayerClick = (playerId: string) => {
		void trigger();
		router.push(`/player/${playerId}`);
	};

	const handleTeamClick = (teamId: string) => {
		void trigger();
		router.push(`/team/${teamId}`);
	};

	const cachedStatistics = readCachedStatistics(userId);
	const [statistics, setStatistics] = useState<StatisticsData>(
		() => cachedStatistics?.statistics ?? EMPTY_STATISTICS,
	);
	const activeRankingView: StatisticsRankingView =
		activeView === "rivalries" ? "singles" : activeView;
	const [loading, setLoading] = useState<StatisticsLoaded>(() => ({
		singles:
			getViewKey(activeRankingView) === "singles" &&
			!cachedStatistics?.loaded.singles,
		doublesPlayers:
			getViewKey(activeRankingView) === "doublesPlayers" &&
			!cachedStatistics?.loaded.doublesPlayers,
		doublesTeams:
			getViewKey(activeRankingView) === "doublesTeams" &&
			!cachedStatistics?.loaded.doublesTeams,
	}));
	const [loaded, setLoaded] = useState<StatisticsLoaded>(
		() => cachedStatistics?.loaded ?? EMPTY_LOADED,
	);
	const [error, setError] = useState<string | null>(null);
	const statisticsRef = useRef(statistics);
	const loadedRef = useRef(loaded);
	const prefetchedViewsRef = useRef(new Set<StatisticsRankingView>());

	useEffect(() => {
		statisticsRef.current = statistics;
	}, [statistics]);

	useEffect(() => {
		loadedRef.current = loaded;
	}, [loaded]);

	// Fetch statistics for a specific view
	const fetchStatistics = useCallback(async (
		view: StatisticsRankingView,
		options?: { force?: boolean; showLoading?: boolean },
	) => {
		const viewKey = getViewKey(view);
		const currentLoaded = loadedRef.current[viewKey];
		if (currentLoaded && !options?.force) {
			return; // Already loaded, skip
		}

		try {
			const showLoading = options?.showLoading ?? !currentLoaded;
			if (showLoading) {
				setLoading((prev) => ({ ...prev, [viewKey]: true }));
			}
			setError(null);

			if (!accessToken) {
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
					cache: "no-store",
					headers: {
						Authorization: `Bearer ${accessToken}`,
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
			const currentStatistics = statisticsRef.current;
			const nextStatistics = {
				...currentStatistics,
				singles: data.singles || currentStatistics.singles,
				doublesPlayers:
					data.doublesPlayers || currentStatistics.doublesPlayers,
				doublesTeams: data.doublesTeams || currentStatistics.doublesTeams,
			};
			const nextLoaded = {
				...loadedRef.current,
				[viewKey]: true,
			};

			statisticsRef.current = nextStatistics;
			loadedRef.current = nextLoaded;
			setStatistics(nextStatistics);
			setLoaded(nextLoaded);

			if (userId) {
				writeStaleCache<StatisticsCache>(
					getStatisticsCacheKey(userId),
					{ statistics: nextStatistics, loaded: nextLoaded },
					{ version: STATISTICS_CACHE_VERSION },
				);
			}
		} catch (err) {
			console.error("Error fetching statistics:", err);
			if (options?.showLoading !== false) {
				setError(t.statistics.error.fetchFailed);
			}
		} finally {
			setLoading((prev) => ({ ...prev, [viewKey]: false }));
		}
	}, [accessToken, userId]);

	useEffect(() => {
		if (!userId) {
			return;
		}

		const cached = readCachedStatistics(userId);
		if (cached) {
			statisticsRef.current = cached.statistics;
			loadedRef.current = cached.loaded;
			setStatistics(cached.statistics);
			setLoaded(cached.loaded);
			setLoading({
				singles: false,
				doublesPlayers: false,
				doublesTeams: false,
			});
		} else {
			statisticsRef.current = EMPTY_STATISTICS;
			loadedRef.current = EMPTY_LOADED;
			setStatistics(EMPTY_STATISTICS);
			setLoaded(EMPTY_LOADED);
			setLoading({
				singles: false,
				doublesPlayers: false,
				doublesTeams: false,
			});
		}
		prefetchedViewsRef.current = new Set();
	}, [userId]);

	// Load initial statistics for active view
	useEffect(() => {
		const viewKey = getViewKey(activeRankingView);
		const hasCachedData = loadedRef.current[viewKey];
		fetchStatistics(activeRankingView, {
			force: hasCachedData,
			showLoading: !hasCachedData,
		});
	}, [activeRankingView, fetchStatistics]);

	useEffect(() => {
		const activeViewKey = getViewKey(activeRankingView);
		if (!accessToken || !loaded[activeViewKey]) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			for (const view of STATISTICS_VIEWS) {
				if (
					view === activeRankingView ||
					loadedRef.current[getViewKey(view)] ||
					prefetchedViewsRef.current.has(view)
				) {
					continue;
				}

				prefetchedViewsRef.current.add(view);
				void fetchStatistics(view, { showLoading: false });
			}
		}, 300);

		return () => window.clearTimeout(timeoutId);
	}, [accessToken, activeRankingView, fetchStatistics, loaded]);

	const isInitialLoading =
		loading[getViewKey(activeRankingView)] &&
		!loaded[getViewKey(activeRankingView)];

	if (isInitialLoading) {
		return (
			<AppShell title={t.statistics.title}>
				<StateBlock
					variant="loading"
					size="lg"
					title={t.statistics.loading}
				/>
			</AppShell>
		);
	}

	if (error) {
		return (
			<AppShell title={t.statistics.title}>
				<StateBlock variant="error" size="lg" title={error} />
			</AppShell>
		);
	}

	const selectedRivalryPlayerId = searchParams.get("player") || userId || "";
	const rivalryPlayers = statistics.singles
		.filter((player) => player.matches_played >= MIN_SINGLES_MATCHES)
		.map((player) => ({
			player_id: player.player_id,
			display_name: player.display_name,
		}));

	if (userId && !rivalryPlayers.some((player) => player.player_id === userId)) {
		const metadata = session?.user.user_metadata;
		rivalryPlayers.unshift({
			player_id: userId,
			display_name:
				(typeof metadata?.display_name === "string" && metadata.display_name) ||
				(typeof metadata?.name === "string" && metadata.name) ||
				session?.user.email?.split("@")[0] ||
				"User",
		});
	}

	const handleRivalryPlayerChange = (playerId: string) => {
		const params = new URLSearchParams(searchParams.toString());
		params.set("view", "rivalries");
		if (playerId === userId) {
			params.delete("player");
		} else {
			params.set("player", playerId);
		}
		router.push(`?${params.toString()}`, { scroll: false });
	};

	return (
		<AppShell title={t.statistics.title}>
							{/* Page-level Navigation Tabs */}
							<Box className="mb-4">
								<Tabs
									value={
										activeView === "doubles_player"
											? "doubles-player"
											: activeView === "doubles_team"
											? "doubles-team"
											: activeView === "rivalries"
											? "rivalries"
											: "singles"
									}
									onValueChange={(value) => {
										if (value === "singles") {
											handleViewChange("singles");
										} else if (value === "doubles-player") {
											handleViewChange("doubles_player");
										} else if (value === "doubles-team") {
											handleViewChange("doubles_team");
										} else if (value === "rivalries") {
											handleViewChange("rivalries");
										}
									}}
								>
									<TabsList className="w-full">
										<TabsTrigger value="singles">
											{t.statistics.tabs.singles}
										</TabsTrigger>
										<TabsTrigger value="doubles-player">
											{t.statistics.tabs.doublesPlayers}
										</TabsTrigger>
										<TabsTrigger value="doubles-team">
											{t.statistics.tabs.doublesTeams}
										</TabsTrigger>
										<TabsTrigger value="rivalries">
											{t.statistics.tabs.rivalries}
										</TabsTrigger>
									</TabsList>
								</Tabs>
							</Box>

							{/* Statistics Table */}
							<Box>
								{(() => {
									if (activeView === "rivalries") {
										return accessToken && selectedRivalryPlayerId ? (
											<RivalriesTab
												accessToken={accessToken}
												selectedPlayerId={selectedRivalryPlayerId}
												players={rivalryPlayers}
												onPlayerChange={handleRivalryPlayerChange}
											/>
										) : null;
									}

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
											? MIN_SINGLES_MATCHES
											: activeView === "doubles_player"
											? MIN_DOUBLES_PLAYER_MATCHES
											: MIN_DOUBLES_TEAM_MATCHES;

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
													<Box className="bg-card rounded-lg border border-border/50">
														<StateBlock
															variant="loading"
															size="md"
															title={t.statistics.loading}
														/>
													</Box>
												</motion.div>
											</AnimatePresence>
										);
									}

									const headerLabel =
										activeView === "doubles_team"
											? t.statistics.table.team
											: t.statistics.table.player;

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
														? undefined
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
														<TableHead className="text-center w-[72px] px-2 whitespace-nowrap">
															{
																t.statistics
																	.table
																	.rankDuration
															}
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
																		<RankCell
																			index={
																				index
																			}
																		/>
																		<TableCell>
																			<TeamTableIdentity
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
																				onClick={() =>
																					handleTeamClick(
																						team.team_id
																					)
																				}
																				rankMovement={
																					team.rank_movement
																				}
																				mobileRecord={
																					team
																				}
																			/>
																		</TableCell>
																		<TableCell className="text-center w-[72px] px-2 font-medium text-muted-foreground whitespace-nowrap">
																			{formatRankDuration(
																				team.rank_duration_days,
																				team.rank_duration_capped
																			)}
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
																	<RankCell
																		index={
																			index
																		}
																	/>
																	<TableCell>
																		<PlayerTableIdentity
																			name={
																				player.display_name
																			}
																			avatar={
																				player.avatar
																			}
																			size="md"
																			onClick={() =>
																				handlePlayerClick(
																					player.player_id
																				)
																			}
																			rankMovement={
																				player.rank_movement
																			}
																			mobileRecord={
																				player
																			}
																		/>
																	</TableCell>
																	<TableCell className="text-center w-[72px] px-2 font-medium text-muted-foreground whitespace-nowrap">
																		{formatRankDuration(
																			player.rank_duration_days,
																			player.rank_duration_capped
																		)}
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
		</AppShell>
	);
}

export default function StatisticsPage() {
	return (
		<AuthGuard>
			<StatisticsPageContent />
		</AuthGuard>
	);
}
