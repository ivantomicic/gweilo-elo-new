"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { Box } from "@/components/ui/box";
import { Stack } from "@/components/ui/stack";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { supabase } from "@/lib/supabase/client";

type PlayerStats = {
	player_id: string;
	display_name: string;
	avatar: string | null;
	matches_played: number;
	wins: number;
	losses: number;
	draws: number;
	elo: number;
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
	elo: number;
};

type StatisticsData = {
	singles: PlayerStats[];
	doublesPlayers: PlayerStats[];
	doublesTeams: TeamStats[];
};

function StatisticsPageContent() {
	const [statistics, setStatistics] = useState<StatisticsData>({
		singles: [],
		doublesPlayers: [],
		doublesTeams: [],
	});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Load player statistics
	useEffect(() => {
		const fetchStatistics = async () => {
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

				// Fetch statistics from API route
				const response = await fetch("/api/statistics", {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				});

				if (!response.ok) {
					if (response.status === 401) {
						setError("Unauthorized");
					} else {
						const errorData = await response.json();
						setError(errorData.error || "Failed to load statistics");
					}
					return;
				}

				const data = await response.json();
				setStatistics({
					singles: data.singles || [],
					doublesPlayers: data.doublesPlayers || [],
					doublesTeams: data.doublesTeams || [],
				});
			} catch (err) {
				console.error("Error fetching statistics:", err);
				setError("Failed to load statistics");
			} finally {
				setLoading(false);
			}
		};

		fetchStatistics();
	}, []);

	if (loading) {
		return (
			<SidebarProvider>
				<AppSidebar variant="inset" />
				<SidebarInset>
					<SiteHeader title="Statistics" />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
								<Box>
									<p className="text-muted-foreground">
										Loading statistics...
									</p>
								</Box>
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
					<SiteHeader title="Statistics" />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2">
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
				<SiteHeader title="Statistics" />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
							{/* Header */}
							<Box>
								<h1 className="text-3xl font-bold font-heading tracking-tight">
									Statistics
								</h1>
							</Box>

							{/* Statistics Tables */}
							<Stack direction="column" spacing={8}>
								{/* 1. Singles Statistics */}
								<Box>
									<h2 className="text-xl font-bold font-heading mb-4">
										Singles
									</h2>
								{statistics.singles.length === 0 ? (
									<p className="text-muted-foreground">
										No singles statistics found.
									</p>
								) : (
									<Box className="rounded-lg border border-border/50 overflow-hidden bg-card">
										<Table>
											<TableHeader className="bg-muted/30">
												<TableRow>
													<TableHead>Player</TableHead>
													<TableHead className="text-right">Matches</TableHead>
													<TableHead className="text-right">Wins</TableHead>
													<TableHead className="text-right">Losses</TableHead>
													<TableHead className="text-right">Draws</TableHead>
													<TableHead className="text-right">Elo</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{statistics.singles.map((player) => (
													<TableRow key={player.player_id}>
														<TableCell>
															<div className="flex items-center gap-3">
																<Avatar className="size-10 border-2 border-border">
																	<AvatarImage
																		src={player.avatar || undefined}
																		alt={player.display_name}
																	/>
																	<AvatarFallback>
																		{player.display_name
																			.charAt(0)
																			.toUpperCase()}
																	</AvatarFallback>
																</Avatar>
																<span className="font-medium">
																	{player.display_name}
																</span>
															</div>
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
														<TableCell className="text-right font-bold">
															{player.elo}
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</Box>
								)}
								</Box>

								{/* 2. Doubles - Players Statistics */}
								<Box>
									<h2 className="text-xl font-bold font-heading mb-4">
										Doubles – Players
									</h2>
								{statistics.doublesPlayers.length === 0 ? (
									<p className="text-muted-foreground">
										No doubles player statistics found.
									</p>
								) : (
									<Box className="rounded-lg border border-border/50 overflow-hidden bg-card">
										<Table>
											<TableHeader className="bg-muted/30">
												<TableRow>
													<TableHead>Player</TableHead>
													<TableHead className="text-right">Matches</TableHead>
													<TableHead className="text-right">Wins</TableHead>
													<TableHead className="text-right">Losses</TableHead>
													<TableHead className="text-right">Draws</TableHead>
													<TableHead className="text-right">Elo</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{statistics.doublesPlayers.map((player) => (
													<TableRow key={player.player_id}>
														<TableCell>
															<div className="flex items-center gap-3">
																<Avatar className="size-10 border-2 border-border">
																	<AvatarImage
																		src={player.avatar || undefined}
																		alt={player.display_name}
																	/>
																	<AvatarFallback>
																		{player.display_name
																			.charAt(0)
																			.toUpperCase()}
																	</AvatarFallback>
																</Avatar>
																<span className="font-medium">
																	{player.display_name}
																</span>
															</div>
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
														<TableCell className="text-right font-bold">
															{player.elo}
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</Box>
								)}
								</Box>

								{/* 3. Doubles - Teams Statistics */}
								<Box>
									<h2 className="text-xl font-bold font-heading mb-4">
										Doubles – Teams
									</h2>
								{statistics.doublesTeams.length === 0 ? (
									<p className="text-muted-foreground">
										No doubles team statistics found.
									</p>
								) : (
									<Box className="rounded-lg border border-border/50 overflow-hidden bg-card">
										<Table>
											<TableHeader className="bg-muted/30">
												<TableRow>
													<TableHead>Team</TableHead>
													<TableHead className="text-right">Matches</TableHead>
													<TableHead className="text-right">Wins</TableHead>
													<TableHead className="text-right">Losses</TableHead>
													<TableHead className="text-right">Draws</TableHead>
													<TableHead className="text-right">Elo</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{statistics.doublesTeams.map((team) => (
													<TableRow key={team.team_id}>
														<TableCell>
															<div className="flex items-center gap-2 flex-wrap">
																<div className="flex items-center gap-2">
																	<Avatar className="size-8 border-2 border-border">
																		<AvatarImage
																			src={team.player1.avatar || undefined}
																			alt={team.player1.display_name}
																		/>
																		<AvatarFallback>
																			{team.player1.display_name
																				.charAt(0)
																				.toUpperCase()}
																		</AvatarFallback>
																	</Avatar>
																	<span className="font-medium text-sm">
																		{team.player1.display_name}
																	</span>
																</div>
																<span className="text-muted-foreground text-sm">
																	&
																</span>
																<div className="flex items-center gap-2">
																	<Avatar className="size-8 border-2 border-border">
																		<AvatarImage
																			src={team.player2.avatar || undefined}
																			alt={team.player2.display_name}
																		/>
																		<AvatarFallback>
																			{team.player2.display_name
																				.charAt(0)
																				.toUpperCase()}
																		</AvatarFallback>
																	</Avatar>
																	<span className="font-medium text-sm">
																		{team.player2.display_name}
																	</span>
																</div>
															</div>
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
														<TableCell className="text-right font-bold">
															{team.elo}
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</Box>
								)}
								</Box>
							</Stack>
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

