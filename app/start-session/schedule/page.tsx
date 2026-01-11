"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { Stack } from "@/components/ui/stack";
import { Box } from "@/components/ui/box";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { RoundCard } from "./_components/round-card";
import { t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase/client";

type Player = {
	id: string;
	name: string;
	avatar: string | null;
};

type Match = {
	type: "singles" | "doubles";
	players: Player[];
};

type Round = {
	id: string;
	roundNumber: number;
	matches: Match[];
	restingPlayers?: Player[];
};

/**
 * Generate schedule for 3 players
 *
 * Round 1: Two random players play, third rests (not shown)
 * Round 2: Player who rested in Round 1 vs Winner of Round 1
 * Round 3: Remaining pairing (Loser of Round 2 vs player who didn't play Round 2)
 *
 * Since match results aren't known yet at schedule generation time,
 * we generate an initial deterministic schedule showing all pairings.
 * The dynamic part (winner-based matchups) will be handled when results are entered.
 */
const generateScheduleFor3Players = (players: Player[]): Round[] => {
	if (players.length !== 3) return [];

	const [A, B, C] = players;
	const rounds: Round[] = [];

	// Round 1: Two players play (A vs B), C rests (not shown in UI)
	rounds.push({
		id: "1",
		roundNumber: 1,
		matches: [{ type: "singles", players: [A, B] }],
	});

	// Round 2: Player who rested (C) vs one of the Round 1 players
	// Since we don't know the winner yet, show C vs A (will be updated when Round 1 result is known)
	rounds.push({
		id: "2",
		roundNumber: 2,
		matches: [{ type: "singles", players: [C, A] }],
	});

	// Round 3: Remaining pairing (B vs C)
	// This ensures all pairings (AB, AC, BC) are covered
	rounds.push({
		id: "3",
		roundNumber: 3,
		matches: [{ type: "singles", players: [B, C] }],
	});

	return rounds;
};

/**
 * Generate schedule for 4 players
 *
 * Rounds 1-3: Singles (each player plays every other player once)
 * - 2 matches per round
 *
 * Rounds 4-6: Doubles (each player pairs with everyone once)
 * - 1 match per round
 */
const generateScheduleFor4Players = (players: Player[]): Round[] => {
	if (players.length !== 4) return [];

	const [A, B, C, D] = players;
	const rounds: Round[] = [];

	// Singles rounds (1-3): Each player plays every other player once
	// Round 1: A vs B, C vs D
	rounds.push({
		id: "1",
		roundNumber: 1,
		matches: [
			{ type: "singles", players: [A, B] },
			{ type: "singles", players: [C, D] },
		],
	});

	// Round 2: A vs C, B vs D
	rounds.push({
		id: "2",
		roundNumber: 2,
		matches: [
			{ type: "singles", players: [A, C] },
			{ type: "singles", players: [B, D] },
		],
	});

	// Round 3: A vs D, B vs C
	rounds.push({
		id: "3",
		roundNumber: 3,
		matches: [
			{ type: "singles", players: [A, D] },
			{ type: "singles", players: [B, C] },
		],
	});

	// Doubles rounds (4-6): Each player pairs with everyone once
	// Round 4: (A + B) vs (C + D)
	rounds.push({
		id: "4",
		roundNumber: 4,
		matches: [{ type: "doubles", players: [A, B, C, D] }],
	});

	// Round 5: (A + C) vs (B + D)
	rounds.push({
		id: "5",
		roundNumber: 5,
		matches: [{ type: "doubles", players: [A, C, B, D] }],
	});

	// Round 6: (A + D) vs (B + C)
	rounds.push({
		id: "6",
		roundNumber: 6,
		matches: [{ type: "doubles", players: [A, D, B, C] }],
	});

	return rounds;
};

/**
 * Generate schedule for 5 players
 *
 * Total rounds: 5
 * Each round: 2 singles matches (4 players play, 1 rests - not shown)
 * Every player rests exactly once
 * Every player plays 4 matches total
 * No duplicate matchups (each pairing happens exactly once)
 */
const generateScheduleFor5Players = (players: Player[]): Round[] => {
	if (players.length !== 5) return [];

	const [A, B, C, D, E] = players;
	const rounds: Round[] = [];

	// Round 1: A rests → BC, DE
	rounds.push({
		id: "1",
		roundNumber: 1,
		matches: [
			{ type: "singles", players: [B, C] },
			{ type: "singles", players: [D, E] },
		],
	});

	// Round 2: B rests → AD, CE (using A, C, D, E)
	rounds.push({
		id: "2",
		roundNumber: 2,
		matches: [
			{ type: "singles", players: [A, D] },
			{ type: "singles", players: [C, E] },
		],
	});

	// Round 3: C rests → AE, BD (using A, B, D, E)
	rounds.push({
		id: "3",
		roundNumber: 3,
		matches: [
			{ type: "singles", players: [A, E] },
			{ type: "singles", players: [B, D] },
		],
	});

	// Round 4: D rests → AC, BE (using A, B, C, E)
	rounds.push({
		id: "4",
		roundNumber: 4,
		matches: [
			{ type: "singles", players: [A, C] },
			{ type: "singles", players: [B, E] },
		],
	});

	// Round 5: E rests → AB, CD (using A, B, C, D)
	rounds.push({
		id: "5",
		roundNumber: 5,
		matches: [
			{ type: "singles", players: [A, B] },
			{ type: "singles", players: [C, D] },
		],
	});

	return rounds;
};

/**
 * Generate schedule for 6 players
 *
 * Players are organized into 3 doubles teams based on selection order:
 * Team A: players[0], players[1]
 * Team B: players[2], players[3]
 * Team C: players[4], players[5]
 *
 * Phase 1 - Singles (Rounds 1-4):
 * - 4 rounds, 3 singles matches each
 * - Each player plays 4 matches (against all players except their doubles partner)
 * - No duplicate matchups
 *
 * Phase 2 - Mixed (Rounds 5-7):
 * - 3 rounds, each with 1 doubles match + 1 singles match
 * - Each doubles team plays exactly one doubles match
 * - Each doubles team plays exactly one internal singles match (A vs B within team)
 * - All players play every round
 */
const generateScheduleFor6Players = (players: Player[]): Round[] => {
	if (players.length !== 6) return [];

	// Organize players into teams (based on selection order from Step 2):
	// Team A: players[0], players[1]
	// Team B: players[2], players[3]
	// Team C: players[4], players[5]
	const [A, B, C, D, E, F] = players;

	const rounds: Round[] = [];

	// Phase 1: Singles rounds (1-4)
	// Each round has 3 matches, ensuring no player plays their doubles partner
	// All 12 valid cross-team pairings are used exactly once

	// Round 1: A vs C, B vs E, D vs F
	rounds.push({
		id: "1",
		roundNumber: 1,
		matches: [
			{ type: "singles", players: [A, C] },
			{ type: "singles", players: [B, E] },
			{ type: "singles", players: [D, F] },
		],
	});

	// Round 2: A vs D, B vs F, C vs E
	rounds.push({
		id: "2",
		roundNumber: 2,
		matches: [
			{ type: "singles", players: [A, D] },
			{ type: "singles", players: [B, F] },
			{ type: "singles", players: [C, E] },
		],
	});

	// Round 3: A vs E, B vs D, C vs F
	rounds.push({
		id: "3",
		roundNumber: 3,
		matches: [
			{ type: "singles", players: [A, E] },
			{ type: "singles", players: [B, D] },
			{ type: "singles", players: [C, F] },
		],
	});

	// Round 4: A vs F, B vs C, D vs E
	// All 12 valid cross-team pairings are now used exactly once
	rounds.push({
		id: "4",
		roundNumber: 4,
		matches: [
			{ type: "singles", players: [A, F] },
			{ type: "singles", players: [B, C] },
			{ type: "singles", players: [D, E] },
		],
	});

	// Phase 2: Mixed rounds (5-7)
	// Each round: 1 doubles match + 1 singles match (internal to the remaining team)
	// Each doubles team plays exactly one doubles match and one internal singles match

	// Round 5: Team A vs Team B (doubles), Team C internal (singles)
	rounds.push({
		id: "5",
		roundNumber: 5,
		matches: [
			{ type: "doubles", players: [A, B, C, D] }, // Team A vs Team B
			{ type: "singles", players: [E, F] }, // Team C internal
		],
	});

	// Round 6: Team B vs Team C (doubles), Team A internal (singles)
	rounds.push({
		id: "6",
		roundNumber: 6,
		matches: [
			{ type: "doubles", players: [C, D, E, F] }, // Team B vs Team C
			{ type: "singles", players: [A, B] }, // Team A internal
		],
	});

	// Round 7: Team A vs Team C (doubles), Team B internal (singles)
	rounds.push({
		id: "7",
		roundNumber: 7,
		matches: [
			{ type: "doubles", players: [A, B, E, F] }, // Team A vs Team C
			{ type: "singles", players: [C, D] }, // Team B internal
		],
	});

	return rounds;
};

/**
 * Generate schedule based on player count
 */
const generateSchedule = (players: Player[]): Round[] => {
	if (players.length === 3) {
		return generateScheduleFor3Players(players);
	}

	if (players.length === 4) {
		return generateScheduleFor4Players(players);
	}

	if (players.length === 5) {
		return generateScheduleFor5Players(players);
	}

	if (players.length === 6) {
		return generateScheduleFor6Players(players);
	}

	return [];
};

function SchedulePageContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const playerCount = parseInt(searchParams.get("count") || "0", 10);

	// Get selected players from sessionStorage
	const [selectedPlayers, setSelectedPlayers] = useState<Player[]>(() => {
		if (typeof window === "undefined") return [];
		const stored = sessionStorage.getItem("selectedPlayers");
		if (stored) {
			try {
				const parsed = JSON.parse(stored);
				// Remove email field if present (from User type)
				return parsed.map((p: any) => ({
					id: p.id,
					name: p.name,
					avatar: p.avatar,
				}));
			} catch (e) {
				return [];
			}
		}
		return [];
	});

	// State for shuffled players (for randomize functionality)
	const [shuffledPlayers, setShuffledPlayers] =
		useState<Player[]>(selectedPlayers);

	// Store original schedule (before randomization) to preserve doubles rounds
	const [originalSchedule, setOriginalSchedule] = useState<Round[]>(() => {
		if (selectedPlayers.length === playerCount) {
			return generateSchedule(selectedPlayers);
		}
		return [];
	});

	// Track if we're manually managing rounds (to prevent useEffect from overwriting)
	const [isManuallyManagingRounds, setIsManuallyManagingRounds] = useState(false);

	// Update shuffled players and original schedule when selected players change
	useEffect(() => {
		if (selectedPlayers.length === playerCount) {
			setShuffledPlayers(selectedPlayers);
			setOriginalSchedule(generateSchedule(selectedPlayers));
			setIsManuallyManagingRounds(false);
		}
	}, [selectedPlayers, playerCount]);

	// Generate schedule from shuffled players
	const [rounds, setRounds] = useState<Round[]>(() => {
		if (shuffledPlayers.length === playerCount) {
			return generateSchedule(shuffledPlayers);
		}
		return [];
	});

	// Update schedule when shuffled players change (only if not manually managing)
	useEffect(() => {
		if (shuffledPlayers.length === playerCount && !isManuallyManagingRounds) {
			const newRounds = generateSchedule(shuffledPlayers);
			setRounds(newRounds);
		}
	}, [shuffledPlayers, playerCount, isManuallyManagingRounds]);

	// Redirect if invalid playerCount or no players
	useEffect(() => {
		if (!playerCount || playerCount < 3 || playerCount > 6) {
			router.push("/start-session");
			return;
		}
		if (selectedPlayers.length !== playerCount) {
			router.push(`/start-session/players?count=${playerCount}`);
			return;
		}
	}, [playerCount, selectedPlayers.length, router]);

	const handleRandomize = () => {
		// For 4 players: preserve doubles rounds (4-6) from original schedule
		// For 6 players: preserve mixed rounds (5-7) from original schedule
		// For 3 and 5 players: all matches are singles, so randomize everything
		
		let doublesRoundsToPreserve: Round[] = [];
		let mixedRoundsToPreserve: Round[] = [];
		
		if (playerCount === 4) {
			// Rounds 4-6 are pure doubles - preserve from original schedule
			doublesRoundsToPreserve = originalSchedule.filter(
				(round) => round.roundNumber >= 4 && round.roundNumber <= 6
			);
		} else if (playerCount === 6) {
			// Rounds 5-7 have doubles matches (mixed rounds) - preserve from original schedule
			mixedRoundsToPreserve = originalSchedule.filter(
				(round) => round.roundNumber >= 5 && round.roundNumber <= 7
			);
		}
		
		// Shuffle players for singles matches
		const shuffled = [...selectedPlayers].sort(() => Math.random() - 0.5);
		
		// Generate new schedule with shuffled players
		const newRounds = generateSchedule(shuffled);
		
		// Combine: use new singles rounds, keep original doubles/mixed rounds
		let finalRounds: Round[] = [];
		
		if (playerCount === 4) {
			// Use singles rounds (1-3) from new schedule, keep doubles rounds (4-6) from original
			const newSinglesRounds = newRounds.filter(
				(round) => round.roundNumber >= 1 && round.roundNumber <= 3
			);
			finalRounds = [...newSinglesRounds, ...doublesRoundsToPreserve];
		} else if (playerCount === 6) {
			// Use singles rounds (1-4) from new schedule, keep mixed rounds (5-7) from original
			const newSinglesRounds = newRounds.filter(
				(round) => round.roundNumber >= 1 && round.roundNumber <= 4
			);
			finalRounds = [...newSinglesRounds, ...mixedRoundsToPreserve];
		} else {
			// For 3 and 5 players, all matches are singles, so use the full new schedule
			finalRounds = newRounds;
			// No need to manually manage for these cases
			setIsManuallyManagingRounds(false);
			setShuffledPlayers(shuffled);
			setRounds(finalRounds);
			return;
		}
		
		// Update rounds state directly (bypassing the useEffect)
		setIsManuallyManagingRounds(true);
		setRounds(finalRounds);
		// Update shuffledPlayers for consistency, but useEffect won't overwrite because of the flag
		setShuffledPlayers(shuffled);
	};

	const [isStartingSession, setIsStartingSession] = useState(false);

	const handleStartSession = async () => {
		if (isStartingSession) return;

		try {
			setIsStartingSession(true);

			// Get current session token
			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				console.error("Not authenticated");
				return;
			}

			// Call API to create session
			const response = await fetch("/api/sessions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${session.access_token}`,
				},
				body: JSON.stringify({
					playerCount,
					players: shuffledPlayers,
					rounds: rounds,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				console.error("Failed to create session:", data.error);
				return;
			}

			const data = await response.json();

			// Redirect to session page
			router.push(`/session/${data.sessionId}`);
		} catch (error) {
			console.error("Error starting session:", error);
		} finally {
			setIsStartingSession(false);
		}
	};

	if (
		!playerCount ||
		playerCount < 3 ||
		playerCount > 6 ||
		rounds.length === 0
	) {
		return null;
	}

	return (
		<SidebarProvider>
			<AppSidebar variant="inset" />
			<SidebarInset>
				<SiteHeader title={t.startSession.schedule.title} />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
							{/* Step Indicator */}
							<Box className="flex justify-end">
								<Box className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full uppercase tracking-wider">
									{t.startSession.schedule.stepIndicator}
								</Box>
							</Box>

							{/* Subtitle */}
							<p className="text-muted-foreground">
								{t.startSession.schedule.subtitle}
							</p>

							{/* Randomize Button */}
							<Box className="mt-2 mb-6">
								<Button
									variant="outline"
									onClick={handleRandomize}
									className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-secondary/50 border-border/50 rounded-2xl"
								>
									<Icon
										icon="solar:shuffle-bold"
										className="size-5 text-primary"
									/>
									<span className="font-semibold text-sm">
										{t.startSession.schedule.randomize}
									</span>
								</Button>
							</Box>

							{/* Rounds List */}
							<Box className="relative">
								{/* Timeline connector */}
								<Box className="absolute left-6 top-8 bottom-8 w-0.5 bg-border/30 -z-0" />

								<Stack direction="column" spacing={6}>
									{rounds.map((round, index) => (
										<RoundCard
											key={round.id}
											roundNumber={round.roundNumber}
											matches={round.matches}
											restingPlayers={
												round.restingPlayers
											}
											isActive={index === 0}
										/>
									))}
								</Stack>
							</Box>

							{/* Back and Start Session Buttons */}
							<Box className="pt-4">
								<Stack direction="column" spacing={3}>
									<Button
										onClick={handleStartSession}
										disabled={isStartingSession}
										className="w-full py-4 px-6 rounded-full font-bold text-lg shadow-lg h-auto"
									>
										<Stack
											direction="row"
											alignItems="center"
											justifyContent="center"
											spacing={2}
										>
											<span>
												{isStartingSession
													? "Kreiranje..."
													: t.startSession.schedule
															.startSession}
											</span>
											{!isStartingSession && (
												<Icon
													icon="solar:play-bold"
													className="size-5"
												/>
											)}
										</Stack>
									</Button>
									<Button
										variant="secondary"
										onClick={() =>
											router.push(
												`/start-session/players?count=${playerCount}`
											)
										}
										className="w-full py-4 px-6 rounded-full font-bold text-lg h-auto"
									>
										{t.startSession.back}
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

export default function SchedulePage() {
	return (
		<AuthGuard>
			<SchedulePageContent />
		</AuthGuard>
	);
}
