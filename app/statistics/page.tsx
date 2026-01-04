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
import { Loading } from "@/components/ui/loading";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase/client";
import { ArrowUp, ArrowDown } from "lucide-react";
import { t } from "@/lib/i18n";

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
					setError(t.statistics.error.notAuthenticated);
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
				setError(t.statistics.error.fetchFailed);
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
					<SiteHeader title={t.statistics.title} />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
								<Loading label={t.statistics.loading} />
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
					<SiteHeader title={t.statistics.title} />
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
				<SiteHeader title={t.statistics.title} />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
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
									<TabsList>
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
									const currentData: (
										| PlayerStats
										| TeamStats
									)[] =
										activeView === "singles"
											? statistics.singles
											: activeView === "doubles_player"
											? statistics.doublesPlayers
											: statistics.doublesTeams;

									const headerLabel =
										activeView === "doubles_team"
											? t.statistics.table.team
											: t.statistics.table.player;

									return (
										<Box className="rounded-lg border border-border/50 overflow-hidden bg-card">
											<Table>
												<TableHeader className="bg-muted/30">
													<TableRow>
														<TableHead className="text-left">
															{headerLabel}
														</TableHead>
														<TableHead className="text-center">
															{
																t.statistics
																	.table
																	.matches
															}
														</TableHead>
														<TableHead className="text-center">
															{
																t.statistics
																	.table.wins
															}
														</TableHead>
														<TableHead className="text-center">
															{
																t.statistics
																	.table
																	.losses
															}
														</TableHead>
														<TableHead className="text-center">
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
													{currentData.map((item) => {
														const isTeam =
															"team_id" in item;
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
																<TableRow
																	key={key}
																>
																	<TableCell>
																		<div className="flex items-center gap-3">
																			<TeamNameCard
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
																			/>
																			{team.rank_movement !==
																				undefined &&
																				team.rank_movement !==
																					0 && (
																					<>
																						{team.rank_movement >
																						0 ? (
																							<ArrowUp className="size-4 text-green-500" />
																						) : (
																							<ArrowDown className="size-4 text-red-500" />
																						)}
																					</>
																				)}
																		</div>
																	</TableCell>
																	<TableCell className="text-center font-medium">
																		{
																			team.matches_played
																		}
																	</TableCell>
																	<TableCell className="text-center">
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
																	<TableCell className="text-center">
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
																	<TableCell className="text-center font-medium text-yellow-500">
																		{
																			team.draws
																		}
																	</TableCell>
																	<TableCell className="text-center font-bold">
																		{
																			team.elo
																		}
																	</TableCell>
																</TableRow>
															);
														}

														const player =
															item as PlayerStats;
														return (
															<TableRow key={key}>
																<TableCell>
																	<div className="flex items-center gap-3">
																		<PlayerNameCard
																			name={
																				player.display_name
																			}
																			avatar={
																				player.avatar
																			}
																			size="md"
																		/>
																		{player.rank_movement !==
																			undefined &&
																			player.rank_movement !==
																				0 && (
																				<>
																					{player.rank_movement >
																					0 ? (
																						<ArrowUp className="size-4 text-green-500" />
																					) : (
																						<ArrowDown className="size-4 text-red-500" />
																					)}
																				</>
																			)}
																	</div>
																</TableCell>
																<TableCell className="text-center font-medium">
																	{
																		player.matches_played
																	}
																</TableCell>
																<TableCell className="text-center">
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
																<TableCell className="text-center">
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
																<TableCell className="text-center font-medium text-yellow-500">
																	{
																		player.draws
																	}
																</TableCell>
																<TableCell className="text-center font-bold">
																	{player.elo}
																</TableCell>
															</TableRow>
														);
													})}
												</TableBody>
											</Table>
										</Box>
									);
								})()}
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
