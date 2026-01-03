"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase/client";
import { ArrowUp, ArrowDown } from "lucide-react";

type PlayerStats = {
	player_id: string;
	display_name: string;
	avatar: string | null;
	matches_played: number;
	wins: number;
	losses: number;
	draws: number;
	elo: number;
	rank_movement?: number;
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
	rank_movement?: number;
};

type StatisticsData = {
	singles: PlayerStats[];
	doublesPlayers: PlayerStats[];
	doublesTeams: TeamStats[];
};

function StatisticsPageContent() {
	const searchParams = useSearchParams();
	const router = useRouter();
	
	// Page-level view filter: 'singles' | 'doubles_player' | 'doubles_team'
	// URL uses hyphens: ?view=singles|doubles-player|doubles-team
	const urlView = searchParams.get("view");
	let activeView: "singles" | "doubles_player" | "doubles_team" = "singles";
	if (urlView === "doubles-player") {
		activeView = "doubles_player";
	} else if (urlView === "doubles-team") {
		activeView = "doubles_team";
	}

	const handleViewChange = (
		view: "singles" | "doubles_player" | "doubles_team"
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
				// Debug: Log received data (remove in production)
				console.log("[STATS] Received data:", {
					singles: data.singles?.map((p: any) => ({
						name: p.display_name,
						movement: p.rank_movement,
					})),
				});
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

							{/* Page-level Navigation Tabs */}
							<Box className="mb-6 pb-4 border-b border-border/50">
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
									<TabsList className="h-auto p-0 bg-transparent gap-6 border-none">
										<TabsTrigger
											value="singles"
											className="px-0 py-2 text-base font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary hover:text-foreground transition-colors"
										>
											Singles
										</TabsTrigger>
										<TabsTrigger
											value="doubles-player"
											className="px-0 py-2 text-base font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary hover:text-foreground transition-colors"
										>
											Doubles – Player
										</TabsTrigger>
										<TabsTrigger
											value="doubles-team"
											className="px-0 py-2 text-base font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary hover:text-foreground transition-colors"
										>
											Doubles – Team
										</TabsTrigger>
									</TabsList>
								</Tabs>
							</Box>

							{/* Statistics Table (Single view) */}
							<Box>
								{/* Singles Statistics */}
								{activeView === "singles" && (
									<>
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
																{player.rank_movement !== undefined &&
																	player.rank_movement !== 0 && (
																		<>
																			{player.rank_movement > 0 ? (
																				<ArrowUp className="size-4 text-green-500" />
																			) : (
																				<ArrowDown className="size-4 text-red-500" />
																			)}
																		</>
																	)}
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
									</>
								)}

								{/* Doubles - Players Statistics */}
								{activeView === "doubles_player" && (
									<>
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
																{player.rank_movement !== undefined &&
																	player.rank_movement !== 0 && (
																		<>
																			{player.rank_movement > 0 ? (
																				<ArrowUp className="size-4 text-green-500" />
																			) : (
																				<ArrowDown className="size-4 text-red-500" />
																			)}
																		</>
																	)}
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
									</>
								)}

								{/* Doubles - Teams Statistics */}
								{activeView === "doubles_team" && (
									<>
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
																{team.rank_movement !== undefined &&
																	team.rank_movement !== 0 && (
																		<>
																			{team.rank_movement > 0 ? (
																				<ArrowUp className="size-4 text-green-500" />
																			) : (
																				<ArrowDown className="size-4 text-red-500" />
																			)}
																		</>
																	)}
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
									</>
								)}
							</Box>
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

