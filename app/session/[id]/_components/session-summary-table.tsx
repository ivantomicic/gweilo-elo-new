"use client";

import { useEffect, useState } from "react";
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

type SessionSummaryTableProps = {
	sessionId: string;
	activeView: "singles" | "doubles_player" | "doubles_team";
	onViewChange: (view: "singles" | "doubles_player" | "doubles_team") => void;
	onViewAvailabilityChange?: (availability: SessionViewAvailability) => void;
};

export type SessionViewAvailability = {
	hasSingles: boolean;
	hasDoublesPlayer: boolean;
	hasDoublesTeam: boolean;
};

// Export function to get view availability (used by parent component)
export function useSessionViewAvailability() {
	return useState<SessionViewAvailability | null>(null);
}

export function SessionSummaryTable({
	sessionId,
	activeView,
	onViewChange,
	onViewAvailabilityChange,
}: SessionSummaryTableProps) {
	const [singlesSummary, setSinglesSummary] = useState<
		SessionPlayerSummary[]
	>([]);
	const [doublesPlayerSummary, setDoublesPlayerSummary] = useState<
		SessionPlayerSummary[]
	>([]);
	const [doublesTeamSummary, setDoublesTeamSummary] = useState<
		SessionTeamSummary[]
	>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchSummary = async () => {
			try {
				setLoading(true);
				setError(null);

				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					setError("Not authenticated");
					return;
				}

				const response = await fetch(
					`/api/sessions/${sessionId}/summary`,
					{
						headers: {
							Authorization: `Bearer ${session.access_token}`,
						},
					}
				);

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));
					throw new Error(
						errorData.error || "Failed to load session summary"
					);
				}

				const data = await response.json();
				setSinglesSummary(data.singles || []);
				setDoublesPlayerSummary(data.doubles_player || []);
				setDoublesTeamSummary(data.doubles_team || []);

				// Notify parent of view availability
				const availability = {
					hasSingles: (data.singles || []).length > 0,
					hasDoublesPlayer: (data.doubles_player || []).length > 0,
					hasDoublesTeam: (data.doubles_team || []).length > 0,
				};
				onViewAvailabilityChange?.(availability);
			} catch (err) {
				console.error("Error fetching session summary:", err);
				setError(
					err instanceof Error
						? err.message
						: "Failed to load session summary"
				);
			} finally {
				setLoading(false);
			}
		};

		fetchSummary();
	}, [sessionId]);

	// Determine which tabs to show (before any conditional returns)
	const hasSingles = singlesSummary.length > 0;
	const hasDoublesPlayer = doublesPlayerSummary.length > 0;
	const hasDoublesTeam = doublesTeamSummary.length > 0;

	// Ensure activeView is valid and falls back to first available tab
	// Must be before conditional returns to maintain hook order
	useEffect(() => {
		if (loading) return; // Don't check during loading

		let fallbackView = activeView;
		if (activeView === "singles" && !hasSingles) {
			fallbackView = hasDoublesPlayer ? "doubles_player" : "doubles_team";
		} else if (activeView === "doubles_player" && !hasDoublesPlayer) {
			fallbackView = hasSingles ? "singles" : "doubles_team";
		} else if (activeView === "doubles_team" && !hasDoublesTeam) {
			fallbackView = hasSingles ? "singles" : "doubles_player";
		}

		// Update parent if view needs to change
		if (fallbackView !== activeView) {
			onViewChange(fallbackView);
		}
	}, [
		activeView,
		hasSingles,
		hasDoublesPlayer,
		hasDoublesTeam,
		onViewChange,
		loading,
	]);

	const handleTabChange = (value: string) => {
		if (
			value === "singles" ||
			value === "doubles_player" ||
			value === "doubles_team"
		) {
			onViewChange(value);
		}
	};

	const currentView = activeView;

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

	if (loading) {
		return (
			<Box>
				<Loading inline label={t.sessions.session.loading} />
			</Box>
		);
	}

	if (error) {
		return (
			<Box>
				<p className="text-destructive">{error}</p>
			</Box>
		);
	}

	// If no data at all
	if (!hasSingles && !hasDoublesPlayer && !hasDoublesTeam) {
		return (
			<Box>
				<p className="text-muted-foreground">
					No summary data available.
				</p>
			</Box>
		);
	}

	// Return just the table content based on current view
	const renderTable = () => {
		if (currentView === "singles" && hasSingles) {
			const sortedPlayers = sortByWins(singlesSummary);
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
							<TableHead className="text-center" colSpan={2}>
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
										{formatElo(player.elo_after)}
									</TableCell>
									<TableCell
										className={cn(
											"text-center font-mono",
											eloChangeColor
										)}
									>
										({eloChange})
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			);
		}

		if (currentView === "doubles_player" && hasDoublesPlayer) {
			const sortedPlayers = sortByWins(doublesPlayerSummary);
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
									<TableCell
										className={cn(
											"text-center font-bold font-mono",
											eloChangeColor
										)}
									>
										{formatElo(player.elo_after)} (
										{eloChange})
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			);
		}

		if (currentView === "doubles_team" && hasDoublesTeam) {
			const sortedTeams = sortByWins(doublesTeamSummary);
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
									<TableCell
										className={cn(
											"text-center font-bold font-mono",
											eloChangeColor
										)}
									>
										{formatElo(team.elo_after)} ({eloChange}
										)
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

// Export view availability as a prop getter function
export function getSessionViewAvailability(
	singlesSummary: SessionPlayerSummary[],
	doublesPlayerSummary: SessionPlayerSummary[],
	doublesTeamSummary: SessionTeamSummary[]
): SessionViewAvailability {
	return {
		hasSingles: singlesSummary.length > 0,
		hasDoublesPlayer: doublesPlayerSummary.length > 0,
		hasDoublesTeam: doublesTeamSummary.length > 0,
	};
}
