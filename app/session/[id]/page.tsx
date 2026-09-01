"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Box } from "@/components/ui/box";
import { StateBlock } from "@/components/ui/state-block";
import { PageLoading } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SurfaceCard } from "@/components/ui/surface-card";
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
import { useAuth } from "@/lib/auth/useAuth";
import { getUserRole } from "@/lib/auth/getUserRole";
import { isValidVideoUrl } from "@/lib/video";
import { cn } from "@/lib/utils";
import { EditMatchDrawer } from "./_components/edit-match-drawer";
import { SessionSummaryTable } from "./_components/session-summary-table";
import {
	SessionCompletedMatchResults,
	SessionDetailHero,
	SessionPerformanceTabs,
	SessionPlayerMatchResults,
	SessionResultsTimeline,
	SessionScoreboardMatch,
	type SessionDetailPlayer,
	type SessionResultRound,
	type SessionScoreboardMatchData,
} from "@/components/sessions/session-detail";
import {
	ActiveSessionBrowseNotice,
	ActiveSessionMatchEditor,
	ActiveSessionNextRound,
	ActiveSessionRestingLine,
	ActiveSessionRoundCanvas,
	ActiveSessionRoundHeader,
	ActiveSessionSubmitBar,
	type ActiveSessionPreviewMatch,
	type ActiveSessionSide,
} from "@/components/sessions/active-session";
import {
	clearSessionSummaryCache,
	prefetchSessionSummary,
	type SummaryView,
} from "./_lib/session-summary-client";
import { toast } from "sonner";
import { getOrCreateDoubleTeam } from "@/lib/elo/double-teams";
import {
	normalizePlayerID,
	normalizePlayerIDs,
} from "@/lib/sessions/player-id";
import { detectTwoHalfSinglesSession } from "@/lib/sessions/two-half-singles";
import { t } from "@/lib/i18n";
import {
	clearSessionDeletionCaches,
	clearSessionsPageCaches,
} from "@/lib/utils/clear-cache";
import {
	CalculationTerminal,
	TerminalLine,
	TerminalModal,
} from "@/components/ui/calculation-terminal";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function createTokenClient(accessToken: string) {
	return createClient(supabaseUrl, supabaseAnonKey, {
		global: {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		},
		auth: {
			autoRefreshToken: false,
			persistSession: false,
			detectSessionInUrl: false,
		},
	});
}

