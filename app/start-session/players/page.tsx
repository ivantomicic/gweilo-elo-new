"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PlayerNameCard } from "@/components/ui/player-name-card";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";

type User = {
	id: string;
	name: string;
	avatar: string | null;
	email: string;
	elo?: number;
	matchesPlayed?: number;
};

function SelectPlayersPageContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const playerCount = parseInt(searchParams.get("count") || "0", 10);

	const [users, setUsers] = useState<User[]>([]);
	const [loadingUsers, setLoadingUsers] = useState(true);
	const [selectedPlayers, setSelectedPlayers] = useState<User[]>([]);
	const [isStartingSession, setIsStartingSession] = useState(false);
	
	// Scroll indicators state
	const scrollRef = useRef<HTMLDivElement>(null);
	const [canScrollLeft, setCanScrollLeft] = useState(false);
	const [canScrollRight, setCanScrollRight] = useState(false);

	const updateScrollIndicators = useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		
		setCanScrollLeft(el.scrollLeft > 0);
		setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
	}, []);

	useEffect(() => {
		updateScrollIndicators();
		window.addEventListener('resize', updateScrollIndicators);
		return () => window.removeEventListener('resize', updateScrollIndicators);
	}, [updateScrollIndicators, users, selectedPlayers]);

	// Fetch users and their Elo ratings
	useEffect(() => {
		const fetchUsersAndRatings = async () => {
			try {
				setLoadingUsers(true);

				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					return;
				}

				// Fetch users from API and player_ratings directly from Supabase
				const [usersResponse, ratingsResult] = await Promise.all([
					fetch("/api/admin/users", {
						headers: {
							Authorization: `Bearer ${session.access_token}`,
						},
					}),
					supabase
						.from("player_ratings")
						.select("player_id, elo, matches_played"),
				]);

				if (!usersResponse.ok) {
					console.error("Failed to fetch users");
					return;
				}

				const usersData = await usersResponse.json();

				// Create maps from player_ratings
				const ratingsMap = new Map<
					string,
					{ elo: number; matchesPlayed: number }
				>();
				if (ratingsResult.data) {
					ratingsResult.data.forEach(
						(rating: {
							player_id: string;
							elo: number;
							matches_played: number;
						}) => {
							ratingsMap.set(rating.player_id, {
								elo: rating.elo,
								matchesPlayed: rating.matches_played || 0,
							});
						},
					);
				}

				// Merge ratings into users and sort by matches played (most first)
				const usersWithRatings = (usersData.users || [])
					.map((user: User) => ({
						...user,
						elo: ratingsMap.get(user.id)?.elo,
						matchesPlayed:
							ratingsMap.get(user.id)?.matchesPlayed || 0,
					}))
					.sort(
						(a: User, b: User) =>
							(b.matchesPlayed || 0) - (a.matchesPlayed || 0),
					);

				setUsers(usersWithRatings);
			} catch (err) {
				console.error("Error fetching users:", err);
			} finally {
				setLoadingUsers(false);
			}
		};

		fetchUsersAndRatings();
	}, []);

	// Redirect if invalid playerCount
	useEffect(() => {
		if (!playerCount || playerCount < 2 || playerCount > 6) {
			router.push("/start-session");
		}
	}, [playerCount, router]);

	const isDoubles = playerCount === 6;
	const maxSelections = playerCount;

	// Compute teams for doubles mode
	const teams = useMemo(() => {
		if (!isDoubles) return null;
		return [
			selectedPlayers.slice(0, 2),
			selectedPlayers.slice(2, 4),
			selectedPlayers.slice(4, 6),
		];
	}, [selectedPlayers, isDoubles]);

	const handlePlayerSelect = (player: User) => {
		// Check if already selected
		if (selectedPlayers.some((p) => p.id === player.id)) {
			return;
		}

		// Check if max selections reached
		if (selectedPlayers.length >= maxSelections) {
			return;
		}

		setSelectedPlayers([...selectedPlayers, player]);
	};

	const handlePlayerRemove = (playerId: string) => {
		setSelectedPlayers(selectedPlayers.filter((p) => p.id !== playerId));
	};

	const isSelected = (playerId: string) => {
		return selectedPlayers.some((p) => p.id === playerId);
	};

	const isComplete = selectedPlayers.length === maxSelections;
	const isTwoPlayerSession = playerCount === 2;

	const handleStartTwoPlayerSession = async () => {
		if (!isTwoPlayerSession || !isComplete) return;
		try {
			setIsStartingSession(true);
			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				console.error("Not authenticated");
				return;
			}

			const sessionDateTime =
				typeof window !== "undefined"
					? sessionStorage.getItem("sessionDateTime")
					: null;

			const playersPayload = selectedPlayers.map((player) => ({
				id: player.id,
				name: player.name,
				avatar: player.avatar,
			}));

			const rounds = [
				{
					id: "1",
					roundNumber: 1,
					matches: [
						{
							type: "singles",
							players: [playersPayload[0], playersPayload[1]],
						},
					],
				},
			];

			const response = await fetch("/api/sessions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${session.access_token}`,
				},
				body: JSON.stringify({
					playerCount,
					players: playersPayload,
					rounds,
					createdAt: sessionDateTime || undefined,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				console.error("Failed to create session:", data.error);
				return;
			}

			const data = await response.json();
			router.push(`/session/${data.sessionId}`);
		} catch (error) {
			console.error("Error starting session:", error);
		} finally {
			setIsStartingSession(false);
		}
	};

	return (
		<SidebarProvider>
			<AppSidebar variant="inset" />
			<SidebarInset className="overflow-x-hidden">
				<SiteHeader title={t.startSession.selectPlayers.title} />
				<div className="flex flex-1 flex-col min-w-0">
					<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav min-w-0">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6 min-w-0">
							{/* Step Indicator */}
							<Box className="flex justify-end">
								<Box className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full uppercase tracking-wider">
									{t.startSession.selectPlayers.stepIndicator}
								</Box>
							</Box>

							{/* Subtitle */}
							<p className="text-muted-foreground">
								{t.startSession.selectPlayers.subtitle}
							</p>

							{/* Player Picker Bar */}
							<div className="mb-8 w-full max-w-full relative">
								{loadingUsers ? (
									<Box className="flex items-center justify-center py-8">
										<p className="text-muted-foreground">
											Učitavanje igrača...
										</p>
									</Box>
								) : (
									<>
										{/* Left fade mask */}
										<div 
											className={cn(
												"absolute left-0 top-0 bottom-4 w-16 bg-gradient-to-r from-background via-background/60 to-transparent z-10 pointer-events-none transition-opacity duration-200",
												canScrollLeft ? "opacity-100" : "opacity-0"
											)}
										/>
										{/* Right fade mask */}
										<div 
											className={cn(
												"absolute right-0 top-0 bottom-4 w-16 bg-gradient-to-l from-background via-background/60 to-transparent z-10 pointer-events-none transition-opacity duration-200",
												canScrollRight ? "opacity-100" : "opacity-0"
											)}
										/>
										<div 
											ref={scrollRef}
											onScroll={updateScrollIndicators}
											className="w-full overflow-x-auto scrollbar-hide"
										>
											<div className="flex gap-4 pb-4 w-max">
												<AnimatePresence>
													{users
														.filter(
															(user) => !isSelected(user.id)
														)
														.map((user) => {
															const isDisabled =
																selectedPlayers.length >= maxSelections;
															return (
																<motion.button
																	key={user.id}
																	initial={{ opacity: 0, scale: 0.8 }}
																	animate={{ opacity: 1, scale: 1 }}
																	exit={{ opacity: 0, scale: 0.8 }}
																	transition={{ duration: 0.2 }}
																	onClick={() => {
																		if (!isDisabled) {
																			handlePlayerSelect(user);
																		}
																	}}
																	className={cn(
																		"flex-shrink-0",
																		isDisabled && "opacity-50 cursor-not-allowed"
																	)}
																	whileTap={{ scale: 0.95 }}
																>
																	<PlayerNameCard
																		name={user.name}
																		avatar={user.avatar}
																		id={user.id}
																		size="lg"
																		variant="vertical"
																		avatarBorder="transparent"
																		className="[&_span]:text-muted-foreground"
																	/>
																</motion.button>
															);
														})}
												</AnimatePresence>
											</div>
										</div>
									</>
								)}
							</div>

							{/* Singles Mode */}
							{!isDoubles && (
								<Box className="overflow-hidden">
									<Stack
										direction="row"
										alignItems="center"
										justifyContent="between"
										className="px-1 mb-4"
									>
										<h3 className="text-lg font-bold text-foreground">
											{
												t.startSession.selectPlayers
													.selectedPlayers
											}
										</h3>
										<motion.div
											key={selectedPlayers.length}
											initial={{ scale: 1.2 }}
											animate={{ scale: 1 }}
											className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md"
										>
											{selectedPlayers.length} /{" "}
											{maxSelections}
										</motion.div>
									</Stack>
									<Stack direction="column" spacing={3}>
										{Array.from({
											length: maxSelections,
										}).map((_, index) => {
											const player =
												selectedPlayers[index];
											return (
												<motion.div
													key={index}
													layout
													initial={false}
													animate={{
														backgroundColor: player
															? "hsl(var(--card))"
															: "transparent",
														borderStyle: player
															? "solid"
															: "dashed",
														opacity: player
															? 1
															: 0.5,
													}}
													transition={{
														type: "spring",
														stiffness: 500,
														damping: 30,
													}}
													className={cn(
														"rounded-[20px] p-3 border border-border/50 flex items-center justify-between",
													)}
												>
													<Stack
														direction="row"
														alignItems="center"
														spacing={4}
													>
														<AnimatePresence mode="wait">
															{player ? (
																<motion.div
																	key={player.id}
																	initial={{ opacity: 0, x: -20 }}
																	animate={{ opacity: 1, x: 0 }}
																	exit={{ opacity: 0, x: 20 }}
																	transition={{
																		type: "spring",
																		stiffness: 500,
																		damping: 30,
																	}}
																>
																	<Stack
																		direction="row"
																		alignItems="center"
																		spacing={3}
																	>
																		<Avatar className="size-10">
																			<AvatarImage
																				src={player.avatar || undefined}
																				alt={player.name}
																			/>
																			<AvatarFallback>
																				{player.name.charAt(0).toUpperCase()}
																			</AvatarFallback>
																		</Avatar>
																		<Box>
																			<p className="font-semibold text-sm">
																				{player.name}
																			</p>
																			{player.elo && (
																				<p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
																					Elo {player.elo}
																				</p>
																			)}
																		</Box>
																	</Stack>
																</motion.div>
															) : (
																<motion.div
																	key="empty"
																	initial={{ opacity: 0 }}
																	animate={{ opacity: 1 }}
																	exit={{ opacity: 0 }}
																	transition={{ duration: 0.15 }}
																>
																	<Stack
																		direction="row"
																		alignItems="center"
																		spacing={3}
																	>
																		<Box className="size-10 rounded-full bg-muted border border-border flex items-center justify-center font-bold text-sm text-muted-foreground">
																			{index + 1}
																		</Box>
																		<p className="text-sm font-medium text-muted-foreground">
																			{t.startSession.selectPlayers.selectPlayer}
																		</p>
																	</Stack>
																</motion.div>
															)}
														</AnimatePresence>
													</Stack>
													<AnimatePresence>
														{player && (
															<motion.button
																initial={{
																	opacity: 0,
																	scale: 0.8,
																}}
																animate={{
																	opacity: 1,
																	scale: 1,
																}}
																exit={{
																	opacity: 0,
																	scale: 0.8,
																}}
																transition={{
																	duration: 0.15,
																}}
																onClick={() =>
																	handlePlayerRemove(
																		player.id,
																	)
																}
																className="p-2 text-muted-foreground active:text-destructive"
																whileTap={{
																	scale: 0.9,
																}}
															>
																<Icon
																	icon="solar:close-circle-bold"
																	className="size-5"
																/>
															</motion.button>
														)}
													</AnimatePresence>
												</motion.div>
											);
										})}
									</Stack>
									<Box className="mt-6 bg-secondary/30 rounded-2xl p-4 border border-border/30">
										<Stack
											direction="row"
											alignItems="start"
											spacing={3}
										>
											<Icon
												icon="solar:info-circle-bold"
												className="size-5 text-primary shrink-0 mt-0.5"
											/>
											<p className="text-sm text-muted-foreground leading-relaxed">
												{t.startSession.selectPlayers.singlesInfo.replace(
													"{count}",
													playerCount.toString(),
												)}
											</p>
										</Stack>
									</Box>
								</Box>
							)}

							{/* Doubles Mode */}
							{isDoubles && teams && (
								<Box className="overflow-hidden">
									<Stack
										direction="row"
										alignItems="center"
										justifyContent="between"
										className="px-1 mb-4"
									>
										<h3 className="text-lg font-bold text-foreground">
											{t.startSession.selectPlayers.teams}
										</h3>
										<motion.div
											key={selectedPlayers.length}
											initial={{ scale: 1.2 }}
											animate={{ scale: 1 }}
											className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md"
										>
											{selectedPlayers.length} /{" "}
											{maxSelections}
										</motion.div>
									</Stack>
									<Stack direction="column" spacing={4}>
										{teams.map((team, teamIndex) => {
											const teamNames = [
												t.startSession.selectPlayers.teamA,
												t.startSession.selectPlayers.teamB,
												t.startSession.selectPlayers.teamC,
											];

											return (
												<Box
													key={teamIndex}
													className="bg-card rounded-[20px] p-4 border border-border/50"
												>
													<Stack
														direction="row"
														alignItems="center"
														justifyContent="between"
														className="mb-3"
													>
														<h4 className="text-sm font-bold text-foreground">
															{teamNames[teamIndex]}
														</h4>
														<motion.div
															key={team.length}
															initial={{ scale: 1.2 }}
															animate={{ scale: 1 }}
															className={cn(
																"text-xs font-bold px-2 py-0.5 rounded-md",
																teamIndex === 0 && "text-chart-1 bg-chart-1/10",
																teamIndex === 1 && "text-chart-2 bg-chart-2/10",
																teamIndex === 2 && "text-chart-3 bg-chart-3/10",
															)}
														>
															{team.length} / 2
														</motion.div>
													</Stack>
													<Stack direction="row" spacing={3}>
														{Array.from({ length: 2 }).map((_, slotIndex) => {
															const player = team[slotIndex];
															return (
																<motion.div
																	key={slotIndex}
																	layout
																	initial={false}
																	animate={{
																		backgroundColor: player 
																			? "hsl(var(--secondary) / 0.3)" 
																			: "hsl(var(--secondary) / 0.15)",
																	}}
																	transition={{
																		type: "spring",
																		stiffness: 500,
																		damping: 30,
																	}}
																	className="flex-1 rounded-2xl p-3 border border-border/30 flex items-center justify-between overflow-hidden"
																>
																	<AnimatePresence mode="wait">
																		{player ? (
																			<motion.div
																				key={player.id}
																				initial={{ opacity: 0, x: -20 }}
																				animate={{ opacity: 1, x: 0 }}
																				exit={{ opacity: 0, x: 20 }}
																				transition={{
																					type: "spring",
																					stiffness: 500,
																					damping: 30,
																				}}
																				className="flex items-center gap-3"
																			>
																				<Avatar className="size-10">
																					<AvatarImage
																						src={player.avatar || undefined}
																						alt={player.name}
																					/>
																					<AvatarFallback>
																						{player.name.charAt(0).toUpperCase()}
																					</AvatarFallback>
																				</Avatar>
																				<Box>
																					<p className="font-semibold text-sm">
																						{player.name}
																					</p>
																					{player.elo && (
																						<p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
																							Elo {player.elo}
																						</p>
																					)}
																				</Box>
																			</motion.div>
																		) : (
																			<motion.div
																				key="empty"
																				initial={{ opacity: 0 }}
																				animate={{ opacity: 1 }}
																				exit={{ opacity: 0 }}
																				transition={{ duration: 0.15 }}
																				className="flex items-center gap-3"
																			>
																				<Box className="size-10 rounded-full bg-muted border border-border flex items-center justify-center">
																					<Icon
																						icon="solar:user-bold"
																						className="size-5 text-muted-foreground/50"
																					/>
																				</Box>
																				<p className="text-sm font-medium text-muted-foreground">
																					{t.startSession.selectPlayers.selectPlayer}
																				</p>
																			</motion.div>
																		)}
																	</AnimatePresence>
																	<AnimatePresence>
																		{player && (
																			<motion.button
																				initial={{ opacity: 0, scale: 0.8 }}
																				animate={{ opacity: 1, scale: 1 }}
																				exit={{ opacity: 0, scale: 0.8 }}
																				transition={{ duration: 0.15 }}
																				onClick={() => handlePlayerRemove(player.id)}
																				className="p-2 text-muted-foreground active:text-destructive"
																				whileTap={{ scale: 0.9 }}
																			>
																				<Icon
																					icon="solar:close-circle-bold"
																					className="size-5"
																				/>
																			</motion.button>
																		)}
																	</AnimatePresence>
																</motion.div>
															);
														})}
													</Stack>
												</Box>
											);
										})}
									</Stack>
									<Box className="mt-6 bg-secondary/30 rounded-2xl p-4 border border-border/30">
										<Stack
											direction="row"
											alignItems="start"
											spacing={3}
										>
											<Icon
												icon="solar:info-circle-bold"
												className="size-5 text-primary shrink-0 mt-0.5"
											/>
											<p className="text-sm text-muted-foreground leading-relaxed">
												{t.startSession.selectPlayers.doublesInfo}
											</p>
										</Stack>
									</Box>
								</Box>
							)}

							{/* Back and Continue Buttons */}
							<Box className="pt-4 overflow-hidden">
								<Stack
									direction="row"
									spacing={3}
									className="min-w-0"
								>
									<Button
										variant="outline"
										onClick={() =>
											router.push("/start-session")
										}
										className="flex-1 py-4 px-6 rounded-full font-bold text-lg shadow-lg h-auto"
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
											<span>{t.startSession.back}</span>
										</Stack>
									</Button>
									<Button
										disabled={!isComplete}
										onClick={() => {
											if (isComplete) {
												if (isTwoPlayerSession) {
													handleStartTwoPlayerSession();
													return;
												}

												// Store selected players in sessionStorage
												sessionStorage.setItem(
													"selectedPlayers",
													JSON.stringify(
														selectedPlayers,
													),
												);
												router.push(
													`/start-session/schedule?count=${playerCount}`,
												);
											}
										}}
										className="flex-1 py-4 px-6 rounded-full font-bold text-lg shadow-lg h-auto"
									>
										<Stack
											direction="row"
											alignItems="center"
											justifyContent="center"
											spacing={2}
										>
											<span>
												{isTwoPlayerSession && isStartingSession
													? "Kreiranje..."
													: t.startSession.continue}
											</span>
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
	);
}

export default function SelectPlayersPage() {
	return (
		<AuthGuard>
			<SelectPlayersPageContent />
		</AuthGuard>
	);
}
