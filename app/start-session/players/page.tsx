"use client";

import { useState, useEffect, useMemo } from "react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserNameCard } from "@/components/ui/user-name-card";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";

type User = {
	id: string;
	name: string;
	avatar: string | null;
	email: string;
};

function SelectPlayersPageContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const playerCount = parseInt(searchParams.get("count") || "0", 10);

	const [users, setUsers] = useState<User[]>([]);
	const [loadingUsers, setLoadingUsers] = useState(true);
	const [selectedPlayers, setSelectedPlayers] = useState<User[]>([]);

	// Fetch users
	useEffect(() => {
		const fetchUsers = async () => {
			try {
				setLoadingUsers(true);

				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					return;
				}

				const response = await fetch("/api/admin/users", {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				});

				if (!response.ok) {
					console.error("Failed to fetch users");
					return;
				}

				const data = await response.json();
				setUsers(data.users || []);
			} catch (err) {
				console.error("Error fetching users:", err);
			} finally {
				setLoadingUsers(false);
			}
		};

		fetchUsers();
	}, []);

	// Redirect if invalid playerCount
	useEffect(() => {
		if (!playerCount || playerCount < 3 || playerCount > 6) {
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

	return (
		<SidebarProvider>
			<AppSidebar variant="inset" />
			<SidebarInset>
				<SiteHeader title={t.startSession.selectPlayers.title} />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
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
							<Box className="mb-8">
								{loadingUsers ? (
									<Box className="flex items-center justify-center py-8">
										<p className="text-muted-foreground">Učitavanje igrača...</p>
									</Box>
								) : (
									<Box className="flex overflow-x-auto gap-4 pb-4 scrollbar-hide">
										{users
											.filter((user) => !isSelected(user.id))
											.map((user) => {
												return (
													<Box
														key={user.id}
														component="button"
														onClick={() => handlePlayerSelect(user)}
														disabled={selectedPlayers.length >= maxSelections}
														className="flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
													>
														<UserNameCard
															name={user.name}
															avatar={user.avatar}
															id={user.id}
															size="lg"
															variant="vertical"
															avatarBorder="transparent"
															className="[&_span]:text-muted-foreground"
														/>
													</Box>
												);
											})}
									</Box>
								)}
							</Box>

							{/* Singles Mode */}
							{!isDoubles && (
								<Box>
									<Stack
										direction="row"
										alignItems="center"
										justifyContent="between"
										className="px-1 mb-4"
									>
										<h3 className="text-lg font-bold text-foreground">
											{t.startSession.selectPlayers.selectedPlayers}
										</h3>
										<Box className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
											{selectedPlayers.length} / {maxSelections}
										</Box>
									</Stack>
									<Stack direction="column" spacing={3}>
										{Array.from({ length: maxSelections }).map((_, index) => {
											const player = selectedPlayers[index];
											return (
												<Box
													key={index}
													className={cn(
														"rounded-[20px] p-3 border flex items-center justify-between",
														player
															? "bg-card border-border/50"
															: "border-dashed border-border opacity-50"
													)}
												>
													<Stack direction="row" alignItems="center" spacing={4}>
														<Box
															className={cn(
																"size-10 rounded-full flex items-center justify-center font-bold text-sm",
																player
																	? "bg-primary/10 text-primary"
																	: "bg-muted text-muted-foreground border border-border"
															)}
														>
															{index + 1}
														</Box>
														{player ? (
															<Stack direction="row" alignItems="center" spacing={3}>
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
																	<p className="font-semibold text-sm">{player.name}</p>
																	<p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
																		Level 4.5
																	</p>
																</Box>
															</Stack>
														) : (
															<Stack direction="row" alignItems="center" spacing={3}>
																<Box className="size-10 rounded-full bg-muted border border-border flex items-center justify-center">
																	<Icon
																		icon="solar:user-bold"
																		className="size-5 text-muted-foreground/50"
																	/>
																</Box>
																<p className="text-sm font-medium text-muted-foreground">
																	{t.startSession.selectPlayers.selectPlayer}
																</p>
															</Stack>
														)}
													</Stack>
													{player && (
														<Box
															component="button"
															onClick={() => handlePlayerRemove(player.id)}
															className="p-2 text-muted-foreground active:text-destructive"
														>
															<Icon icon="solar:close-circle-bold" className="size-5" />
														</Box>
													)}
												</Box>
											);
										})}
									</Stack>
									<Box className="mt-6 bg-secondary/30 rounded-2xl p-4 border border-border/30">
										<Stack direction="row" alignItems="start" spacing={3}>
											<Icon
												icon="solar:info-circle-bold"
												className="size-5 text-primary shrink-0 mt-0.5"
											/>
											<p className="text-sm text-muted-foreground leading-relaxed">
												{t.startSession.selectPlayers.singlesInfo.replace(
													"{count}",
													playerCount.toString()
												)}
											</p>
										</Stack>
									</Box>
								</Box>
							)}

							{/* Doubles Mode */}
							{isDoubles && teams && (
								<Box>
									<Stack
										direction="row"
										alignItems="center"
										justifyContent="between"
										className="px-1 mb-4"
									>
										<h3 className="text-lg font-bold text-foreground">
											{t.startSession.selectPlayers.teams}
										</h3>
										<Box className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
											{selectedPlayers.length} / {maxSelections}
										</Box>
									</Stack>
									<Stack direction="column" spacing={4}>
										{teams.map((team, teamIndex) => {
											const teamNames = [
												t.startSession.selectPlayers.teamA,
												t.startSession.selectPlayers.teamB,
												t.startSession.selectPlayers.teamC,
											];
											const isFull = team.length === 2;

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
														<Box
															className={cn(
																"text-xs font-bold px-2 py-0.5 rounded-md",
																teamIndex === 0 && "text-chart-1 bg-chart-1/10",
																teamIndex === 1 && "text-chart-2 bg-chart-2/10",
																teamIndex === 2 && "text-chart-3 bg-chart-3/10"
															)}
														>
															{team.length} / 2
														</Box>
													</Stack>
													<Stack direction="row" spacing={3}>
														{Array.from({ length: 2 }).map((_, slotIndex) => {
															const player = team[slotIndex];
															return (
																<Box
																	key={slotIndex}
																	className="flex-1 bg-secondary/30 rounded-2xl p-3 border border-border/30 flex items-center gap-3"
																>
																	{player ? (
																		<>
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
																				<p className="font-semibold text-sm">{player.name}</p>
																				<p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
																					Level 4.5
																				</p>
																			</Box>
																		</>
																	) : (
																		<>
																			<Box className="size-10 rounded-full bg-muted border border-border flex items-center justify-center">
																				<Icon
																					icon="solar:user-bold"
																					className="size-5 text-muted-foreground/50"
																				/>
																			</Box>
																			<p className="text-sm font-medium text-muted-foreground">
																				{t.startSession.selectPlayers.selectPlayer}
																			</p>
																		</>
																	)}
																</Box>
															);
														})}
													</Stack>
												</Box>
											);
										})}
									</Stack>
									<Box className="mt-6 bg-secondary/30 rounded-2xl p-4 border border-border/30">
										<Stack direction="row" alignItems="start" spacing={3}>
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
							<Box className="pt-4">
								<Stack direction="row" spacing={3}>
									<Button
										variant="outline"
										onClick={() => router.push("/start-session")}
										className="flex-1 py-4 px-6 rounded-full font-bold text-lg shadow-lg h-auto"
									>
										<Stack
											direction="row"
											alignItems="center"
											justifyContent="center"
											spacing={2}
										>
											<Icon icon="solar:arrow-left-linear" className="size-5" />
											<span>{t.startSession.back}</span>
										</Stack>
									</Button>
									<Button
										disabled={!isComplete}
										onClick={() => {
											if (isComplete) {
												// Store selected players in sessionStorage
												sessionStorage.setItem(
													"selectedPlayers",
													JSON.stringify(selectedPlayers)
												);
												router.push(`/start-session/schedule?count=${playerCount}`);
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
											<span>{t.startSession.continue}</span>
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

export default function SelectPlayersPage() {
	return (
		<AuthGuard>
			<SelectPlayersPageContent />
		</AuthGuard>
	);
}

