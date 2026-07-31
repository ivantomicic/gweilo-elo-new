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
import { useAuth } from "@/lib/auth/useAuth";
import { t } from "@/lib/i18n";
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
	recent_form: number[];
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
	recent_form: number[];
};

type StatisticsData = {
	singles: PlayerStats[];
	doublesPlayers: PlayerStats[];
	doublesTeams: TeamStats[];
};

type StatisticsRankingView = "singles" | "doubles_player" | "doubles_team";

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

const STATISTICS_CACHE_VERSION = 5;
const STATISTICS_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const STATISTICS_VIEWS: StatisticsRankingView[] = [
	"singles",
	"doubles_player",
	"doubles_team",
];

function RecentFormDots({ values }: { values: number[] }) {
	const recentValues = values.slice(-5);
	const paddedValues: Array<number | null> = [
		...Array(Math.max(0, 5 - recentValues.length)).fill(null),
		...recentValues,
	];

	const toneFor = (value: number | null) => {
		if (value === null) {
			return {
				color: "hsl(var(--muted-foreground) / 0.2)",
				label: "Nema podatka",
			};
		}
		if (value > 5) {
			return { color: "#10b981", label: "Dobra forma" };
		}
		if (value < -5) {
			return { color: "#ef4444", label: "Loša forma" };
		}
		return { color: "#fbbf24", label: "Neutralna forma" };
	};

	const tones = paddedValues.map(toneFor);
	const gradientStops = [`${tones[0].color} 0%`];

	for (let index = 0; index < tones.length - 1; index += 1) {
		const boundary = (index + 1) * 20;
		gradientStops.push(
			`${tones[index].color} ${boundary - 10}%`,
			`${tones[index + 1].color} ${boundary + 10}%`
		);
	}
	gradientStops.push(`${tones[tones.length - 1].color} 100%`);

	return (
		<div
			className="mx-auto flex h-2 w-14 overflow-hidden rounded-[3px] md:w-20"
			style={{
				backgroundImage: `linear-gradient(90deg in oklab, ${gradientStops.join(", ")})`,
			}}
			aria-label={`Forma u poslednjih pet termina: ${paddedValues
				.map((value) => (value === null ? "nema podatka" : value.toFixed(1)))
				.join(", ")}`}
		>
			{paddedValues.map((value, index) => {
				const tone = tones[index];
				const deltaLabel =
					value === null
						? tone.label
						: `${tone.label}: ${value > 0 ? "+" : ""}${value.toFixed(1)} Elo`;

				return (
					<span
						key={index}
						className="h-full min-w-0 flex-1"
						title={deltaLabel}
						aria-hidden="true"
					/>
				);
			})}
		</div>
	);
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
	let activeView: StatisticsRankingView = "singles";
	if (urlView === "doubles-player") {
		activeView = "doubles_player";
	} else if (urlView === "doubles-team") {
		activeView = "doubles_team";
	}

	const handleViewChange = (
		view: StatisticsRankingView
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
	const activeRankingView = activeView;
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
	}, [activeView, activeRankingView, fetchStatistics]);

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
														<TableHead className="hidden text-left w-8 md:table-cell">
															#
														</TableHead>
														<TableHead className="text-left">
															{headerLabel}
														</TableHead>
														<TableHead className="w-[68px] px-1 text-center whitespace-nowrap md:w-[92px] md:px-2">
															{
																t.statistics
																	.table
																	.form
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
													{currentData.map(
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
																			className="hidden md:table-cell"
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
																				mobileRankIndex={
																					index
																				}
																			/>
																		</TableCell>
																		<TableCell className="w-[68px] px-1 text-center md:w-[92px] md:px-2">
																			<RecentFormDots
																				values={
																					team.recent_form
																				}
																			/>
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
																		className="hidden md:table-cell"
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
																			mobileRankIndex={
																				index
																			}
																		/>
																	</TableCell>
																	<TableCell className="w-[68px] px-1 text-center md:w-[92px] md:px-2">
																		<RecentFormDots
																			values={
																				player.recent_form
																			}
																		/>
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
