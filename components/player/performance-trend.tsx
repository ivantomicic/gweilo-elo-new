"use client";

import { useEffect, useState, useRef } from "react";
import { Box } from "@/components/ui/box";
import { Stack } from "@/components/ui/stack";
import { Icon } from "@/components/ui/icon";
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
};

export function PerformanceTrend({ playerId }: PerformanceTrendProps) {
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

				// Build URL with optional playerId parameter
				const url = playerId
					? `/api/player/elo-history?playerId=${encodeURIComponent(playerId)}`
					: "/api/player/elo-history";

				const response = await fetch(url, {
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
	}, [playerId]);

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
	const yAxisDomain =
		eloValues.length > 0 ? [minElo, maxElo] : [1500, 1500];

	return (
		<Box className="bg-card rounded-[24px] border border-border/50 p-6 relative overflow-hidden">
			<Stack direction="column" spacing={4}>
				{/* Header */}
				<Stack direction="column" spacing={3}>
					<Stack
						direction="row"
						alignItems="center"
						justifyContent="space-between"
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
								tick={{
									fill: "hsl(var(--muted-foreground))",
									fontSize: 12,
								}}
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
										const dataPoint =
											payload[0].payload as EloHistoryDataPoint;
										const date = new Date(dataPoint.date);
										const formattedDate = date.toLocaleDateString(
											"sr-Latn-RS",
											{
												month: "short",
												day: "numeric",
												year: "numeric",
											}
										);
										const opponent = dataPoint.opponent || "Unknown";
										return `${formattedDate} • vs. ${opponent}`;
									}
									return "";
								}}
								formatter={(value: number, name: string, props: any) => {
									const dataPoint =
										props.payload as EloHistoryDataPoint;
									const delta = dataPoint?.delta ?? 0;
									const deltaFormatted = formatEloDelta(delta, true);
									const deltaColor =
										delta >= 0 ? "text-emerald-500" : "text-red-500";
									return [
										<span key="elo-delta">
											{formatElo(value, true)}{" "}
											<span className={deltaColor}>
												({deltaFormatted})
											</span>
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
						</LineChart>
					</ResponsiveContainer>
				</Box>
			</Stack>
		</Box>
	);
}
