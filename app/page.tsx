"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";
import { AuthScreen } from "@/components/auth/auth-screen";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Stack } from "@/components/ui/stack";
import { Box } from "@/components/ui/box";
import { Loading } from "@/components/ui/loading";
import { t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatElo, formatEloDelta } from "@/lib/elo/format";
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	ResponsiveContainer,
	Tooltip,
	CartesianGrid,
} from "recharts";

type ActiveSession = {
	id: string;
	player_count: number;
	created_at: string;
};

type NoShowUser = {
	id: string;
	name: string;
	avatar: string | null;
	noShowCount: number;
	lastNoShowDate: string;
};

type PlayerStat = {
	player_id: string;
	display_name: string;
	avatar: string | null;
	elo: number;
	matches_played: number;
	wins: number;
	losses: number;
	draws: number;
};

function Top3PlayersWidget() {
	const [topPlayers, setTopPlayers] = useState<PlayerStat[]>([]);
	const [loading, setLoading] = useState(true);

	const CACHE_KEY = "top3players_cache";
	const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

	useEffect(() => {
		const fetchTopPlayers = async () => {
			try {
				setLoading(true);

				// Check cache first
				const cachedData = localStorage.getItem(CACHE_KEY);
				if (cachedData) {
					try {
						const { data, timestamp } = JSON.parse(cachedData);
						const now = Date.now();
						if (now - timestamp < CACHE_DURATION) {
							// Cache is still fresh
							setTopPlayers(data);
							setLoading(false);
							return;
						}
					} catch (e) {
						// Invalid cache, continue to fetch
						console.warn("Invalid cache data, fetching fresh data");
					}
				}

				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					setTopPlayers([]);
					return;
				}

				const response = await fetch("/api/statistics/top3", {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				});

				if (!response.ok) {
					setTopPlayers([]);
					return;
				}

				const data = await response.json();
				// Top 3 players (already sorted by Elo descending from API)
				const top3 = data.data || [];
				setTopPlayers(top3);

				// Cache the data
				localStorage.setItem(
					CACHE_KEY,
					JSON.stringify({
						data: top3,
						timestamp: Date.now(),
					})
				);
			} catch (error) {
				console.error("Error fetching top players:", error);
				setTopPlayers([]);
			} finally {
				setLoading(false);
			}
		};

		fetchTopPlayers();
	}, []);

	const second = topPlayers[1];
	const first = topPlayers[0];
	const third = topPlayers[2];

	return (
		<Box className="bg-card rounded-[24px] border border-border/50 shadow-sm relative overflow-hidden px-6 pt-4 pb-0 aspect-[7/5] flex flex-col">
			{/* Blurred primary background circle */}
			<Box className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-primary/20 blur-[60px] rounded-full pointer-events-none" />

			{/* Podium layout */}
			<Stack direction="row" alignItems="end" justifyContent="center" spacing={3} className="flex-1 pt-4 pb-0 relative z-10 min-h-[192px]">
				{loading ? (
					<>
						{/* Loading skeleton - 2nd Place */}
						<Stack direction="column" alignItems="center" justifyContent="end" className="w-1/3 h-full">
							<Box className="relative mb-3 flex-shrink-0">
								<Box className="w-[clamp(3rem,15%,4rem)] h-[clamp(3rem,15%,4rem)] aspect-square rounded-full p-0.5 bg-gradient-to-tr from-zinc-500 to-zinc-300 shadow-lg mx-auto animate-pulse">
									<Box className="size-full rounded-full bg-zinc-700/50 border-2 border-card" />
								</Box>
								<Box className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-zinc-700 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-card shadow-sm animate-pulse">
									#2
								</Box>
							</Box>
							<Box className="h-4 w-16 bg-zinc-700/50 rounded mb-1 animate-pulse" />
							<Box className="flex-[0.85] min-h-[4rem] w-full bg-gradient-to-b from-zinc-600/70 to-zinc-800/50 mt-1 rounded-t-lg border-t border-zinc-400/30 relative flex flex-col items-center justify-start pt-1.5 animate-pulse">
								<Box className="h-3 w-12 bg-zinc-700/50 rounded" />
							</Box>
						</Stack>

						{/* Loading skeleton - 1st Place */}
						<Stack direction="column" alignItems="center" justifyContent="end" className="w-1/3 -mt-4 z-20 h-full">
							<Box className="relative mb-3 flex-shrink-0">
								<Box className="w-[clamp(4rem,20%,5rem)] h-[clamp(4rem,20%,5rem)] aspect-square rounded-full p-0.5 bg-gradient-to-tr from-yellow-500 via-amber-300 to-yellow-600 shadow-xl shadow-yellow-500/10 mx-auto animate-pulse">
									<Box className="size-full rounded-full bg-yellow-800/50 border-4 border-card" />
								</Box>
								<Box className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-yellow-500 text-black text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-card shadow-sm animate-pulse">
									#1
								</Box>
							</Box>
							<Box className="h-4 w-20 bg-yellow-800/50 rounded mb-1 animate-pulse" />
							<Box className="flex-[1] min-h-[6rem] w-full bg-gradient-to-b from-yellow-800/50 to-yellow-900/30 mt-1 rounded-t-lg border-t border-yellow-600/40 relative flex flex-col items-center justify-start pt-1.5 animate-pulse">
								<Box className="h-3 w-14 bg-yellow-800/50 rounded" />
							</Box>
						</Stack>

						{/* Loading skeleton - 3rd Place */}
						<Stack direction="column" alignItems="center" justifyContent="end" className="w-1/3 z-10 h-full">
							<Box className="relative mb-3 flex-shrink-0">
								<Box className="w-[clamp(3rem,15%,4rem)] h-[clamp(3rem,15%,4rem)] aspect-square rounded-full p-0.5 bg-gradient-to-tr from-orange-700 to-amber-700 shadow-lg mx-auto animate-pulse">
									<Box className="size-full rounded-full bg-orange-800/50 border-2 border-card" />
								</Box>
								<Box className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-amber-800 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-card shadow-sm animate-pulse">
									#3
								</Box>
							</Box>
							<Box className="h-4 w-16 bg-orange-800/50 rounded mb-1 animate-pulse" />
							<Box className="flex-[0.7] min-h-[3rem] w-full bg-gradient-to-b from-orange-800/60 to-orange-900/40 mt-1 rounded-t-lg border-t border-orange-700/40 relative flex flex-col items-center justify-start pt-1.5 animate-pulse">
								<Box className="h-3 w-12 bg-orange-800/50 rounded" />
							</Box>
						</Stack>
					</>
				) : (
					<>
						{/* 2nd Place */}
						{second && (
					<Stack direction="column" alignItems="center" justifyContent="end" className="w-1/3 h-full">
						<Box className="relative mb-3 flex-shrink-0">
							<Box className="w-[clamp(3rem,15%,4rem)] h-[clamp(3rem,15%,4rem)] aspect-square rounded-full p-0.5 bg-gradient-to-tr from-zinc-500 to-zinc-300 shadow-lg mx-auto">
								<Avatar className="size-full aspect-square rounded-full border-2 border-card">
									<AvatarImage
										src={second.avatar || undefined}
										alt={second.display_name}
									/>
									<AvatarFallback>
										{second.display_name.charAt(0).toUpperCase()}
									</AvatarFallback>
								</Avatar>
							</Box>
							<Box className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-zinc-700 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-card shadow-sm">
								#2
							</Box>
						</Box>
						<p className="text-sm font-semibold text-center mb-1">
							{second.display_name}
						</p>
						{/* Podium bar - flexible height based on available space */}
						<Box className="flex-[0.85] min-h-[4rem] w-full bg-gradient-to-b from-zinc-600/70 to-zinc-800/50 mt-1 rounded-t-lg border-t border-zinc-400/30 relative flex flex-col items-center justify-start pt-1.5">
							<p className="text-xs text-muted-foreground font-mono text-center">
								{formatElo(second.elo, true)}
							</p>
						</Box>
					</Stack>
				)}

				{/* 1st Place */}
				{first && (
					<Stack direction="column" alignItems="center" justifyContent="end" className="w-1/3 -mt-4 z-20 h-full">
						<Box className="relative mb-3 flex-shrink-0">
							<Box className="w-[clamp(4rem,20%,5rem)] h-[clamp(4rem,20%,5rem)] aspect-square rounded-full p-0.5 bg-gradient-to-tr from-yellow-500 via-amber-300 to-yellow-600 shadow-xl shadow-yellow-500/10 mx-auto">
								<Avatar className="size-full aspect-square rounded-full border-4 border-card">
									<AvatarImage
										src={first.avatar || undefined}
										alt={first.display_name}
									/>
									<AvatarFallback className="text-lg">
										{first.display_name.charAt(0).toUpperCase()}
									</AvatarFallback>
								</Avatar>
							</Box>
							<Box className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-yellow-500 text-black text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-card shadow-sm">
								#1
							</Box>
						</Box>
						<p className="text-sm font-semibold text-center mb-1">
							{first.display_name}
						</p>
						{/* Podium bar - flexible height, tallest */}
						<Box className="flex-[1] min-h-[6rem] w-full bg-gradient-to-b from-yellow-800/50 to-yellow-900/30 mt-1 rounded-t-lg border-t border-yellow-600/40 relative flex flex-col items-center justify-start pt-1.5">
							<p className="text-xs text-yellow-500 font-mono font-bold text-center">
								{formatElo(first.elo, true)}
							</p>
						</Box>
					</Stack>
				)}

				{/* 3rd Place */}
				{third && (
					<Stack direction="column" alignItems="center" justifyContent="end" className="w-1/3 z-10 h-full">
						<Box className="relative mb-3 flex-shrink-0">
							<Box className="w-[clamp(3rem,15%,4rem)] h-[clamp(3rem,15%,4rem)] aspect-square rounded-full p-0.5 bg-gradient-to-tr from-orange-700 to-amber-700 shadow-lg mx-auto">
								<Avatar className="size-full aspect-square rounded-full border-2 border-card">
									<AvatarImage
										src={third.avatar || undefined}
										alt={third.display_name}
									/>
									<AvatarFallback>
										{third.display_name.charAt(0).toUpperCase()}
									</AvatarFallback>
								</Avatar>
							</Box>
							<Box className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-amber-800 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-card shadow-sm">
								#3
							</Box>
						</Box>
						<p className="text-sm font-semibold text-center mb-1">
							{third.display_name}
						</p>
						{/* Podium bar - flexible height, shortest */}
						<Box className="flex-[0.7] min-h-[3rem] w-full bg-gradient-to-b from-orange-800/60 to-orange-900/40 mt-1 rounded-t-lg border-t border-orange-700/40 relative flex flex-col items-center justify-start pt-1.5">
							<p className="text-xs text-muted-foreground font-mono text-center">
								{formatElo(third.elo, true)}
							</p>
						</Box>
					</Stack>
				)}
					</>
				)}
			</Stack>
		</Box>
	);
}

