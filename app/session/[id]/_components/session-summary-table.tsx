"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
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
import { Box } from "@/components/ui/box";
import { Loading } from "@/components/ui/loading";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

type SessionPlayerSummary = {
	player_id: string;
	display_name: string;
	avatar: string | null;
	elo_before: number;
	elo_after: number;
	elo_change: number;
	matches_played: number;
	wins: number;
	losses: number;
	draws: number;
};

type SessionTeamSummary = {
	team_id: string;
	player1_id: string;
	player2_id: string;
	player1_name: string;
	player2_name: string;
	player1_avatar: string | null;
	player2_avatar: string | null;
	elo_before: number;
	elo_after: number;
	elo_change: number;
	matches_played: number;
	wins: number;
	losses: number;
	draws: number;
};

type SummaryView = "singles" | "doubles_player" | "doubles_team";

type SessionSummaryTableProps = {
	sessionId: string;
	activeView: SummaryView;
	onPlayerClick?: (playerId: string) => void;
	selectedPlayerFilter?: string | null;
};

export function SessionSummaryTable({
	sessionId,
	activeView,
	onPlayerClick,
	selectedPlayerFilter,
}: SessionSummaryTableProps) {
	const [singlesSummary, setSinglesSummary] = useState<
		SessionPlayerSummary[] | null
	>(null);
	const [doublesPlayerSummary, setDoublesPlayerSummary] = useState<
		SessionPlayerSummary[] | null
	>(null);
	const [doublesTeamSummary, setDoublesTeamSummary] = useState<
		SessionTeamSummary[] | null
	>(null);
	const [loadingByView, setLoadingByView] = useState<
		Record<SummaryView, boolean>
	>({
		singles: false,
		doubles_player: false,
		doubles_team: false,
	});
	const [errorByView, setErrorByView] = useState<
		Partial<Record<SummaryView, string>>
	>({});
	const accessTokenRef = useRef<string | null>(null);
	const loadedViewsRef = useRef<Set<SummaryView>>(new Set());
	const inFlightViewsRef = useRef<Set<SummaryView>>(new Set());

	const getAccessToken = useCallback(async () => {
		if (accessTokenRef.current) {
			return accessTokenRef.current;
		}

		const {
			data: { session },
		} = await supabase.auth.getSession();
		if (!session) {
			throw new Error("Not authenticated");
		}
		accessTokenRef.current = session.access_token;
		return session.access_token;
	}, []);

	const fetchSummaryForView = useCallback(
		async (view: SummaryView) => {
			if (
				loadedViewsRef.current.has(view) ||
				inFlightViewsRef.current.has(view)
			) {
				return;
			}

			inFlightViewsRef.current.add(view);
			setLoadingByView((prev) => ({ ...prev, [view]: true }));
			setErrorByView((prev) => {
				const next = { ...prev };
				delete next[view];
				return next;
			});

			try {
				const accessToken = await getAccessToken();
				const response = await fetch(
					`/api/sessions/${sessionId}/summary?type=${view}`,
					{
						headers: {
							Authorization: `Bearer ${accessToken}`,
						},
					},
				);

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));
					throw new Error(
						errorData.error || "Failed to load session summary",
					);
				}

				const data = await response.json();
				if (view === "singles") {
					setSinglesSummary(data.singles || []);
				} else if (view === "doubles_player") {
					setDoublesPlayerSummary(data.doubles_player || []);
				} else {
					setDoublesTeamSummary(data.doubles_team || []);
				}
				loadedViewsRef.current.add(view);
			} catch (err) {
				console.error(`Error fetching ${view} summary:`, err);
				setErrorByView((prev) => ({
					...prev,
					[view]:
						err instanceof Error
							? err.message
							: "Failed to load session summary",
				}));
			} finally {
				inFlightViewsRef.current.delete(view);
				setLoadingByView((prev) => ({ ...prev, [view]: false }));
			}
		},
		[getAccessToken, sessionId],
	);

	// Reset summary state when session changes.
	useEffect(() => {
		setSinglesSummary(null);
		setDoublesPlayerSummary(null);
		setDoublesTeamSummary(null);
		setLoadingByView({
			singles: false,
			doubles_player: false,
			doubles_team: false,
		});
		setErrorByView({});
		accessTokenRef.current = null;
		loadedViewsRef.current.clear();
		inFlightViewsRef.current.clear();
	}, [sessionId]);

	// Load singles immediately for fastest first paint.
	useEffect(() => {
		fetchSummaryForView("singles");
	}, [fetchSummaryForView]);

	// Lazy-load other summaries when user opens that tab.
	useEffect(() => {
		fetchSummaryForView(activeView);
	}, [activeView, fetchSummaryForView]);

	const currentView = activeView;
	const currentError = errorByView[currentView] ?? null;
	const isCurrentViewLoading = loadingByView[currentView];
	const currentViewLoaded =
		currentView === "singles"
			? singlesSummary !== null
			: currentView === "doubles_player"
				? doublesPlayerSummary !== null
				: doublesTeamSummary !== null;

	// Format Elo values (round to nearest integer for display)
	const formatElo = (elo: number) => Math.round(elo);
	const formatEloChange = (change: number) => {
		const rounded = Math.round(change);
		return rounded > 0 ? `+${rounded}` : `${rounded}`;
	};
	const formatEloChangeColor = (change: number) => {
		if (change > 0) return "text-emerald-500";
		if (change < 0) return "text-red-500";
		return "text-foreground";
	};

	// Get rank color based on position
	const getRankColor = (index: number) => {
		if (index === 0) return "text-yellow-500";
		if (index === 1) return "text-zinc-400";
		if (index === 2) return "text-orange-700";
		return "text-muted-foreground";
	};

	// Sort by wins (descending) for display
	const sortByWins = <T extends { wins: number }>(arr: T[]): T[] => {
		return [...arr].sort((a, b) => b.wins - a.wins);
	};

	if (isCurrentViewLoading && !currentViewLoaded) {
		return (
			<Box>
				<Loading inline label={t.sessions.session.loading} />
			</Box>
		);
	}

	if (currentError) {
		return (
			<Box>
				<p className="text-destructive">{currentError}</p>
			</Box>
		);
	}

	// Return just the table content based on current view
	const renderTable = () => {
		if (currentView === "singles") {
			const sortedPlayers = sortByWins(singlesSummary ?? []);
			if (sortedPlayers.length === 0) {
				return (
					<p className="text-muted-foreground text-sm px-4 py-5">
						No summary data available.
					</p>
				);
			}
			return (
				<Table>
					<TableHeader className="bg-muted/30">
						<TableRow>
							<TableHead className="text-left w-8">#</TableHead>
							<TableHead className="text-left">
								{t.statistics.table.player}
							</TableHead>
							<TableHead className="text-center hidden md:table-cell">
								{t.statistics.table.wins}
							</TableHead>
							<TableHead className="text-center hidden md:table-cell">
								{t.statistics.table.losses}
							</TableHead>
							<TableHead className="text-center hidden md:table-cell">
								{t.statistics.table.draws}
							</TableHead>
							<TableHead className="text-center">
								{t.statistics.table.elo}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{sortedPlayers.map((player, index) => {
							const eloChange = formatEloChange(
								player.elo_change
							);
							const eloChangeColor = formatEloChangeColor(
								player.elo_change
							);

							return (
								<TableRow key={player.player_id}>
									<TableCell
										className={cn(
											"font-bold w-8",
											getRankColor(index)
										)}
									>
										{index + 1}
									</TableCell>
									<TableCell>
										<Box
											onClick={() => onPlayerClick?.(player.player_id)}
											className={cn(
												onPlayerClick &&
													"cursor-pointer hover:opacity-80 transition-opacity",
												selectedPlayerFilter ===
													player.player_id &&
													"opacity-100"
											)}
										>
											<PlayerNameCard
												name={player.display_name}
												avatar={player.avatar}
												id={player.player_id}
												size="sm"
												addon={
													<span className="text-[10px] font-mono font-semibold leading-tight md:hidden">
														<span className="text-emerald-500">
															{player.wins}
														</span>
														{" / "}
														<span className="text-red-500">
															{player.losses}
														</span>
														{" / "}
														<span className="text-muted-foreground">
															{player.draws}
														</span>
													</span>
												}
											/>
										</Box>
									</TableCell>
									<TableCell className="text-center font-bold font-mono hidden md:table-cell text-emerald-500">
										{player.wins}
									</TableCell>
									<TableCell className="text-center font-bold font-mono hidden md:table-cell text-red-500">
										{player.losses}
									</TableCell>
									<TableCell className="text-center font-bold font-mono hidden md:table-cell text-muted-foreground">
										{player.draws}
									</TableCell>
									<TableCell className="text-center font-mono">
										<span className={eloChangeColor}>
											{eloChange}
										</span>{" "}
										/ {formatElo(player.elo_after)}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			);
		}

		if (currentView === "doubles_player") {
			const sortedPlayers = sortByWins(doublesPlayerSummary ?? []);
			if (sortedPlayers.length === 0) {
				return (
					<p className="text-muted-foreground text-sm px-4 py-5">
						No summary data available.
					</p>
				);
			}
			return (
				<Table>
					<TableHeader className="bg-muted/30">
						<TableRow>
							<TableHead className="text-left w-8">#</TableHead>
							<TableHead className="text-left">
								{t.statistics.table.player}
							</TableHead>
							<TableHead className="text-center hidden md:table-cell">
								W
							</TableHead>
							<TableHead className="text-center hidden md:table-cell">
								L
							</TableHead>
							<TableHead className="text-center hidden md:table-cell">
								D
							</TableHead>
							<TableHead className="text-center">
								{t.statistics.table.elo}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{sortedPlayers.map((player, index) => {
							const eloChange = formatEloChange(
								player.elo_change
							);
							const eloChangeColor = formatEloChangeColor(
								player.elo_change
							);

							return (
								<TableRow key={player.player_id}>
									<TableCell
										className={cn(
											"font-bold w-8",
											getRankColor(index)
										)}
									>
										{index + 1}
									</TableCell>
									<TableCell>
										<Box
											onClick={() => onPlayerClick?.(player.player_id)}
											className={cn(
												onPlayerClick &&
													"cursor-pointer hover:opacity-80 transition-opacity",
												selectedPlayerFilter ===
													player.player_id &&
													"opacity-100"
											)}
										>
											<PlayerNameCard
												name={player.display_name}
												avatar={player.avatar}
												id={player.player_id}
												size="sm"
												addon={
													<span className="text-[10px] font-mono font-semibold leading-tight md:hidden">
														<span className="text-emerald-500">
															{player.wins}
														</span>
														{" / "}
														<span className="text-red-500">
															{player.losses}
														</span>
														{" / "}
														<span className="text-muted-foreground">
															{player.draws}
														</span>
													</span>
												}
											/>
										</Box>
									</TableCell>
									<TableCell className="text-center font-bold font-mono hidden md:table-cell text-emerald-500">
										{player.wins}
									</TableCell>
									<TableCell className="text-center font-bold font-mono hidden md:table-cell text-red-500">
										{player.losses}
									</TableCell>
									<TableCell className="text-center font-bold font-mono hidden md:table-cell text-muted-foreground">
										{player.draws}
									</TableCell>
									<TableCell className="text-center font-mono">
										<span className={eloChangeColor}>
											{eloChange}
										</span>{" "}
										/ {formatElo(player.elo_after)}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			);
		}

		if (currentView === "doubles_team") {
			const sortedTeams = sortByWins(doublesTeamSummary ?? []);
			if (sortedTeams.length === 0) {
				return (
					<p className="text-muted-foreground text-sm px-4 py-5">
						No summary data available.
					</p>
				);
			}
			return (
				<Table>
					<TableHeader className="bg-muted/30">
						<TableRow>
							<TableHead className="text-left w-8">#</TableHead>
							<TableHead className="text-left">
								{t.statistics.table.team}
							</TableHead>
							<TableHead className="text-center hidden md:table-cell">
								W
							</TableHead>
							<TableHead className="text-center hidden md:table-cell">
								L
							</TableHead>
							<TableHead className="text-center hidden md:table-cell">
								D
							</TableHead>
							<TableHead className="text-center">
								{t.statistics.table.elo}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{sortedTeams.map((team, index) => {
							const eloChange = formatEloChange(team.elo_change);
							const eloChangeColor = formatEloChangeColor(
								team.elo_change
							);

							return (
								<TableRow key={team.team_id}>
									<TableCell
										className={cn(
											"font-bold w-8",
											getRankColor(index)
										)}
									>
										{index + 1}
									</TableCell>
									<TableCell>
										<TeamNameCard
											player1={{
												name: team.player1_name,
												avatar: team.player1_avatar,
											}}
											player2={{
												name: team.player2_name,
												avatar: team.player2_avatar,
											}}
											size="sm"
											addon={
												<span className="text-[10px] font-mono font-semibold leading-tight md:hidden">
													<span className="text-emerald-500">
														{team.wins}
													</span>
													{" / "}
													<span className="text-red-500">
														{team.losses}
													</span>
													{" / "}
													<span className="text-muted-foreground">
														{team.draws}
													</span>
												</span>
											}
										/>
									</TableCell>
									<TableCell className="text-center font-bold font-mono hidden md:table-cell text-emerald-500">
										{team.wins}
									</TableCell>
									<TableCell className="text-center font-bold font-mono hidden md:table-cell text-red-500">
										{team.losses}
									</TableCell>
									<TableCell className="text-center font-bold font-mono hidden md:table-cell text-muted-foreground">
										{team.draws}
									</TableCell>
									<TableCell className="text-center font-mono">
										<span className={eloChangeColor}>
											{eloChange}
										</span>{" "}
										/ {formatElo(team.elo_after)}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			);
		}

		return null;
	};

	return (
		<Box className="rounded-lg border border-border/50 overflow-hidden bg-card">
			{renderTable()}
		</Box>
	);
}
