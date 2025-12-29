"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { Box } from "@/components/ui/box";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Stack } from "@/components/ui/stack";
import { supabase } from "@/lib/supabase/client";
import { createClient } from "@supabase/supabase-js";
import { calculateEloChange, averageElo } from "@/lib/elo";
import { cn } from "@/lib/utils";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type Player = {
	id: string;
	sessionPlayerId: string;
	team: string | null;
	name: string;
	avatar: string | null;
	elo: number;
	matchCount?: number; // For accurate K-factor calculation
};

type Match = {
	id: string;
	round_number: number;
	match_type: "singles" | "doubles";
	match_order: number;
	player_ids: string[];
};

type SessionData = {
	session: {
		id: string;
		player_count: number;
		created_at: string;
	};
	players: Player[];
	matchesByRound: Record<number, Match[]>;
};

type Scores = Record<string, { team1: number | null; team2: number | null }>;

function SessionPageContent() {
	const params = useParams();
	const router = useRouter();
	const sessionId = params.id as string;

	const [sessionData, setSessionData] = useState<SessionData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [currentRound, setCurrentRound] = useState(1);
	const [scores, setScores] = useState<Scores>({});

	// Load session data
	useEffect(() => {
		const fetchSession = async () => {
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

				const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
					global: {
						headers: {
							Authorization: `Bearer ${session.access_token}`,
						},
					},
				});

				// Fetch session
				const { data: sessionRecord, error: sessionError } = await supabaseClient
					.from("sessions")
					.select("*")
					.eq("id", sessionId)
					.single();

				if (sessionError) {
					console.error("Error fetching session:", sessionError);
					setError(`Failed to load session: ${sessionError.message || JSON.stringify(sessionError)}`);
					setLoading(false);
					return;
				}

				// Fetch players with details
				const playersResponse = await fetch(`/api/sessions/${sessionId}/players`, {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				});

				if (!playersResponse.ok) {
					const errorData = await playersResponse.json().catch(() => ({}));
					console.error("Error fetching players:", errorData);
					setError(`Failed to load players: ${errorData.error || playersResponse.statusText}`);
					setLoading(false);
					return;
				}

				const playersData = await playersResponse.json();
				const players: Player[] = playersData.players;

				// Fetch matches
				const { data: matches, error: matchesError } = await supabaseClient
					.from("session_matches")
					.select("*")
					.eq("session_id", sessionId)
					.order("round_number", { ascending: true })
					.order("match_order", { ascending: true });

				if (matchesError) {
					console.error("Error fetching matches:", matchesError);
					setError(`Failed to load matches: ${matchesError.message || JSON.stringify(matchesError)}`);
					setLoading(false);
					return;
				}

				// Group matches by round_number
				const matchesByRound = (matches || []).reduce((acc, match) => {
					const roundNumber = match.round_number;
					if (!acc[roundNumber]) {
						acc[roundNumber] = [];
					}
					acc[roundNumber].push(match);
					return acc;
				}, {} as Record<number, Match[]>);

				setSessionData({
					session: sessionRecord,
					players,
					matchesByRound,
				});

				// Set initial round to first available round
				const roundNumbers = Object.keys(matchesByRound).map(Number).sort((a, b) => a - b);
				if (roundNumbers.length > 0) {
					setCurrentRound(roundNumbers[0]);
				}
			} catch (err) {
				console.error("Error fetching session:", err);
				setError("Failed to load session");
			} finally {
				setLoading(false);
			}
		};

		if (sessionId) {
			fetchSession();
		}
	}, [sessionId]);

	// Get available rounds
	const roundNumbers = useMemo(() => {
		if (!sessionData) return [];
		return Object.keys(sessionData.matchesByRound)
			.map(Number)
			.sort((a, b) => a - b);
	}, [sessionData]);

	// Get current round matches
	const currentRoundMatches = useMemo(() => {
		if (!sessionData) return [];
		return sessionData.matchesByRound[currentRound] || [];
	}, [sessionData, currentRound]);

	// Get player by ID
	const getPlayer = useCallback(
		(playerId: string): Player | undefined => {
			if (!sessionData) return undefined;
			return sessionData.players.find((p) => p.id === playerId);
		},
		[sessionData]
	);

	// Handle score change
	const handleScoreChange = useCallback(
		(matchId: string, side: "team1" | "team2", value: string) => {
			setScores((prev) => ({
				...prev,
				[matchId]: {
					...prev[matchId],
					[side]: value === "" ? null : parseInt(value, 10) || null,
				},
			}));
		},
		[]
	);

	// Navigate rounds
	const goToRound = useCallback((round: number) => {
		if (roundNumbers.includes(round)) {
			setCurrentRound(round);
		}
	}, [roundNumbers]);

	const goToPreviousRound = useCallback(() => {
		const currentIndex = roundNumbers.indexOf(currentRound);
		if (currentIndex > 0) {
			setCurrentRound(roundNumbers[currentIndex - 1]);
		}
	}, [roundNumbers, currentRound]);

	const goToNextRound = useCallback(() => {
		const currentIndex = roundNumbers.indexOf(currentRound);
		if (currentIndex < roundNumbers.length - 1) {
			setCurrentRound(roundNumbers[currentIndex + 1]);
		}
	}, [roundNumbers, currentRound]);

	if (loading) {
		return (
			<SidebarProvider>
				<AppSidebar variant="inset" />
				<SidebarInset>
					<SiteHeader title="Session" />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
								<Box>
									<p className="text-muted-foreground">Loading session...</p>
								</Box>
							</div>
						</div>
					</div>
				</SidebarInset>
			</SidebarProvider>
		);
	}

	if (error || !sessionData) {
		return (
			<SidebarProvider>
				<AppSidebar variant="inset" />
				<SidebarInset>
					<SiteHeader title="Session" />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
								<Box>
									<p className="text-destructive">{error || "Failed to load session"}</p>
								</Box>
							</div>
						</div>
					</div>
				</SidebarInset>
			</SidebarProvider>
		);
	}

	const totalRounds = roundNumbers.length;

	return (
		<SidebarProvider>
			<AppSidebar variant="inset" />
			<SidebarInset>
				<SiteHeader title="Session" />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
							{/* Header */}
							<Box className="flex justify-between items-end">
								<Box>
									<h1 className="text-3xl font-bold font-heading tracking-tight">
										Session
									</h1>
								</Box>
								<Box className="flex items-center gap-1 bg-chart-2/10 text-chart-2 px-2 py-1 rounded-lg border border-chart-2/20">
									<Box className="size-2 rounded-full bg-chart-2 animate-pulse" />
									<span className="text-[10px] font-black uppercase tracking-tight">Live</span>
								</Box>
							</Box>

							{/* Matches */}
							<Stack direction="column" spacing={4} className="min-h-[400px]">
								{currentRoundMatches.map((match) => {
									const matchScores = scores[match.id] || { team1: null, team2: null };
									const isSingles = match.match_type === "singles";

									// Get players for each team
									const team1PlayerIds = isSingles
										? [match.player_ids[0]]
										: [match.player_ids[0], match.player_ids[1]];
									const team2PlayerIds = isSingles
										? [match.player_ids[1]]
										: [match.player_ids[2], match.player_ids[3]];

									const team1Players = team1PlayerIds.map((id) => getPlayer(id)).filter(Boolean) as Player[];
									const team2Players = team2PlayerIds.map((id) => getPlayer(id)).filter(Boolean) as Player[];

									const team1Elo = isSingles
										? team1Players[0]?.elo || 1500
										: averageElo(team1Players.map((p) => p.elo));
									const team2Elo = isSingles
										? team2Players[0]?.elo || 1500
										: averageElo(team2Players.map((p) => p.elo));

									// Get match counts for accurate K-factor calculation
									// For singles: use player's match count
									// For doubles: use average of team players' match counts (approximation for UI preview)
									const team1MatchCount = isSingles
										? team1Players[0]?.matchCount || 0
										: Math.round(
												((team1Players[0]?.matchCount || 0) + (team1Players[1]?.matchCount || 0)) / 2
										  );
									const team2MatchCount = isSingles
										? team2Players[0]?.matchCount || 0
										: Math.round(
												((team2Players[0]?.matchCount || 0) + (team2Players[1]?.matchCount || 0)) / 2
										  );

									// Calculate Elo previews with accurate match counts
									const team1WinChange = calculateEloChange(team1Elo, team2Elo, "win", team1MatchCount);
									const team1DrawChange = calculateEloChange(team1Elo, team2Elo, "draw", team1MatchCount);
									const team1LoseChange = calculateEloChange(team1Elo, team2Elo, "lose", team1MatchCount);

									const team2WinChange = calculateEloChange(team2Elo, team1Elo, "win", team2MatchCount);
									const team2DrawChange = calculateEloChange(team2Elo, team1Elo, "draw", team2MatchCount);
									const team2LoseChange = calculateEloChange(team2Elo, team1Elo, "lose", team2MatchCount);

									const team1Name = isSingles
										? team1Players[0]?.name || "Unknown"
										: `${team1Players[0]?.name || ""} & ${team1Players[1]?.name || ""}`.trim();
									const team2Name = isSingles
										? team2Players[0]?.name || "Unknown"
										: `${team2Players[0]?.name || ""} & ${team2Players[1]?.name || ""}`.trim();

									return (
										<Box
											key={match.id}
											className="bg-card rounded-[20px] p-5 border border-border/50 shadow-sm"
										>
											<Stack direction="row" alignItems="center" justifyContent="between" spacing={4}>
												{/* Team 1 */}
												<Stack direction="column" alignItems="center" spacing={2} className="flex-1">
													{isSingles ? (
														<Avatar className="size-16 border-2 border-border shadow-md">
															<AvatarImage
																src={team1Players[0]?.avatar || undefined}
																alt={team1Players[0]?.name}
															/>
															<AvatarFallback>
																{team1Players[0]?.name?.charAt(0).toUpperCase() || "?"}
															</AvatarFallback>
														</Avatar>
													) : (
														<Stack direction="row" spacing={-4}>
															{team1Players.map((player, idx) => (
																<Avatar
																	key={player.id}
																	className="size-14 border-2 border-background shadow-sm"
																>
																	<AvatarImage src={player.avatar || undefined} alt={player.name} />
																	<AvatarFallback>{player.name?.charAt(0).toUpperCase() || "?"}</AvatarFallback>
																</Avatar>
															))}
														</Stack>
													)}
													<Box className="text-center">
														<p className="text-base font-bold leading-tight">{team1Name}</p>
														<p className="text-xs text-muted-foreground font-medium">
															{isSingles ? `Elo ${team1Elo}` : `Avg. ${team1Elo}`}
														</p>
													</Box>
													<Stack
														direction="row"
														alignItems="center"
														justifyContent="center"
														spacing={3}
														className="text-xs font-bold mt-2"
													>
														<span className="text-chart-2">+{team1WinChange}</span>
														<span className="text-chart-3">{team1DrawChange >= 0 ? "+" : ""}{team1DrawChange}</span>
														<span className="text-chart-4">{team1LoseChange}</span>
													</Stack>
												</Stack>

												{/* Score Inputs */}
												<Stack direction="row" alignItems="center" spacing={3} className="shrink-0">
													<input
														type="number"
														placeholder="0"
														value={matchScores.team1 ?? ""}
														onChange={(e) => handleScoreChange(match.id, "team1", e.target.value)}
														className="size-16 bg-input rounded-xl text-center text-2xl font-black border-2 border-border/50 focus:border-primary focus:ring-2 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground/30"
													/>
													<Box className="px-1">
														<span className="text-xs font-black text-muted-foreground">VS</span>
													</Box>
													<input
														type="number"
														placeholder="0"
														value={matchScores.team2 ?? ""}
														onChange={(e) => handleScoreChange(match.id, "team2", e.target.value)}
														className="size-16 bg-input rounded-xl text-center text-2xl font-black border-2 border-border/50 focus:border-primary focus:ring-2 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground/30"
													/>
												</Stack>

												{/* Team 2 */}
												<Stack direction="column" alignItems="center" spacing={2} className="flex-1">
													{isSingles ? (
														<Avatar className="size-16 border-2 border-border shadow-md">
															<AvatarImage
																src={team2Players[0]?.avatar || undefined}
																alt={team2Players[0]?.name}
															/>
															<AvatarFallback>
																{team2Players[0]?.name?.charAt(0).toUpperCase() || "?"}
															</AvatarFallback>
														</Avatar>
													) : (
														<Stack direction="row" spacing={-4}>
															{team2Players.map((player, idx) => (
																<Avatar
																	key={player.id}
																	className="size-14 border-2 border-background shadow-sm"
																>
																	<AvatarImage src={player.avatar || undefined} alt={player.name} />
																	<AvatarFallback>{player.name?.charAt(0).toUpperCase() || "?"}</AvatarFallback>
																</Avatar>
															))}
														</Stack>
													)}
													<Box className="text-center">
														<p className="text-base font-bold leading-tight">{team2Name}</p>
														<p className="text-xs text-muted-foreground font-medium">
															{isSingles ? `Elo ${team2Elo}` : `Avg. ${team2Elo}`}
														</p>
													</Box>
													<Stack
														direction="row"
														alignItems="center"
														justifyContent="center"
														spacing={3}
														className="text-xs font-bold mt-2"
													>
														<span className="text-chart-2">+{team2WinChange}</span>
														<span className="text-chart-3">{team2DrawChange >= 0 ? "+" : ""}{team2DrawChange}</span>
														<span className="text-chart-4">{team2LoseChange}</span>
													</Stack>
												</Stack>
											</Stack>
										</Box>
									);
								})}
							</Stack>

							{/* Round Indicators */}
							<Box className="pt-6 pb-4">
								<Stack direction="row" alignItems="center" justifyContent="center" spacing={2}>
									{roundNumbers.map((round) => {
										const isActive = round === currentRound;
										return (
											<Box
												key={round}
												className={cn(
													"flex-1 h-1 rounded-full transition-all",
													isActive
														? "bg-primary"
														: "bg-muted"
												)}
											/>
										);
									})}
								</Stack>
							</Box>

							{/* Navigation Buttons */}
							<Box className="pt-2 pb-8">
								<Stack direction="row" spacing={3}>
									<Button
										variant="outline"
										onClick={goToPreviousRound}
										disabled={currentRound === roundNumbers[0]}
										className="flex-1 py-4 px-6 rounded-full font-bold text-base h-auto"
									>
										<Stack
											direction="row"
											alignItems="center"
											justifyContent="center"
											spacing={2}
										>
											<Icon icon="solar:arrow-left-linear" className="size-5" />
											<span>Previous</span>
										</Stack>
									</Button>
									<Button
										variant="outline"
										onClick={goToNextRound}
										disabled={currentRound === roundNumbers[roundNumbers.length - 1]}
										className="flex-1 py-4 px-6 rounded-full font-bold text-base h-auto"
									>
										<Stack
											direction="row"
											alignItems="center"
											justifyContent="center"
											spacing={2}
										>
											<span>Next</span>
											<Icon icon="solar:arrow-right-linear" className="size-5" />
										</Stack>
									</Button>
								</Stack>
							</Box>
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

export default function SessionPage() {
	return (
		<AuthGuard>
			<SessionPageContent />
		</AuthGuard>
	);
}
