"use client";

import { useEffect, useState, useRef } from "react";
import { Box } from "@/components/ui/box";
import { Stack } from "@/components/ui/stack";
import { Icon } from "@/components/ui/icon";
import { Loading } from "@/components/ui/loading";
import { supabase } from "@/lib/supabase/client";
import { formatElo, formatEloDelta } from "@/lib/elo/format";
import { t } from "@/lib/i18n";
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	ResponsiveContainer,
	Tooltip,
	CartesianGrid,
} from "recharts";

type EloHistoryDataPoint = {
	match: number;
	elo: number;
	date: string;
	opponent: string;
	delta: number;
};

type FilterType = "all" | "last4" | "last2" | "last1";

type PerformanceTrendProps = {
	playerId?: string;
	secondaryPlayerId?: string;
	primaryPlayerName?: string;
};

type CombinedDataPoint = {
	match: number;
	elo?: number;
	date: string;
	opponent: string;
	delta: number;
	secondaryElo?: number;
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function PerformanceTrend({ playerId, secondaryPlayerId, primaryPlayerName: primaryPlayerNameProp }: PerformanceTrendProps) {
	const [eloHistory, setEloHistory] = useState<EloHistoryDataPoint[]>([]);
	const [secondaryEloHistory, setSecondaryEloHistory] = useState<EloHistoryDataPoint[]>([]);
	const [currentElo, setCurrentElo] = useState<number>(1500);
	const [secondaryCurrentElo, setSecondaryCurrentElo] = useState<number>(1500);
	const [primaryPlayerName, setPrimaryPlayerName] = useState<string>(primaryPlayerNameProp || "");
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState<FilterType>("all");
	const [showLeftMask, setShowLeftMask] = useState(false);
	const [showRightMask, setShowRightMask] = useState(true);
	const scrollContainerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const fetchEloHistory = async () => {
			try {
				setLoading(true);
				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					setEloHistory([]);
					setSecondaryEloHistory([]);
					return;
				}

				// Get primary player name (use prop if available, otherwise fetch)
				if (!primaryPlayerNameProp) {
					if (playerId) {
						// Fetch player name from API
						try {
							const playerResponse = await fetch(`/api/player/${playerId}`, {
								headers: {
									Authorization: `Bearer ${session.access_token}`,
								},
							});
							if (playerResponse.ok) {
								const playerData = await playerResponse.json();
								setPrimaryPlayerName(playerData.display_name || "");
							}
						} catch (e) {
							console.error("Error fetching player name:", e);
						}
					} else {
						// Use current user's name from session
						const userName =
							session.user.user_metadata?.display_name ||
							session.user.user_metadata?.name ||
							session.user.email?.split("@")[0] ||
							"You";
						setPrimaryPlayerName(userName);
					}
				} else {
					setPrimaryPlayerName(primaryPlayerNameProp);
				}

				// Cache keys based on player IDs
				const primaryCacheKey = playerId
					? `elo_history_${playerId}`
					: `elo_history_${session.user.id}`;
				const secondaryCacheKey = secondaryPlayerId
					? `elo_history_${secondaryPlayerId}`
					: null;

				// Try to get primary player data from cache
				const primaryCachedData = localStorage.getItem(primaryCacheKey);
				if (primaryCachedData) {
					try {
						const { data, currentElo: cachedElo, timestamp } = JSON.parse(primaryCachedData);
						const now = Date.now();
						if (now - timestamp < CACHE_DURATION) {
							// Cache is still fresh
							setEloHistory(data || []);
							setCurrentElo(cachedElo || 1500);
						} else {
							// Cache expired, fetch fresh data
							throw new Error("Cache expired");
						}
					} catch (e) {
						// Invalid cache or expired, fetch fresh data
						const primaryUrl = playerId
							? `/api/player/elo-history?playerId=${encodeURIComponent(playerId)}`
							: "/api/player/elo-history";

						const primaryResponse = await fetch(primaryUrl, {
							headers: {
								Authorization: `Bearer ${session.access_token}`,
							},
						});

						if (primaryResponse.ok) {
							const primaryData = await primaryResponse.json();
							setEloHistory(primaryData.data || []);
							setCurrentElo(primaryData.currentElo || 1500);

							// Cache the data
							localStorage.setItem(
								primaryCacheKey,
								JSON.stringify({
									data: primaryData.data || [],
									currentElo: primaryData.currentElo || 1500,
									timestamp: Date.now(),
								})
							);
						} else {
							setEloHistory([]);
						}
					}
				} else {
					// No cache, fetch fresh data
					const primaryUrl = playerId
						? `/api/player/elo-history?playerId=${encodeURIComponent(playerId)}`
						: "/api/player/elo-history";

					const primaryResponse = await fetch(primaryUrl, {
						headers: {
							Authorization: `Bearer ${session.access_token}`,
						},
					});

					if (primaryResponse.ok) {
						const primaryData = await primaryResponse.json();
						setEloHistory(primaryData.data || []);
						setCurrentElo(primaryData.currentElo || 1500);

						// Cache the data
						localStorage.setItem(
							primaryCacheKey,
							JSON.stringify({
								data: primaryData.data || [],
								currentElo: primaryData.currentElo || 1500,
								timestamp: Date.now(),
							})
						);
					} else {
						setEloHistory([]);
					}
				}

				// Fetch secondary player history if provided
				if (secondaryPlayerId && secondaryCacheKey) {
					// Try to get secondary player data from cache
					const secondaryCachedData = localStorage.getItem(secondaryCacheKey);
					if (secondaryCachedData) {
						try {
							const { data, currentElo: cachedElo, timestamp } = JSON.parse(secondaryCachedData);
							const now = Date.now();
							if (now - timestamp < CACHE_DURATION) {
								// Cache is still fresh
								setSecondaryEloHistory(data || []);
								setSecondaryCurrentElo(cachedElo || 1500);
							} else {
								// Cache expired, fetch fresh data
								throw new Error("Cache expired");
							}
						} catch (e) {
							// Invalid cache or expired, fetch fresh data
							const secondaryUrl = `/api/player/elo-history?playerId=${encodeURIComponent(secondaryPlayerId)}`;
							const secondaryResponse = await fetch(secondaryUrl, {
								headers: {
									Authorization: `Bearer ${session.access_token}`,
								},
							});

							if (secondaryResponse.ok) {
								const secondaryData = await secondaryResponse.json();
								setSecondaryEloHistory(secondaryData.data || []);
								setSecondaryCurrentElo(secondaryData.currentElo || 1500);

								// Cache the data
								localStorage.setItem(
									secondaryCacheKey,
									JSON.stringify({
										data: secondaryData.data || [],
										currentElo: secondaryData.currentElo || 1500,
										timestamp: Date.now(),
									})
								);
							} else {
								setSecondaryEloHistory([]);
							}
						}
					} else {
						// No cache, fetch fresh data
						const secondaryUrl = `/api/player/elo-history?playerId=${encodeURIComponent(secondaryPlayerId)}`;
						const secondaryResponse = await fetch(secondaryUrl, {
							headers: {
								Authorization: `Bearer ${session.access_token}`,
							},
						});

						if (secondaryResponse.ok) {
							const secondaryData = await secondaryResponse.json();
							setSecondaryEloHistory(secondaryData.data || []);
							setSecondaryCurrentElo(secondaryData.currentElo || 1500);

							// Cache the data
							localStorage.setItem(
								secondaryCacheKey,
								JSON.stringify({
									data: secondaryData.data || [],
									currentElo: secondaryData.currentElo || 1500,
									timestamp: Date.now(),
								})
							);
						} else {
							setSecondaryEloHistory([]);
						}
					}
				} else {
					setSecondaryEloHistory([]);
				}
			} catch (error) {
				console.error("Error fetching Elo history:", error);
				setEloHistory([]);
				setSecondaryEloHistory([]);
			} finally {
				setLoading(false);
			}
		};

		fetchEloHistory();
	}, [playerId, secondaryPlayerId]);

	// Check scroll position to show/hide fade masks
	const checkScrollPosition = () => {
		const container = scrollContainerRef.current;
		if (!container) return;

		const { scrollLeft, scrollWidth, clientWidth } = container;
		const isAtStart = scrollLeft <= 1;
		const isAtEnd = scrollLeft + clientWidth >= scrollWidth - 1;

		setShowLeftMask(!isAtStart);
		setShowRightMask(!isAtEnd);
	};

	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;

		// Check initial state after a brief delay to ensure DOM is ready
		const timeoutId = setTimeout(() => {
			checkScrollPosition();
		}, 100);

		// Add scroll listener
		container.addEventListener("scroll", checkScrollPosition);
		return () => {
			clearTimeout(timeoutId);
			container.removeEventListener("scroll", checkScrollPosition);
		};
	}, [filter, eloHistory.length]);

	if (loading) {
		return (
			<Box className="bg-card rounded-[24px] border border-border/50 p-6 min-h-[300px]">
				<Loading label={t.performanceTrend.loading} inline />
			</Box>
		);
	}

	// If no data or only one point, show placeholder
	if (eloHistory.length === 0 || eloHistory.length === 1) {
		return (
			<Box className="bg-card rounded-[24px] border border-border/50 p-6 min-h-[300px] flex items-center justify-center">
				<p className="text-muted-foreground text-center">
					Not enough match data to display chart
				</p>
			</Box>
		);
	}

	// Filter by sessions: group by date (session date) and filter
	const getFilteredHistory = (history: EloHistoryDataPoint[]) => {
		if (filter === "all") {
			return history;
		}

		// Group by session date (normalize date to just date part, ignoring time)
		const sessionDates = new Set<string>();
		const dateToPoints = new Map<string, EloHistoryDataPoint[]>();

		for (const point of history) {
			const date = new Date(point.date);
			const dateKey = date.toISOString().split("T")[0]; // YYYY-MM-DD
			sessionDates.add(dateKey);
			if (!dateToPoints.has(dateKey)) {
				dateToPoints.set(dateKey, []);
			}
			dateToPoints.get(dateKey)!.push(point);
		}

		// Get unique session dates sorted by date (most recent first)
		const sortedSessionDates = Array.from(sessionDates).sort((a, b) =>
			b.localeCompare(a)
		);

		// Get the last N sessions
		let sessionsToInclude = 0;
		if (filter === "last1") sessionsToInclude = 1;
		else if (filter === "last2") sessionsToInclude = 2;
		else if (filter === "last4") sessionsToInclude = 4;

		const selectedDates = sortedSessionDates.slice(0, sessionsToInclude);
		const filtered: EloHistoryDataPoint[] = [];

		// Collect all points from selected sessions, maintaining original order
		for (const point of history) {
			const date = new Date(point.date);
			const dateKey = date.toISOString().split("T")[0];
			if (selectedDates.includes(dateKey)) {
				filtered.push(point);
			}
		}

		return filtered;
	};

	const filteredHistory = getFilteredHistory(eloHistory);
	const filteredSecondaryHistory = getFilteredHistory(secondaryEloHistory);

	// Combine data for chart - normalize secondary player to primary player's match progression
	// Primary player determines the X-axis (match positions)
	const combinedData: CombinedDataPoint[] = [];
	
	if (filteredHistory.length > 0 && secondaryPlayerId && filteredSecondaryHistory.length > 0) {
		const primaryMatchCount = filteredHistory.length;
		const secondaryMatchCount = filteredSecondaryHistory.length;
		
		// Normalize secondary player's data to match primary player's progression
		filteredHistory.forEach((primaryPoint, primaryIndex) => {
			const combined: CombinedDataPoint = {
				match: primaryPoint.match,
				elo: primaryPoint.elo,
				date: primaryPoint.date,
				opponent: primaryPoint.opponent,
				delta: primaryPoint.delta,
			};
			
			// Calculate normalized position (0 to 1) in primary's progression
			const primaryProgress = primaryMatchCount > 1 
				? primaryIndex / (primaryMatchCount - 1) 
				: 0;
			
			// Map to secondary player's corresponding match index
			const secondaryIndex = Math.round(primaryProgress * (secondaryMatchCount - 1));
			const secondaryPoint = filteredSecondaryHistory[secondaryIndex];
			
			if (secondaryPoint) {
				combined.secondaryElo = secondaryPoint.elo;
			}
			
			combinedData.push(combined);
		});
	} else {
		// No secondary player or no secondary data - just use primary data
		combinedData.push(...filteredHistory.map((point) => ({
			match: point.match,
			elo: point.elo,
			date: point.date,
			opponent: point.opponent,
			delta: point.delta,
		})));
	}

	// Calculate Y-axis domain to include both players' data
	const allEloValues = [
		...filteredHistory.map((p) => p.elo),
		...filteredSecondaryHistory.map((p) => p.elo),
	];
	const minElo = allEloValues.length > 0 ? Math.min(...allEloValues) : 1500;
	const maxElo = allEloValues.length > 0 ? Math.max(...allEloValues) : 1500;
	const yAxisDomain =
		allEloValues.length > 0 ? [minElo, maxElo] : [1500, 1500];

	return (
		<Box className="bg-card rounded-[24px] border border-border/50 p-6 relative overflow-hidden">
			<Stack direction="column" spacing={4}>
				{/* Header */}
				<Stack direction="column" spacing={3}>
					<Stack
						direction="row"
						alignItems="center"
						justifyContent="between"
						className="flex-wrap gap-4"
					>
						<p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
							{t.performanceTrend.title}
						</p>
						{/* Filter buttons */}
						<Box className="relative w-full md:w-auto mt-2 md:mt-0 md:ml-auto">
							{/* Fade masks for mobile - positioned at viewport edges, outside scroll container */}
							{showLeftMask && (
								<Box className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-card via-card/80 to-transparent pointer-events-none z-10 md:hidden" />
							)}
							{showRightMask && (
								<Box className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-card via-card/80 to-transparent pointer-events-none z-10 md:hidden" />
							)}
							{/* Scrollable container - scroll stays within content area */}
							<Box
								ref={scrollContainerRef}
								className="overflow-x-auto md:overflow-visible scrollbar-hide relative"
							>
								<Stack
									direction="row"
									alignItems="center"
									spacing={1}
									className="flex-nowrap whitespace-nowrap min-w-max"
								>
									<button
										onClick={() => setFilter("all")}
										className={`px-3 py-1 rounded-md text-xs font-medium transition-colors shrink-0 ${
											filter === "all"
												? "bg-primary text-primary-foreground"
												: "bg-secondary/50 text-muted-foreground hover:bg-secondary"
										}`}
									>
										{t.performanceTrend.filters.all}
									</button>
									<button
										onClick={() => setFilter("last4")}
										className={`px-3 py-1 rounded-md text-xs font-medium transition-colors shrink-0 ${
											filter === "last4"
												? "bg-primary text-primary-foreground"
												: "bg-secondary/50 text-muted-foreground hover:bg-secondary"
										}`}
									>
										{t.performanceTrend.filters.last4}
									</button>
									<button
										onClick={() => setFilter("last2")}
										className={`px-3 py-1 rounded-md text-xs font-medium transition-colors shrink-0 ${
											filter === "last2"
												? "bg-primary text-primary-foreground"
												: "bg-secondary/50 text-muted-foreground hover:bg-secondary"
										}`}
									>
										{t.performanceTrend.filters.last2}
									</button>
									<button
										onClick={() => setFilter("last1")}
										className={`px-3 py-1 rounded-md text-xs font-medium transition-colors shrink-0 ${
											filter === "last1"
												? "bg-primary text-primary-foreground"
												: "bg-secondary/50 text-muted-foreground hover:bg-secondary"
										}`}
									>
										{t.performanceTrend.filters.last1}
									</button>
								</Stack>
							</Box>
						</Box>
					</Stack>
					<Stack
						direction="row"
						alignItems="baseline"
						spacing={6}
						className="flex-wrap"
					>
						{/* Current Elo - Main stat */}
						<Stack direction="column" spacing={0.5}>
							<p className="text-[11px] text-muted-foreground font-medium">
								{t.performanceTrend.currentElo}
							</p>
							<p className="text-2xl font-bold font-heading text-foreground">
								{formatElo(currentElo, true)}
							</p>
						</Stack>
						{filteredHistory.length > 0 && (
							<>
								{/* Peak Elo */}
								<Stack direction="column" spacing={0.5}>
									<Stack
										direction="row"
										alignItems="center"
										spacing={1.5}
									>
										<Icon
											icon="solar:graph-up-bold"
											className="size-3 text-emerald-500"
										/>
										<p className="text-[11px] text-muted-foreground font-medium">
											{t.performanceTrend.peak}
										</p>
									</Stack>
									<p className="text-2xl font-bold font-heading text-emerald-500">
										{formatElo(maxElo, true)}
									</p>
								</Stack>
								{/* Lowest Elo */}
								<Stack direction="column" spacing={0.5}>
									<Stack
										direction="row"
										alignItems="center"
										spacing={1.5}
									>
										<Icon
											icon="solar:graph-down-bold"
											className="size-3 text-red-500"
										/>
										<p className="text-[11px] text-muted-foreground font-medium">
											{t.performanceTrend.lowest}
										</p>
									</Stack>
									<p className="text-2xl font-bold font-heading text-red-500">
										{formatElo(minElo, true)}
									</p>
								</Stack>
							</>
						)}
					</Stack>
				</Stack>

				{/* Chart */}
				<Box className="h-[300px] w-full">
					<ResponsiveContainer width="100%" height="100%">
						<LineChart
							data={combinedData}
							margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
						>
							<CartesianGrid
								strokeDasharray="3 3"
								stroke="hsl(var(--border))"
								opacity={0.2}
							/>
							<XAxis
								dataKey="match"
								axisLine={false}
								tickLine={false}
								tick={false}
							/>
							<YAxis
								domain={yAxisDomain}
								axisLine={false}
								tickLine={false}
								tick={false}
								width={0}
							/>
							<Tooltip
								content={({ active, payload }) => {
									if (!active || !payload || payload.length === 0) {
										return null;
									}

									const dataPoint = payload[0].payload as EloHistoryDataPoint;
									if (!dataPoint) return null;

									const date = new Date(dataPoint.date);
									const formattedDate = date.toLocaleDateString("sr-Latn-RS", {
										month: "short",
										day: "numeric",
										year: "numeric",
									});
									const formattedTime = date.toLocaleTimeString("sr-Latn-RS", {
										hour: "2-digit",
										minute: "2-digit",
									});

									const opponent = dataPoint.opponent || "Unknown";
									const elo = dataPoint.elo ?? (payload[0].value as number);
									const delta = dataPoint.delta ?? 0;
									const deltaFormatted = formatEloDelta(delta, true);

									// Determine result from delta
									let result: "Win" | "Loss" | "Draw";
									let resultColor: string;
									let resultIcon: string;
									if (delta > 0) {
										result = "Win";
										resultColor = "text-emerald-500";
										resultIcon = "solar:medal-ribbons-star-bold";
									} else if (delta < 0) {
										result = "Loss";
										resultColor = "text-red-500";
										resultIcon = "solar:close-circle-bold";
									} else {
										result = "Draw";
										resultColor = "text-muted-foreground";
										resultIcon = "solar:minus-circle-bold";
									}

									const deltaColor = delta >= 0 ? "text-emerald-500" : delta < 0 ? "text-red-500" : "text-muted-foreground";

									return (
										<Box className="bg-card border border-border rounded-lg shadow-lg p-4 min-w-[220px]">
											<Stack direction="column" spacing={3}>
												{/* Header: Date */}
												<Stack direction="column" spacing={0.5}>
													<p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
														{formattedDate}
													</p>
													<p className="text-[10px] text-muted-foreground">
														{formattedTime}
													</p>
												</Stack>

												{/* Match Info: Player vs Opponent */}
												<Stack direction="column" spacing={1}>
													<p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
														Match #{dataPoint.match}
													</p>
													<Stack direction="row" alignItems="center" spacing={2} className="flex-wrap">
														<p className="text-sm font-medium text-foreground">
															{primaryPlayerName}
														</p>
														<p className="text-sm text-muted-foreground">vs</p>
														<p className="text-sm font-medium text-foreground">
															{opponent}
														</p>
													</Stack>
												</Stack>

												{/* Result Badge */}
												<Stack direction="row" alignItems="center" spacing={1.5}>
													<Icon icon={resultIcon} className={`size-4 ${resultColor}`} />
													<p className={`text-sm font-semibold ${resultColor}`}>
														{result}
													</p>
												</Stack>

												{/* Elo Stats */}
												<Stack direction="column" spacing={2} className="pt-1 border-t border-border/50">
													<Stack direction="row" alignItems="baseline" justifyContent="between" spacing={3}>
														<p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
															Elo
														</p>
														<p className="text-base font-bold font-heading text-foreground">
															{formatElo(elo, true)}
														</p>
													</Stack>
													<Stack direction="row" alignItems="baseline" justifyContent="between" spacing={3}>
														<p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
															Change
														</p>
														<Stack direction="row" alignItems="center" spacing={1}>
															<Icon
																icon={delta >= 0 ? "solar:arrow-up-bold" : "solar:arrow-down-bold"}
																className={`size-3 ${deltaColor}`}
															/>
															<p className={`text-base font-bold font-heading ${deltaColor}`}>
																{deltaFormatted}
															</p>
														</Stack>
													</Stack>
												</Stack>
											</Stack>
										</Box>
									);
								}}
							/>
							<Line
								type="monotone"
								dataKey="elo"
								stroke="hsl(var(--primary))"
								strokeWidth={2}
								dot={(props: any) => {
									const { cx, cy, payload } = props;
									const dataPoint = payload as EloHistoryDataPoint;
									const delta = dataPoint?.delta ?? 0;
									const fillColor =
										delta >= 0 ? "#10b981" : "#ef4444"; // emerald-500 : red-500
									return (
										<circle
											cx={cx}
											cy={cy}
											r={4}
											fill={fillColor}
											stroke="hsl(var(--card))"
											strokeWidth={2}
										/>
									);
								}}
								activeDot={{ r: 5 }}
							/>
							{secondaryPlayerId && (
								<Line
									type="monotone"
									dataKey="secondaryElo"
									stroke="hsl(var(--muted-foreground))"
									strokeWidth={2}
									strokeOpacity={0.5}
									dot={false}
									activeDot={{ r: 5 }}
								/>
							)}
						</LineChart>
					</ResponsiveContainer>
				</Box>
			</Stack>
		</Box>
	);
}
