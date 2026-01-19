"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Box } from "@/components/ui/box";
import { Stack } from "@/components/ui/stack";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/lib/supabase/client";
import { formatElo } from "@/lib/elo/format";

type PlayerStat = {
	player_id: string;
	display_name: string;
	avatar: string | null;
	elo: number;
	matches_played: number;
	wins: number;
	losses: number;
	draws: number;
};

export function Top3PlayersWidget() {
	const router = useRouter();
	const [topPlayers, setTopPlayers] = useState<PlayerStat[]>([]);
	const [loading, setLoading] = useState(true);

	const CACHE_KEY = "top3players_cache";
	const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

	useEffect(() => {
		const fetchTopPlayers = async () => {
			try {
				setLoading(true);

				// Check cache first
				const cachedData = localStorage.getItem(CACHE_KEY);
				if (cachedData) {
					try {
						const { data, timestamp } = JSON.parse(cachedData);
						const now = Date.now();
						if (now - timestamp < CACHE_DURATION) {
							// Cache is still fresh
							setTopPlayers(data);
							setLoading(false);
							return;
						}
					} catch (e) {
						// Invalid cache, continue to fetch
						console.warn("Invalid cache data, fetching fresh data");
					}
				}

				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					setTopPlayers([]);
					return;
				}

				const response = await fetch("/api/statistics/top3", {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				});

				if (!response.ok) {
					setTopPlayers([]);
					return;
				}

				const data = await response.json();
				// Top 3 players (already sorted by Elo descending from API)
				const top3 = data.data || [];
				setTopPlayers(top3);

				// Cache the data
				localStorage.setItem(
					CACHE_KEY,
					JSON.stringify({
						data: top3,
						timestamp: Date.now(),
					})
				);
			} catch (error) {
				console.error("Error fetching top players:", error);
				setTopPlayers([]);
			} finally {
				setLoading(false);
			}
		};

		fetchTopPlayers();
	}, []);

	const second = topPlayers[1];
	const first = topPlayers[0];
	const third = topPlayers[2];

	return (
		<Box className="bg-card rounded-[24px] border border-border/50 shadow-sm relative overflow-hidden px-6 pt-4 pb-0 aspect-[7/5] flex flex-col">
			{/* Blurred primary background circle */}
			<Box className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-primary/20 blur-[60px] rounded-full pointer-events-none" />

			{/* Podium layout */}
			<Stack
				direction="row"
				alignItems="end"
				justifyContent="center"
				spacing={3}
				className="flex-1 pt-4 pb-0 relative z-10 min-h-[192px]"
			>
				{loading ? (
					<>
						{/* Loading skeleton - 2nd Place */}
						<Stack
							direction="column"
							alignItems="center"
							justifyContent="end"
							className="w-1/3 h-full"
						>
							<Box className="relative mb-3 flex-shrink-0">
								<Box className="w-[clamp(3rem,15%,4rem)] h-[clamp(3rem,15%,4rem)] aspect-square rounded-full p-0.5 bg-gradient-to-tr from-zinc-500 to-zinc-300 shadow-lg mx-auto animate-pulse">
									<Box className="size-full rounded-full bg-zinc-700/50 border-2 border-card" />
								</Box>
								<Box className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-zinc-700 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-card shadow-sm animate-pulse">
									#2
								</Box>
							</Box>
							<Box className="h-4 w-16 bg-zinc-700/50 rounded mb-1 animate-pulse" />
							<Box className="flex-[0.85] min-h-[4rem] w-full bg-gradient-to-b from-zinc-600/70 to-zinc-800/50 mt-1 rounded-t-lg border-t border-zinc-400/30 relative flex flex-col items-center justify-start pt-1.5 animate-pulse">
								<Box className="h-3 w-12 bg-zinc-700/50 rounded" />
							</Box>
						</Stack>

						{/* Loading skeleton - 1st Place */}
						<Stack
							direction="column"
							alignItems="center"
							justifyContent="end"
							className="w-1/3 -mt-4 z-20 h-full"
						>
							<Box className="relative mb-3 flex-shrink-0">
								<Box className="w-[clamp(4rem,20%,5rem)] h-[clamp(4rem,20%,5rem)] aspect-square rounded-full p-0.5 bg-gradient-to-tr from-yellow-500 via-amber-300 to-yellow-600 shadow-xl shadow-yellow-500/10 mx-auto animate-pulse">
									<Box className="size-full rounded-full bg-yellow-800/50 border-4 border-card" />
								</Box>
								<Box className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-yellow-500 text-black text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-card shadow-sm animate-pulse">
									#1
								</Box>
							</Box>
							<Box className="h-4 w-20 bg-yellow-800/50 rounded mb-1 animate-pulse" />
							<Box className="flex-[1] min-h-[6rem] w-full bg-gradient-to-b from-yellow-800/50 to-yellow-900/30 mt-1 rounded-t-lg border-t border-yellow-600/40 relative flex flex-col items-center justify-start pt-1.5 animate-pulse">
								<Box className="h-3 w-14 bg-yellow-800/50 rounded" />
							</Box>
						</Stack>

						{/* Loading skeleton - 3rd Place */}
						<Stack
							direction="column"
							alignItems="center"
							justifyContent="end"
							className="w-1/3 z-10 h-full"
						>
							<Box className="relative mb-3 flex-shrink-0">
								<Box className="w-[clamp(3rem,15%,4rem)] h-[clamp(3rem,15%,4rem)] aspect-square rounded-full p-0.5 bg-gradient-to-tr from-orange-700 to-amber-700 shadow-lg mx-auto animate-pulse">
									<Box className="size-full rounded-full bg-orange-800/50 border-2 border-card" />
								</Box>
								<Box className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-amber-800 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-card shadow-sm animate-pulse">
									#3
								</Box>
							</Box>
							<Box className="h-4 w-16 bg-orange-800/50 rounded mb-1 animate-pulse" />
							<Box className="flex-[0.7] min-h-[3rem] w-full bg-gradient-to-b from-orange-800/60 to-orange-900/40 mt-1 rounded-t-lg border-t border-orange-700/40 relative flex flex-col items-center justify-start pt-1.5 animate-pulse">
								<Box className="h-3 w-12 bg-orange-800/50 rounded" />
							</Box>
						</Stack>
					</>
				) : (
					<>
						{/* 2nd Place */}
						{second && (
							<Stack
								direction="column"
								alignItems="center"
								justifyContent="end"
								className="w-1/3 h-full cursor-pointer hover:opacity-80 transition-opacity"
								onClick={() => router.push(`/player/${second.player_id}`)}
							>
								<Box className="relative mb-3 flex-shrink-0">
									<Box className="w-[clamp(3rem,15%,4rem)] h-[clamp(3rem,15%,4rem)] aspect-square rounded-full p-0.5 bg-gradient-to-tr from-zinc-500 to-zinc-300 shadow-lg mx-auto">
										<Avatar className="size-full aspect-square rounded-full border-2 border-card">
											<AvatarImage
												src={second.avatar || undefined}
												alt={second.display_name}
											/>
											<AvatarFallback>
												{second.display_name.charAt(0).toUpperCase()}
											</AvatarFallback>
										</Avatar>
									</Box>
									<Box className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-zinc-700 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-card shadow-sm">
										#2
									</Box>
								</Box>
								<p className="text-sm font-semibold text-center mb-1">
									{second.display_name}
								</p>
								{/* Podium bar - flexible height based on available space */}
								<Box className="flex-[0.85] min-h-[4rem] w-full bg-gradient-to-b from-zinc-600/70 to-zinc-800/50 mt-1 rounded-t-lg border-t border-zinc-400/30 relative flex flex-col items-center justify-start pt-1.5">
									<p className="text-xs text-muted-foreground font-mono text-center">
										{formatElo(second.elo, true)}
									</p>
								</Box>
							</Stack>
						)}

						{/* 1st Place */}
						{first && (
							<Stack
								direction="column"
								alignItems="center"
								justifyContent="end"
								className="w-1/3 -mt-4 z-20 h-full cursor-pointer hover:opacity-80 transition-opacity"
								onClick={() => router.push(`/player/${first.player_id}`)}
							>
								<Box className="relative mb-3 flex-shrink-0">
									<Box className="w-[clamp(4rem,20%,5rem)] h-[clamp(4rem,20%,5rem)] aspect-square rounded-full p-0.5 bg-gradient-to-tr from-yellow-500 via-amber-300 to-yellow-600 shadow-xl shadow-yellow-500/10 mx-auto">
										<Avatar className="size-full aspect-square rounded-full border-4 border-card">
											<AvatarImage
												src={first.avatar || undefined}
												alt={first.display_name}
											/>
											<AvatarFallback className="text-lg">
												{first.display_name.charAt(0).toUpperCase()}
											</AvatarFallback>
										</Avatar>
									</Box>
									<Box className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-yellow-500 text-black text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-card shadow-sm">
										#1
									</Box>
								</Box>
								<p className="text-sm font-semibold text-center mb-1">
									{first.display_name}
								</p>
								{/* Podium bar - flexible height, tallest */}
								<Box className="flex-[1] min-h-[6rem] w-full bg-gradient-to-b from-yellow-800/50 to-yellow-900/30 mt-1 rounded-t-lg border-t border-yellow-600/40 relative flex flex-col items-center justify-start pt-1.5">
									<p className="text-xs text-yellow-500 font-mono font-bold text-center">
										{formatElo(first.elo, true)}
									</p>
								</Box>
							</Stack>
						)}

						{/* 3rd Place */}
						{third && (
							<Stack
								direction="column"
								alignItems="center"
								justifyContent="end"
								className="w-1/3 z-10 h-full cursor-pointer hover:opacity-80 transition-opacity"
								onClick={() => router.push(`/player/${third.player_id}`)}
							>
								<Box className="relative mb-3 flex-shrink-0">
									<Box className="w-[clamp(3rem,15%,4rem)] h-[clamp(3rem,15%,4rem)] aspect-square rounded-full p-0.5 bg-gradient-to-tr from-orange-700 to-amber-700 shadow-lg mx-auto">
										<Avatar className="size-full aspect-square rounded-full border-2 border-card">
											<AvatarImage
												src={third.avatar || undefined}
												alt={third.display_name}
											/>
											<AvatarFallback>
												{third.display_name.charAt(0).toUpperCase()}
											</AvatarFallback>
										</Avatar>
									</Box>
									<Box className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-amber-800 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-card shadow-sm">
										#3
									</Box>
								</Box>
								<p className="text-sm font-semibold text-center mb-1">
									{third.display_name}
								</p>
								{/* Podium bar - flexible height, shortest */}
								<Box className="flex-[0.7] min-h-[3rem] w-full bg-gradient-to-b from-orange-800/60 to-orange-900/40 mt-1 rounded-t-lg border-t border-orange-700/40 relative flex flex-col items-center justify-start pt-1.5">
									<p className="text-xs text-muted-foreground font-mono text-center">
										{formatElo(third.elo, true)}
									</p>
								</Box>
							</Stack>
						)}
					</>
				)}
			</Stack>
		</Box>
	);
}
