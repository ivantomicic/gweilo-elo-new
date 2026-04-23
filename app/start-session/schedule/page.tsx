"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useWebHaptics } from "web-haptics/react";
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
	isDynamic?: boolean; // Flag to indicate this round will be updated dynamically
	dynamicNote?: {
		title: string;
		description: string;
	};
};

type ScheduleBuildResult = {
	shuffledPlayers: Player[];
	rounds: Round[];
	isManuallyManagingRounds: boolean;
};

type SixPlayerTeamKey = "A" | "B" | "C";

const getSixPlayerCandidateTeams = (
	players: Player[],
): Record<SixPlayerTeamKey, [string, string]> | null => {
	if (players.length !== 6) {
		return null;
	}

	return {
		A: [players[0].id, players[1].id],
		B: [players[2].id, players[3].id],
		C: [players[4].id, players[5].id],
	};
};

/**
 * Generate schedule for 2 players
 *
 * Single match between the two players
 */
const generateScheduleFor2Players = (players: Player[]): Round[] => {
	if (players.length !== 2) return [];

	const [A, B] = players;
	return [
		{
			id: "1",
			roundNumber: 1,
			matches: [{ type: "singles", players: [A, B] }],
		},
	];
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
const generateScheduleFor6Players = (
	players: Player[],
	round5SinglesTeam: SixPlayerTeamKey = "C",
): Round[] => {
	if (players.length !== 6) return [];

	// Organize players into teams (based on selection order from Step 2):
	// Team A: players[0], players[1]
	// Team B: players[2], players[3]
	// Team C: players[4], players[5]
	const [A, B, C, D, E, F] = players;
	const teams: Record<SixPlayerTeamKey, [Player, Player]> = {
		A: [A, B],
		B: [C, D],
		C: [E, F],
	};
	const round5SinglesPlayers = teams[round5SinglesTeam];
	const doublesTeamKeys = (["A", "B", "C"] as SixPlayerTeamKey[]).filter(
		(teamKey) => teamKey !== round5SinglesTeam,
	);
	const round5DoublesTeam1Key = doublesTeamKeys[0];
	const round5DoublesTeam2Key = doublesTeamKeys[1];
	const round5DoublesTeam1Players = teams[round5DoublesTeam1Key];
	const round5DoublesTeam2Players = teams[round5DoublesTeam2Key];

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

	// Round 5: two teams play doubles, remaining team plays internal singles
	rounds.push({
		id: "5",
		roundNumber: 5,
		matches: [
			{
				type: "doubles",
				players: [
					...round5DoublesTeam1Players,
					...round5DoublesTeam2Players,
				],
			},
			{ type: "singles", players: [...round5SinglesPlayers] },
		],
	});

	// Round 6: Dynamically determined after Round 5
	// Winners from Round 5 doubles + players from Round 5 singles
	// For now, we'll use a placeholder that will be updated after Round 5 is completed
	rounds.push({
		id: "6",
		roundNumber: 6,
		matches: [
			{
				type: "doubles",
				players: [
					...round5DoublesTeam1Players,
					...round5SinglesPlayers,
				],
			},
			{ type: "singles", players: [...round5DoublesTeam2Players] },
		],
		isDynamic: true, // Flag to indicate this round will be updated dynamically
	});

	// Round 7: Dynamically determined after Round 5
	// Doubles losers vs Round 5 singles, doubles winners play singles
	rounds.push({
		id: "7",
		roundNumber: 7,
		matches: [
			{
				type: "doubles",
				players: [
					...round5DoublesTeam2Players,
					...round5SinglesPlayers,
				],
			},
			{ type: "singles", players: [...round5DoublesTeam1Players] },
		],
		isDynamic: true,
		dynamicNote: {
			title: "Schedule will be determined after Round 5 is completed.",
			description:
				"Round 5 doubles winners will play singles, and doubles losers will play doubles against Round 5 singles.",
		},
	});

	return rounds;
};

/**
 * Generate schedule based on player count
 */
const generateSchedule = (
	players: Player[],
	options?: {
		sixPlayerRound5SinglesTeam?: SixPlayerTeamKey;
	},
): Round[] => {
	if (players.length === 2) {
		return generateScheduleFor2Players(players);
	}

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
		return generateScheduleFor6Players(
			players,
			options?.sixPlayerRound5SinglesTeam,
		);
	}

	return [];
};

