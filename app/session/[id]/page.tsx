"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { Box } from "@/components/ui/box";
import { Loading } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Stack } from "@/components/ui/stack";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerFooter,
} from "@/components/ui/drawer";
import { supabase } from "@/lib/supabase/client";
import { createClient } from "@supabase/supabase-js";
import { calculateEloChange } from "@/lib/elo";
import { formatEloDelta } from "@/lib/elo/format";
import { getUserRole } from "@/lib/auth/getUserRole";
import { isValidVideoUrl } from "@/lib/video";
import { cn } from "@/lib/utils";
import { EditMatchDrawer } from "./_components/edit-match-drawer";
import { SessionSummaryTable } from "./_components/session-summary-table";
import { MatchHistoryCard } from "./_components/match-history-card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { getOrCreateDoubleTeam } from "@/lib/elo/double-teams";
import { t } from "@/lib/i18n";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type Player = {
	id: string;
	sessionPlayerId: string;
	team: string | null;
	name: string;
	avatar: string | null;
	elo: number;
	doublesElo?: number; // Player doubles Elo (partner-independent skill)
	matchCount?: number; // For accurate K-factor calculation
};

type Match = {
	id: string;
	round_number: number;
	match_type: "singles" | "doubles";
	match_order: number;
	player_ids: string[];
	status?: "pending" | "completed";
	team1_score?: number | null;
	team2_score?: number | null;
	video_url?: string | null;
	team_1_id?: string | null;
	team_2_id?: string | null;
};

type SessionData = {
	session: {
		id: string;
		player_count: number;
		created_at: string;
		status: "active" | "completed";
		completed_at?: string | null;
	};
	players: Player[];
	matchesByRound: Record<number, Match[]>;
};

type Scores = Record<string, { team1: number | null; team2: number | null }>;