type EloHistoryDataPoint = {
	match: number;
	elo: number;
	date: string;
	opponent: string;
	delta: number;
};

type FilterType = "all" | "last4" | "last2" | "last1";

function EloChartWidget() {
	const [eloHistory, setEloHistory] = useState<EloHistoryDataPoint[]>([]);
	const [currentElo, setCurrentElo] = useState<number>(1500);
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
					return;
				}

				const response = await fetch("/api/player/elo-history", {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				});

				if (!response.ok) {
					setEloHistory([]);
					return;
				}

				const data = await response.json();
				setEloHistory(data.data || []);
				setCurrentElo(data.currentElo || 1500);
			} catch (error) {
				console.error("Error fetching Elo history:", error);
				setEloHistory([]);
			} finally {
				setLoading(false);
			}
		};

		fetchEloHistory();
	}, []);

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
	}, [filter, eloHistory.length]); // Use eloHistory.length instead of filteredHistory

	if (loading) {
		return null;
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
	const getFilteredHistory = () => {
		if (filter === "all") {
			return eloHistory;
		}

		// Group by session date (normalize date to just date part, ignoring time)
		const sessionDates = new Set<string>();
		const dateToPoints = new Map<string, EloHistoryDataPoint[]>();

		for (const point of eloHistory) {
			const date = new Date(point.date);
			const dateKey = date.toISOString().split("T")[0]; // YYYY-MM-DD
			sessionDates.add(dateKey);
			if (!dateToPoints.has(dateKey)) {
				dateToPoints.set(dateKey, []);
			}
			dateToPoints.get(dateKey)!.push(point);
		}

		// Get unique session dates sorted by date (most recent first)
		const sortedSessionDates = Array.from(sessionDates).sort((a, b) => b.localeCompare(a));

		// Get the last N sessions
		let sessionsToInclude = 0;
		if (filter === "last1") sessionsToInclude = 1;
		else if (filter === "last2") sessionsToInclude = 2;
		else if (filter === "last4") sessionsToInclude = 4;

		const selectedDates = sortedSessionDates.slice(0, sessionsToInclude);
		const filtered: EloHistoryDataPoint[] = [];

		// Collect all points from selected sessions, maintaining original order
		for (const point of eloHistory) {
			const date = new Date(point.date);
			const dateKey = date.toISOString().split("T")[0];
			if (selectedDates.includes(dateKey)) {
				filtered.push(point);
			}
		}

		return filtered;
	};

	const filteredHistory = getFilteredHistory();

	// Calculate Y-axis domain to match exact data range (no padding)
	const eloValues = filteredHistory.map((point) => point.elo);
	const minElo = eloHistory.length > 0 ? Math.min(...eloValues) : 0;
	const maxElo = eloHistory.length > 0 ? Math.max(...eloValues) : 0;
	const yAxisDomain = eloValues.length > 0 ? [minElo, maxElo] : [1500, 1500];

	return (
		<Box className="bg-card rounded-[24px] border border-border/50 p-6 relative overflow-hidden">
			<Stack direction="column" spacing={4}>
				{/* Header */}
				<Stack direction="column" spacing={3}>
					<Stack direction="row" alignItems="center" justifyContent="space-between" className="flex-wrap gap-4">
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
							<Box ref={scrollContainerRef} className="overflow-x-auto md:overflow-visible scrollbar-hide relative">
								<Stack direction="row" alignItems="center" spacing={1} className="flex-nowrap whitespace-nowrap min-w-max">
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
					<Stack direction="row" alignItems="baseline" spacing={6} className="flex-wrap">
						{/* Current Elo - Main stat */}
						<Stack direction="column" spacing={0.5}>
							<p className="text-[11px] text-muted-foreground font-medium">{t.performanceTrend.currentElo}</p>
							<p className="text-2xl font-bold font-heading text-foreground">
								{formatElo(currentElo, true)}
							</p>
						</Stack>
						{filteredHistory.length > 0 && (
							<>
								{/* Peak Elo */}
								<Stack direction="column" spacing={0.5}>
									<Stack direction="row" alignItems="center" spacing={1.5}>
										<Icon icon="solar:graph-up-bold" className="size-3 text-emerald-500" />
										<p className="text-[11px] text-muted-foreground font-medium">{t.performanceTrend.peak}</p>
									</Stack>
									<p className="text-2xl font-bold font-heading text-emerald-500">
										{formatElo(maxElo, true)}
									</p>
								</Stack>
								{/* Lowest Elo */}
								<Stack direction="column" spacing={0.5}>
									<Stack direction="row" alignItems="center" spacing={1.5}>
										<Icon icon="solar:graph-down-bold" className="size-3 text-red-500" />
										<p className="text-[11px] text-muted-foreground font-medium">{t.performanceTrend.lowest}</p>
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
							data={filteredHistory}
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
								tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
							/>
							<YAxis
								domain={yAxisDomain}
								axisLine={false}
								tickLine={false}
								tick={false}
								width={0}
							/>
							<Tooltip
								contentStyle={{
									backgroundColor: "hsl(var(--card))",
									border: "1px solid hsl(var(--border))",
									borderRadius: "8px",
								}}
								labelFormatter={(value, payload) => {
									if (payload && payload[0]?.payload) {
										const dataPoint = payload[0].payload as EloHistoryDataPoint;
										const date = new Date(dataPoint.date);
										const formattedDate = date.toLocaleDateString("sr-Latn-RS", {
											month: "short",
											day: "numeric",
											year: "numeric",
										});
										const opponent = dataPoint.opponent || "Unknown";
										return `${formattedDate} • vs. ${opponent}`;
									}
									return "";
								}}
								formatter={(value: number, name: string, props: any) => {
									const dataPoint = props.payload as EloHistoryDataPoint;
									const delta = dataPoint?.delta ?? 0;
									const deltaFormatted = formatEloDelta(delta, true);
									const deltaColor = delta >= 0 ? "text-emerald-500" : "text-red-500";
									return [
										<span key="elo-delta">
											{formatElo(value, true)}{" "}
											<span className={deltaColor}>({deltaFormatted})</span>
										</span>,
										"Elo",
									];
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
									const fillColor = delta >= 0 ? "#10b981" : "#ef4444"; // emerald-500 : red-500
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
						</LineChart>
					</ResponsiveContainer>
				</Box>
			</Stack>
		</Box>
	);
}

function TableTennisGifWidget() {
	const [gifUrl, setGifUrl] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fetchGif = async () => {
			try {
				setLoading(true);
				// Using Giphy's random endpoint with table tennis tag
				const apiKey = process.env.NEXT_PUBLIC_GIPHY_API_KEY || 'dc6zaTOxFJmzC'; // fallback to demo key
				const response = await fetch(
					`https://api.giphy.com/v1/gifs/random?api_key=${apiKey}&tag=table+tennis+ping+pong&rating=g`
				);
				
				if (response.ok) {
					const data = await response.json();
					if (data?.data?.images?.downsized?.url) {
						setGifUrl(data.data.images.downsized.url);
						setLoading(false);
						return;
					}
				}
			} catch (error) {
				console.error("Error fetching gif:", error);
			}
			
			// Fallback: use curated table tennis gif URLs
			const fallbackUrls = [
				'https://media.giphy.com/media/3o7TKTnJYXYK8A0VQA/giphy.gif',
				'https://media.giphy.com/media/l0MYB5UzpU9M2B8Na/giphy.gif',
				'https://media.giphy.com/media/3o6Zt481isNVuQI1l6/giphy.gif',
				'https://media.giphy.com/media/26BRuo6sLetdllPAQ/giphy.gif',
				'https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif',
			];
			const randomUrl = fallbackUrls[Math.floor(Math.random() * fallbackUrls.length)];
			setGifUrl(randomUrl);
			setLoading(false);
		};

		fetchGif();
	}, []);

	if (loading) {
		return (
			<Box className="bg-card rounded-[24px] border border-border/50 p-6 aspect-[7/5] flex flex-col items-center justify-center">
				<Loading inline />
			</Box>
		);
	}

	return (
		<Box className="bg-card rounded-[24px] border border-border/50 aspect-[7/5] overflow-hidden relative">
			{gifUrl && (
				<img
					src={gifUrl}
					alt="Table tennis"
					className="absolute inset-0 w-full h-full object-cover"
				/>
			)}
		</Box>
	);
}

function NoShowAlertWidget() {
	const [worstOffender, setWorstOffender] = useState<NoShowUser | null>(null);
	const [loading, setLoading] = useState(true);

	const CACHE_KEY = "noshow_alert_cache";
	const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

	useEffect(() => {
		const fetchNoShowStats = async () => {
			try {
				setLoading(true);

				// Check cache first
				const cachedData = localStorage.getItem(CACHE_KEY);
				if (cachedData) {
					try {
						const { data, timestamp } = JSON.parse(cachedData);
						const now = Date.now();
						if (now - timestamp < CACHE_DURATION) {
							// Cache is still fresh
							setWorstOffender(data);
							setLoading(false);
							return;
						}
					} catch (e) {
						// Invalid cache, continue to fetch
						console.warn("Invalid cache data, fetching fresh data");
					}
				}

				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					setWorstOffender(null);
					return;
				}

				const response = await fetch("/api/no-shows", {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				});

				if (!response.ok) {
					setWorstOffender(null);
					return;
				}

				const data = await response.json();
				const users = data.users || [];
				// Worst offender is the first one (sorted by count descending)
				const worst = users[0] || null;
				setWorstOffender(worst);

				// Cache the data
				localStorage.setItem(
					CACHE_KEY,
					JSON.stringify({
						data: worst,
						timestamp: Date.now(),
					})
				);
			} catch (error) {
				console.error("Error fetching no-show stats:", error);
				setWorstOffender(null);
			} finally {
				setLoading(false);
			}
		};

		fetchNoShowStats();
	}, []);

		if (loading) {
		return (
			<Box className="bg-card rounded-[24px] border border-border/50 shadow-sm relative overflow-hidden p-6 aspect-[7/5] flex flex-col">
				{/* Blurred destructive background circle */}
				<Box className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-destructive/20 blur-[60px] rounded-full pointer-events-none" />
				<Box className="flex items-center justify-center mb-4 relative z-10">
					<Box className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
						{t.ispale.noShowAlert}
					</Box>
				</Box>

				<Stack
					direction="column"
					alignItems="center"
					justifyContent="center"
					spacing={4}
					className="relative z-10 w-full flex-1"
				>
					{/* Avatar skeleton */}
					<Box className="relative shrink-0">
						<Box className="size-20 rounded-full bg-destructive/20 border-2 border-destructive/30 animate-pulse" />
						<Box className="absolute -bottom-1 -right-1 bg-destructive/50 size-6 rounded-full border-2 border-card animate-pulse" />
					</Box>

					{/* Content skeleton */}
					<Stack direction="column" spacing={1} alignItems="center" className="w-full">
						<Box className="h-5 w-32 bg-muted-foreground/20 rounded animate-pulse" />
						<Box className="h-3 w-24 bg-muted-foreground/20 rounded animate-pulse" />
					</Stack>
				</Stack>
			</Box>
		);
	}

	if (!worstOffender) {
		return null;
	}

	return (
		<Box className="bg-card rounded-[24px] border border-border/50 shadow-sm relative overflow-hidden p-6 aspect-[7/5] flex flex-col">
			{/* Blurred destructive background circle */}
			<Box className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-destructive/20 blur-[60px] rounded-full pointer-events-none" />
			<Box className="flex items-center justify-center mb-4 relative z-10">
				<Box className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
					{t.ispale.noShowAlert}
				</Box>
			</Box>

			<Stack
				direction="column"
				alignItems="center"
				justifyContent="center"
				spacing={4}
				className="relative z-10 w-full flex-1"
			>
				{/* Avatar with danger badge */}
				<Box className="relative shrink-0">
					<Avatar className="size-20 border-2 border-destructive/30">
						<AvatarImage
							src={worstOffender.avatar || undefined}
							alt={worstOffender.name}
						/>
						<AvatarFallback>
							{worstOffender.name.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>
					<Box className="absolute -bottom-1 -right-1 bg-destructive text-white size-6 rounded-full flex items-center justify-center text-xs border-2 border-card">
						<Icon icon="solar:danger-bold" />
					</Box>
				</Box>

				{/* Content */}
				<Stack direction="column" spacing={1} alignItems="center" className="w-full">
					<p className="text-lg font-bold text-center">
						{worstOffender.name}
					</p>
					<p className="text-xs text-muted-foreground text-center">
						{t.ispale.last}: {formatRelativeTime(worstOffender.lastNoShowDate)} • {worstOffender.noShowCount} {worstOffender.noShowCount === 1 ? t.ispale.miss : t.ispale.misses}
					</p>
				</Stack>
			</Stack>
		</Box>
	);
}

function ActiveSessionBanner({ session }: { session: ActiveSession }) {
	const router = useRouter();

	return (
		<Card className="border-primary/20 bg-card">
			<CardContent className="p-4 !pt-4">
				<Stack direction="row" alignItems="center" justifyContent="between" spacing={4}>
					<Stack direction="column" spacing={1} className="flex-1 min-w-0">
						<Stack direction="row" alignItems="center" spacing={2}>
							<Box className="size-2 rounded-full bg-chart-2 animate-pulse shrink-0" />
							<p className="font-bold text-sm">{t.activeSession.title}</p>
						</Stack>
						<p className="text-xs text-muted-foreground">
							{t.activeSession.playerCount.replace("{count}", session.player_count.toString())} • {t.activeSession.started}{" "}
							{formatRelativeTime(session.created_at)}
						</p>
					</Stack>
					<Button
						onClick={() => router.push(`/session/${session.id}`)}
						className="shrink-0"
					>
						<Stack direction="row" alignItems="center" spacing={2}>
							<span>{t.activeSession.continue}</span>
							<Icon icon="solar:arrow-right-linear" className="size-4" />
						</Stack>
					</Button>
				</Stack>
			</CardContent>
		</Card>
	);
}

/**
 * Root route handler
 *
 * Uses centralized auth hook for reactive auth state.
 * Automatically updates UI on login/logout via onAuthStateChange.
 */
export default function HomePage() {
	const { isAuthenticated } = useAuth();
	const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
	const [loadingSession, setLoadingSession] = useState(true);

	// Fetch active session
	useEffect(() => {
		const fetchActiveSession = async () => {
			if (!isAuthenticated) {
				setActiveSession(null);
				setLoadingSession(false);
				return;
			}

			try {
				setLoadingSession(true);
				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					setActiveSession(null);
					return;
				}

				const response = await fetch("/api/sessions/active", {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				});

				if (!response.ok) {
					console.error("Failed to fetch active session");
					setActiveSession(null);
					return;
				}

				const data = await response.json();
				setActiveSession(data.session || null);
			} catch (error) {
				console.error("Error fetching active session:", error);
				setActiveSession(null);
			} finally {
				setLoadingSession(false);
			}
		};

		fetchActiveSession();
	}, [isAuthenticated]);

	// Show loading state briefly to prevent flicker
	if (isAuthenticated === null) {
		return (
			<div className="min-h-screen bg-background">
				<Loading />
			</div>
		);
	}

	// Show login screen if not authenticated
	if (!isAuthenticated) {
		return <AuthScreen />;
	}

	// Render dashboard if authenticated
	return (
		<SidebarProvider>
			<AppSidebar variant="inset" />
			<SidebarInset>
				<SiteHeader title={t.pages.dashboard} />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
							{/* Active Session Banner */}
							{!loadingSession && activeSession && (
								<ActiveSessionBanner session={activeSession} />
							)}

							{/* Widget Grid */}
							<Stack direction="column" spacing={4}>
								{/* First Row: 3 widgets */}
								<Box className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
									<Top3PlayersWidget />
									<NoShowAlertWidget />
									<Box className="hidden md:block">
										<TableTennisGifWidget />
									</Box>
								</Box>

								{/* Second Row: 1 full-width widget */}
								<EloChartWidget />
							</Stack>
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