const getSinglesMatchups = (rounds: Round[]): Set<string> => {
	const matchups = new Set<string>();

	rounds.forEach((round) => {
		round.matches.forEach((match) => {
			if (match.type === "singles" && match.players.length === 2) {
				const [p1, p2] = match.players.map((player) => player.id).sort();
				matchups.add(`${p1}-${p2}`);
			}
		});
	});

	return matchups;
};

const shufflePlayers = (players: Player[]): Player[] =>
	[...players].sort(() => Math.random() - 0.5);

const buildRandomizedSchedule = (
	selectedPlayers: Player[],
	playerCount: number,
	originalSchedule: Round[],
): ScheduleBuildResult => {
	if (playerCount === 2) {
		return {
			shuffledPlayers: selectedPlayers,
			rounds: originalSchedule,
			isManuallyManagingRounds: false,
		};
	}

	let doublesRoundsToPreserve: Round[] = [];
	let mixedRoundsToPreserve: Round[] = [];

	if (playerCount === 4) {
		doublesRoundsToPreserve = originalSchedule.filter(
			(round) => round.roundNumber >= 4 && round.roundNumber <= 6,
		);
	} else if (playerCount === 6) {
		mixedRoundsToPreserve = originalSchedule.filter(
			(round) => round.roundNumber >= 5 && round.roundNumber <= 7,
		);
	}

	const preservedSinglesMatchups =
		playerCount === 6
			? getSinglesMatchups(mixedRoundsToPreserve)
			: new Set<string>();

	let attempts = 0;
	const maxAttempts = 10;
	let finalRounds: Round[] = [];
	let finalShuffledPlayers = selectedPlayers;

	while (attempts < maxAttempts) {
		const shuffled = shufflePlayers(selectedPlayers);
		const newRounds = generateSchedule(shuffled);

		if (playerCount === 6) {
			const newSinglesRounds = newRounds.filter(
				(round) => round.roundNumber >= 1 && round.roundNumber <= 4,
			);
			const newSinglesMatchups = getSinglesMatchups(newSinglesRounds);
			let hasConflict = false;

			for (const matchup of newSinglesMatchups) {
				if (preservedSinglesMatchups.has(matchup)) {
					hasConflict = true;
					break;
				}
			}

			if (hasConflict) {
				attempts++;
				continue;
			}

			finalRounds = [...newSinglesRounds, ...mixedRoundsToPreserve];
			finalShuffledPlayers = shuffled;
			break;
		}

		if (playerCount === 4) {
			const newSinglesRounds = newRounds.filter(
				(round) => round.roundNumber >= 1 && round.roundNumber <= 3,
			);
			finalRounds = [...newSinglesRounds, ...doublesRoundsToPreserve];
			finalShuffledPlayers = shuffled;
			break;
		}

		finalRounds = newRounds;
		finalShuffledPlayers = shuffled;
		break;
	}

	if (finalRounds.length === 0) {
		const shuffled = shufflePlayers(selectedPlayers);
		const newRounds = generateSchedule(shuffled);

		if (playerCount === 4) {
			const newSinglesRounds = newRounds.filter(
				(round) => round.roundNumber >= 1 && round.roundNumber <= 3,
			);
			finalRounds = [...newSinglesRounds, ...doublesRoundsToPreserve];
		} else if (playerCount === 6) {
			const newSinglesRounds = newRounds.filter(
				(round) => round.roundNumber >= 1 && round.roundNumber <= 4,
			);
			finalRounds = [...newSinglesRounds, ...mixedRoundsToPreserve];
		} else {
			finalRounds = newRounds;
		}

		finalShuffledPlayers = shuffled;
	}

	return {
		shuffledPlayers: finalShuffledPlayers,
		rounds: finalRounds,
		isManuallyManagingRounds: playerCount === 4 || playerCount === 6,
	};
};

function SchedulePageContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { trigger } = useWebHaptics();
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

	// Get session date/time from sessionStorage
	const sessionDateTime = (() => {
		if (typeof window === "undefined") return null;
		const stored = sessionStorage.getItem("sessionDateTime");
		if (stored) {
			try {
				return new Date(stored);
			} catch (e) {
				return null;
			}
		}
		return null;
	})();
	const [sixPlayerRound5SinglesTeam, setSixPlayerRound5SinglesTeam] =
		useState<SixPlayerTeamKey>("C");
	const [isLoadingSixPlayerRound5Team, setIsLoadingSixPlayerRound5Team] =
		useState(playerCount === 6);

	const selectedPlayerIdsKey = selectedPlayers.map((player) => player.id).join(",");
	const scheduleSeedKey = `${selectedPlayerIdsKey}:${sixPlayerRound5SinglesTeam}`;
	const initialScheduleState =
		selectedPlayers.length === playerCount &&
		(playerCount !== 6 || !isLoadingSixPlayerRound5Team)
			? (() => {
					const baseSchedule = generateSchedule(selectedPlayers, {
						sixPlayerRound5SinglesTeam,
					});
					return {
						originalSchedule: baseSchedule,
						...buildRandomizedSchedule(
							selectedPlayers,
							playerCount,
							baseSchedule,
						),
					};
				})()
			: {
					originalSchedule: [] as Round[],
					shuffledPlayers: [] as Player[],
					rounds: [] as Round[],
					isManuallyManagingRounds: false,
				};

	// State for shuffled players (for randomize functionality)
	const [shuffledPlayers, setShuffledPlayers] =
		useState<Player[]>(initialScheduleState.shuffledPlayers);

	// Store original schedule (before randomization) to preserve doubles rounds
	const [originalSchedule, setOriginalSchedule] = useState<Round[]>(
		initialScheduleState.originalSchedule,
	);

	// Track if we're manually managing rounds (to prevent useEffect from overwriting)
	const [isManuallyManagingRounds, setIsManuallyManagingRounds] = useState(
		initialScheduleState.isManuallyManagingRounds,
	);
	const [initializedScheduleSeedKey, setInitializedScheduleSeedKey] = useState(
		initialScheduleState.rounds.length > 0 ? scheduleSeedKey : "",
	);

	useEffect(() => {
		if (playerCount !== 6 || selectedPlayers.length !== playerCount) {
			setIsLoadingSixPlayerRound5Team(false);
			return;
		}

		let cancelled = false;

		const loadPreferredRound5Team = async () => {
			try {
				setIsLoadingSixPlayerRound5Team(true);

				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					return;
				}

				const candidateTeams = getSixPlayerCandidateTeams(selectedPlayers);
				if (!candidateTeams) {
					return;
				}

				const response = await fetch("/api/sessions/6-player-round5-team", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${session.access_token}`,
					},
					body: JSON.stringify({ candidateTeams }),
				});

				if (!response.ok) {
					const errorData = await response.json().catch(() => null);
					console.error(
						"Failed to fetch preferred 6-player round 5 team:",
						errorData?.error || response.statusText,
					);
					return;
				}

				const data = (await response.json()) as {
					preferredSinglesTeam?: SixPlayerTeamKey;
				};

				if (
					!cancelled &&
					(data.preferredSinglesTeam === "A" ||
						data.preferredSinglesTeam === "B" ||
						data.preferredSinglesTeam === "C")
				) {
					setSixPlayerRound5SinglesTeam(data.preferredSinglesTeam);
				}
			} catch (error) {
				console.error(
					"Error fetching preferred 6-player round 5 team:",
					error,
				);
			} finally {
				if (!cancelled) {
					setIsLoadingSixPlayerRound5Team(false);
				}
			}
		};

		void loadPreferredRound5Team();

		return () => {
			cancelled = true;
		};
	}, [playerCount, selectedPlayers]);

	// Update shuffled players and original schedule when selected players change
	useEffect(() => {
		if (
			selectedPlayers.length === playerCount &&
			(playerCount !== 6 || !isLoadingSixPlayerRound5Team) &&
			scheduleSeedKey !== initializedScheduleSeedKey
		) {
			const baseSchedule = generateSchedule(selectedPlayers, {
				sixPlayerRound5SinglesTeam,
			});
			const randomizedSchedule = buildRandomizedSchedule(
				selectedPlayers,
				playerCount,
				baseSchedule,
			);

			setInitializedScheduleSeedKey(scheduleSeedKey);
			setOriginalSchedule(baseSchedule);
			setShuffledPlayers(randomizedSchedule.shuffledPlayers);
			setRounds(randomizedSchedule.rounds);
			setIsManuallyManagingRounds(
				randomizedSchedule.isManuallyManagingRounds,
			);
		}
	}, [
		selectedPlayers,
		playerCount,
		scheduleSeedKey,
		initializedScheduleSeedKey,
		isLoadingSixPlayerRound5Team,
		sixPlayerRound5SinglesTeam,
	]);

	// Generate schedule from shuffled players
	const [rounds, setRounds] = useState<Round[]>(initialScheduleState.rounds);

	// Update schedule when shuffled players change (only if not manually managing)
	useEffect(() => {
		if (shuffledPlayers.length === playerCount && !isManuallyManagingRounds) {
			const newRounds = generateSchedule(shuffledPlayers);
			setRounds(newRounds);
		}
	}, [shuffledPlayers, playerCount, isManuallyManagingRounds]);

	// Redirect if invalid playerCount or no players
	useEffect(() => {
		if (!playerCount || playerCount < 2 || playerCount > 6) {
			router.push("/start-session");
			return;
		}
		if (selectedPlayers.length !== playerCount) {
			router.push(`/start-session/players?count=${playerCount}`);
			return;
		}
	}, [playerCount, selectedPlayers.length, router]);

	const [isShuffling, setIsShuffling] = useState(false);
	const [scheduleKey, setScheduleKey] = useState(0);

	const handleRandomize = async () => {
		void trigger();

		// Start shuffle animation
		setIsShuffling(true);
		
		// Wait for spin out animation to complete
		await new Promise(resolve => setTimeout(resolve, 450));
		const randomizedSchedule = buildRandomizedSchedule(
			selectedPlayers,
			playerCount,
			originalSchedule,
		);
		setShuffledPlayers(randomizedSchedule.shuffledPlayers);
		setRounds(randomizedSchedule.rounds);
		setIsManuallyManagingRounds(
			randomizedSchedule.isManuallyManagingRounds,
		);
		
		// Trigger re-render with new key for enter animation
		setScheduleKey(prev => prev + 1);
		
		// End shuffle animation
		setIsShuffling(false);
	};

	const [isStartingSession, setIsStartingSession] = useState(false);

	const handleStartSession = async () => {
		if (isStartingSession) return;
		void trigger();

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
					createdAt: sessionDateTime?.toISOString(),
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
		playerCount < 2 ||
		playerCount > 6 ||
		(playerCount === 6 && isLoadingSixPlayerRound5Team) ||
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

							{/* Randomize Button */}
							<Box className="mb-6">
								<Button
									variant="outline"
									onClick={handleRandomize}
									disabled={isShuffling}
									className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-secondary/50 border-border/50 rounded-2xl"
								>
									<motion.div
										animate={isShuffling ? { rotate: [0, 360] } : {}}
										transition={{ duration: 0.5, ease: "easeInOut" }}
									>
										<Icon
											icon="solar:shuffle-bold"
											className={isShuffling ? "size-5 text-amber-400" : "size-5 text-foreground"}
										/>
									</motion.div>
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
											restingPlayers={round.restingPlayers}
											isActive={index === 0}
											isDynamic={round.isDynamic}
											dynamicNote={round.dynamicNote}
											isShuffling={isShuffling}
											shuffleKey={scheduleKey}
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
										onClick={() => {
											void trigger();
											router.push(
												`/start-session/players?count=${playerCount}`
											);
										}}
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