function SessionPageContent() {
	const params = useParams();
	const router = useRouter();
	const searchParams = useSearchParams();
	const sessionId = params.id as string;

	// Page-level view filter: 'singles' | 'doubles_player' | 'doubles_team'
	// This controls both the table and the match list
	// URL uses hyphens: ?view=singles|doubles-player|doubles-team
	const urlView = searchParams.get("view");
	let activeView: "singles" | "doubles_player" | "doubles_team" = "singles";
	if (urlView === "doubles-player") {
		activeView = "doubles_player";
	} else if (urlView === "doubles-team") {
		activeView = "doubles_team";
	}

	const handleViewChange = useCallback(
		(view: "singles" | "doubles_player" | "doubles_team") => {
			const params = new URLSearchParams(searchParams.toString());
			if (view === "singles") {
				params.delete("view");
			} else if (view === "doubles_player") {
				params.set("view", "doubles-player");
			} else if (view === "doubles_team") {
				params.set("view", "doubles-team");
			}
			router.push(`?${params.toString()}`, { scroll: false });
		},
		[searchParams, router]
	);

	const [sessionData, setSessionData] = useState<SessionData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [currentRound, setCurrentRound] = useState(1);
	const [scores, setScores] = useState<Scores>({});
	const [submitting, setSubmitting] = useState(false);
	const [showForceCloseModal, setShowForceCloseModal] = useState(false);
	const [forceClosing, setForceClosing] = useState(false);
	const [showDeleteModal, setShowDeleteModal] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [isDeletable, setIsDeletable] = useState(false);
	const [deleteConfirmationChecked, setDeleteConfirmationChecked] =
		useState(false);
	const [isAdmin, setIsAdmin] = useState(false);
	const [selectedMatchForVideo, setSelectedMatchForVideo] =
		useState<Match | null>(null);
	const [videoUrlInput, setVideoUrlInput] = useState("");
	const [savingVideoUrl, setSavingVideoUrl] = useState(false);
	const [selectedMatchForEdit, setSelectedMatchForEdit] =
		useState<Match | null>(null);
	const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
	const [isEditingMatch, setIsEditingMatch] = useState(false);
	const [recalcStatus, setRecalcStatus] = useState<string | null>(null);
	const [teamEloRatings, setTeamEloRatings] = useState<
		Record<string, number>
	>({});
	const [playerPairToTeamId, setPlayerPairToTeamId] = useState<
		Record<string, string>
	>({});
	const [viewAvailability, setViewAvailability] = useState<{
		hasSingles: boolean;
		hasDoublesPlayer: boolean;
		hasDoublesTeam: boolean;
	} | null>(null);
	const [matchEloHistory, setMatchEloHistory] = useState<
		Record<
			string,
			{
				team1EloChange?: number;
				team2EloChange?: number;
			}
		>
	>({});
	const [selectedPlayerFilter, setSelectedPlayerFilter] = useState<
		string | null
	>(null);

	// Refs for score inputs to enable auto-focus
	const scoreInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

	// Reusable function to fetch players with updated Elo ratings
	const fetchPlayers = useCallback(async (): Promise<Player[]> => {
		const {
			data: { session },
		} = await supabase.auth.getSession();

		if (!session) {
			throw new Error("Not authenticated");
		}

		const playersResponse = await fetch(
			`/api/sessions/${sessionId}/players`,
			{
				headers: {
					Authorization: `Bearer ${session.access_token}`,
				},
			}
		);

		if (!playersResponse.ok) {
			const errorData = await playersResponse.json().catch(() => ({}));
			console.error("Error fetching players:", errorData);
			throw new Error(
				`Failed to load players: ${
					errorData.error || playersResponse.statusText
				}`
			);
		}

		const playersData = await playersResponse.json();
		return playersData.players as Player[];
	}, [sessionId]);

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
					setError(t.sessions.session.error.notAuthenticated);
					return;
				}

				const supabaseClient = createClient(
					supabaseUrl,
					supabaseAnonKey,
					{
						global: {
							headers: {
								Authorization: `Bearer ${session.access_token}`,
							},
						},
					}
				);

				// Fetch session
				const { data: sessionRecord, error: sessionError } =
					await supabaseClient
						.from("sessions")
						.select("*")
						.eq("id", sessionId)
						.single();

				if (sessionError) {
					console.error("Error fetching session:", sessionError);
					setError(
						`Failed to load session: ${
							sessionError.message || JSON.stringify(sessionError)
						}`
					);
					setLoading(false);
					return;
				}

				// Fetch players with details
				let players: Player[];
				try {
					players = await fetchPlayers();
				} catch (playersError) {
					console.error("Error fetching players:", playersError);
					setError(
						`Failed to load players: ${
							playersError instanceof Error
								? playersError.message
								: String(playersError)
						}`
					);
					setLoading(false);
					return;
				}

				// Fetch matches
				const { data: matches, error: matchesError } =
					await supabaseClient
						.from("session_matches")
						.select("*")
						.eq("session_id", sessionId)
						.order("round_number", { ascending: true })
						.order("match_order", { ascending: true });

				if (matchesError) {
					console.error("Error fetching matches:", matchesError);
					setError(
						`Failed to load matches: ${
							matchesError.message || JSON.stringify(matchesError)
						}`
					);
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

				// Fetch team Elo ratings for doubles matches
				// This is async, so we'll do it separately
				const fetchTeamEloRatings = async () => {
					const teamIds = new Set<string>();

					// Collect team IDs from matches (if stored)
					for (const match of matches || []) {
						if (match.match_type === "doubles") {
							if (match.team_1_id) {
								teamIds.add(match.team_1_id);
							}
							if (match.team_2_id) {
								teamIds.add(match.team_2_id);
							}
						}
					}

					// For matches without team IDs, get/create them
					const pairToTeamIdMap: Record<string, string> = {};
					for (const match of matches || []) {
						if (
							match.match_type === "doubles" &&
							match.player_ids.length >= 4
						) {
							// Normalize player pairs for lookup
							const normalizePair = (p1: string, p2: string) =>
								p1 < p2 ? `${p1}:${p2}` : `${p2}:${p1}`;

							const pair1Key = normalizePair(
								match.player_ids[0],
								match.player_ids[1]
							);
							const pair2Key = normalizePair(
								match.player_ids[2],
								match.player_ids[3]
							);

							let team1Id = match.team_1_id;
							let team2Id = match.team_2_id;

							if (!team1Id) {
								try {
									team1Id = await getOrCreateDoubleTeam(
										match.player_ids[0],
										match.player_ids[1]
									);
									pairToTeamIdMap[pair1Key] = team1Id;
								} catch (error) {
									console.error(
										"Error getting team 1 ID:",
										error
									);
								}
							} else {
								pairToTeamIdMap[pair1Key] = team1Id;
							}

							if (!team2Id) {
								try {
									team2Id = await getOrCreateDoubleTeam(
										match.player_ids[2],
										match.player_ids[3]
									);
									pairToTeamIdMap[pair2Key] = team2Id;
								} catch (error) {
									console.error(
										"Error getting team 2 ID:",
										error
									);
								}
							} else {
								pairToTeamIdMap[pair2Key] = team2Id;
							}

							if (team1Id) teamIds.add(team1Id);
							if (team2Id) teamIds.add(team2Id);
						}
					}

					// Store player pair to team ID mapping
					setPlayerPairToTeamId(pairToTeamIdMap);

					// Fetch team Elo ratings for all team IDs
					if (teamIds.size > 0) {
						const { data: teamRatings, error: teamRatingsError } =
							await supabaseClient
								.from("double_team_ratings")
								.select("team_id, elo")
								.in("team_id", Array.from(teamIds));

						const teamEloMap: Record<string, number> = {};
						if (!teamRatingsError && teamRatings) {
							for (const rating of teamRatings) {
								// Convert elo to number if it's a string (NUMERIC type)
								const eloValue =
									typeof rating.elo === "string"
										? parseFloat(rating.elo)
										: Number(rating.elo);
								teamEloMap[rating.team_id] = eloValue;
							}
						}
						// Set default 1500 for teams that don't have ratings yet
						for (const teamId of teamIds) {
							if (!teamEloMap[teamId]) {
								teamEloMap[teamId] = 1500;
							}
						}
						setTeamEloRatings(teamEloMap);
					}
				};

				// Fetch team Elo ratings asynchronously
				fetchTeamEloRatings().catch((error) => {
					console.error("Error fetching team Elo ratings:", error);
				});

				// Fetch match Elo history for completed matches
				const fetchMatchEloHistory = async () => {
					const completedMatchIds = (matches || [])
						.filter((m) => m.status === "completed")
						.map((m) => m.id);

					if (completedMatchIds.length === 0) {
						return;
					}

					const {
						data: { session: authSession },
					} = await supabase.auth.getSession();

					if (!authSession) {
						return;
					}

					const supabaseClient = createClient(
						supabaseUrl,
						supabaseAnonKey,
						{
							global: {
								headers: {
									Authorization: `Bearer ${authSession.access_token}`,
								},
							},
						}
					);

					const { data: eloHistory, error: eloHistoryError } =
						await supabaseClient
							.from("match_elo_history")
							.select("*")
							.in("match_id", completedMatchIds);

					if (eloHistoryError) {
						console.error(
							"Error fetching match Elo history:",
							eloHistoryError
						);
						return;
					}

					const eloHistoryMap: Record<
						string,
						{
							team1EloChange?: number;
							team2EloChange?: number;
						}
					> = {};

					if (eloHistory) {
						for (const history of eloHistory) {
							let team1Change: number | undefined;
							let team2Change: number | undefined;

							// For singles matches, use player deltas
							if (
								history.player1_elo_delta !== null &&
								history.player1_elo_delta !== undefined
							) {
								const delta =
									typeof history.player1_elo_delta ===
									"string"
										? parseFloat(history.player1_elo_delta)
										: Number(history.player1_elo_delta);
								team1Change = delta;
							}

							if (
								history.player2_elo_delta !== null &&
								history.player2_elo_delta !== undefined
							) {
								const delta =
									typeof history.player2_elo_delta ===
									"string"
										? parseFloat(history.player2_elo_delta)
										: Number(history.player2_elo_delta);
								team2Change = delta;
							}

							// For doubles matches, use team deltas (override player deltas)
							if (
								history.team1_elo_delta !== null &&
								history.team1_elo_delta !== undefined
							) {
								const delta =
									typeof history.team1_elo_delta === "string"
										? parseFloat(history.team1_elo_delta)
										: Number(history.team1_elo_delta);
								team1Change = delta;
							}

							if (
								history.team2_elo_delta !== null &&
								history.team2_elo_delta !== undefined
							) {
								const delta =
									typeof history.team2_elo_delta === "string"
										? parseFloat(history.team2_elo_delta)
										: Number(history.team2_elo_delta);
								team2Change = delta;
							}

							eloHistoryMap[history.match_id] = {
								team1EloChange: team1Change,
								team2EloChange: team2Change,
							};
						}
					}

					setMatchEloHistory(eloHistoryMap);
				};

				// Fetch match Elo history asynchronously
				fetchMatchEloHistory().catch((error) => {
					console.error("Error fetching match Elo history:", error);
				});

				// Initialize scores from completed matches
				// Note: 0 is a valid score, so we check for null/undefined explicitly
				const initialScores: Scores = {};
				for (const match of matches || []) {
					if (
						match.status === "completed" &&
						match.team1_score !== null &&
						match.team1_score !== undefined &&
						match.team2_score !== null &&
						match.team2_score !== undefined &&
						!isNaN(match.team1_score) &&
						!isNaN(match.team2_score)
					) {
						initialScores[match.id] = {
							team1: match.team1_score,
							team2: match.team2_score,
						};
					}
				}
				setScores(initialScores);

				// Set initial round: find first incomplete round, or last round if all are complete
				const roundNumbers = Object.keys(matchesByRound)
					.map(Number)
					.sort((a, b) => a - b);
				if (roundNumbers.length > 0) {
					// Find first round that has at least one incomplete match
					const firstIncompleteRound = roundNumbers.find(
						(roundNum) => {
							const roundMatches = matchesByRound[roundNum] || [];
							return roundMatches.some(
								(m: Match) => m.status !== "completed"
							);
						}
					);
					// If all rounds are complete, go to last round; otherwise go to first incomplete
					const initialRound =
						firstIncompleteRound ??
						roundNumbers[roundNumbers.length - 1];
					setCurrentRound(initialRound);
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
	}, [sessionId, fetchPlayers]);

	// Check if user is admin and if session is deletable
	useEffect(() => {
		const checkAdminAndDeletable = async () => {
			const role = await getUserRole();
			setIsAdmin(role === "admin");

			// Check if session is deletable (only for admins and completed sessions)
			if (
				role === "admin" &&
				sessionData?.session.status === "completed"
			) {
				try {
					const {
						data: { session },
					} = await supabase.auth.getSession();

					if (!session) return;

					const response = await fetch(
						`/api/sessions/${sessionId}/deletable`,
						{
							headers: {
								Authorization: `Bearer ${session.access_token}`,
							},
						}
					);

					if (response.ok) {
						const data = await response.json();
						setIsDeletable(data.deletable || false);
					}
				} catch (error) {
					console.error(
						"Error checking if session is deletable:",
						error
					);
					setIsDeletable(false);
				}
			} else {
				setIsDeletable(false);
			}
		};
		checkAdminAndDeletable();
	}, [sessionId, sessionData?.session.status]);

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

	// Helper function to validate if a score is valid (not null, undefined, or NaN)
	const isValidScore = useCallback(
		(score: number | null | undefined): boolean => {
			return score !== null && score !== undefined && !isNaN(score);
		},
		[]
	);

	// Handle score change with auto-focus to next input
	const handleScoreChange = useCallback(
		(matchId: string, side: "team1" | "team2", value: string, matchIndex?: number) => {
			setScores((prev) => {
				let parsedValue: number | null = null;
				if (value !== "") {
					const parsed = parseInt(value, 10);
					parsedValue = isNaN(parsed) ? null : parsed;
				}
				return {
					...prev,
					[matchId]: {
						...prev[matchId],
						[side]: parsedValue,
					},
				};
			});

			// Auto-focus next input if a value was entered
			if (value !== "") {
				setTimeout(() => {
					if (side === "team1") {
						// Focus team2 input of same match (try mobile first, then desktop)
						const nextRef = scoreInputRefs.current[`${matchId}-team2`] 
							|| scoreInputRefs.current[`${matchId}-team2-desktop`];
						nextRef?.focus();
					} else if (side === "team2" && matchIndex !== undefined) {
						// Focus team1 input of next match
						const currentMatches = sessionData?.matchesByRound[currentRound] || [];
						if (matchIndex < currentMatches.length - 1) {
							const nextMatch = currentMatches[matchIndex + 1];
							const nextRef = scoreInputRefs.current[`${nextMatch.id}-team1`]
								|| scoreInputRefs.current[`${nextMatch.id}-team1-desktop`];
							nextRef?.focus();
						}
					}
				}, 0);
			}
		},
		[sessionData, currentRound]
	);

	// Navigate rounds
	const goToRound = useCallback(
		(round: number) => {
			if (roundNumbers.includes(round)) {
				setCurrentRound(round);
			}
		},
		[roundNumbers]
	);

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

	// Check if current round is completed
	const isCurrentRoundCompleted = useMemo(() => {
		if (!sessionData) return false;
		const currentMatches = sessionData.matchesByRound[currentRound] || [];
		return (
			currentMatches.length > 0 &&
			currentMatches.every((m) => m.status === "completed")
		);
	}, [sessionData, currentRound]);

	// Check if current round has all scores entered
	const canSubmitRound = useMemo(() => {
		if (!sessionData || isCurrentRoundCompleted) return false;
		const currentMatches = sessionData.matchesByRound[currentRound] || [];
		return currentMatches.every((match) => {
			const matchScores = scores[match.id];
			if (!matchScores) return false;
			// Validate both scores: must be numbers (not null, undefined, or NaN)
			// 0 is a valid score
			return (
				isValidScore(matchScores.team1) &&
				isValidScore(matchScores.team2)
			);
		});
	}, [
		sessionData,
		currentRound,
		scores,
		isCurrentRoundCompleted,
		isValidScore,
	]);

	// Submit round results
	const handleSubmitRound = useCallback(async () => {
		if (!sessionData || !canSubmitRound || submitting) return;

		const currentMatches = sessionData.matchesByRound[currentRound] || [];
		const matchScores = currentMatches.map((match) => ({
			matchId: match.id,
			team1Score: scores[match.id].team1!,
			team2Score: scores[match.id].team2!,
		}));

		setSubmitting(true);
		try {
			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				setError(t.sessions.session.error.notAuthenticated);
				return;
			}

			const response = await fetch(
				`/api/sessions/${sessionId}/rounds/${currentRound}/submit`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${session.access_token}`,
					},
					body: JSON.stringify({ matchScores }),
				}
			);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(
					errorData.error || t.sessions.session.error.submitFailed
				);
			}

			// Refetch players to get updated Elo ratings after round submission
			const updatedPlayers = await fetchPlayers();

			// If this is Round 5 for a 6-player session, refetch matches to get updated Round 6
			if (currentRound === 5 && sessionData.session.player_count === 6) {
				const {
					data: { session: authSession },
				} = await supabase.auth.getSession();

				if (authSession) {
					const supabaseClient = createClient(
						supabaseUrl,
						supabaseAnonKey,
						{
							global: {
								headers: {
									Authorization: `Bearer ${authSession.access_token}`,
								},
							},
						}
					);

					// Refetch all matches to get updated Round 6
					const { data: allMatches, error: matchesError } =
						await supabaseClient
							.from("session_matches")
							.select("*")
							.eq("session_id", sessionId)
							.order("round_number", { ascending: true })
							.order("match_order", { ascending: true });

					if (!matchesError && allMatches) {
						// Group matches by round_number
						const matchesByRound = (allMatches || []).reduce(
							(acc, match) => {
								const roundNumber = match.round_number;
								if (!acc[roundNumber]) {
									acc[roundNumber] = [];
								}
								acc[roundNumber].push(match);
								return acc;
							},
							{} as Record<number, Match[]>
						);

						// Update local state with refreshed matches
						setSessionData((prev) => {
							if (!prev) return prev;
							const updatedMatchesByRound = { ...prev.matchesByRound };
							const currentMatches =
								updatedMatchesByRound[currentRound] || [];
							updatedMatchesByRound[currentRound] = currentMatches.map(
								(match) => ({
									...match,
									status: "completed" as const,
									team1_score: scores[match.id].team1!,
									team2_score: scores[match.id].team2!,
								})
							);

							// Merge refreshed matches (this will update Round 6 with new player assignments)
							Object.keys(matchesByRound).forEach((roundNum) => {
								const roundNumber = parseInt(roundNum, 10);
								// For Round 5, use our local state (with completed status)
								// For other rounds, use refreshed data
								if (roundNumber !== currentRound) {
									updatedMatchesByRound[roundNumber] =
										matchesByRound[roundNumber];
								}
							});

							// Check if this was the last round
							const roundNumbersList = Object.keys(
								updatedMatchesByRound
							)
								.map(Number)
								.sort((a, b) => a - b);
							const maxRoundNumber = Math.max(...roundNumbersList);
							const isLastRound = currentRound >= maxRoundNumber;

							return {
								...prev,
								players: updatedPlayers,
								matchesByRound: updatedMatchesByRound,
								session: {
									...prev.session,
									status: isLastRound
										? ("completed" as const)
										: prev.session.status,
									completed_at: isLastRound
										? new Date().toISOString()
										: prev.session.completed_at,
								},
							};
						});
					} else {
						// Fallback to original logic if refetch fails
						setSessionData((prev) => {
							if (!prev) return prev;
							const updatedMatchesByRound = { ...prev.matchesByRound };
							const currentMatches =
								updatedMatchesByRound[currentRound] || [];
							updatedMatchesByRound[currentRound] = currentMatches.map(
								(match) => ({
									...match,
									status: "completed" as const,
									team1_score: scores[match.id].team1!,
									team2_score: scores[match.id].team2!,
								})
							);

							const roundNumbersList = Object.keys(
								sessionData.matchesByRound
							)
								.map(Number)
								.sort((a, b) => a - b);
							const maxRoundNumber = Math.max(...roundNumbersList);
							const isLastRound = currentRound >= maxRoundNumber;

							return {
								...prev,
								players: updatedPlayers,
								matchesByRound: updatedMatchesByRound,
								session: {
									...prev.session,
									status: isLastRound
										? ("completed" as const)
										: prev.session.status,
									completed_at: isLastRound
										? new Date().toISOString()
										: prev.session.completed_at,
								},
							};
						});
					}
				}
			} else {
				// Update local state to mark matches as completed (for non-Round 5 or non-6-player sessions)
				setSessionData((prev) => {
					if (!prev) return prev;
					const updatedMatchesByRound = { ...prev.matchesByRound };
					const currentMatches =
						updatedMatchesByRound[currentRound] || [];
					updatedMatchesByRound[currentRound] = currentMatches.map(
						(match) => ({
							...match,
							status: "completed" as const,
							team1_score: scores[match.id].team1!,
							team2_score: scores[match.id].team2!,
						})
					);

					// Check if this was the last round
					const roundNumbersList = Object.keys(sessionData.matchesByRound)
						.map(Number)
						.sort((a, b) => a - b);
					const maxRoundNumber = Math.max(...roundNumbersList);
					const isLastRound = currentRound >= maxRoundNumber;

					return {
						...prev,
						players: updatedPlayers, // Update players with fresh Elo ratings
						matchesByRound: updatedMatchesByRound,
						session: {
							...prev.session,
							status: isLastRound
								? ("completed" as const)
								: prev.session.status,
							completed_at: isLastRound
								? new Date().toISOString()
								: prev.session.completed_at,
						},
					};
				});
			}

			// Advance to next round immediately (if not last round)
			// Use the roundNumbers memo for consistency (it's computed from sessionData)
			const roundNumbersList = Object.keys(sessionData.matchesByRound)
				.map(Number)
				.sort((a, b) => a - b);
			const currentIndex = roundNumbersList.indexOf(currentRound);
			if (currentIndex < roundNumbersList.length - 1) {
				setCurrentRound(roundNumbersList[currentIndex + 1]);
			}
		} catch (err) {
			console.error("Error submitting round:", err);
			setError(
				err instanceof Error ? err.message : "Failed to submit round"
			);
		} finally {
			setSubmitting(false);
		}
	}, [
		sessionData,
		currentRound,
		scores,
		canSubmitRound,
		submitting,
		sessionId,
		fetchPlayers,
	]);

	const handleNextClick = useCallback(async () => {
		if (submitting) return; // Prevent duplicate clicks during submission

		if (isCurrentRoundCompleted) {
			goToNextRound();
		} else if (canSubmitRound) {
			// Auto-submit the round, then advance (no confirmation modal)
			await handleSubmitRound();
		} else {
			// Can't submit - just go to next if allowed
			goToNextRound();
		}
	}, [
		isCurrentRoundCompleted,
		canSubmitRound,
		goToNextRound,
		submitting,
		handleSubmitRound,
	]);

	// Delete session handler
	const handleDeleteSession = useCallback(async () => {
		if (!sessionData || deleting || !deleteConfirmationChecked) return;

		setDeleting(true);
		try {
			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				setError(t.sessions.session.error.notAuthenticated);
				return;
			}

			const response = await fetch(`/api/sessions/${sessionId}`, {
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${session.access_token}`,
				},
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(
					errorData.error || t.sessions.session.error.deleteFailed
				);
			}

			// Redirect to sessions list after successful deletion
			router.push("/sessions");
		} catch (err) {
			console.error("Error deleting session:", err);
			setError(
				err instanceof Error ? err.message : "Failed to delete session"
			);
		} finally {
			setDeleting(false);
		}
	}, [sessionData, deleting, deleteConfirmationChecked, sessionId, router]);

	// Force close session handler
	const handleForceClose = useCallback(async () => {
		if (!sessionData || forceClosing) return;

		setForceClosing(true);
		try {
			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				setError(t.sessions.session.error.notAuthenticated);
				return;
			}

			const response = await fetch(
				`/api/sessions/${sessionId}/force-close`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${session.access_token}`,
					},
				}
			);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(
					errorData.error || t.sessions.session.error.forceCloseFailed
				);
			}

			// Update local state to mark session as completed
			setSessionData((prev) => {
				if (!prev) return prev;
				return {
					...prev,
					session: {
						...prev.session,
						status: "completed" as const,
						completed_at: new Date().toISOString(),
					},
				};
			});
		} catch (err) {
			console.error("Error force closing session:", err);
			setError(
				err instanceof Error
					? err.message
					: "Failed to force close session"
			);
		} finally {
			setForceClosing(false);
			setShowForceCloseModal(false);
		}
	}, [sessionData, forceClosing, sessionId]);

	// Handle opening video URL drawer
	const handleOpenVideoDrawer = useCallback(
		(match: Match) => {
			if (!isAdmin) return;
			setSelectedMatchForVideo(match);
			setVideoUrlInput(match.video_url || "");
		},
		[isAdmin]
	);

	// Handle closing video URL drawer
	const handleCloseVideoDrawer = useCallback(() => {
		setSelectedMatchForVideo(null);
		setVideoUrlInput("");
		setError(null);
	}, []);

	// Fetch recalc status
	const fetchRecalcStatus = useCallback(async () => {
		if (!sessionId) return;
		try {
			const {
				data: { session },
			} = await supabase.auth.getSession();
			if (!session) return;

			const { data, error } = await supabase
				.from("sessions")
				.select("recalc_status")
				.eq("id", sessionId)
				.single();

			if (!error && data) {
				setRecalcStatus(data.recalc_status);
			}
		} catch (err) {
			console.error("Error fetching recalc status:", err);
		}
	}, [sessionId]);

	// Poll recalc status when it's running
	useEffect(() => {
		if (recalcStatus === "running") {
			const interval = setInterval(fetchRecalcStatus, 1000); // Poll every second
			return () => clearInterval(interval);
		}
	}, [recalcStatus, fetchRecalcStatus]);

	// Initial fetch of recalc status
	useEffect(() => {
		fetchRecalcStatus();
	}, [fetchRecalcStatus]);

	// Handle match edit
	const handleEditMatch = useCallback(
		async (
			team1Score: number,
			team2Score: number,
			reason?: string,
			matchId?: string
		) => {
			// Use provided matchId, or fall back to selectedMatchForEdit
			const targetMatchId = matchId || selectedMatchForEdit?.id;
			if (!targetMatchId || !sessionId) {
				console.error("Missing matchId or sessionId", {
					matchId,
					targetMatchId,
					sessionId,
				});
				return;
			}

			setIsEditingMatch(true);
			const toastId = toast.loading("Recalculating session...", {
				description: "This may take a moment",
			});

			try {
				const {
					data: { session },
				} = await supabase.auth.getSession();
				if (!session) {
					toast.error("Authentication required");
					setIsEditingMatch(false);
					return;
				}

				const response = await fetch(
					`/api/sessions/${sessionId}/matches/${targetMatchId}/edit`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${session.access_token}`,
						},
						body: JSON.stringify({
							team1Score,
							team2Score,
							reason,
						}),
					}
				);

				if (!response.ok) {
					const errorData = await response.json();
					toast.error("Failed to edit match", {
						description: errorData.error || "Unknown error",
						id: toastId,
					});
					setIsEditingMatch(false);
					return;
				}

				// Poll until recalculation is done
				const maxWait = 60000; // 60 seconds max
				const startTime = Date.now();
				const pollInterval = setInterval(async () => {
					await fetchRecalcStatus();
					// Check status by fetching it directly
					const {
						data: { session: authSession },
					} = await supabase.auth.getSession();
					if (!authSession) return;

					const { data: statusData } = await supabase
						.from("sessions")
						.select("recalc_status")
						.eq("id", sessionId)
						.single();

					if (statusData?.recalc_status === "done") {
						clearInterval(pollInterval);
						toast.success("Session recalculated successfully", {
							id: toastId,
						});
						// Reload session data
						window.location.reload();
					} else if (statusData?.recalc_status === "failed") {
						clearInterval(pollInterval);
						toast.error("Recalculation failed", {
							id: toastId,
						});
					} else if (Date.now() - startTime > maxWait) {
						clearInterval(pollInterval);
						toast.error("Recalculation timed out", {
							id: toastId,
						});
					}
				}, 1000);
			} catch (err) {
				console.error("Error editing match:", err);
				toast.error("Failed to edit match", {
					description:
						err instanceof Error ? err.message : "Unknown error",
				});
			} finally {
				setIsEditingMatch(false);
			}
		},
		[selectedMatchForEdit, sessionId, fetchRecalcStatus]
	);

	// Unified save handler for match drawer
	const handleSaveMatchDrawer = useCallback(async () => {
		if (
			!selectedMatchForVideo ||
			!sessionId ||
			savingVideoUrl ||
			isEditingMatch
		)
			return;

		try {
			setSavingVideoUrl(true);
			setError(null);

			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				setError(t.sessions.session.error.notAuthenticated);
				return;
			}

			// Check what needs to be saved
			const originalMatch = sessionData?.matchesByRound[
				selectedMatchForVideo.round_number
			]?.find((m) => m.id === selectedMatchForVideo.id);

			const scoresChanged =
				originalMatch?.team1_score !==
					selectedMatchForVideo.team1_score ||
				originalMatch?.team2_score !==
					selectedMatchForVideo.team2_score;
			const videoUrlChanged =
				originalMatch?.video_url !== videoUrlInput.trim();

			const hasValidScores =
				selectedMatchForVideo.team1_score !== null &&
				selectedMatchForVideo.team2_score !== null;

			// Save match result if scores changed
			if (scoresChanged && hasValidScores) {
				await handleEditMatch(
					selectedMatchForVideo.team1_score!,
					selectedMatchForVideo.team2_score!,
					undefined,
					selectedMatchForVideo.id
				);
				// Don't close drawer yet - wait for video URL save if needed
			}

			// Save video URL if changed
			if (videoUrlChanged) {
				const response = await fetch(
					`/api/sessions/${sessionId}/matches/${selectedMatchForVideo.id}/video-url`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${session.access_token}`,
						},
						body: JSON.stringify({
							video_url: videoUrlInput.trim() || null,
						}),
					}
				);

				if (!response.ok) {
					const errorData = await response.json();
					setError(errorData.error || "Failed to save video URL");
					return;
				}

				// Optimistically update the match in sessionData
				setSessionData((prev) => {
					if (!prev) return prev;

					const updatedMatchesByRound = { ...prev.matchesByRound };
					const roundNumber = selectedMatchForVideo.round_number;
					const roundMatches =
						updatedMatchesByRound[roundNumber] || [];

					updatedMatchesByRound[roundNumber] = roundMatches.map((m) =>
						m.id === selectedMatchForVideo.id
							? { ...m, video_url: videoUrlInput.trim() || null }
							: m
					);

					return {
						...prev,
						matchesByRound: updatedMatchesByRound,
					};
				});
			}

			// Close drawer if no match result edit (video-only save)
			if (!scoresChanged) {
				handleCloseVideoDrawer();
			}
			// If scores changed, the page will reload after recalculation
		} catch (err) {
			console.error("Error saving match data:", err);
			setError("Failed to save changes");
		} finally {
			setSavingVideoUrl(false);
		}
	}, [
		selectedMatchForVideo,
		sessionId,
		videoUrlInput,
		savingVideoUrl,
		isEditingMatch,
		sessionData,
		handleEditMatch,
		handleCloseVideoDrawer,
	]);

	// Format session date for header title
	const formattedSessionDate = useMemo(() => {
		if (!sessionData) return t.sessions.session.title;
		const date = new Date(sessionData.session.created_at);
		return date.toLocaleDateString("sr-Latn-RS", {
			day: "numeric",
			month: "short",
			year: "numeric",
		});
	}, [sessionData]);

	if (loading) {
		return (
			<SidebarProvider>
				<AppSidebar variant="inset" />
				<SidebarInset>
					<SiteHeader title={t.sessions.session.loading} />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
								<Loading label={t.sessions.session.loading} />
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
					<SiteHeader title={t.sessions.session.title} />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
								<Box>
									<p className="text-destructive">
										{error ||
											t.sessions.session.loadingFailed}
									</p>
								</Box>
							</div>
						</div>
					</div>
				</SidebarInset>
			</SidebarProvider>
		);
	}

	// Branch UI based on session status
	if (sessionData.session.status === "completed") {
		const roundNumbersList = Object.keys(sessionData.matchesByRound)
			.map(Number)
			.sort((a, b) => a - b);

		// Calculate total matches
		const totalMatches = roundNumbersList.reduce(
			(sum, roundNum) =>
				sum + (sessionData.matchesByRound[roundNum]?.length || 0),
			0
		);

		return (
			<>
				<SidebarProvider>
					<AppSidebar variant="inset" />
					<SidebarInset>
						<SiteHeader
							title={formattedSessionDate}
							actionLabel={
								isAdmin && isDeletable
									? t.sessions.session.delete.button
									: undefined
							}
							actionOnClick={
								isAdmin && isDeletable
									? () => setShowDeleteModal(true)
									: undefined
							}
							actionIcon="solar:trash-bin-trash-bold"
							actionVariant={
								isAdmin && isDeletable
									? "destructive"
									: undefined
							}
						/>
						<div className="flex flex-1 flex-col">
							<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
								<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
									{/* Compact Header */}
									<Box className="mb-4">
										{/* Page-level Navigation Tabs */}
										{viewAvailability && (
											<Box className="mb-2">
												<Tabs
													value={
														activeView ===
														"doubles_player"
															? "doubles-player"
															: activeView ===
															  "doubles_team"
															? "doubles-team"
															: "singles"
													}
													onValueChange={(value) => {
														if (
															value === "singles"
														) {
															handleViewChange(
																"singles"
															);
														} else if (
															value ===
															"doubles-player"
														) {
															handleViewChange(
																"doubles_player"
															);
														} else if (
															value ===
															"doubles-team"
														) {
															handleViewChange(
																"doubles_team"
															);
														}
													}}
												>
													<TabsList>
														{viewAvailability.hasSingles && (
															<TabsTrigger value="singles">
																{
																	t.sessions
																		.session
																		.tabs
																		.singles
																}
															</TabsTrigger>
														)}
														{viewAvailability.hasDoublesPlayer && (
															<TabsTrigger value="doubles-player">
																{
																	t.sessions
																		.session
																		.tabs
																		.doublesPlayer
																}
															</TabsTrigger>
														)}
														{viewAvailability.hasDoublesTeam && (
															<TabsTrigger value="doubles-team">
																{
																	t.sessions
																		.session
																		.tabs
																		.doublesTeam
																}
															</TabsTrigger>
														)}
													</TabsList>
												</Tabs>
											</Box>
										)}
									</Box>

									{/* Performance Overview Table */}
									<Box className="mb-6">
										<Box className="flex items-center justify-between mb-3 px-1">
											<h3 className="text-base font-bold font-heading">
												{
													t.sessions.session
														.performanceOverview
												}
											</h3>
										</Box>
										<SessionSummaryTable
											sessionId={sessionId}
											activeView={activeView}
											onViewChange={handleViewChange}
											onViewAvailabilityChange={
												setViewAvailability
											}
											onPlayerClick={(playerId) => {
												setSelectedPlayerFilter(
													selectedPlayerFilter === playerId
														? null
														: playerId
												);
											}}
											selectedPlayerFilter={selectedPlayerFilter}
										/>
									</Box>

									{/* Match History */}
									<Box>
										<Box className="flex items-center justify-between mb-3 px-1">
											<h3 className="text-base font-bold font-heading">
												{
													t.sessions.session
														.matchHistory
												}
											</h3>
											{selectedPlayerFilter && (
												<Box
													onClick={() =>
														setSelectedPlayerFilter(
															null
														)
													}
													className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-xs font-semibold cursor-pointer hover:bg-primary/20 transition-colors"
												>
													<span>
														{getPlayer(
															selectedPlayerFilter
														)?.name || "Filtered"}
													</span>
													<Icon
														icon="solar:close-circle-bold"
														className="size-4"
													/>
												</Box>
											)}
										</Box>
										<Stack direction="column" spacing={2.5}>
											{roundNumbersList.flatMap(
												(roundNumber) => {
													const allRoundMatches =
														sessionData
															.matchesByRound[
															roundNumber
														] || [];

													// Filter matches based on active view and selected player
													const roundMatches =
														allRoundMatches.filter(
															(match) => {
																// Filter by match type (view)
																const matchesView =
																	activeView ===
																	"singles"
																		? match.match_type ===
																		  "singles"
																		: match.match_type ===
																		  "doubles";
																
																if (!matchesView) return false;
																
																// Filter by selected player if applicable
																if (selectedPlayerFilter) {
																	return match.player_ids.includes(
																		selectedPlayerFilter
																	);
																}
																
																return true;
															}
														);

													return roundMatches.map(
														(match) => {
															const isSingles =
																match.match_type ===
																"singles";

															// Get players for each team
															const team1PlayerIds =
																isSingles
																	? [
																			match
																				.player_ids[0],
																	  ]
																	: [
																			match
																				.player_ids[0],
																			match
																				.player_ids[1],
																	  ];
															const team2PlayerIds =
																isSingles
																	? [
																			match
																				.player_ids[1],
																	  ]
																	: [
																			match
																				.player_ids[2],
																			match
																				.player_ids[3],
																	  ];

															const team1Players =
																team1PlayerIds
																	.map((id) =>
																		getPlayer(
																			id
																		)
																	)
																	.filter(
																		Boolean
																	) as Player[];
															const team2Players =
																team2PlayerIds
																	.map((id) =>
																		getPlayer(
																			id
																		)
																	)
																	.filter(
																		Boolean
																	) as Player[];

															const eloHistory =
																matchEloHistory[
																	match.id
																];
															return (
																<MatchHistoryCard
																	key={
																		match.id
																	}
																	matchType={
																		match.match_type
																	}
																	team1Players={team1Players.map(
																		(
																			p
																		) => ({
																			id: p.id,
																			name: p.name,
																			avatar: p.avatar,
																		})
																	)}
																	team2Players={team2Players.map(
																		(
																			p
																		) => ({
																			id: p.id,
																			name: p.name,
																			avatar: p.avatar,
																		})
																	)}
																	team1Score={
																		match.team1_score ??
																		null
																	}
																	team2Score={
																		match.team2_score ??
																		null
																	}
																	team1EloChange={
																		eloHistory?.team1EloChange
																	}
																	team2EloChange={
																		eloHistory?.team2EloChange
																	}
																	onClick={() =>
																		isAdmin &&
																		handleOpenVideoDrawer(
																			match
																		)
																	}
																	hasVideo={
																		!!match.video_url
																	}
																/>
															);
														}
													);
												}
											)}
										</Stack>
									</Box>
								</div>
							</div>
						</div>
					</SidebarInset>
				</SidebarProvider>

				{/* Video URL Drawer */}
				<Drawer
					open={selectedMatchForVideo !== null}
					onOpenChange={(open) => !open && handleCloseVideoDrawer()}
				>
					<DrawerContent>
						<DrawerHeader>
							<DrawerTitle>
								{selectedMatchForVideo ? (
									<>
										{t.sessions.session.roundNumber}{" "}
										{selectedMatchForVideo.round_number} –{" "}
										{selectedMatchForVideo.match_type ===
										"singles"
											? t.sessions.singles
											: t.sessions.doubles}
									</>
								) : null}
							</DrawerTitle>
						</DrawerHeader>

						{selectedMatchForVideo ? (
							<div className="px-4 pb-4 space-y-6">
								{(() => {
									const match = selectedMatchForVideo;
									const isSingles =
										match.match_type === "singles";
									const team1PlayerIds = isSingles
										? [match.player_ids[0]]
										: [
												match.player_ids[0],
												match.player_ids[1],
										  ];
									const team2PlayerIds = isSingles
										? [match.player_ids[1]]
										: [
												match.player_ids[2],
												match.player_ids[3],
										  ];

									const team1Players = team1PlayerIds
										.map((id) => getPlayer(id))
										.filter(Boolean) as Player[];
									const team2Players = team2PlayerIds
										.map((id) => getPlayer(id))
										.filter(Boolean) as Player[];

									const team1Name = isSingles
										? team1Players[0]?.name || "Unknown"
										: `${team1Players[0]?.name || ""} & ${
												team1Players[1]?.name || ""
										  }`.trim();
									const team2Name = isSingles
										? team2Players[0]?.name || "Unknown"
										: `${team2Players[0]?.name || ""} & ${
												team2Players[1]?.name || ""
										  }`.trim();

									return (
										<>
											{/* Players / Teams (Read-only) */}
											<Box>
												<Stack
													direction="column"
													spacing={3}
												>
													<Box>
														<p className="text-sm font-semibold text-muted-foreground mb-2">
															{
																t.sessions
																	.session
																	.video
																	.players
															}
														</p>
														<Stack
															direction="row"
															alignItems="center"
															spacing={2}
														>
															<span className="font-medium">
																{team1Name}
															</span>
															<span className="text-muted-foreground">
																vs
															</span>
															<span className="font-medium">
																{team2Name}
															</span>
														</Stack>
													</Box>
												</Stack>
											</Box>

											{/* Match Scores (Editable) */}
											{match.status === "completed" && (
												<Box>
													<label className="text-sm font-semibold text-foreground mb-2 block">
														{
															t.sessions.session
																.video
																.matchResult
														}
													</label>
													<Stack
														direction="row"
														spacing={3}
														alignItems="center"
													>
														<Box className="flex-1">
															<Input
																type="number"
																value={
																	match.team1_score?.toString() ??
																	""
																}
																onChange={(
																	e
																) => {
																	// Update the match in state
																	setSelectedMatchForVideo(
																		{
																			...match,
																			team1_score:
																				e
																					.target
																					.value
																					? parseInt(
																							e
																								.target
																								.value,
																							10
																					  )
																					: null,
																		}
																	);
																}}
																placeholder="0"
																min="0"
																disabled={
																	isEditingMatch ||
																	recalcStatus ===
																		"running"
																}
																className="w-full"
															/>
															<p className="text-xs text-muted-foreground mt-1 text-center">
																{team1Name}
															</p>
														</Box>
														<Box className="px-2">
															<span className="text-sm font-semibold text-muted-foreground">
																vs
															</span>
														</Box>
														<Box className="flex-1">
															<Input
																type="number"
																value={
																	match.team2_score?.toString() ??
																	""
																}
																onChange={(
																	e
																) => {
																	// Update the match in state
																	setSelectedMatchForVideo(
																		{
																			...match,
																			team2_score:
																				e
																					.target
																					.value
																					? parseInt(
																							e
																								.target
																								.value,
																							10
																					  )
																					: null,
																		}
																	);
																}}
																placeholder="0"
																min="0"
																disabled={
																	isEditingMatch ||
																	recalcStatus ===
																		"running"
																}
																className="w-full"
															/>
															<p className="text-xs text-muted-foreground mt-1 text-center">
																{team2Name}
															</p>
														</Box>
													</Stack>
													{recalcStatus ===
														"running" && (
														<p className="text-xs text-muted-foreground mt-2">
															{
																t.sessions
																	.session
																	.video
																	.recalculationInProgress
															}
														</p>
													)}
												</Box>
											)}

											{/* Video URL Input */}
											<Box>
												<label className="text-sm font-semibold text-foreground mb-2 block">
													{
														t.sessions.session.video
															.title
													}
												</label>
												<Input
													type="url"
													value={videoUrlInput}
													onChange={(e) =>
														setVideoUrlInput(
															e.target.value
														)
													}
													placeholder={
														t.sessions.session.video
															.placeholder
													}
													disabled={savingVideoUrl}
													className="w-full"
												/>
											</Box>
										</>
									);
								})()}
							</div>
						) : null}

						<DrawerFooter>
							{selectedMatchForVideo &&
								(() => {
									// Determine what has changed
									const originalMatch =
										sessionData?.matchesByRound[
											selectedMatchForVideo.round_number
										]?.find(
											(m) =>
												m.id ===
												selectedMatchForVideo.id
										);

									const scoresChanged =
										selectedMatchForVideo.status ===
											"completed" &&
										(originalMatch?.team1_score !==
											selectedMatchForVideo.team1_score ||
											originalMatch?.team2_score !==
												selectedMatchForVideo.team2_score);
									const videoUrlChanged =
										originalMatch?.video_url !==
										videoUrlInput.trim();
									const hasChanges =
										scoresChanged || videoUrlChanged;
									const hasValidScores =
										selectedMatchForVideo.team1_score !==
											null &&
										selectedMatchForVideo.team2_score !==
											null;

									// Validate video URL if provided
									const videoUrlValid =
										videoUrlInput.trim() === "" ||
										isValidVideoUrl(videoUrlInput);

									// Determine button text
									let buttonText: string =
										t.sessions.session.video.save;
									if (isEditingMatch || savingVideoUrl) {
										buttonText = scoresChanged
											? t.sessions.session.video
													.recalculating
											: t.sessions.session.video.saving;
									} else if (
										scoresChanged &&
										videoUrlChanged
									) {
										buttonText =
											t.sessions.session.video
												.saveResultAndVideo;
									} else if (scoresChanged) {
										buttonText =
											t.sessions.session.video.saveResult;
									} else if (videoUrlChanged) {
										buttonText =
											t.sessions.session.video.saveVideo;
									}

									return (
										<Stack
											direction="row"
											spacing={3}
											className="w-full"
										>
											<Button
												variant="outline"
												onClick={handleCloseVideoDrawer}
												disabled={
													isEditingMatch ||
													savingVideoUrl
												}
												className="flex-1"
											>
												{t.common.cancel}
											</Button>
											<Button
												onClick={handleSaveMatchDrawer}
												disabled={
													!hasChanges ||
													isEditingMatch ||
													savingVideoUrl ||
													recalcStatus ===
														"running" ||
													(scoresChanged &&
														!hasValidScores) ||
													!videoUrlValid
												}
												className="flex-1"
											>
												{isEditingMatch ||
												savingVideoUrl ? (
													<>
														<Icon
															icon="lucide:loader-circle"
															className="animate-spin mr-2"
														/>
														{buttonText}
													</>
												) : (
													buttonText
												)}
											</Button>
										</Stack>
									);
								})()}
						</DrawerFooter>
					</DrawerContent>
				</Drawer>

				{/* Edit Match Drawer */}
				{selectedMatchForEdit && (
					<EditMatchDrawer
						open={isEditDrawerOpen}
						onOpenChange={setIsEditDrawerOpen}
						match={selectedMatchForEdit}
						team1Players={
							selectedMatchForEdit.match_type === "singles"
								? ([
										getPlayer(
											selectedMatchForEdit.player_ids[0]
										),
								  ].filter(Boolean) as Player[])
								: ([
										getPlayer(
											selectedMatchForEdit.player_ids[0]
										),
										getPlayer(
											selectedMatchForEdit.player_ids[1]
										),
								  ].filter(Boolean) as Player[])
						}
						team2Players={
							selectedMatchForEdit.match_type === "singles"
								? ([
										getPlayer(
											selectedMatchForEdit.player_ids[1]
										),
								  ].filter(Boolean) as Player[])
								: ([
										getPlayer(
											selectedMatchForEdit.player_ids[2]
										),
										getPlayer(
											selectedMatchForEdit.player_ids[3]
										),
								  ].filter(Boolean) as Player[])
						}
						onSave={handleEditMatch}
						isSaving={isEditingMatch}
					/>
				)}

				{/* Delete Session Confirmation Modal */}
				{showDeleteModal && (
					<Box className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
						<Box className="bg-card rounded-[24px] p-6 border border-border/50 max-w-sm w-full mx-4">
							<Stack direction="column" spacing={4}>
								<Box>
									<h2 className="text-2xl font-bold font-heading text-destructive">
										{t.sessions.session.delete.title}
									</h2>
									<p className="text-muted-foreground mt-2 text-sm">
										{t.sessions.session.delete.description}
									</p>
								</Box>
								<Box>
									<label className="flex items-start gap-3 cursor-pointer">
										<input
											type="checkbox"
											checked={deleteConfirmationChecked}
											onChange={(e) =>
												setDeleteConfirmationChecked(
													e.target.checked
												)
											}
											disabled={deleting}
											className="mt-1 size-4 rounded border-border"
										/>
										<span className="text-sm text-foreground">
											{t.sessions.session.delete.confirm}
										</span>
									</label>
								</Box>
								{error && (
									<Box>
										<p className="text-sm text-destructive">
											{error}
										</p>
									</Box>
								)}
								<Stack direction="row" spacing={3}>
									<Button
										variant="outline"
										onClick={() => {
											setShowDeleteModal(false);
											setDeleteConfirmationChecked(false);
											setError(null);
										}}
										disabled={deleting}
										className="flex-1"
									>
										{t.common.cancel}
									</Button>
									<Button
										variant="destructive"
										onClick={handleDeleteSession}
										disabled={
											deleting ||
											!deleteConfirmationChecked
										}
										className="flex-1"
									>
										{deleting
											? t.sessions.session.delete.deleting
											: t.sessions.session.delete.button}
									</Button>
								</Stack>
							</Stack>
						</Box>
					</Box>
				)}
				{/* Force Close Confirmation Modal */}
				{showForceCloseModal && (
					<Box className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
						<Box className="bg-card rounded-[24px] p-6 border border-border/50 max-w-sm w-full mx-4">
							<Stack direction="column" spacing={4}>
								<Box>
									<h2 className="text-2xl font-bold font-heading">
										{t.sessions.session.forceClose.title}
									</h2>
									<p className="text-muted-foreground mt-2 text-sm">
										{
											t.sessions.session.forceClose
												.description
										}
									</p>
								</Box>
								<Stack direction="row" spacing={3}>
									<Button
										variant="outline"
										onClick={() =>
											setShowForceCloseModal(false)
										}
										disabled={forceClosing}
										className="flex-1"
									>
										{t.common.cancel}
									</Button>
									<Button
										variant="destructive"
										onClick={handleForceClose}
										disabled={forceClosing}
										className="flex-1"
									>
										{forceClosing
											? t.sessions.session.forceClose
													.closing
											: t.sessions.session.forceClose
													.button}
									</Button>
								</Stack>
							</Stack>
						</Box>
					</Box>
				)}
			</>
		);
	}

	return (
		<>
			<SidebarProvider>
				<AppSidebar variant="inset" />
				<SidebarInset>
					<SiteHeader title={formattedSessionDate} />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
								{/* Header */}
								<Box className="flex justify-between items-end">
									<Box>
										<h1 className="text-3xl font-bold font-heading tracking-tight">
											Session
										</h1>
									</Box>
									{sessionData.session.status ===
										"active" && (
										<Stack
											direction="row"
											spacing={3}
											alignItems="center"
										>
											<Button
												variant="outline"
												size="sm"
												onClick={() =>
													setShowForceCloseModal(true)
												}
												className="text-xs"
											>
												{
													t.sessions.session
														.forceClose.button
												}
											</Button>
											<Box className="flex items-center gap-1 bg-chart-2/10 text-chart-2 px-2 py-1 rounded-lg border border-chart-2/20">
												<Box className="size-2 rounded-full bg-chart-2 animate-pulse" />
												<span className="text-[10px] font-black uppercase tracking-tight">
													{t.sessions.session.live}
												</span>
											</Box>
										</Stack>
									)}
								</Box>

								{/* Matches */}
								<Stack
									direction="column"
									spacing={4}
									className="min-h-[400px]"
								>
									{/* Show message for Round 6 if Round 5 is not completed (6-player variant) */}
									{currentRound === 6 &&
										sessionData.session.player_count === 6 &&
										(() => {
											const round5Matches =
												sessionData.matchesByRound[5] || [];
											const isRound5Completed =
												round5Matches.length > 0 &&
												round5Matches.every(
													(m) => m.status === "completed"
												);
											if (!isRound5Completed) {
												return (
													<Box className="bg-card border border-border/50 rounded-lg p-4 text-center">
														<p className="text-muted-foreground text-sm">
															Round 6 will be determined after Round 5 is
															completed. Winners from Round 5 doubles will
															play against players from Round 5 singles.
														</p>
													</Box>
												);
											}
											return null;
										})()}
									{currentRoundMatches.map((match, matchIndex) => {
										const matchScores = scores[
											match.id
										] || { team1: null, team2: null };
										const isSingles =
											match.match_type === "singles";
										const isMatchCompleted =
											match.status === "completed";
										const isReadOnly = isMatchCompleted;

										// Get players for each team
										const team1PlayerIds = isSingles
											? [match.player_ids[0]]
											: [
													match.player_ids[0],
													match.player_ids[1],
											  ];
										const team2PlayerIds = isSingles
											? [match.player_ids[1]]
											: [
													match.player_ids[2],
													match.player_ids[3],
											  ];

										const team1Players = team1PlayerIds
											.map((id) => getPlayer(id))
											.filter(Boolean) as Player[];
										const team2Players = team2PlayerIds
											.map((id) => getPlayer(id))
											.filter(Boolean) as Player[];

										// For singles: use player Elo
										// For doubles: use team Elo from double_team_ratings
										let team1Elo: number;
										let team2Elo: number;

										if (isSingles) {
											team1Elo =
												team1Players[0]?.elo || 1500;
											team2Elo =
												team2Players[0]?.elo || 1500;
										} else {
											// Doubles: get team IDs from match or lookup by player pair
											const normalizePair = (
												p1: string,
												p2: string
											) =>
												p1 < p2
													? `${p1}:${p2}`
													: `${p2}:${p1}`;

											let team1Id = match.team_1_id;
											let team2Id = match.team_2_id;

											// If team IDs not in match, try to find them from player pair mapping
											if (
												!team1Id &&
												team1PlayerIds.length >= 2
											) {
												const pairKey = normalizePair(
													team1PlayerIds[0],
													team1PlayerIds[1]
												);
												team1Id =
													playerPairToTeamId[pairKey];
											}

											if (
												!team2Id &&
												team2PlayerIds.length >= 2
											) {
												const pairKey = normalizePair(
													team2PlayerIds[0],
													team2PlayerIds[1]
												);
												team2Id =
													playerPairToTeamId[pairKey];
											}

											// Get team Elo from state (fetched earlier) or default to 1500
											team1Elo = team1Id
												? teamEloRatings[team1Id] ??
												  1500
												: 1500;
											team2Elo = team2Id
												? teamEloRatings[team2Id] ??
												  1500
												: 1500;
										}

										// Get match counts for accurate K-factor calculation
										// For singles: use player's match count
										// For doubles: use average of team players' match counts (approximation for UI preview)
										const team1MatchCount = isSingles
											? team1Players[0]?.matchCount || 0
											: Math.round(
													((team1Players[0]
														?.matchCount || 0) +
														(team1Players[1]
															?.matchCount ||
															0)) /
														2
											  );
										const team2MatchCount = isSingles
											? team2Players[0]?.matchCount || 0
											: Math.round(
													((team2Players[0]
														?.matchCount || 0) +
														(team2Players[1]
															?.matchCount ||
															0)) /
														2
											  );

										// Calculate Elo previews with accurate match counts
										const team1WinChange =
											calculateEloChange(
												team1Elo,
												team2Elo,
												"win",
												team1MatchCount
											);
										const team1DrawChange =
											calculateEloChange(
												team1Elo,
												team2Elo,
												"draw",
												team1MatchCount
											);
										const team1LoseChange =
											calculateEloChange(
												team1Elo,
												team2Elo,
												"lose",
												team1MatchCount
											);

										const team2WinChange =
											calculateEloChange(
												team2Elo,
												team1Elo,
												"win",
												team2MatchCount
											);
										const team2DrawChange =
											calculateEloChange(
												team2Elo,
												team1Elo,
												"draw",
												team2MatchCount
											);
										const team2LoseChange =
											calculateEloChange(
												team2Elo,
												team1Elo,
												"lose",
												team2MatchCount
											);

										const team1Name = isSingles
											? team1Players[0]?.name || "Unknown"
											: `${
													team1Players[0]?.name || ""
											  } & ${
													team1Players[1]?.name || ""
											  }`.trim();
										const team2Name = isSingles
											? team2Players[0]?.name || "Unknown"
											: `${
													team2Players[0]?.name || ""
											  } & ${
													team2Players[1]?.name || ""
											  }`.trim();

										// Calculate player doubles Elo values for doubles matches
										const team1Player1DoublesElo =
											!isSingles
												? team1Players[0]?.doublesElo ??
												  1500
												: 0;
										const team1Player2DoublesElo =
											!isSingles
												? team1Players[1]?.doublesElo ??
												  1500
												: 0;
										const team1PlayerAverageDoublesElo =
											!isSingles
												? (team1Player1DoublesElo +
														team1Player2DoublesElo) /
												  2
												: 0;

										const team2Player1DoublesElo =
											!isSingles
												? team2Players[0]?.doublesElo ??
												  1500
												: 0;
										const team2Player2DoublesElo =
											!isSingles
												? team2Players[1]?.doublesElo ??
												  1500
												: 0;
										const team2PlayerAverageDoublesElo =
											!isSingles
												? (team2Player1DoublesElo +
														team2Player2DoublesElo) /
												  2
												: 0;

										return (
											<Box
												key={match.id}
												className="bg-card rounded-2xl md:rounded-[20px] p-3 md:p-5 border border-border/50 shadow-sm relative"
											>
												{/* Edit button for completed matches */}
												{isMatchCompleted && (
													<Button
														variant="ghost"
														size="sm"
														onClick={() => {
															setSelectedMatchForEdit(
																match
															);
															setIsEditDrawerOpen(
																true
															);
														}}
														disabled={
															recalcStatus ===
																"running" ||
															isEditingMatch
														}
														className="absolute top-2 right-2 size-8 p-0"
													>
														<Icon
															icon="lucide:edit"
															className="size-4"
														/>
													</Button>
												)}
												<Stack
													direction="column"
													spacing={1}
													className="md:hidden"
												>
													{/* Mobile: Vertical Layout */}
													{/* Team 1 - Mobile */}
													<Stack
														direction="row"
														alignItems="center"
														justifyContent="between"
														spacing={3}
														className="w-full"
													>
														<Stack
															direction="row"
															alignItems="center"
															spacing={2}
															className="flex-1 min-w-0"
														>
															{isSingles ? (
																<Avatar className="size-12 md:size-16 border-2 border-border shadow-md shrink-0">
																	<AvatarImage
																		src={
																			team1Players[0]
																				?.avatar ||
																			undefined
																		}
																		alt={
																			team1Players[0]
																				?.name
																		}
																	/>
																	<AvatarFallback>
																		{team1Players[0]?.name
																			?.charAt(
																				0
																			)
																			.toUpperCase() ||
																			"?"}
																	</AvatarFallback>
																</Avatar>
															) : (
																<Stack
																	direction="row"
																	spacing={-2}
																	className="shrink-0"
																>
																	{team1Players.map(
																		(
																			player
																		) => (
																			<Avatar
																				key={
																					player.id
																				}
																				className="size-10 border-2 border-background shadow-sm"
																			>
																				<AvatarImage
																					src={
																						player.avatar ||
																						undefined
																					}
																					alt={
																						player.name
																					}
																				/>
																				<AvatarFallback>
																					{player.name
																						?.charAt(
																							0
																						)
																						.toUpperCase() ||
																						"?"}
																				</AvatarFallback>
																			</Avatar>
																		)
																	)}
																</Stack>
															)}
															<Box className="min-w-0 flex-1">
																<p className="text-sm font-bold leading-tight truncate">
																	{team1Name}
																</p>
																<p className="text-[10px] text-muted-foreground font-medium">
																	{isSingles
																		? `Elo ${team1Elo}`
																		: `Team ${team1Elo}`}
																</p>
																{/* Elo predictions as addon */}
																<Stack
																	direction="row"
																	alignItems="center"
																	spacing={1.5}
																	className="mt-0.5"
																>
																	<span className="text-[9px] font-bold text-chart-2">
																		{formatEloDelta(
																			team1WinChange,
																			false
																		)}
																	</span>
																	<span className="text-[9px] font-bold text-chart-3">
																		{formatEloDelta(
																			team1DrawChange,
																			false
																		)}
																	</span>
																	<span className="text-[9px] font-bold text-red-500">
																		{formatEloDelta(
																			team1LoseChange,
																			false
																		)}
																	</span>
																</Stack>
															</Box>
														</Stack>
														<Input
															ref={(el) => {
																scoreInputRefs.current[`${match.id}-team1`] = el;
															}}
															type="number"
															inputMode="numeric"
															pattern="[0-9]*"
															placeholder="0"
															value={
																matchScores.team1 ??
																""
															}
															onChange={(e) =>
																handleScoreChange(
																	match.id,
																	"team1",
																	e.target.value,
																	matchIndex
																)
															}
															disabled={
																isReadOnly
															}
															readOnly={
																isReadOnly
															}
															className="size-14 bg-input rounded-xl text-center text-xl font-black border-2 border-border/50 focus:border-primary focus:ring-2 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground/30 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
														/>
													</Stack>

													{/* VS Divider - Mobile */}
													<Box className="flex items-center justify-center py-1">
														<Box className="h-px bg-border flex-1" />
														<Box className="px-3">
															<span className="text-[10px] font-black text-muted-foreground uppercase">
																{
																	t.sessions
																		.session
																		.vs
																}
															</span>
														</Box>
														<Box className="h-px bg-border flex-1" />
													</Box>

													{/* Team 2 - Mobile */}
													<Stack
														direction="row"
														alignItems="center"
														justifyContent="between"
														spacing={3}
														className="w-full"
													>
														<Stack
															direction="row"
															alignItems="center"
															spacing={2}
															className="flex-1 min-w-0"
														>
															{isSingles ? (
																<Avatar className="size-12 md:size-16 border-2 border-border shadow-md shrink-0">
																	<AvatarImage
																		src={
																			team2Players[0]
																				?.avatar ||
																			undefined
																		}
																		alt={
																			team2Players[0]
																				?.name
																		}
																	/>
																	<AvatarFallback>
																		{team2Players[0]?.name
																			?.charAt(
																				0
																			)
																			.toUpperCase() ||
																			"?"}
																	</AvatarFallback>
																</Avatar>
															) : (
																<Stack
																	direction="row"
																	spacing={-2}
																	className="shrink-0"
																>
																	{team2Players.map(
																		(
																			player
																		) => (
																			<Avatar
																				key={
																					player.id
																				}
																				className="size-10 border-2 border-background shadow-sm"
																			>
																				<AvatarImage
																					src={
																						player.avatar ||
																						undefined
																					}
																					alt={
																						player.name
																					}
																				/>
																				<AvatarFallback>
																					{player.name
																						?.charAt(
																							0
																						)
																						.toUpperCase() ||
																						"?"}
																				</AvatarFallback>
																			</Avatar>
																		)
																	)}
																</Stack>
															)}
															<Box className="min-w-0 flex-1">
																<p className="text-sm font-bold leading-tight truncate">
																	{team2Name}
																</p>
																<p className="text-[10px] text-muted-foreground font-medium">
																	{isSingles
																		? `Elo ${team2Elo}`
																		: `Team ${team2Elo}`}
																</p>
																{/* Elo predictions as addon */}
																<Stack
																	direction="row"
																	alignItems="center"
																	spacing={1.5}
																	className="mt-0.5"
																>
																	<span className="text-[9px] font-bold text-chart-2">
																		{formatEloDelta(
																			team2WinChange,
																			false
																		)}
																	</span>
																	<span className="text-[9px] font-bold text-chart-3">
																		{formatEloDelta(
																			team2DrawChange,
																			false
																		)}
																	</span>
																	<span className="text-[9px] font-bold text-red-500">
																		{formatEloDelta(
																			team2LoseChange,
																			false
																		)}
																	</span>
																</Stack>
															</Box>
														</Stack>
														<Input
															ref={(el) => {
																scoreInputRefs.current[`${match.id}-team2`] = el;
															}}
															type="number"
															inputMode="numeric"
															pattern="[0-9]*"
															placeholder="0"
															value={
																matchScores.team2 ??
																""
															}
															onChange={(e) =>
																handleScoreChange(
																	match.id,
																	"team2",
																	e.target.value,
																	matchIndex
																)
															}
															disabled={
																isReadOnly
															}
															readOnly={
																isReadOnly
															}
															className="size-14 bg-input rounded-xl text-center text-xl font-black border-2 border-border/50 focus:border-primary focus:ring-2 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground/30 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
														/>
													</Stack>

												</Stack>

												{/* Desktop: Original Horizontal Layout */}
												<Stack
													direction="row"
													alignItems="center"
													justifyContent="between"
													spacing={4}
													className="hidden md:flex"
												>
													{/* Team 1 */}
													<Stack
														direction="column"
														alignItems="center"
														spacing={2}
														className="flex-1"
													>
														{isSingles ? (
															<Avatar className="size-16 border-2 border-border shadow-md">
																<AvatarImage
																	src={
																		team1Players[0]
																			?.avatar ||
																		undefined
																	}
																	alt={
																		team1Players[0]
																			?.name
																	}
																/>
																<AvatarFallback>
																	{team1Players[0]?.name
																		?.charAt(
																			0
																		)
																		.toUpperCase() ||
																		"?"}
																</AvatarFallback>
															</Avatar>
														) : (
															<Stack
																direction="row"
																spacing={-4}
															>
																{team1Players.map(
																	(
																		player,
																		idx
																	) => (
																		<Avatar
																			key={
																				player.id
																			}
																			className="size-14 border-2 border-background shadow-sm"
																		>
																			<AvatarImage
																				src={
																					player.avatar ||
																					undefined
																				}
																				alt={
																					player.name
																				}
																			/>
																			<AvatarFallback>
																				{player.name
																					?.charAt(
																						0
																					)
																					.toUpperCase() ||
																					"?"}
																			</AvatarFallback>
																		</Avatar>
																	)
																)}
															</Stack>
														)}
														<Box className="text-center">
															<p className="text-base font-bold leading-tight">
																{team1Name}
															</p>
															<p className="text-xs text-muted-foreground font-medium">
																{isSingles
																	? `${t.sessions.session.elo} ${team1Elo}`
																	: `${t.sessions.session.teamElo} ${team1Elo}`}
															</p>
															{!isSingles && (
																<Box className="mt-1.5 pt-1.5 border-t border-border/30 hidden md:block">
																	<p className="text-[10px] text-muted-foreground/70 font-medium mb-0.5">
																		{
																			t
																				.sessions
																				.session
																				.playerDoublesElo
																		}
																	</p>
																	<p className="text-[10px] text-muted-foreground/80 leading-tight">
																		{team1Players[0]?.name?.split(
																			" "
																		)[0] ||
																			"P1"}
																		:{" "}
																		{team1Player1DoublesElo.toFixed(
																			1
																		)}
																		<br />
																		{team1Players[1]?.name?.split(
																			" "
																		)[0] ||
																			"P2"}
																		:{" "}
																		{team1Player2DoublesElo.toFixed(
																			1
																		)}
																		<br />
																		<span className="font-semibold">
																			{
																				t
																					.sessions
																					.session
																					.avg
																			}
																			:{" "}
																			{team1PlayerAverageDoublesElo.toFixed(
																				1
																			)}
																		</span>
																	</p>
																</Box>
															)}
														</Box>
														<Stack
															direction="row"
															alignItems="center"
															justifyContent="center"
															spacing={3}
															className="text-xs font-bold mt-2"
														>
															<span className="text-chart-2">
																{formatEloDelta(
																	team1WinChange,
																	false
																)}
															</span>
															<span className="text-chart-3">
																{formatEloDelta(
																	team1DrawChange,
																	false
																)}
															</span>
															<span className="text-red-500">
																{formatEloDelta(
																	team1LoseChange,
																	false
																)}
															</span>
														</Stack>
													</Stack>

													{/* Score Inputs */}
													<Stack
														direction="row"
														alignItems="center"
														spacing={3}
														className="shrink-0"
													>
														<Input
															ref={(el) => {
																scoreInputRefs.current[`${match.id}-team1-desktop`] = el;
															}}
															type="number"
															inputMode="numeric"
															pattern="[0-9]*"
															placeholder="0"
															value={
																matchScores.team1 ??
																""
															}
															onChange={(e) =>
																handleScoreChange(
																	match.id,
																	"team1",
																	e.target.value,
																	matchIndex
																)
															}
															disabled={
																isReadOnly
															}
															readOnly={
																isReadOnly
															}
															className="size-16 bg-input rounded-xl text-center text-2xl font-black border-2 border-border/50 focus:border-primary focus:ring-2 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground/30 disabled:opacity-50 disabled:cursor-not-allowed"
														/>
														<Box className="px-1">
															<span className="text-xs font-black text-muted-foreground">
																{
																	t.sessions
																		.session
																		.vs
																}
															</span>
														</Box>
														<Input
															ref={(el) => {
																scoreInputRefs.current[`${match.id}-team2-desktop`] = el;
															}}
															type="number"
															inputMode="numeric"
															pattern="[0-9]*"
															placeholder="0"
															value={
																matchScores.team2 ??
																""
															}
															onChange={(e) =>
																handleScoreChange(
																	match.id,
																	"team2",
																	e.target.value,
																	matchIndex
																)
															}
															disabled={
																isReadOnly
															}
															readOnly={
																isReadOnly
															}
															className="size-16 bg-input rounded-xl text-center text-2xl font-black border-2 border-border/50 focus:border-primary focus:ring-2 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground/30 disabled:opacity-50 disabled:cursor-not-allowed"
														/>
													</Stack>

													{/* Team 2 */}
													<Stack
														direction="column"
														alignItems="center"
														spacing={2}
														className="flex-1"
													>
														{isSingles ? (
															<Avatar className="size-16 border-2 border-border shadow-md">
																<AvatarImage
																	src={
																		team2Players[0]
																			?.avatar ||
																		undefined
																	}
																	alt={
																		team2Players[0]
																			?.name
																	}
																/>
																<AvatarFallback>
																	{team2Players[0]?.name
																		?.charAt(
																			0
																		)
																		.toUpperCase() ||
																		"?"}
																</AvatarFallback>
															</Avatar>
														) : (
															<Stack
																direction="row"
																spacing={-4}
															>
																{team2Players.map(
																	(
																		player,
																		idx
																	) => (
																		<Avatar
																			key={
																				player.id
																			}
																			className="size-14 border-2 border-background shadow-sm"
																		>
																			<AvatarImage
																				src={
																					player.avatar ||
																					undefined
																				}
																				alt={
																					player.name
																				}
																			/>
																			<AvatarFallback>
																				{player.name
																					?.charAt(
																						0
																					)
																					.toUpperCase() ||
																					"?"}
																			</AvatarFallback>
																		</Avatar>
																	)
																)}
															</Stack>
														)}
														<Box className="text-center">
															<p className="text-base font-bold leading-tight">
																{team2Name}
															</p>
															<p className="text-xs text-muted-foreground font-medium">
																{isSingles
																	? `${t.sessions.session.elo} ${team2Elo}`
																	: `${t.sessions.session.teamElo} ${team2Elo}`}
															</p>
															{!isSingles && (
																<Box className="mt-1.5 pt-1.5 border-t border-border/30 hidden md:block">
																	<p className="text-[10px] text-muted-foreground/70 font-medium mb-0.5">
																		{
																			t
																				.sessions
																				.session
																				.playerDoublesElo
																		}
																	</p>
																	<p className="text-[10px] text-muted-foreground/80 leading-tight">
																		{team2Players[0]?.name?.split(
																			" "
																		)[0] ||
																			"P1"}
																		:{" "}
																		{team2Player1DoublesElo.toFixed(
																			1
																		)}
																		<br />
																		{team2Players[1]?.name?.split(
																			" "
																		)[0] ||
																			"P2"}
																		:{" "}
																		{team2Player2DoublesElo.toFixed(
																			1
																		)}
																		<br />
																		<span className="font-semibold">
																			{
																				t
																					.sessions
																					.session
																					.avg
																			}
																			:{" "}
																			{team2PlayerAverageDoublesElo.toFixed(
																				1
																			)}
																		</span>
																	</p>
																</Box>
															)}
														</Box>
														<Stack
															direction="row"
															alignItems="center"
															justifyContent="center"
															spacing={3}
															className="text-xs font-bold mt-2"
														>
															<span className="text-chart-2">
																{formatEloDelta(
																	team2WinChange,
																	false
																)}
															</span>
															<span className="text-chart-3">
																{formatEloDelta(
																	team2DrawChange,
																	false
																)}
															</span>
															<span className="text-red-500">
																{formatEloDelta(
																	team2LoseChange,
																	false
																)}
															</span>
														</Stack>
													</Stack>
												</Stack>
											</Box>
										);
									})}
								</Stack>

								{/* Round Indicators */}
								<Box className="pt-6 pb-4">
									<Stack
										direction="row"
										alignItems="center"
										justifyContent="center"
										spacing={2}
									>
										{roundNumbers.map((round) => {
											const isActive =
												round === currentRound;
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

								{/* Up Next Preview */}
								{(() => {
									const currentIndex = roundNumbers.indexOf(currentRound);
									const nextRound = currentIndex < roundNumbers.length - 1 
										? roundNumbers[currentIndex + 1] 
										: null;
									
									if (!nextRound) return null;
									
									const nextMatches = sessionData.matchesByRound[nextRound] || [];
									if (nextMatches.length === 0) return null;
									
									return (
										<Box className="pb-4">
											<Stack 
												direction="row" 
												alignItems="center" 
												justifyContent="center"
												spacing={3}
												className="flex-wrap"
											>
												<span className="text-xs font-semibold text-muted-foreground/70">
													{t.sessions.session.upNext}:
												</span>
												{nextMatches.map((match, idx) => {
													const isSingles = match.match_type === "singles";
													const team1PlayerIds = isSingles
														? [match.player_ids[0]]
														: [match.player_ids[0], match.player_ids[1]];
													const team2PlayerIds = isSingles
														? [match.player_ids[1]]
														: [match.player_ids[2], match.player_ids[3]];
													
													const team1Players = team1PlayerIds
														.map((id) => getPlayer(id))
														.filter(Boolean) as Player[];
													const team2Players = team2PlayerIds
														.map((id) => getPlayer(id))
														.filter(Boolean) as Player[];
													
													const team1Name = isSingles
														? team1Players[0]?.name?.split(" ")[0] || "?"
														: team1Players.map(p => p.name?.split(" ")[0] || "?").join(" & ");
													const team2Name = isSingles
														? team2Players[0]?.name?.split(" ")[0] || "?"
														: team2Players.map(p => p.name?.split(" ")[0] || "?").join(" & ");
													
													return (
														<Stack 
															key={match.id} 
															direction="row" 
															alignItems="center"
															spacing={3}
														>
															{idx > 0 && (
																<Box className="w-px h-4 bg-border/50 -ml-1.5" />
															)}
															<Stack 
																direction="row" 
																alignItems="center"
																spacing={1.5}
															>
																<span className="text-xs text-muted-foreground">
																	{team1Name}
																</span>
																<span className="text-[10px] font-bold text-muted-foreground/60">
																	vs
																</span>
																<span className="text-xs text-muted-foreground">
																	{team2Name}
																</span>
															</Stack>
														</Stack>
													);
												})}
											</Stack>
										</Box>
									);
								})()}

								{/* Navigation Buttons */}
								<Box className="pt-2 pb-8">
									<Stack direction="row" spacing={3}>
										<Button
											variant="outline"
											onClick={goToPreviousRound}
											disabled={
												currentRound === roundNumbers[0]
											}
											className="flex-1 py-4 px-6 rounded-full font-bold text-base h-auto"
										>
											<Stack
												direction="row"
												alignItems="center"
												justifyContent="center"
												spacing={2}
											>
												<Icon
													icon="solar:arrow-left-linear"
													className="size-5"
												/>
												<span>
													{
														t.sessions.session
															.previous
													}
												</span>
											</Stack>
										</Button>
										<Button
											variant="outline"
											onClick={handleNextClick}
											disabled={
												submitting ||
												(currentRound ===
													roundNumbers[
														roundNumbers.length - 1
													] &&
													!canSubmitRound &&
													!isCurrentRoundCompleted)
											}
											className="flex-1 py-4 px-6 rounded-full font-bold text-base h-auto"
										>
											<Stack
												direction="row"
												alignItems="center"
												justifyContent="center"
												spacing={2}
											>
												{submitting ? (
													<>
														<Icon
															icon="lucide:loader-circle"
															className="size-5 animate-spin"
														/>
														<span>
															{
																t.sessions
																	.session
																	.submitting
															}
														</span>
													</>
												) : (
													<>
														<span>
															{
																t.sessions
																	.session
																	.next
															}
														</span>
														<Icon
															icon="solar:arrow-right-linear"
															className="size-5"
														/>
													</>
												)}
											</Stack>
										</Button>
									</Stack>
								</Box>
							</div>
						</div>
					</div>
				</SidebarInset>
			</SidebarProvider>

			{/* Edit Match Drawer */}
			{selectedMatchForEdit && (
				<EditMatchDrawer
					open={isEditDrawerOpen}
					onOpenChange={setIsEditDrawerOpen}
					match={selectedMatchForEdit}
					team1Players={
						selectedMatchForEdit.match_type === "singles"
							? ([
									getPlayer(
										selectedMatchForEdit.player_ids[0]
									),
							  ].filter(Boolean) as Player[])
							: ([
									getPlayer(
										selectedMatchForEdit.player_ids[0]
									),
									getPlayer(
										selectedMatchForEdit.player_ids[1]
									),
							  ].filter(Boolean) as Player[])
					}
					team2Players={
						selectedMatchForEdit.match_type === "singles"
							? ([
									getPlayer(
										selectedMatchForEdit.player_ids[1]
									),
							  ].filter(Boolean) as Player[])
							: ([
									getPlayer(
										selectedMatchForEdit.player_ids[2]
									),
									getPlayer(
										selectedMatchForEdit.player_ids[3]
									),
							  ].filter(Boolean) as Player[])
					}
					onSave={handleEditMatch}
					isSaving={isEditingMatch}
				/>
			)}
		</>
	);
}

export default function SessionPage() {
	return (
		<AuthGuard>
			<SessionPageContent />
		</AuthGuard>
	);
}
