"use client";

import { useEffect, useState } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Box } from "@/components/ui/box";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

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
	const [singlesSummary, setSinglesSummary] = useState<SessionPlayerSummary[]>(
		[]
	);
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

				const response = await fetch(`/api/sessions/${sessionId}/summary`, {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				});

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));
					throw new Error(errorData.error || "Failed to load session summary");
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
					err instanceof Error ? err.message : "Failed to load session summary"
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

	if (loading) {
		return (
			<Box>
				<p className="text-muted-foreground">Loading session summary...</p>
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
				<p className="text-muted-foreground">No summary data available.</p>
			</Box>
		);
	}

	// Return just the table content based on current view
	const renderTable = () => {

		if (currentView === "singles" && hasSingles) {
			return (
				<Table>
							<TableHeader className="bg-muted/30">
								<TableRow>
									<TableHead>Player</TableHead>
									<TableHead className="text-right">Elo Before</TableHead>
									<TableHead className="text-right">Elo After</TableHead>
									<TableHead className="text-right">Elo Change</TableHead>
									<TableHead className="text-right">Matches</TableHead>
									<TableHead className="text-right">Wins</TableHead>
									<TableHead className="text-right">Losses</TableHead>
									<TableHead className="text-right">Draws</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{singlesSummary.map((player) => (
									<TableRow key={player.player_id}>
										<TableCell>
											<div className="flex items-center gap-3">
												<Avatar className="size-10 border-2 border-border">
													<AvatarImage
														src={player.avatar || undefined}
														alt={player.display_name}
													/>
													<AvatarFallback>
														{player.display_name.charAt(0).toUpperCase()}
													</AvatarFallback>
												</Avatar>
												<span className="font-medium">
													{player.display_name}
												</span>
											</div>
										</TableCell>
										<TableCell className="text-right font-medium">
											{formatElo(player.elo_before)}
										</TableCell>
										<TableCell className="text-right font-medium">
											{formatElo(player.elo_after)}
										</TableCell>
										<TableCell
											className={cn(
												"text-right font-bold",
												player.elo_change > 0 && "text-green-500",
												player.elo_change < 0 && "text-red-500",
												player.elo_change === 0 && "text-foreground"
											)}
										>
											{formatEloChange(player.elo_change)}
										</TableCell>
										<TableCell className="text-right font-medium">
											{player.matches_played}
										</TableCell>
										<TableCell className="text-right font-medium">
											{player.wins}
										</TableCell>
										<TableCell className="text-right font-medium">
											{player.losses}
										</TableCell>
										<TableCell className="text-right font-medium">
											{player.draws}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
			);
		}

		if (currentView === "doubles_player" && hasDoublesPlayer) {
			return (
				<Table>
							<TableHeader className="bg-muted/30">
								<TableRow>
									<TableHead>Player</TableHead>
									<TableHead className="text-right">Elo Before</TableHead>
									<TableHead className="text-right">Elo After</TableHead>
									<TableHead className="text-right">Elo Change</TableHead>
									<TableHead className="text-right">Matches</TableHead>
									<TableHead className="text-right">Wins</TableHead>
									<TableHead className="text-right">Losses</TableHead>
									<TableHead className="text-right">Draws</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{doublesPlayerSummary.map((player) => (
									<TableRow key={player.player_id}>
										<TableCell>
											<div className="flex items-center gap-3">
												<Avatar className="size-10 border-2 border-border">
													<AvatarImage
														src={player.avatar || undefined}
														alt={player.display_name}
													/>
													<AvatarFallback>
														{player.display_name.charAt(0).toUpperCase()}
													</AvatarFallback>
												</Avatar>
												<span className="font-medium">
													{player.display_name}
												</span>
											</div>
										</TableCell>
										<TableCell className="text-right font-medium">
											{formatElo(player.elo_before)}
										</TableCell>
										<TableCell className="text-right font-medium">
											{formatElo(player.elo_after)}
										</TableCell>
										<TableCell
											className={cn(
												"text-right font-bold",
												player.elo_change > 0 && "text-green-500",
												player.elo_change < 0 && "text-red-500",
												player.elo_change === 0 && "text-foreground"
											)}
										>
											{formatEloChange(player.elo_change)}
										</TableCell>
										<TableCell className="text-right font-medium">
											{player.matches_played}
										</TableCell>
										<TableCell className="text-right font-medium">
											{player.wins}
										</TableCell>
										<TableCell className="text-right font-medium">
											{player.losses}
										</TableCell>
										<TableCell className="text-right font-medium">
											{player.draws}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
			);
		}

		if (currentView === "doubles_team" && hasDoublesTeam) {
			return (
				<Table>
							<TableHeader className="bg-muted/30">
								<TableRow>
									<TableHead>Team</TableHead>
									<TableHead className="text-right">Elo Before</TableHead>
									<TableHead className="text-right">Elo After</TableHead>
									<TableHead className="text-right">Elo Change</TableHead>
									<TableHead className="text-right">Matches</TableHead>
									<TableHead className="text-right">Wins</TableHead>
									<TableHead className="text-right">Losses</TableHead>
									<TableHead className="text-right">Draws</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{doublesTeamSummary.map((team) => (
									<TableRow key={team.team_id}>
										<TableCell>
											<span className="font-medium">
												{team.player1_name} & {team.player2_name}
											</span>
										</TableCell>
										<TableCell className="text-right font-medium">
											{formatElo(team.elo_before)}
										</TableCell>
										<TableCell className="text-right font-medium">
											{formatElo(team.elo_after)}
										</TableCell>
										<TableCell
											className={cn(
												"text-right font-bold",
												team.elo_change > 0 && "text-green-500",
												team.elo_change < 0 && "text-red-500",
												team.elo_change === 0 && "text-foreground"
											)}
										>
											{formatEloChange(team.elo_change)}
										</TableCell>
										<TableCell className="text-right font-medium">
											{team.matches_played}
										</TableCell>
										<TableCell className="text-right font-medium">
											{team.wins}
										</TableCell>
										<TableCell className="text-right font-medium">
											{team.losses}
										</TableCell>
										<TableCell className="text-right font-medium">
											{team.draws}
										</TableCell>
									</TableRow>
								))}
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
