"use client";

import { useEffect, useState } from "react";
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

	useEffect(() => {
		const fetchTopPlayers = async () => {
			try {
				setLoading(true);
				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					setTopPlayers([]);
					return;
				}

				const response = await fetch("/api/statistics", {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				});

				if (!response.ok) {
					setTopPlayers([]);
					return;
				}

				const data = await response.json();
				const singlesStats = data.singles || [];
				// Top 3 players (already sorted by Elo descending)
				setTopPlayers(singlesStats.slice(0, 3));
			} catch (error) {
				console.error("Error fetching top players:", error);
				setTopPlayers([]);
			} finally {
				setLoading(false);
			}
		};

		fetchTopPlayers();
	}, []);

	if (loading || topPlayers.length === 0) {
		return null;
	}

	const second = topPlayers[1];
	const first = topPlayers[0];
	const third = topPlayers[2];

	return (
		<Box className="bg-card rounded-[24px] border border-border/50 p-3 md:p-6 relative overflow-hidden flex items-center justify-center min-h-[200px] md:min-h-[250px]">
			{/* Diagonal pattern background */}
			<Box
				className="absolute inset-0 opacity-30"
				style={{
					backgroundImage:
						"linear-gradient(45deg, transparent 25%, rgba(34,197,94,0.03) 25%, rgba(34,197,94,0.03) 50%, transparent 50%, transparent 75%, rgba(34,197,94,0.03) 75%, rgba(34,197,94,0.03) 100%)",
					backgroundSize: "20px 20px",
				}}
			/>

			<Stack direction="row" alignItems="center" justifyContent="center" spacing={3} className="relative z-10 md:gap-6">
				{/* 2nd Place */}
				{second && (
					<Stack direction="column" alignItems="center" spacing={1.5} className="w-1/3">
						<Box className="relative">
							<Avatar className="size-12 border-2 border-[#C0C0C0] md:size-16">
								<AvatarImage
									src={second.avatar || undefined}
									alt={second.display_name}
								/>
								<AvatarFallback>
									{second.display_name.charAt(0).toUpperCase()}
								</AvatarFallback>
							</Avatar>
							<Box className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-[#C0C0C0] text-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-card shadow-sm md:-bottom-2 md:text-[10px] md:px-2">
								#2
							</Box>
						</Box>
						<Stack direction="column" alignItems="center" spacing={0.5}>
							<p className="text-xs font-semibold truncate w-full text-center md:text-sm">
								{second.display_name}
							</p>
							<p className="text-[10px] text-muted-foreground font-mono md:text-xs">
								{formatElo(second.elo, true)}
							</p>
						</Stack>
					</Stack>
				)}

				{/* 1st Place */}
				{first && (
					<Stack direction="column" alignItems="center" spacing={1.5} className="w-1/3">
						<Box className="relative">
							<Icon
								icon="solar:crown-bold"
								className="absolute -top-4 left-1/2 -translate-x-1/2 text-yellow-400 size-4 drop-shadow-md md:-top-6 md:size-6"
							/>
							<Avatar className="size-14 border-[3px] border-[#FFD700] md:size-20 md:border-4">
								<AvatarImage
									src={first.avatar || undefined}
									alt={first.display_name}
								/>
								<AvatarFallback className="text-base md:text-lg">
									{first.display_name.charAt(0).toUpperCase()}
								</AvatarFallback>
							</Avatar>
							<Box className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-[#FFD700] text-foreground text-[9px] font-bold px-2 py-0.5 rounded-full border border-card shadow-sm md:-bottom-2.5 md:text-[10px] md:px-2.5">
								#1
							</Box>
						</Box>
						<Stack direction="column" alignItems="center" spacing={0.5}>
							<p className="text-sm font-bold truncate w-full text-center md:text-base">
								{first.display_name}
							</p>
							<p className="text-[10px] text-[#FFD700] font-mono font-bold md:text-xs">
								{formatElo(first.elo, true)}
							</p>
						</Stack>
					</Stack>
				)}

				{/* 3rd Place */}
				{third && (
					<Stack direction="column" alignItems="center" spacing={1.5} className="w-1/3">
						<Box className="relative">
							<Avatar className="size-12 border-2 border-[#CD7F32] md:size-16">
								<AvatarImage
									src={third.avatar || undefined}
									alt={third.display_name}
								/>
								<AvatarFallback>
									{third.display_name.charAt(0).toUpperCase()}
								</AvatarFallback>
							</Avatar>
							<Box className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-[#CD7F32] text-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-card shadow-sm md:-bottom-2 md:text-[10px] md:px-2">
								#3
							</Box>
						</Box>
						<Stack direction="column" alignItems="center" spacing={0.5}>
							<p className="text-xs font-semibold truncate w-full text-center md:text-sm">
								{third.display_name}
							</p>
							<p className="text-[10px] text-muted-foreground font-mono md:text-xs">
								{formatElo(third.elo, true)}
							</p>
						</Stack>
					</Stack>
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

function EloChartWidget() {
	const [eloHistory, setEloHistory] = useState<EloHistoryDataPoint[]>([]);
	const [currentElo, setCurrentElo] = useState<number>(1500);
	const [loading, setLoading] = useState(true);

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

	// Calculate Y-axis domain to match exact data range (no padding)
	const eloValues = eloHistory.map((point) => point.elo);
	const minElo = Math.min(...eloValues);
	const maxElo = Math.max(...eloValues);
	const yAxisDomain = [minElo, maxElo];

	return (
		<Box className="bg-card rounded-[24px] border border-border/50 p-6 relative overflow-hidden">
			<Stack direction="column" spacing={4}>
				{/* Header */}
				<Stack direction="column" spacing={4}>
					<p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
						Performance Trend
					</p>
					<Stack
						direction="row"
						alignItems="stretch"
						spacing={3}
						className="flex-wrap"
					>
						{/* Current Elo - Primary Stat */}
						<Box className="bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 flex-1 min-w-[140px]">
							<Stack direction="column" spacing={1}>
								<p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
									Current Elo
								</p>
								<p className="text-3xl font-bold font-heading text-primary">
									{formatElo(currentElo, true)}
								</p>
							</Stack>
						</Box>
						{eloHistory.length > 0 && (
							<>
								{/* Max Elo */}
								<Box className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 flex-1 min-w-[120px]">
									<Stack direction="column" spacing={1}>
										<Stack direction="row" alignItems="center" spacing={1.5}>
											<Icon
												icon="solar:graph-up-bold"
												className="size-3 text-emerald-500"
											/>
											<p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
												Peak
											</p>
										</Stack>
										<p className="text-2xl font-bold font-heading text-emerald-500">
											{formatElo(maxElo, true)}
										</p>
									</Stack>
								</Box>
								{/* Min Elo */}
								<Box className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex-1 min-w-[120px]">
									<Stack direction="column" spacing={1}>
										<Stack direction="row" alignItems="center" spacing={1.5}>
											<Icon
												icon="solar:graph-down-bold"
												className="size-3 text-red-500"
											/>
											<p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
												Lowest
											</p>
										</Stack>
										<p className="text-2xl font-bold font-heading text-red-500">
											{formatElo(minElo, true)}
										</p>
									</Stack>
								</Box>
							</>
						)}
					</Stack>
				</Stack>

				{/* Chart */}
				<Box className="h-[300px] w-full">
					<ResponsiveContainer width="100%" height="100%">
						<LineChart
							data={eloHistory}
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

function NoShowAlertWidget() {
	const [worstOffender, setWorstOffender] = useState<NoShowUser | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fetchNoShowStats = async () => {
			try {
				setLoading(true);
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
				setWorstOffender(users[0] || null);
			} catch (error) {
				console.error("Error fetching no-show stats:", error);
				setWorstOffender(null);
			} finally {
				setLoading(false);
			}
		};

		fetchNoShowStats();
	}, []);

	if (loading || !worstOffender) {
		return null;
	}

	return (
		<Box className="bg-destructive/5 border border-destructive/20 rounded-[24px] p-6 relative overflow-hidden flex items-center justify-center">
			{/* Diagonal pattern background */}
			<Box
				className="absolute inset-0 opacity-30"
				style={{
					backgroundImage:
						"linear-gradient(45deg, transparent 25%, rgba(239,68,68,0.03) 25%, rgba(239,68,68,0.03) 50%, transparent 50%, transparent 75%, rgba(239,68,68,0.03) 75%, rgba(239,68,68,0.03) 100%)",
					backgroundSize: "20px 20px",
				}}
			/>
			<Stack
				direction="column"
				alignItems="center"
				spacing={3}
				className="relative z-10 w-full"
			>
				{/* Avatar with danger badge */}
				<Box className="relative">
					<Avatar className="size-16 border-2 border-destructive/30 grayscale">
						<AvatarImage
							src={worstOffender.avatar || undefined}
							alt={worstOffender.name}
						/>
						<AvatarFallback>
							{worstOffender.name.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>
					<Box className="absolute -bottom-1 -right-1 bg-destructive text-white size-5 rounded-full flex items-center justify-center border-2 border-card">
						<Icon icon="solar:danger-bold" className="size-3" />
					</Box>
				</Box>

				{/* Content */}
				<Stack direction="column" alignItems="center" spacing={2} className="w-full">
					<Box className="bg-destructive/10 px-2 py-1 rounded text-[10px] font-bold tracking-wide uppercase text-destructive-foreground">
						{t.ispale.title}
					</Box>
					<p className="text-base font-semibold text-foreground text-center">
						{worstOffender.name}
					</p>
					<Stack direction="column" alignItems="center" spacing={0.5}>
						<span className="text-xs font-mono text-destructive font-bold">
							{worstOffender.noShowCount}{" "}
							{worstOffender.noShowCount === 1 ? "Miss" : "Misses"}
						</span>
						<p className="text-xs text-muted-foreground">
							Last: {formatRelativeTime(worstOffender.lastNoShowDate)}
						</p>
					</Stack>
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
									<Box className="bg-card rounded-[24px] border border-border/50 p-6 min-h-[200px]">
										{/* Widget Placeholder 3 */}
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
