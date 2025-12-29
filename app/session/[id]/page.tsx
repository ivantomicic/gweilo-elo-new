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
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerFooter,
} from "@/components/ui/drawer";
import { supabase } from "@/lib/supabase/client";
import { createClient } from "@supabase/supabase-js";
import { calculateEloChange, averageElo } from "@/lib/elo";
import { getUserRole } from "@/lib/auth/getUserRole";
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
	status?: "pending" | "completed";
	team1_score?: number | null;
	team2_score?: number | null;
	youtube_url?: string | null;
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
	const sessionId = params.id as string;

	const [sessionData, setSessionData] = useState<SessionData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [currentRound, setCurrentRound] = useState(1);
	const [scores, setScores] = useState<Scores>({});
	const [submitting, setSubmitting] = useState(false);
	const [showConfirmModal, setShowConfirmModal] = useState(false);
	const [showForceCloseModal, setShowForceCloseModal] = useState(false);
	const [forceClosing, setForceClosing] = useState(false);
	const [isAdmin, setIsAdmin] = useState(false);
	const [selectedMatchForYoutube, setSelectedMatchForYoutube] =
		useState<Match | null>(null);
	const [youtubeUrlInput, setYoutubeUrlInput] = useState("");
	const [savingYoutubeUrl, setSavingYoutubeUrl] = useState(false);

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
				const playersResponse = await fetch(
					`/api/sessions/${sessionId}/players`,
					{
						headers: {
							Authorization: `Bearer ${session.access_token}`,
						},
					}
				);

				if (!playersResponse.ok) {
					const errorData = await playersResponse
						.json()
						.catch(() => ({}));
					console.error("Error fetching players:", errorData);
					setError(
						`Failed to load players: ${
							errorData.error || playersResponse.statusText
						}`
					);
					setLoading(false);
					return;
				}

				const playersData = await playersResponse.json();
				const players: Player[] = playersData.players;

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
		// Only fetch on mount or sessionId change, not on every render
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sessionId]);

	// Check if user is admin
	useEffect(() => {
		const checkAdmin = async () => {
			const role = await getUserRole();
			setIsAdmin(role === "admin");
		};
		checkAdmin();
	}, []);

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

	// Handle score change
	const handleScoreChange = useCallback(
		(matchId: string, side: "team1" | "team2", value: string) => {
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
		},
		[]
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
				setError("Not authenticated");
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
				throw new Error(errorData.error || "Failed to submit round");
			}

			// Update local state to mark matches as completed
			// Also check if this was the last round and update session status
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
			setShowConfirmModal(false);
		}
	}, [
		sessionData,
		currentRound,
		scores,
		canSubmitRound,
		submitting,
		sessionId,
	]);

	const handleNextClick = useCallback(() => {
		if (isCurrentRoundCompleted) {
			goToNextRound();
		} else if (canSubmitRound) {
			setShowConfirmModal(true);
		} else {
			// Can't submit - just go to next if allowed
			goToNextRound();
		}
	}, [isCurrentRoundCompleted, canSubmitRound, goToNextRound]);

	// Force close session handler
	const handleForceClose = useCallback(async () => {
		if (!sessionData || forceClosing) return;

		setForceClosing(true);
		try {
			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				setError("Not authenticated");
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
					errorData.error || "Failed to force close session"
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

	// Handle opening YouTube URL drawer
	const handleOpenYoutubeDrawer = useCallback(
		(match: Match) => {
			if (!isAdmin) return;
			setSelectedMatchForYoutube(match);
			setYoutubeUrlInput(match.youtube_url || "");
		},
		[isAdmin]
	);

	// Handle closing YouTube URL drawer
	const handleCloseYoutubeDrawer = useCallback(() => {
		setSelectedMatchForYoutube(null);
		setYoutubeUrlInput("");
		setError(null);
	}, []);

	// Validate YouTube URL (empty is valid, non-empty must contain youtube.com or youtu.be)
	const isValidYoutubeUrl = useCallback((url: string): boolean => {
		const trimmed = url.trim();
		if (trimmed === "") return true; // Empty is valid (clears link)
		return trimmed.includes("youtube.com") || trimmed.includes("youtu.be");
	}, []);

	// Handle saving YouTube URL
	const handleSaveYoutubeUrl = useCallback(async () => {
		if (!selectedMatchForYoutube || !sessionId || savingYoutubeUrl) return;

		// Validate URL if provided
		if (!isValidYoutubeUrl(youtubeUrlInput)) {
			setError(
				"Invalid YouTube URL. Must contain youtube.com or youtu.be"
			);
			return;
		}

		try {
			setSavingYoutubeUrl(true);
			setError(null);

			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				setError("Not authenticated");
				return;
			}

			const response = await fetch(
				`/api/sessions/${sessionId}/matches/${selectedMatchForYoutube.id}/youtube-url`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${session.access_token}`,
					},
					body: JSON.stringify({
						youtube_url: youtubeUrlInput.trim() || null,
					}),
				}
			);

			if (!response.ok) {
				const errorData = await response.json();
				setError(errorData.error || "Failed to save YouTube URL");
				return;
			}

			// Optimistically update the match in sessionData
			setSessionData((prev) => {
				if (!prev) return prev;

				const updatedMatchesByRound = { ...prev.matchesByRound };
				const roundNumber = selectedMatchForYoutube.round_number;
				const roundMatches = updatedMatchesByRound[roundNumber] || [];

				updatedMatchesByRound[roundNumber] = roundMatches.map((m) =>
					m.id === selectedMatchForYoutube.id
						? { ...m, youtube_url: youtubeUrlInput.trim() || null }
						: m
				);

				return {
					...prev,
					matchesByRound: updatedMatchesByRound,
				};
			});

			handleCloseYoutubeDrawer();
		} catch (err) {
			console.error("Error saving YouTube URL:", err);
			setError("Failed to save YouTube URL");
		} finally {
			setSavingYoutubeUrl(false);
		}
	}, [
		selectedMatchForYoutube,
		sessionId,
		youtubeUrlInput,
		savingYoutubeUrl,
		isValidYoutubeUrl,
		handleCloseYoutubeDrawer,
	]);

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
									<p className="text-muted-foreground">
										Loading session...
									</p>
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
									<p className="text-destructive">
										{error || "Failed to load session"}
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

		return (
			<>
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
												Session Results
											</h1>
											<p className="text-sm text-muted-foreground mt-1">
												Completed on{" "}
												{sessionData.session
													.completed_at
													? new Date(
															sessionData.session.completed_at
													  ).toLocaleDateString()
													: "Unknown"}
											</p>
										</Box>
									</Box>

									{/* Rounds */}
									<Stack direction="column" spacing={6}>
										{roundNumbersList.map((roundNumber) => {
											const roundMatches =
												sessionData.matchesByRound[
													roundNumber
												] || [];
											return (
												<Box key={roundNumber}>
													<h2 className="text-xl font-bold font-heading mb-4">
														Round {roundNumber}
													</h2>
													<Stack
														direction="column"
														spacing={3}
													>
														{roundMatches.map(
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
																		.map(
																			(
																				id
																			) =>
																				getPlayer(
																					id
																				)
																		)
																		.filter(
																			Boolean
																		) as Player[];
																const team2Players =
																	team2PlayerIds
																		.map(
																			(
																				id
																			) =>
																				getPlayer(
																					id
																				)
																		)
																		.filter(
																			Boolean
																		) as Player[];

																const team1Name =
																	isSingles
																		? team1Players[0]
																				?.name ||
																		  "Unknown"
																		: `${
																				team1Players[0]
																					?.name ||
																				""
																		  } & ${
																				team1Players[1]
																					?.name ||
																				""
																		  }`.trim();
																const team2Name =
																	isSingles
																		? team2Players[0]
																				?.name ||
																		  "Unknown"
																		: `${
																				team2Players[0]
																					?.name ||
																				""
																		  } & ${
																				team2Players[1]
																					?.name ||
																				""
																		  }`.trim();

																const hasYoutubeUrl =
																	!!match.youtube_url;

																return (
																	<Box
																		key={
																			match.id
																		}
																		onClick={() =>
																			isAdmin &&
																			handleOpenYoutubeDrawer(
																				match
																			)
																		}
																		className={cn(
																			"bg-card rounded-[20px] p-5 border border-border/50 shadow-sm relative",
																			isAdmin &&
																				"cursor-pointer hover:border-border active:scale-[0.99] transition-all"
																		)}
																	>
																		{/* YouTube URL Indicator */}
																		{hasYoutubeUrl && (
																			<Box className="absolute top-3 right-3">
																				<Icon
																					icon="solar:play-circle-bold"
																					className="size-5 text-chart-4"
																				/>
																			</Box>
																		)}
																		<Stack
																			direction="row"
																			alignItems="center"
																			justifyContent="between"
																			spacing={
																				4
																			}
																		>
																			{/* Team 1 */}
																			<Stack
																				direction="column"
																				alignItems="center"
																				spacing={
																					2
																				}
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
																						spacing={
																							-4
																						}
																					>
																						{team1Players.map(
																							(
																								player
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
																						{
																							team1Name
																						}
																					</p>
																				</Box>
																			</Stack>

																			{/* Scores */}
																			<Stack
																				direction="row"
																				alignItems="center"
																				spacing={
																					3
																				}
																				className="shrink-0"
																			>
																				<Box className="text-center">
																					<p className="text-3xl font-black">
																						{match.team1_score ??
																							"-"}
																					</p>
																				</Box>
																				<Box className="px-1">
																					<span className="text-xs font-black text-muted-foreground">
																						VS
																					</span>
																				</Box>
																				<Box className="text-center">
																					<p className="text-3xl font-black">
																						{match.team2_score ??
																							"-"}
																					</p>
																				</Box>
																			</Stack>

																			{/* Team 2 */}
																			<Stack
																				direction="column"
																				alignItems="center"
																				spacing={
																					2
																				}
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
																						spacing={
																							-4
																						}
																					>
																						{team2Players.map(
																							(
																								player
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
																						{
																							team2Name
																						}
																					</p>
																				</Box>
																			</Stack>
																		</Stack>
																	</Box>
																);
															}
														)}
													</Stack>
												</Box>
											);
										})}
									</Stack>
								</div>
							</div>
						</div>
					</SidebarInset>
				</SidebarProvider>

				{/* YouTube URL Drawer */}
				<Drawer
					open={selectedMatchForYoutube !== null}
					onOpenChange={(open) => !open && handleCloseYoutubeDrawer()}
				>
					<DrawerContent>
						<DrawerHeader>
							<DrawerTitle>
								{selectedMatchForYoutube ? (
									<>
										Round{" "}
										{selectedMatchForYoutube.round_number} –{" "}
										{selectedMatchForYoutube.match_type ===
										"singles"
											? "Singles"
											: "Doubles"}
									</>
								) : null}
							</DrawerTitle>
						</DrawerHeader>

						{selectedMatchForYoutube ? (
							<div className="px-4 pb-4 space-y-6">
								{/* Players / Teams (Read-only) */}
								<Box>
									<Stack direction="column" spacing={3}>
										{(() => {
											const match =
												selectedMatchForYoutube;
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
												? team1Players[0]?.name ||
												  "Unknown"
												: `${
														team1Players[0]?.name ||
														""
												  } & ${
														team1Players[1]?.name ||
														""
												  }`.trim();
											const team2Name = isSingles
												? team2Players[0]?.name ||
												  "Unknown"
												: `${
														team2Players[0]?.name ||
														""
												  } & ${
														team2Players[1]?.name ||
														""
												  }`.trim();

											return (
												<Box>
													<p className="text-sm font-semibold text-muted-foreground mb-2">
														Players
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
											);
										})()}
									</Stack>
								</Box>

								{/* YouTube URL Input */}
								<Box>
									<label className="text-sm font-semibold text-foreground mb-2 block">
										YouTube link
									</label>
									<Input
										type="url"
										value={youtubeUrlInput}
										onChange={(e) =>
											setYoutubeUrlInput(e.target.value)
										}
										placeholder="https://www.youtube.com/watch?v=..."
										disabled={savingYoutubeUrl}
										className="w-full"
									/>
								</Box>
							</div>
						) : null}

						<DrawerFooter>
							<Stack
								direction="row"
								spacing={3}
								className="w-full"
							>
								<Button
									variant="outline"
									onClick={handleCloseYoutubeDrawer}
									disabled={savingYoutubeUrl}
									className="flex-1"
								>
									Cancel
								</Button>
								<Button
									onClick={handleSaveYoutubeUrl}
									disabled={
										savingYoutubeUrl ||
										!isValidYoutubeUrl(youtubeUrlInput)
									}
									className="flex-1"
								>
									{savingYoutubeUrl ? "Saving..." : "Save"}
								</Button>
							</Stack>
						</DrawerFooter>
					</DrawerContent>
				</Drawer>
			</>
		);
	}

	const totalRounds = roundNumbers.length;

	return (
		<>
			{/* Confirmation Modal */}
			{showConfirmModal && (
				<Box className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
					<Box className="bg-card rounded-[24px] p-6 border border-border/50 max-w-sm w-full mx-4">
						<Stack direction="column" spacing={4}>
							<Box>
								<h2 className="text-2xl font-bold font-heading">
									Confirm Submission
								</h2>
								<p className="text-muted-foreground mt-2 text-sm">
									Submit results for Round {currentRound}?
									This will update Elo ratings and cannot be
									undone.
								</p>
							</Box>
							<Stack direction="row" spacing={3}>
								<Button
									variant="outline"
									onClick={() => setShowConfirmModal(false)}
									disabled={submitting}
									className="flex-1"
								>
									Cancel
								</Button>
								<Button
									onClick={handleSubmitRound}
									disabled={submitting}
									className="flex-1"
								>
									{submitting ? "Submitting..." : "Confirm"}
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
									Force Close Session
								</h2>
								<p className="text-muted-foreground mt-2 text-sm">
									This will mark the session as completed
									without processing any remaining rounds.
									This action cannot be undone. Only use this
									if the session should already be completed.
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
									Cancel
								</Button>
								<Button
									variant="destructive"
									onClick={handleForceClose}
									disabled={forceClosing}
									className="flex-1"
								>
									{forceClosing
										? "Closing..."
										: "Force Close"}
								</Button>
							</Stack>
						</Stack>
					</Box>
				</Box>
			)}
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
												Force Close Session
											</Button>
											<Box className="flex items-center gap-1 bg-chart-2/10 text-chart-2 px-2 py-1 rounded-lg border border-chart-2/20">
												<Box className="size-2 rounded-full bg-chart-2 animate-pulse" />
												<span className="text-[10px] font-black uppercase tracking-tight">
													Live
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
									{currentRoundMatches.map((match) => {
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

										const team1Elo = isSingles
											? team1Players[0]?.elo || 1500
											: averageElo(
													team1Players.map(
														(p) => p.elo
													)
											  );
										const team2Elo = isSingles
											? team2Players[0]?.elo || 1500
											: averageElo(
													team2Players.map(
														(p) => p.elo
													)
											  );

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

										return (
											<Box
												key={match.id}
												className="bg-card rounded-[20px] p-5 border border-border/50 shadow-sm"
											>
												<Stack
													direction="row"
													alignItems="center"
													justifyContent="between"
													spacing={4}
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
																	? `Elo ${team1Elo}`
																	: `Avg. ${team1Elo}`}
															</p>
														</Box>
														<Stack
															direction="row"
															alignItems="center"
															justifyContent="center"
															spacing={3}
															className="text-xs font-bold mt-2"
														>
															<span className="text-chart-2">
																+
																{team1WinChange}
															</span>
															<span className="text-chart-3">
																{team1DrawChange >=
																0
																	? "+"
																	: ""}
																{
																	team1DrawChange
																}
															</span>
															<span className="text-chart-4">
																{
																	team1LoseChange
																}
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
															type="number"
															placeholder="0"
															value={
																matchScores.team1 ??
																""
															}
															onChange={(e) =>
																handleScoreChange(
																	match.id,
																	"team1",
																	e.target
																		.value
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
																VS
															</span>
														</Box>
														<Input
															type="number"
															placeholder="0"
															value={
																matchScores.team2 ??
																""
															}
															onChange={(e) =>
																handleScoreChange(
																	match.id,
																	"team2",
																	e.target
																		.value
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
																	? `Elo ${team2Elo}`
																	: `Avg. ${team2Elo}`}
															</p>
														</Box>
														<Stack
															direction="row"
															alignItems="center"
															justifyContent="center"
															spacing={3}
															className="text-xs font-bold mt-2"
														>
															<span className="text-chart-2">
																+
																{team2WinChange}
															</span>
															<span className="text-chart-3">
																{team2DrawChange >=
																0
																	? "+"
																	: ""}
																{
																	team2DrawChange
																}
															</span>
															<span className="text-chart-4">
																{
																	team2LoseChange
																}
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
												<span>Previous</span>
											</Stack>
										</Button>
										<Button
											variant="outline"
											onClick={handleNextClick}
											disabled={
												currentRound ===
													roundNumbers[
														roundNumbers.length - 1
													] &&
												!canSubmitRound &&
												!isCurrentRoundCompleted
											}
											className="flex-1 py-4 px-6 rounded-full font-bold text-base h-auto"
										>
											<Stack
												direction="row"
												alignItems="center"
												justifyContent="center"
												spacing={2}
											>
												<span>Next</span>
												<Icon
													icon="solar:arrow-right-linear"
													className="size-5"
												/>
											</Stack>
										</Button>
									</Stack>
								</Box>
							</div>
						</div>
					</div>
				</SidebarInset>
			</SidebarProvider>
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