type Player = {
	id: string;
	sessionPlayerId: string;
	team: string | null;
	name: string;
	avatar: string | null;
	elo: number;
	doublesElo?: number; // Player doubles Elo (partner-independent skill)
	matchCount?: number; // For accurate K-factor calculation
	isPlaceholder?: boolean;
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
	is_rated: boolean;
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

type PairedFirstHalfScore = {
	roundNumber: number;
	team1Score: number;
	team2Score: number;
};

const pageTransition = {
	duration: 0.2,
	ease: [0.25, 0.46, 0.45, 0.94] as const,
};

function SessionPageContent() {
	const params = useParams();
	const router = useRouter();
	const searchParams = useSearchParams();
	const sessionId = params.id as string;
	const { session } = useAuth();
	const accessToken = session?.access_token;
	const shouldReduceMotion = useReducedMotion();

	// Page-level view filter: 'singles' | 'doubles_player' | 'doubles_team'
	// This controls both the table and the match list
	// URL uses hyphens: ?view=singles|doubles-player|doubles-team
	const urlView = searchParams.get("view");
	let activeView: SummaryView = "singles";
	if (urlView === "doubles-player") {
		activeView = "doubles_player";
	} else if (urlView === "doubles-team") {
		activeView = "doubles_team";
	}
	const summaryPrefetchViewsRef = useRef<SummaryView[]>(
		Array.from(new Set<SummaryView>(["singles", activeView])),
	);
	summaryPrefetchViewsRef.current = Array.from(
		new Set<SummaryView>(["singles", activeView]),
	);

	const handleViewChange = useCallback(
		(view: SummaryView) => {
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
		[searchParams, router],
	);

	const [sessionData, setSessionData] = useState<SessionData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [sessionNotFound, setSessionNotFound] = useState(false);
	const [currentRound, setCurrentRound] = useState(1);
	const [roundDirection, setRoundDirection] = useState<-1 | 0 | 1>(0);
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
	const [matchEloHistory, setMatchEloHistory] = useState<
		Record<
			string,
			{
				player1EloChange?: number;
				player2EloChange?: number;
				team1EloChange?: number;
				team2EloChange?: number;
			}
		>
	>({});
	const [selectedPlayerFilter, setSelectedPlayerFilter] = useState<
		string | null
	>(null);
	const [selectedPlayerSummary, setSelectedPlayerSummary] = useState<
		string | null
	>(null);
	const [sessionReloadKey, setSessionReloadKey] = useState(0);

	const viewAvailability = useMemo(() => {
		if (!sessionData) return null;

		let hasSingles = false;
		let hasDoubles = false;
		for (const roundMatches of Object.values(sessionData.matchesByRound)) {
			for (const match of roundMatches) {
				if (match.match_type === "singles") {
					hasSingles = true;
				} else if (match.match_type === "doubles") {
					hasDoubles = true;
				}
				if (hasSingles && hasDoubles) break;
			}
			if (hasSingles && hasDoubles) break;
		}

		return {
			hasSingles,
			hasDoublesPlayer: hasDoubles,
			hasDoublesTeam: hasDoubles,
		};
	}, [sessionData]);
	const showViewTabs = Boolean(
		viewAvailability &&
			[
				viewAvailability.hasSingles,
				viewAvailability.hasDoublesPlayer,
				viewAvailability.hasDoublesTeam,
			].filter(Boolean).length > 1,
	);
	const completedMatchCount = useMemo(
		() =>
			Object.values(sessionData?.matchesByRound ?? {})
				.flat()
				.filter((match) => match.status === "completed").length,
		[sessionData],
	);

	// Terminal state for ELO calculation visualization
	const [showCalculationTerminal, setShowCalculationTerminal] =
		useState(false);
	const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
	const [isTerminalComplete, setIsTerminalComplete] = useState(false);
	const apiCallCompleteRef = useRef(false);

	useEffect(() => {
		setSelectedPlayerFilter(null);
		setSelectedPlayerSummary(null);
		return () => {
			clearSessionSummaryCache(sessionId);
		};
	}, [sessionId]);

	// Generate terminal lines for ELO calculation visualization
	const generateTerminalLines = useCallback(
		(
			matches: Match[],
			roundNumber: number,
			matchScores: Record<
				string,
				{ team1: number | null; team2: number | null }
			>,
		): TerminalLine[] => {
			const lines: TerminalLine[] = [];
			const players = sessionData?.players || [];
			const allSessionMatches = sessionData
				? Object.values(sessionData.matchesByRound).flat()
				: [];
			const twoHalfSinglesConfig = sessionData
				? detectTwoHalfSinglesSession(
						sessionData.session.player_count,
						allSessionMatches,
					)
				: null;
			const isDeferredTwoHalfRound =
				Boolean(twoHalfSinglesConfig) &&
				roundNumber <= twoHalfSinglesConfig!.halfRoundCount;
			const isPairedSecondHalfRound =
				Boolean(twoHalfSinglesConfig) &&
				roundNumber > twoHalfSinglesConfig!.halfRoundCount;

			// Get player by ID
			const getPlayer = (playerId: string): Player | undefined => {
				return players.find((p) => p.id === playerId);
			};

			// Get player name by ID
			const getPlayerName = (playerId: string): string => {
				return getPlayer(playerId)?.name || "Unknown";
			};

			// Determine match outcome for a team
			const getOutcome = (
				team1Score: number,
				team2Score: number,
				isTeam1: boolean,
			): "win" | "lose" | "draw" => {
				if (team1Score === team2Score) return "draw";
				if (isTeam1) return team1Score > team2Score ? "win" : "lose";
				return team2Score > team1Score ? "win" : "lose";
			};

			// Intro
			lines.push({
				text: isDeferredTwoHalfRound
					? t.terminal.initializingScorekeeper
					: t.terminal.initializing,
				type: "dim",
				delay: 0,
			});
			lines.push({
				text: t.terminal.loadingPlayers,
				type: "dim",
				delay: 120,
			});
			lines.push({
				text: t.terminal.processingRound(roundNumber, matches.length),
				type: "highlight",
				delay: 150,
			});

			// Process each match
			matches.forEach((match, index) => {
				const isSingles = match.match_type === "singles";
				const matchDelay = 180 + index * 250;
				const matchScore = matchScores[match.id];
				let team1Score = matchScore?.team1 ?? 0;
				let team2Score = matchScore?.team2 ?? 0;
				const pairedFirstHalfRound =
					roundNumber -
					(twoHalfSinglesConfig?.halfRoundCount ?? 0);
				const firstHalfMatch = isPairedSecondHalfRound
					? sessionData?.matchesByRound[pairedFirstHalfRound]?.find(
						(firstHalfCandidate) =>
							firstHalfCandidate.match_order === match.match_order,
					)
					: undefined;
				const hasCombinedScore =
					Boolean(firstHalfMatch) &&
					firstHalfMatch?.match_type === "singles" &&
					match.match_type === "singles" &&
					typeof firstHalfMatch.team1_score === "number" &&
					!isNaN(firstHalfMatch.team1_score) &&
					typeof firstHalfMatch.team2_score === "number" &&
					!isNaN(firstHalfMatch.team2_score);
				let combinedWithFirstHalf = false;

				if (hasCombinedScore && firstHalfMatch) {
					if (
						firstHalfMatch.player_ids[0] === match.player_ids[0] &&
						firstHalfMatch.player_ids[1] === match.player_ids[1]
					) {
						team1Score += firstHalfMatch.team1_score ?? 0;
						team2Score += firstHalfMatch.team2_score ?? 0;
						combinedWithFirstHalf = true;
					} else if (
						firstHalfMatch.player_ids[0] === match.player_ids[1] &&
						firstHalfMatch.player_ids[1] === match.player_ids[0]
					) {
						team1Score += firstHalfMatch.team2_score ?? 0;
						team2Score += firstHalfMatch.team1_score ?? 0;
						combinedWithFirstHalf = true;
					}
				}

				if (isSingles) {
					const player1 = getPlayer(match.player_ids[0]);
					const player2 = getPlayer(match.player_ids[1]);
					const player1Name = player1?.name || "Unknown";
					const player2Name = player2?.name || "Unknown";
					const player1Elo = player1?.elo ?? 1500;
					const player2Elo = player2?.elo ?? 1500;
					const player1MatchCount = player1?.matchCount ?? 0;
					const player2MatchCount = player2?.matchCount ?? 0;

					const player1Outcome = getOutcome(
						team1Score,
						team2Score,
						true,
					);
					const player2Outcome = getOutcome(
						team1Score,
						team2Score,
						false,
					);
					const player1Delta = calculateEloChange(
						player1Elo,
						player2Elo,
						player1Outcome,
						player1MatchCount,
					);
					const player2Delta = calculateEloChange(
						player2Elo,
						player1Elo,
						player2Outcome,
						player2MatchCount,
					);

					lines.push({
						text: t.terminal.matchHeader(
							index + 1,
							player1Name,
							player2Name,
							team1Score,
							team2Score,
						),
						type: "info",
						delay: matchDelay,
					});
					if (!match.is_rated) {
						lines.push({
							text: "Rezultat je sačuvan bez ELO-a",
							type: "dim",
							delay: 60,
						});
						lines.push({
							text: t.terminal.matchDone(index + 1),
							type: "success",
							delay: 60,
						});
						return;
					}
					if (isDeferredTwoHalfRound) {
						lines.push({
							text: t.terminal.recordingScore,
							type: "dim",
							delay: 60,
						});
						lines.push({
							text: t.terminal.matchDone(index + 1),
							type: "success",
							delay: 60,
						});
						return;
					}
					if (combinedWithFirstHalf) {
						lines.push({
							text: t.terminal.combiningScore(pairedFirstHalfRound),
							type: "dim",
							delay: 60,
						});
					}
					lines.push({
						text: t.terminal.calculating,
						type: "dim",
						delay: 60,
					});
					lines.push({
						text: t.terminal.eloChange(player1Name, player1Delta),
						type: player1Delta >= 0 ? "success" : "error",
						delay: 50,
					});
					lines.push({
						text: t.terminal.eloChange(player2Name, player2Delta),
						type: player2Delta >= 0 ? "success" : "error",
						delay: 50,
					});
					lines.push({
						text: t.terminal.matchDone(index + 1),
						type: "success",
						delay: 60,
					});
				} else {
					// Doubles
					const team1Player1 = getPlayer(match.player_ids[0]);
					const team1Player2 = getPlayer(match.player_ids[1]);
					const team2Player1 = getPlayer(match.player_ids[2]);
					const team2Player2 = getPlayer(match.player_ids[3]);

					const team1Player1Name = team1Player1?.name || "Unknown";
					const team1Player2Name = team1Player2?.name || "Unknown";
					const team2Player1Name = team2Player1?.name || "Unknown";
					const team2Player2Name = team2Player2?.name || "Unknown";

					const team1Player1Elo = team1Player1?.doublesElo ?? 1500;
					const team1Player2Elo = team1Player2?.doublesElo ?? 1500;
					const team2Player1Elo = team2Player1?.doublesElo ?? 1500;
					const team2Player2Elo = team2Player2?.doublesElo ?? 1500;

					const team1AvgElo = (team1Player1Elo + team1Player2Elo) / 2;
					const team2AvgElo = (team2Player1Elo + team2Player2Elo) / 2;

					const team1Outcome = getOutcome(
						team1Score,
						team2Score,
						true,
					);
					const team2Outcome = getOutcome(
						team1Score,
						team2Score,
						false,
					);
					const team1Delta = calculateEloChange(
						team1AvgElo,
						team2AvgElo,
						team1Outcome,
					);
					const team2Delta = calculateEloChange(
						team2AvgElo,
						team1AvgElo,
						team2Outcome,
					);

					lines.push({
						text: t.terminal.doublesMatchHeader(
							index + 1,
							`${team1Player1Name} & ${team1Player2Name}`,
							`${team2Player1Name} & ${team2Player2Name}`,
							team1Score,
							team2Score,
						),
						type: "info",
						delay: matchDelay,
					});
					if (!match.is_rated) {
						lines.push({
							text: "Rezultat je sačuvan bez ELO-a",
							type: "dim",
							delay: 60,
						});
						lines.push({
							text: t.terminal.matchDone(index + 1),
							type: "success",
							delay: 60,
						});
						return;
					}
					if (isDeferredTwoHalfRound) {
						lines.push({
							text: t.terminal.recordingScore,
							type: "dim",
							delay: 60,
						});
						lines.push({
							text: t.terminal.matchDone(index + 1),
							type: "success",
							delay: 60,
						});
						return;
					}
					if (combinedWithFirstHalf) {
						lines.push({
							text: t.terminal.combiningScore(pairedFirstHalfRound),
							type: "dim",
							delay: 60,
						});
					}
					lines.push({
						text: t.terminal.calculating,
						type: "dim",
						delay: 60,
					});
					lines.push({
						text: t.terminal.eloChange(
							`${team1Player1Name}, ${team1Player2Name}`,
							team1Delta,
						),
						type: team1Delta >= 0 ? "success" : "error",
						delay: 50,
					});
					lines.push({
						text: t.terminal.eloChange(
							`${team2Player1Name}, ${team2Player2Name}`,
							team2Delta,
						),
						type: team2Delta >= 0 ? "success" : "error",
						delay: 50,
					});
					lines.push({
						text: t.terminal.matchDone(index + 1),
						type: "success",
						delay: 60,
					});
				}
			});

			// Final messages
			lines.push({
				text: t.terminal.saving,
				type: "dim",
				delay: 180,
			});
			lines.push({
				text: isDeferredTwoHalfRound
					? t.terminal.deferredDone(roundNumber)
					: t.terminal.done(roundNumber),
				type: "success",
				delay: 120,
			});

			return lines;
		},
		[sessionData],
	);

	// Refs for score inputs to enable auto-focus
	const scoreInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

	// Reusable function to fetch players with updated Elo ratings
	const fetchPlayers = useCallback(
		async (accessToken: string): Promise<Player[]> => {
			if (!accessToken) {
				throw new Error("Not authenticated");
			}

			const playersResponse = await fetch(
				`/api/sessions/${sessionId}/players`,
				{
					headers: {
						Authorization: `Bearer ${accessToken}`,
					},
				},
			);

			if (!playersResponse.ok) {
				const errorData = await playersResponse
					.json()
					.catch(() => ({}));
				console.error("Error fetching players:", errorData);
				throw new Error(
					`Failed to load players: ${
						errorData.error || playersResponse.statusText
					}`,
				);
			}

			const playersData = await playersResponse.json();
			return (playersData.players as Player[]).map((player) => ({
				...player,
				id: normalizePlayerID(player.id),
			}));
		},
		[sessionId],
	);

	// Load session data
	useEffect(() => {
		const fetchSession = async () => {
			try {
				setLoading(true);
				setError(null);
				setSessionNotFound(false);

				if (!accessToken) {
					setError(t.sessions.session.error.notAuthenticated);
					return;
				}

				const supabaseClient = createTokenClient(accessToken);

				// Bootstrap page data immediately, then overlap summary prefetch
				// with the remaining session requests for completed sessions.
				const sessionPromise = supabaseClient
					.from("sessions")
					.select("id, player_count, created_at, status, completed_at")
					.eq("id", sessionId)
					.maybeSingle();
				const playersPromise = fetchPlayers(accessToken);
				const matchesPromise = supabaseClient
					.from("session_matches")
					.select(
						"id, round_number, match_type, match_order, player_ids, status, team1_score, team2_score, video_url, team_1_id, team_2_id, is_rated",
					)
					.eq("session_id", sessionId)
					.order("round_number", { ascending: true })
					.order("match_order", { ascending: true });

				const sessionResult = await sessionPromise;

				if (sessionResult.error) {
					void playersPromise.catch(() => undefined);
					console.error("Error fetching session:", sessionResult.error);
					setError(t.sessions.session.loadingFailed);
					return;
				}

				if (!sessionResult.data) {
					void playersPromise.catch(() => undefined);
					// A stale list cache can outlive a session deleted on another client.
					// Drop it so returning to the list cannot show the ghost row again.
					clearSessionsPageCaches();
					setSessionNotFound(true);
					setError(t.sessions.session.error.notFound);
					return;
				}

				if (
					sessionResult.data?.status === "completed"
				) {
					for (const view of summaryPrefetchViewsRef.current) {
						const prefetchPromise = prefetchSessionSummary(
							sessionId,
							view,
							accessToken,
						);
						void prefetchPromise.catch((summaryError) => {
							console.error(
								`Error prefetching ${view} summary:`,
								summaryError,
							);
						});
					}
				}

				const [playersResult, matchesResult] = await Promise.all([
					playersPromise,
					matchesPromise,
				]);

				const players = playersResult;

				if (matchesResult.error) {
					console.error("Error fetching matches:", matchesResult.error);
					setError(
						`Failed to load matches: ${
							matchesResult.error.message ||
							JSON.stringify(matchesResult.error)
						}`,
					);
					setLoading(false);
					return;
				}

				const sessionRecord = sessionResult.data;
				const matches = ((matchesResult.data || []) as Match[]).map(
					(match) => ({
						...match,
						player_ids: normalizePlayerIDs(match.player_ids),
					}),
				);

				// Group matches by round_number
				const matchesByRound = (matches || []).reduce(
					(acc, match) => {
						const roundNumber = match.round_number;
						if (!acc[roundNumber]) {
							acc[roundNumber] = [];
						}
						acc[roundNumber].push(match);
						return acc;
					},
					{} as Record<number, Match[]>,
				);

				setSessionData({
					session: sessionRecord,
					players,
					matchesByRound,
				});

				// Fetch team Elo ratings for doubles matches
				// This is async, so we'll do it separately
				const fetchTeamEloRatings = async () => {
					const teamIds = new Set<string>();

					const pairToTeamIdMap: Record<string, string> = {};
					const missingPairs = new Map<string, [string, string]>();

					const normalizePair = (p1: string, p2: string) =>
						p1 < p2 ? `${p1}:${p2}` : `${p2}:${p1}`;

					for (const match of matches) {
						if (
							match.is_rated &&
							match.match_type === "doubles" &&
							match.player_ids.length >= 4
						) {
							const pair1Key = normalizePair(
								match.player_ids[0],
								match.player_ids[1],
							);
							const pair2Key = normalizePair(
								match.player_ids[2],
								match.player_ids[3],
							);

							let team1Id = match.team_1_id;
							let team2Id = match.team_2_id;

							if (team1Id) {
								pairToTeamIdMap[pair1Key] = team1Id;
								teamIds.add(team1Id);
							} else if (!pairToTeamIdMap[pair1Key]) {
								missingPairs.set(pair1Key, [
									match.player_ids[0],
									match.player_ids[1],
								]);
							}

							if (team2Id) {
								pairToTeamIdMap[pair2Key] = team2Id;
								teamIds.add(team2Id);
							} else if (!pairToTeamIdMap[pair2Key]) {
								missingPairs.set(pair2Key, [
									match.player_ids[2],
									match.player_ids[3],
								]);
							}
						}
					}

					if (missingPairs.size > 0) {
						const resolvedPairs = await Promise.all(
							Array.from(missingPairs.entries()).map(
								async ([pairKey, [player1Id, player2Id]]) => {
									try {
										const teamId =
											await getOrCreateDoubleTeam(
												player1Id,
												player2Id,
											);
										return [pairKey, teamId] as const;
									} catch (error) {
										console.error(
											`Error getting team ID for pair ${pairKey}:`,
											error,
										);
										return [pairKey, null] as const;
									}
								},
							),
						);

						for (const [pairKey, teamId] of resolvedPairs) {
							if (!teamId) continue;
							pairToTeamIdMap[pairKey] = teamId;
							teamIds.add(teamId);
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
					const completedMatchIds = matches
						.filter((m) => m.status === "completed")
						.map((m) => m.id);

					if (completedMatchIds.length === 0) {
						return;
					}

					const { data: eloHistory, error: eloHistoryError } =
						await supabaseClient
							.from("match_elo_history")
							.select(
								"match_id, player1_elo_delta, player2_elo_delta, team1_elo_delta, team2_elo_delta",
							)
							.in("match_id", completedMatchIds);

					if (eloHistoryError) {
						console.error(
							"Error fetching match Elo history:",
							eloHistoryError,
						);
						return;
					}

					const eloHistoryMap: Record<
						string,
						{
							player1EloChange?: number;
							player2EloChange?: number;
							team1EloChange?: number;
							team2EloChange?: number;
						}
					> = {};

					const parseDelta = (value: unknown) => {
						if (value === null || value === undefined) {
							return undefined;
						}

						return typeof value === "string"
							? parseFloat(value)
							: Number(value);
					};

					if (eloHistory) {
						for (const history of eloHistory) {
							eloHistoryMap[history.match_id] = {
								player1EloChange: parseDelta(
									history.player1_elo_delta,
								),
								player2EloChange: parseDelta(
									history.player2_elo_delta,
								),
								team1EloChange: parseDelta(
									history.team1_elo_delta,
								),
								team2EloChange: parseDelta(
									history.team2_elo_delta,
								),
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
								(m: Match) => m.status !== "completed",
							);
						},
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
	}, [accessToken, sessionId, fetchPlayers, sessionReloadKey]);

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
						},
					);

					if (response.ok) {
						const data = await response.json();
						setIsDeletable(data.deletable || false);
					}
				} catch (error) {
					console.error(
						"Error checking if session is deletable:",
						error,
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
	const activeRoundNumber = useMemo(() => {
		if (!sessionData || roundNumbers.length === 0) return currentRound;
		return (
			roundNumbers.find((roundNumber) =>
				(sessionData.matchesByRound[roundNumber] ?? []).some(
					(match) => match.status !== "completed",
				),
			) ?? roundNumbers[roundNumbers.length - 1]
		);
	}, [sessionData, roundNumbers, currentRound]);
	const twoHalfSinglesConfig = useMemo(
		() =>
			sessionData
				? detectTwoHalfSinglesSession(
						sessionData.session.player_count,
						Object.values(sessionData.matchesByRound).flat(),
					)
				: null,
		[sessionData],
	);
	const isTwoHalfSinglesSession =
		sessionData?.session.status === "active" &&
		Boolean(twoHalfSinglesConfig);
	const usesCompletedFlatMatchList =
		sessionData?.session.status === "completed" &&
		Boolean(twoHalfSinglesConfig);
	const isTwoHalfScoreOnlyEdit = useCallback(
		(match: Match | null | undefined): boolean => {
			if (!sessionData || !match || !isTwoHalfSinglesSession) {
				return false;
			}

			if (
				match.round_number <=
				(twoHalfSinglesConfig?.halfRoundCount ?? 0)
			) {
				const settlementMatch = sessionData.matchesByRound[
					match.round_number + twoHalfSinglesConfig!.halfRoundCount
				]?.find(
					(candidate) =>
						candidate.match_order === match.match_order,
				);

				return settlementMatch?.status !== "completed";
			}

			return match.status !== "completed";
		},
		[sessionData, isTwoHalfSinglesSession, twoHalfSinglesConfig],
	);
	const isSettledFirstHalfMatch = useCallback(
		(match: Match): boolean => {
			if (
				!sessionData ||
				!twoHalfSinglesConfig ||
				match.round_number > twoHalfSinglesConfig.halfRoundCount
			) {
				return false;
			}

			const settlementMatch = sessionData.matchesByRound[
				match.round_number + twoHalfSinglesConfig.halfRoundCount
			]?.find(
				(candidate) =>
					candidate.match_order === match.match_order &&
					candidate.status === "completed",
			);

			return Boolean(settlementMatch);
		},
		[sessionData, twoHalfSinglesConfig],
	);

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
		[sessionData],
	);

	// Helper function to validate if a score is valid (not null, undefined, or NaN)
	const isValidScore = useCallback(
		(score: number | null | undefined): boolean => {
			return score !== null && score !== undefined && !isNaN(score);
		},
		[],
	);
	const getPairedFirstHalfScore = useCallback(
		(match: Match): PairedFirstHalfScore | null => {
			if (
				!sessionData ||
				!twoHalfSinglesConfig ||
				match.round_number <= twoHalfSinglesConfig.halfRoundCount ||
				match.match_type !== "singles"
			) {
				return null;
			}

			const firstHalfRoundNumber =
				match.round_number - twoHalfSinglesConfig.halfRoundCount;
			const firstHalfMatch = sessionData.matchesByRound[
				firstHalfRoundNumber
			]?.find(
				(candidate) =>
					candidate.match_order === match.match_order &&
					candidate.match_type === "singles",
			);

			if (
				!firstHalfMatch ||
				!isValidScore(firstHalfMatch.team1_score) ||
				!isValidScore(firstHalfMatch.team2_score)
			) {
				return null;
			}

			if (
				firstHalfMatch.player_ids[0] === match.player_ids[0] &&
				firstHalfMatch.player_ids[1] === match.player_ids[1]
			) {
				return {
					roundNumber: firstHalfRoundNumber,
					team1Score: firstHalfMatch.team1_score!,
					team2Score: firstHalfMatch.team2_score!,
				};
			}

			if (
				firstHalfMatch.player_ids[0] === match.player_ids[1] &&
				firstHalfMatch.player_ids[1] === match.player_ids[0]
			) {
				return {
					roundNumber: firstHalfRoundNumber,
					team1Score: firstHalfMatch.team2_score!,
					team2Score: firstHalfMatch.team1_score!,
				};
			}

			return null;
		},
		[sessionData, twoHalfSinglesConfig, isValidScore],
	);
	const renderPairedScoreReminder = useCallback(
		(
			pairedScore: PairedFirstHalfScore | null,
			currentTeam1Score?: number | null,
			currentTeam2Score?: number | null,
		) => {
			if (!pairedScore) {
				return null;
			}

			const showTotal =
				isValidScore(currentTeam1Score) && isValidScore(currentTeam2Score);
			const totalTeam1Score =
				pairedScore.team1Score + (currentTeam1Score ?? 0);
			const totalTeam2Score =
				pairedScore.team2Score + (currentTeam2Score ?? 0);

			return (
				<Box className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary shadow-sm">
					<span>
						{t.sessions.session.pairedFirstHalfScore(
							pairedScore.roundNumber,
							pairedScore.team1Score,
							pairedScore.team2Score,
						)}
					</span>
					{showTotal && (
						<>
							<span className="h-3 w-px bg-primary/25" />
							<span>
								{t.sessions.session.pairedTotalScore(
									totalTeam1Score,
									totalTeam2Score,
								)}
							</span>
						</>
					)}
				</Box>
			);
		},
		[isValidScore],
	);
	const getPairedDisplayScore = useCallback(
		(
			match: Match,
			pairedScore: PairedFirstHalfScore | null,
		): { team1Score: number | null; team2Score: number | null } => {
			const team1Score = match.team1_score;
			const team2Score = match.team2_score;

			if (
				!pairedScore ||
				typeof team1Score !== "number" ||
				isNaN(team1Score) ||
				typeof team2Score !== "number" ||
				isNaN(team2Score)
			) {
				return {
					team1Score: team1Score ?? null,
					team2Score: team2Score ?? null,
				};
			}

			return {
				team1Score: pairedScore.team1Score + team1Score,
				team2Score: pairedScore.team2Score + team2Score,
			};
		},
		[],
	);

	// Handle score change with auto-focus to next input
	const handleScoreChange = useCallback(
		(
			matchId: string,
			side: "team1" | "team2",
			value: string,
			matchIndex?: number,
		) => {
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
					// Helper to get the visible input (mobile or desktop)
					const getVisibleInput = (
						mobileKey: string,
						desktopKey: string,
					) => {
						const mobileRef = scoreInputRefs.current[mobileKey];
						const desktopRef = scoreInputRefs.current[desktopKey];
						// Check which one is visible (offsetParent is null for hidden elements)
						if (desktopRef && desktopRef.offsetParent !== null) {
							return desktopRef;
						}
						if (mobileRef && mobileRef.offsetParent !== null) {
							return mobileRef;
						}
						return null;
					};

					if (side === "team1") {
						// Focus team2 input of same match
						const nextRef = getVisibleInput(
							`${matchId}-team2`,
							`${matchId}-team2-desktop`,
						);
						nextRef?.focus();
					} else if (side === "team2" && matchIndex !== undefined) {
						// Focus team1 input of next match
						const currentMatches =
							sessionData?.matchesByRound[currentRound] || [];
						if (matchIndex < currentMatches.length - 1) {
							const nextMatch = currentMatches[matchIndex + 1];
							const nextRef = getVisibleInput(
								`${nextMatch.id}-team1`,
								`${nextMatch.id}-team1-desktop`,
							);
							nextRef?.focus();
						} else {
							// Last field - blur to dismiss keyboard on mobile
							const currentRef = getVisibleInput(
								`${matchId}-team2`,
								`${matchId}-team2-desktop`,
							);
							currentRef?.blur();
						}
					}
				}, 0);
			}
		},
		[sessionData, currentRound],
	);

	// Navigate rounds
	const goToRound = useCallback(
		(round: number) => {
			if (roundNumbers.includes(round)) {
				setRoundDirection(
					round > currentRound ? 1 : round < currentRound ? -1 : 0,
				);
				setCurrentRound(round);
			}
		},
		[roundNumbers, currentRound],
	);

	const goToPreviousRound = useCallback(() => {
		const currentIndex = roundNumbers.indexOf(currentRound);
		if (currentIndex > 0) {
			setRoundDirection(-1);
			setCurrentRound(roundNumbers[currentIndex - 1]);
		}
	}, [roundNumbers, currentRound]);

	const goToNextRound = useCallback(() => {
		const currentIndex = roundNumbers.indexOf(currentRound);
		if (currentIndex < roundNumbers.length - 1) {
			setRoundDirection(1);
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

	// Refs to store API call results for terminal completion handler
	const submitResultRef = useRef<{
		success: boolean;
		updatedPlayers?: Player[];
		allMatches?: Match[];
		error?: string;
	} | null>(null);
	const submitRoundRef = useRef(currentRound);
	const isManualRecalcPollingRef = useRef(false);

	// Handle terminal animation complete - finalize the submission
	const handleTerminalComplete = useCallback(() => {
		const result = submitResultRef.current;
		if (!result) return;

		if (result.success && result.updatedPlayers) {
			const roundToUpdate = submitRoundRef.current;
			clearSessionSummaryCache(sessionId);

			// If this is Round 5 for a 6-player session and we have refreshed matches
			if (
				roundToUpdate === 5 &&
				sessionData?.session.player_count === 6 &&
				result.allMatches
			) {
				// Group matches by round_number
				const matchesByRound = result.allMatches.reduce(
					(acc, match) => {
						const roundNumber = match.round_number;
						if (!acc[roundNumber]) {
							acc[roundNumber] = [];
						}
						acc[roundNumber].push(match);
						return acc;
					},
					{} as Record<number, Match[]>,
				);

				// Update local state with refreshed matches
				setSessionData((prev) => {
					if (!prev) return prev;
					const updatedMatchesByRound = { ...prev.matchesByRound };
					const currentMatches =
						updatedMatchesByRound[roundToUpdate] || [];
					updatedMatchesByRound[roundToUpdate] = currentMatches.map(
						(match) => ({
							...match,
							status: "completed" as const,
							team1_score: scores[match.id].team1!,
							team2_score: scores[match.id].team2!,
						}),
					);

					// Merge refreshed matches (this will update Round 6 with new player assignments)
					Object.keys(matchesByRound).forEach((roundNum) => {
						const roundNumber = parseInt(roundNum, 10);
						if (roundNumber !== roundToUpdate) {
							updatedMatchesByRound[roundNumber] =
								matchesByRound[roundNumber];
						}
					});

					const roundNumbersList = Object.keys(updatedMatchesByRound)
						.map(Number)
						.sort((a, b) => a - b);
					const maxRoundNumber = Math.max(...roundNumbersList);
					const isLastRound = roundToUpdate >= maxRoundNumber;

					return {
						...prev,
						players: result.updatedPlayers!,
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
				// Standard update for non-Round 5 or non-6-player sessions
				setSessionData((prev) => {
					if (!prev) return prev;
					const updatedMatchesByRound = { ...prev.matchesByRound };
					const currentMatches =
						updatedMatchesByRound[roundToUpdate] || [];
					updatedMatchesByRound[roundToUpdate] = currentMatches.map(
						(match) => ({
							...match,
							status: "completed" as const,
							team1_score: scores[match.id].team1!,
							team2_score: scores[match.id].team2!,
						}),
					);

					const roundNumbersList = Object.keys(prev.matchesByRound)
						.map(Number)
						.sort((a, b) => a - b);
					const maxRoundNumber = Math.max(...roundNumbersList);
					const isLastRound = roundToUpdate >= maxRoundNumber;

					return {
						...prev,
						players: result.updatedPlayers!,
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

			// Advance to next round (if not last round)
			if (sessionData) {
				const roundNumbersList = Object.keys(sessionData.matchesByRound)
					.map(Number)
					.sort((a, b) => a - b);
				const currentIndex = roundNumbersList.indexOf(roundToUpdate);
				if (currentIndex < roundNumbersList.length - 1) {
					setRoundDirection(1);
					setCurrentRound(roundNumbersList[currentIndex + 1]);
				}
				// Last round completed - session is now done
			}
		} else if (result.error) {
			setError(result.error);
		}

		// Clean up
		setShowCalculationTerminal(false);
		setIsTerminalComplete(false);
		setSubmitting(false);
		submitResultRef.current = null;
	}, [sessionData, scores, sessionId]);

	// Submit round results with terminal visualization
	const handleSubmitRound = useCallback(async () => {
		if (!sessionData || !canSubmitRound || submitting) return;

		const currentMatches = sessionData.matchesByRound[currentRound] || [];
		const matchScores = currentMatches.map((match) => ({
			matchId: match.id,
			team1Score: scores[match.id].team1!,
			team2Score: scores[match.id].team2!,
		}));

		// Store current round for the completion handler
		submitRoundRef.current = currentRound;

		// Generate terminal lines and show the terminal
		const lines = generateTerminalLines(
			currentMatches,
			currentRound,
			scores,
		);
		setTerminalLines(lines);
		setIsTerminalComplete(false);
		setShowCalculationTerminal(true);
		setSubmitting(true);

		// Start the API call in the background
		try {
			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				submitResultRef.current = {
					success: false,
					error: t.sessions.session.error.notAuthenticated,
				};
				setIsTerminalComplete(true);
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
				},
			);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				submitResultRef.current = {
					success: false,
					error:
						errorData.error ||
						t.sessions.session.error.submitFailed,
				};
				setIsTerminalComplete(true);
				return;
			}

				// Refetch players to get updated Elo ratings
				const updatedPlayers = await fetchPlayers(session.access_token);

				// For Round 5 of 6-player sessions, also refetch matches
				let allMatches: Match[] | undefined;
				if (currentRound === 5 && sessionData.session.player_count === 6) {
					const supabaseClient = createTokenClient(
						session.access_token,
					);

					const { data: matchesData, error: matchesError } =
						await supabaseClient
							.from("session_matches")
							.select(
								"id, round_number, match_type, match_order, player_ids, status, team1_score, team2_score, video_url, team_1_id, team_2_id, is_rated",
							)
							.eq("session_id", sessionId)
							.order("round_number", { ascending: true })
							.order("match_order", { ascending: true });

					if (matchesError) {
						console.error(
							"Error refetching matches after round submit:",
							matchesError,
						);
					} else if (matchesData) {
						allMatches = (matchesData as Match[]).map((match) => ({
							...match,
							player_ids: normalizePlayerIDs(match.player_ids),
						}));
					}
				}

			// Store successful result
			submitResultRef.current = {
				success: true,
				updatedPlayers,
				allMatches,
			};

			// Mark terminal as complete - this will trigger onComplete callback
			setIsTerminalComplete(true);
		} catch (err) {
			console.error("Error submitting round:", err);
			submitResultRef.current = {
				success: false,
				error:
					err instanceof Error
						? err.message
						: "Failed to submit round",
			};
			setIsTerminalComplete(true);
		}
	}, [
		sessionData,
		currentRound,
		scores,
		canSubmitRound,
		submitting,
		sessionId,
		fetchPlayers,
		generateTerminalLines,
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
					errorData.error || t.sessions.session.error.deleteFailed,
				);
			}

			clearSessionSummaryCache(sessionId);
			clearSessionDeletionCaches();

			// Redirect to sessions list after successful deletion
			router.replace("/sessions");
			router.refresh();
		} catch (err) {
			console.error("Error deleting session:", err);
			setError(
				err instanceof Error ? err.message : "Failed to delete session",
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
				},
			);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(
					errorData.error ||
						t.sessions.session.error.forceCloseFailed,
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
					: "Failed to force close session",
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
		[isAdmin],
	);

	// Handle closing video URL drawer
	const handleCloseVideoDrawer = useCallback(() => {
		setSelectedMatchForVideo(null);
		setVideoUrlInput("");
		setError(null);
	}, []);

	// Fetch recalc status
	const fetchRecalcStatus = useCallback(async (): Promise<string | null> => {
		if (!sessionId) return null;
		try {
			const { data, error } = await supabase
				.from("sessions")
				.select("recalc_status")
				.eq("id", sessionId)
				.single();

			if (!error && data) {
				setRecalcStatus(data.recalc_status);
				return data.recalc_status;
			}
			return null;
		} catch (err) {
			console.error("Error fetching recalc status:", err);
			return null;
		}
	}, [sessionId]);

	// Poll recalc status when it's running
	useEffect(() => {
		if (
			recalcStatus === "running" &&
			!isManualRecalcPollingRef.current
		) {
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
			matchId?: string,
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
			const toastId = toast.loading("Saving match...", {
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
					},
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

				const editResult = await response.json().catch(() => null);
				if (editResult?.ratingsDeferred) {
					setSessionData((prev) => {
						if (!prev) return prev;

						const updatedMatchesByRound = { ...prev.matchesByRound };
						for (const [roundKey, roundMatches] of Object.entries(
							updatedMatchesByRound,
						)) {
							if (!roundMatches.some((match) => match.id === targetMatchId)) {
								continue;
							}

							updatedMatchesByRound[Number(roundKey)] = roundMatches.map(
								(match) =>
									match.id === targetMatchId
										? {
												...match,
												team1_score: team1Score,
												team2_score: team2Score,
												status: "completed" as const,
											}
										: match,
							);
							break;
						}

						return {
							...prev,
							matchesByRound: updatedMatchesByRound,
						};
					});
					setScores((prev) => ({
						...prev,
						[targetMatchId]: {
							team1: team1Score,
							team2: team2Score,
						},
					}));
					toast.success("Match score updated", { id: toastId });
					setIsEditDrawerOpen(false);
					setSelectedMatchForEdit(null);
					return;
				}

				// Poll until recalculation is done
				const maxWait = 60000; // 60 seconds max
				const startTime = Date.now();
				isManualRecalcPollingRef.current = true;
				const pollInterval = setInterval(async () => {
					const latestStatus = await fetchRecalcStatus();

					if (latestStatus === "done") {
						clearInterval(pollInterval);
						isManualRecalcPollingRef.current = false;
						toast.success("Session recalculated successfully", {
							id: toastId,
						});
						clearSessionSummaryCache(sessionId);
						setSessionReloadKey((value) => value + 1);
					} else if (latestStatus === "failed") {
						clearInterval(pollInterval);
						isManualRecalcPollingRef.current = false;
						toast.error("Recalculation failed", {
							id: toastId,
						});
					} else if (Date.now() - startTime > maxWait) {
						clearInterval(pollInterval);
						isManualRecalcPollingRef.current = false;
						toast.error("Recalculation timed out", {
							id: toastId,
						});
					}
				}, 1000);
			} catch (err) {
				isManualRecalcPollingRef.current = false;
				console.error("Error editing match:", err);
				toast.error("Failed to edit match", {
					description:
						err instanceof Error ? err.message : "Unknown error",
				});
			} finally {
				setIsEditingMatch(false);
			}
		},
		[selectedMatchForEdit, sessionId, fetchRecalcStatus],
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
					selectedMatchForVideo.id,
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
					},
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

					updatedMatchesByRound[roundNumber] = roundMatches.map(
						(m) =>
							m.id === selectedMatchForVideo.id
								? {
										...m,
										video_url: videoUrlInput.trim() || null,
									}
								: m,
					);

					return {
						...prev,
						matchesByRound: updatedMatchesByRound,
					};
				});
			}

			// Unsettled two-half pair edits do not trigger a recalculation reload.
			if (
				!scoresChanged ||
				isTwoHalfScoreOnlyEdit(selectedMatchForVideo)
			) {
				handleCloseVideoDrawer();
			}
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
		isTwoHalfScoreOnlyEdit,
	]);

	if (loading) {
		return (
			<AppShell title={t.sessions.session.title} showHeader={false}>
				<PageLoading label={t.sessions.session.loading} />
			</AppShell>
		);
	}

	if (error || !sessionData) {
		return (
			<AppShell
				title={t.sessions.session.title}
				contentPadding={false}
				contentClassName="gap-0 py-0 md:gap-0 md:py-0"
			>
				<motion.div
					className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6"
					initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={pageTransition}
				>
					<StateBlock
						variant="error"
						size="lg"
						title={error || t.sessions.session.loadingFailed}
						description={
							sessionNotFound
								? t.sessions.session.notFoundDescription
								: undefined
						}
						action={
							sessionNotFound ? (
								<Button
									variant="outline"
									onClick={() => router.replace("/sessions")}
								>
									{t.sessions.session.backToSessions}
								</Button>
							) : undefined
						}
					/>
				</motion.div>
			</AppShell>
		);
	}

	// Branch UI based on session status
	if (sessionData.session.status === "completed") {
		const roundNumbersList = Object.keys(sessionData.matchesByRound)
			.map(Number)
			.sort((a, b) => a - b);
		const performanceTabs: Array<{ value: SummaryView; label: string }> = [];
		if (viewAvailability?.hasSingles) {
			performanceTabs.push({
				value: "singles",
				label: t.sessions.session.tabs.singles,
			});
		}
		if (viewAvailability?.hasDoublesPlayer) {
			performanceTabs.push({
				value: "doubles_player",
				label: t.sessions.session.tabs.doublesPlayer,
			});
		}
		if (viewAvailability?.hasDoublesTeam) {
			performanceTabs.push({
				value: "doubles_team",
				label: t.sessions.session.tabs.doublesTeam,
			});
		}

		const toDetailPlayer = (player: Player): SessionDetailPlayer => ({
			id: player.id,
			name: player.name,
			avatar: player.avatar,
			isPlaceholder: player.isPlaceholder,
		});

		const toScoreboardMatch = (
			match: Match,
		): SessionScoreboardMatchData => {
			const isSingles = match.match_type === "singles";
			const teamOneIds = isSingles
				? [match.player_ids[0]]
				: [match.player_ids[0], match.player_ids[1]];
			const teamTwoIds = isSingles
				? [match.player_ids[1]]
				: [match.player_ids[2], match.player_ids[3]];
			const teamOne = teamOneIds
				.map(getPlayer)
				.filter((player): player is Player => Boolean(player));
			const teamTwo = teamTwoIds
				.map(getPlayer)
				.filter((player): player is Player => Boolean(player));
			const pairedFirstHalfScore = getPairedFirstHalfScore(match);
			const displayScore = getPairedDisplayScore(match, pairedFirstHalfScore);
			const history = matchEloHistory[match.id];
			const teamOneEloChange =
				activeView === "doubles_team"
					? history?.team1EloChange
					: history?.player1EloChange;
			const teamTwoEloChange =
				activeView === "doubles_team"
					? history?.team2EloChange
					: history?.player2EloChange;
			const selectedPlayerIsOnlyOnTeamTwo = Boolean(
				selectedPlayerFilter &&
					teamTwoIds.includes(selectedPlayerFilter) &&
					!teamOneIds.includes(selectedPlayerFilter),
			);

			return {
				id: match.id,
				roundNumber: match.round_number,
				matchType: match.match_type,
				teamOne: (selectedPlayerIsOnlyOnTeamTwo ? teamTwo : teamOne).map(
					toDetailPlayer,
				),
				teamTwo: (selectedPlayerIsOnlyOnTeamTwo ? teamOne : teamTwo).map(
					toDetailPlayer,
				),
				teamOneScore: selectedPlayerIsOnlyOnTeamTwo
					? displayScore.team2Score
					: displayScore.team1Score,
				teamTwoScore: selectedPlayerIsOnlyOnTeamTwo
					? displayScore.team1Score
					: displayScore.team2Score,
				teamOneEloChange: selectedPlayerIsOnlyOnTeamTwo
					? teamTwoEloChange
					: teamOneEloChange,
				teamTwoEloChange: selectedPlayerIsOnlyOnTeamTwo
					? teamOneEloChange
					: teamTwoEloChange,
				pairedFirstHalfLabel:
					match.status === "completed" && pairedFirstHalfScore
					? t.sessions.session.pairedFirstHalfScore(
							pairedFirstHalfScore.roundNumber,
							pairedFirstHalfScore.team1Score,
							pairedFirstHalfScore.team2Score,
						)
					: undefined,
				isRated: match.is_rated,
				hasVideo: Boolean(match.video_url),
				onActivate: isAdmin
					? () => handleOpenVideoDrawer(match)
					: undefined,
			};
		};

		const resultRounds: SessionResultRound[] = roundNumbersList
			.map((roundNumber) => ({
				number: roundNumber,
				matches: (sessionData.matchesByRound[roundNumber] || [])
					.filter((match) => !isSettledFirstHalfMatch(match))
					.map(toScoreboardMatch),
			}))
			.filter((round) => round.matches.length > 0);
		const selectedPlayer = selectedPlayerFilter
			? getPlayer(selectedPlayerFilter)
			: undefined;
		const selectedPlayerMatches = selectedPlayer
			? resultRounds
					.flatMap((round) => round.matches)
					.filter(
						(match) =>
							match.matchType ===
								(activeView === "singles" ? "singles" : "doubles") &&
							(match.teamOne.some(
								(player) => player.id === selectedPlayer.id,
							) ||
								match.teamTwo.some(
									(player) => player.id === selectedPlayer.id,
								)),
					)
			: [];
		const completedMatches = resultRounds.flatMap((round) => round.matches);

		return (
			<>
				<AppShell
					title={t.sessions.session.title}
					showHeader={false}
					contentPadding={false}
					contentClassName="gap-0 py-0 md:gap-0 md:py-0"
					insetClassName="session-detail-native-shell"
					bodyClassName="session-detail-native-shell"
					containerClassName="session-detail-native-shell"
				>
					<motion.div
						className="session-detail-native mx-auto flex w-full max-w-[760px] flex-col gap-[30px] px-5 pb-12 pt-[calc(1rem+env(safe-area-inset-top,0px))] md:py-8"
						initial={
							shouldReduceMotion ? false : { opacity: 0, y: 8 }
						}
						animate={{ opacity: 1, y: 0 }}
						transition={pageTransition}
					>
						<SessionDetailHero
							date={sessionData.session.created_at}
							status="completed"
						/>

						<div className="space-y-3.5">
							{showViewTabs && performanceTabs.length > 1 ? (
								<SessionPerformanceTabs
									tabs={performanceTabs}
									value={activeView}
									onValueChange={(value) => {
										if (value === "doubles_team") {
											setSelectedPlayerFilter(null);
											setSelectedPlayerSummary(null);
										}
										handleViewChange(value as SummaryView);
									}}
								/>
							) : null}
							<SessionSummaryTable
								key={`${sessionId}:${completedMatchCount}`}
								sessionId={sessionId}
								activeView={activeView}
								onPlayerClick={(playerId) => {
									setSelectedPlayerFilter(
										selectedPlayerFilter === playerId
											? null
											: playerId,
									);
								}}
								selectedPlayerFilter={selectedPlayerFilter}
								onSelectedPlayerSummaryChange={
									setSelectedPlayerSummary
								}
							/>
						</div>

						{selectedPlayer && activeView !== "doubles_team" ? (
							<SessionPlayerMatchResults
								player={toDetailPlayer(selectedPlayer)}
								matches={selectedPlayerMatches}
								summary={selectedPlayerSummary}
								onClear={() => setSelectedPlayerFilter(null)}
							/>
						) : usesCompletedFlatMatchList ? (
							<SessionCompletedMatchResults matches={completedMatches} />
						) : (
							<SessionResultsTimeline rounds={resultRounds} />
						)}
						{isAdmin && isDeletable ? (
							<Button
								variant="destructive"
								className="self-end"
								onClick={() => setShowDeleteModal(true)}
							>
								<Icon icon="solar:trash-bin-trash-bold" className="mr-1.5 size-4" />
								{t.sessions.session.delete.button}
							</Button>
						) : null}
					</motion.div>
				</AppShell>

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
									const pairedFirstHalfScore =
										getPairedFirstHalfScore(match);

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
													{pairedFirstHalfScore && (
														<Box className="mb-3 flex justify-center">
															{renderPairedScoreReminder(
																pairedFirstHalfScore,
																match.team1_score,
																match.team2_score,
															)}
														</Box>
													)}
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
																	e,
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
																							10,
																						)
																					: null,
																		},
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
																	e,
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
																							10,
																						)
																					: null,
																		},
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
															e.target.value,
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
												selectedMatchForVideo.id,
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
											isLoading={isEditingMatch || savingVideoUrl}
											loadingLabel={buttonText}
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
											{buttonText}
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
											selectedMatchForEdit.player_ids[0],
										),
									].filter(Boolean) as Player[])
								: ([
										getPlayer(
											selectedMatchForEdit.player_ids[0],
										),
										getPlayer(
											selectedMatchForEdit.player_ids[1],
										),
									].filter(Boolean) as Player[])
						}
						team2Players={
							selectedMatchForEdit.match_type === "singles"
								? ([
										getPlayer(
											selectedMatchForEdit.player_ids[1],
										),
									].filter(Boolean) as Player[])
								: ([
										getPlayer(
											selectedMatchForEdit.player_ids[2],
										),
										getPlayer(
											selectedMatchForEdit.player_ids[3],
										),
									].filter(Boolean) as Player[])
						}
						onSave={handleEditMatch}
						isSaving={isEditingMatch}
						isEloDeferred={isTwoHalfScoreOnlyEdit(
							selectedMatchForEdit,
						)}
					/>
				)}

				{/* Delete Session Confirmation Modal */}
				{showDeleteModal && (
					<Box className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
						<SurfaceCard variant="modal">
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
													e.target.checked,
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
						</SurfaceCard>
					</Box>
				)}
				{/* Force Close Confirmation Modal */}
				{showForceCloseModal && (
					<Box className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
						<SurfaceCard variant="modal">
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
						</SurfaceCard>
					</Box>
				)}

				{/* ELO Calculation Terminal Modal */}
				<TerminalModal isVisible={showCalculationTerminal}>
					<CalculationTerminal
						lines={terminalLines}
						isComplete={isTerminalComplete}
						onComplete={handleTerminalComplete}
					/>
				</TerminalModal>
			</>
		);
	}

	if (sessionData.session.status === "active") {
		const toDetailPlayer = (player: Player): SessionDetailPlayer => ({
			id: player.id,
			name: player.name,
			avatar: player.avatar,
			isPlaceholder: player.isPlaceholder,
		});
		const currentRoundIndex = roundNumbers.indexOf(currentRound);
		const nextRoundNumber =
			currentRound === activeRoundNumber &&
			currentRoundIndex >= 0 &&
			currentRoundIndex < roundNumbers.length - 1
				? roundNumbers[currentRoundIndex + 1]
				: null;
		const currentRoundSingles = currentRoundMatches.filter(
			(match) => match.match_type === "singles",
		).length;
		const currentRoundDoubles = currentRoundMatches.length - currentRoundSingles;
		const matchSummary = [
			currentRoundDoubles > 0
				? `${currentRoundDoubles} ${currentRoundDoubles === 1 ? "dubl" : "dubla"}`
				: null,
			currentRoundSingles > 0
				? `${currentRoundSingles} ${currentRoundSingles === 1 ? "singl" : "singla"}`
				: null,
		]
			.filter(Boolean)
			.join(" · ");
		const playingPlayerIds = new Set(
			currentRoundMatches.flatMap((match) => match.player_ids),
		);
		const restingPlayers = sessionData.players
			.filter((player) => !playingPlayerIds.has(player.id))
			.map(toDetailPlayer);
		const shortTeamName = (ids: string[]) =>
			ids
				.map((id) => getPlayer(id)?.name ?? "?")
				.map((name) => name.split(" ")[0] ?? name)
				.join(" & ");
		const nextRoundMatches: ActiveSessionPreviewMatch[] = nextRoundNumber
			? (sessionData.matchesByRound[nextRoundNumber] ?? []).map((match) => {
					const isSingles = match.match_type === "singles";
					return {
						id: match.id,
						teamOne: shortTeamName(
							isSingles
								? [match.player_ids[0]]
								: [match.player_ids[0], match.player_ids[1]],
						),
						teamTwo: shortTeamName(
							isSingles
								? [match.player_ids[1]]
								: [match.player_ids[2], match.player_ids[3]],
						),
						isRated: match.is_rated,
					};
				})
			: [];

		const teamRating = (match: Match, playerIds: string[]) => {
			if (match.match_type === "singles") {
				return getPlayer(playerIds[0])?.elo ?? 1500;
			}
			const normalizedPair = [...playerIds].sort().join(":");
			const explicitTeamId =
				playerIds[0] === match.player_ids[0] ? match.team_1_id : match.team_2_id;
			const teamId = explicitTeamId ?? playerPairToTeamId[normalizedPair];
			return teamId ? (teamEloRatings[teamId] ?? 1500) : 1500;
		};
		const sideFor = (
			match: Match,
			playerIds: string[],
			opponentIds: string[],
		): ActiveSessionSide => {
			const players = playerIds
				.map(getPlayer)
				.filter((player): player is Player => Boolean(player));
			const rating = teamRating(match, playerIds);
			const opponentRating = teamRating(match, opponentIds);
			const matchCount =
				match.match_type === "singles"
					? (players[0]?.matchCount ?? 0)
					: Math.round(
							players.reduce(
								(total, player) => total + (player.matchCount ?? 0),
								0,
							) / Math.max(players.length, 1),
						);
			return {
				name: players.map((player) => player.name).join(" + ") || "Nepoznat igrač",
				players: players.map(toDetailPlayer),
				...(match.is_rated
					? {
							rating,
							winDelta: calculateEloChange(
								rating,
								opponentRating,
								"win",
								matchCount,
							),
							drawDelta: calculateEloChange(
								rating,
								opponentRating,
								"draw",
								matchCount,
							),
							lossDelta: calculateEloChange(
								rating,
								opponentRating,
								"lose",
								matchCount,
							),
						}
					: {}),
			};
		};
		const toBrowsableMatch = (match: Match): SessionScoreboardMatchData => {
			const isSingles = match.match_type === "singles";
			const teamOneIds = isSingles
				? [match.player_ids[0]]
				: [match.player_ids[0], match.player_ids[1]];
			const teamTwoIds = isSingles
				? [match.player_ids[1]]
				: [match.player_ids[2], match.player_ids[3]];
			const pairedFirstHalfScore = getPairedFirstHalfScore(match);
			const displayScore = getPairedDisplayScore(match, pairedFirstHalfScore);
			return {
				id: match.id,
				roundNumber: match.round_number,
				matchType: match.match_type,
				teamOne: teamOneIds
					.map(getPlayer)
					.filter((player): player is Player => Boolean(player))
					.map(toDetailPlayer),
				teamTwo: teamTwoIds
					.map(getPlayer)
					.filter((player): player is Player => Boolean(player))
					.map(toDetailPlayer),
				teamOneScore: displayScore.team1Score,
				teamTwoScore: displayScore.team2Score,
				isRated: match.is_rated,
				pairedFirstHalfLabel: pairedFirstHalfScore
					? t.sessions.session.pairedFirstHalfScore(
							pairedFirstHalfScore.roundNumber,
							pairedFirstHalfScore.team1Score,
							pairedFirstHalfScore.team2Score,
						)
					: undefined,
				onActivate:
					match.status === "completed"
						? () => {
								setSelectedMatchForEdit(match);
								setIsEditDrawerOpen(true);
							}
						: undefined,
			};
		};

		const previousRound = () => {
			if (currentRoundIndex > 0) goToPreviousRound();
		};
		const nextRound = () => {
			if (currentRoundIndex < roundNumbers.length - 1) goToNextRound();
		};
		const waitingForGeneratedRound =
			currentRound === activeRoundNumber && currentRoundMatches.length === 0;

		return (
			<>
				<AppShell
					title={t.sessions.session.title}
					actionLabel={t.sessions.session.forceClose.button}
					actionAriaLabel="Opcije termina"
					actionOnClick={() => setShowForceCloseModal(true)}
					actionIcon="solar:menu-dots-bold"
					actionIconOnly
					actionVariant="ghost"
					centerTitleOnMobile
					contentPadding={false}
					contentClassName="gap-0 py-0 md:gap-0 md:py-0"
					insetClassName="session-detail-native-shell"
					bodyClassName="session-detail-native-shell"
					containerClassName="session-detail-native-shell"
				>
					<ActiveSessionRoundCanvas
						onPrevious={currentRoundIndex > 0 ? previousRound : undefined}
						onNext={
							currentRoundIndex < roundNumbers.length - 1
								? nextRound
								: undefined
						}
						className="session-detail-native mx-auto w-full max-w-[760px] px-5 pb-[110px] pt-[18px] md:pt-7"
					>
						<AnimatePresence initial={false} mode="wait">
							<motion.div
								key={currentRound}
								className="space-y-[18px]"
								initial={
									shouldReduceMotion
										? false
										: {
												opacity: 0.72,
												transform: `translateX(${roundDirection * 18}px)`,
											}
								}
								animate={{ opacity: 1, transform: "translateX(0px)" }}
								exit={
									shouldReduceMotion
										? undefined
										: {
												opacity: 0.4,
												transform: `translateX(${roundDirection * -12}px)`,
											}
								}
								transition={{
									duration: shouldReduceMotion ? 0 : 0.18,
									ease: [0.16, 1, 0.3, 1],
								}}
							>
								<ActiveSessionRoundHeader
									roundNumber={currentRound}
									currentRoundNumber={activeRoundNumber}
									totalRounds={roundNumbers.length}
									roundNumbers={roundNumbers}
									matchSummary={matchSummary || "Raspored se priprema"}
									onRoundSelect={goToRound}
								/>

								{nextRoundNumber ? (
									<ActiveSessionNextRound
										roundNumber={nextRoundNumber}
										matches={nextRoundMatches}
									/>
								) : null}

								{currentRound > activeRoundNumber ? (
									<ActiveSessionBrowseNotice />
								) : null}

								{waitingForGeneratedRound ? (
									<div className="session-detail-scoreboard p-4 text-center text-ios-subheadline text-[rgb(var(--ds-native-muted))]">
										Raspored ove runde biće prikazan čim prethodna runda bude sačuvana.
									</div>
								) : currentRound === activeRoundNumber ? (
									currentRoundMatches.map((match, matchIndex) => {
										const isSingles = match.match_type === "singles";
										const teamOneIds = isSingles
											? [match.player_ids[0]]
											: [match.player_ids[0], match.player_ids[1]];
										const teamTwoIds = isSingles
											? [match.player_ids[1]]
											: [match.player_ids[2], match.player_ids[3]];
										const matchScores = scores[match.id] ?? {
											team1: null,
											team2: null,
										};
						return (
											<ActiveSessionMatchEditor
												key={match.id}
												teamOne={sideFor(match, teamOneIds, teamTwoIds)}
												teamTwo={sideFor(match, teamTwoIds, teamOneIds)}
												teamOneScore={matchScores.team1}
												teamTwoScore={matchScores.team2}
												onTeamOneScoreChange={(value) =>
													handleScoreChange(match.id, "team1", value, matchIndex)
												}
												onTeamTwoScoreChange={(value) =>
													handleScoreChange(match.id, "team2", value, matchIndex)
												}
												teamOneInputRef={(element) => {
													scoreInputRefs.current[`${match.id}-team1`] = element;
												}}
												teamTwoInputRef={(element) => {
													scoreInputRefs.current[`${match.id}-team2`] = element;
												}}
								disabled={submitting || match.status === "completed"}
											/>
										);
									})
								) : (
									currentRoundMatches.map((match) => (
										<SessionScoreboardMatch
											key={match.id}
											match={toBrowsableMatch(match)}
										/>
									))
								)}

								<ActiveSessionRestingLine players={restingPlayers} />

								{currentRound === activeRoundNumber ? (
									<ActiveSessionSubmitBar
										isReady={canSubmitRound}
										isSubmitting={submitting}
										isFinalRound={
											currentRound === roundNumbers[roundNumbers.length - 1]
										}
										onSubmit={() => void handleSubmitRound()}
									/>
								) : null}
							</motion.div>
						</AnimatePresence>
					</ActiveSessionRoundCanvas>
				</AppShell>

				{showForceCloseModal ? (
					<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-5 backdrop-blur-sm">
						<div
							className="session-detail-scoreboard w-full max-w-md p-5"
							role="dialog"
							aria-modal="true"
							aria-labelledby="force-close-title"
						>
							<h2
								id="force-close-title"
								className="font-session-heading text-ios-display-24 font-bold text-[rgb(var(--ds-native-bone))]"
							>
								{t.sessions.session.forceClose.title}
							</h2>
							<p className="mt-2 text-ios-subheadline leading-relaxed text-[rgb(var(--ds-native-muted))]">
								{t.sessions.session.forceClose.description}
							</p>
							<div className="mt-5 flex gap-3">
								<Button
									variant="outline"
									onClick={() => setShowForceCloseModal(false)}
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
										? t.sessions.session.forceClose.closing
										: t.sessions.session.forceClose.button}
								</Button>
							</div>
						</div>
					</div>
				) : null}

				{selectedMatchForEdit ? (
					<EditMatchDrawer
						open={isEditDrawerOpen}
						onOpenChange={setIsEditDrawerOpen}
						match={selectedMatchForEdit}
						team1Players={
							selectedMatchForEdit.match_type === "singles"
								? ([getPlayer(selectedMatchForEdit.player_ids[0])].filter(
										Boolean,
									) as Player[])
								: ([
										getPlayer(selectedMatchForEdit.player_ids[0]),
										getPlayer(selectedMatchForEdit.player_ids[1]),
									].filter(Boolean) as Player[])
						}
						team2Players={
							selectedMatchForEdit.match_type === "singles"
								? ([getPlayer(selectedMatchForEdit.player_ids[1])].filter(
										Boolean,
									) as Player[])
								: ([
										getPlayer(selectedMatchForEdit.player_ids[2]),
										getPlayer(selectedMatchForEdit.player_ids[3]),
									].filter(Boolean) as Player[])
						}
						onSave={handleEditMatch}
						isSaving={isEditingMatch}
						isEloDeferred={isTwoHalfScoreOnlyEdit(selectedMatchForEdit)}
					/>
				) : null}

				<TerminalModal isVisible={showCalculationTerminal}>
					<CalculationTerminal
						lines={terminalLines}
						isComplete={isTerminalComplete}
						onComplete={handleTerminalComplete}
					/>
				</TerminalModal>
			</>
		);
	}
	return null;
}

export default function SessionPage() {
	return (
		<AuthGuard>
			<SessionPageContent />
		</AuthGuard>
	);
}
