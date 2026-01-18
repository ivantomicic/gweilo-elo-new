"use client";

import { useEffect, useState } from "react";
import { Box } from "@/components/ui/box";
import { Stack } from "@/components/ui/stack";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PlayerNameCard } from "@/components/ui/player-name-card";
import { Loading } from "@/components/ui/loading";
import { supabase } from "@/lib/supabase/client";
import { formatElo } from "@/lib/elo/format";
import { t } from "@/lib/i18n";

type HeadToHeadData = {
	player1: {
		id: string;
		display_name: string;
		avatar: string | null;
		elo: number;
		wins: number;
		losses: number;
		draws: number;
		setsWon: number;
		setsLost: number;
	};
	player2: {
		id: string;
		display_name: string;
		avatar: string | null;
		elo: number;
		wins: number;
		losses: number;
		draws: number;
		setsWon: number;
		setsLost: number;
	};
	totalMatches: number;
};

type PlayerComparisonProps = {
	viewedPlayerId: string;
	currentUserId: string;
};

export function PlayerComparison({
	viewedPlayerId,
	currentUserId,
}: PlayerComparisonProps) {
	const [data, setData] = useState<HeadToHeadData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchComparison = async () => {
			try {
				setLoading(true);
				setError(null);

				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					setError(t.playerComparison.error);
					return;
				}

				const response = await fetch(
					`/api/player/${viewedPlayerId}/head-to-head?opponentId=${currentUserId}`,
					{
						headers: {
							Authorization: `Bearer ${session.access_token}`,
						},
					}
				);

				if (!response.ok) {
					if (response.status === 404) {
						setError("Players not found");
					} else {
						setError(t.playerComparison.error);
					}
					return;
				}

				const comparisonData = await response.json();
				setData(comparisonData);
			} catch (err) {
				console.error("Error fetching comparison:", err);
				setError(t.playerComparison.error);
			} finally {
				setLoading(false);
			}
		};

		if (viewedPlayerId && currentUserId && viewedPlayerId !== currentUserId) {
			fetchComparison();
		} else {
			setLoading(false);
		}
	}, [viewedPlayerId, currentUserId]);

	// Don't show if viewing own profile
	if (viewedPlayerId === currentUserId) {
		return null;
	}

	if (loading) {
		return (
			<Card className="bg-card border-border/50">
				<CardContent className="pt-6">
					<Loading label={t.playerComparison.loading} />
				</CardContent>
			</Card>
		);
	}

	if (error || !data) {
		return (
			<Card className="bg-card border-border/50">
				<CardContent className="pt-6">
					<p className="text-sm text-destructive">
						{error || t.playerComparison.error}
					</p>
				</CardContent>
			</Card>
		);
	}

	const { player1, player2, totalMatches } = data;
	const eloDifference = Math.abs(player1.elo - player2.elo);
	const higherEloPlayer = player1.elo >= player2.elo ? player1 : player2;

	return (
		<Card className="bg-card border-border/50">
			<CardContent className="pt-4 md:pt-6 px-4 md:px-6">
				{/* Mobile: Vertical Stack */}
				<Stack
					direction="column"
					alignItems="center"
					spacing={4}
					className="w-full md:hidden"
				>
					{/* Players Row */}
					<Stack
						direction="row"
						alignItems="center"
						justifyContent="center"
						spacing={3}
						className="w-full"
					>
						<PlayerNameCard
							name={player1.display_name}
							avatar={player1.avatar}
							size="md"
							variant="vertical"
							avatarBorder="primary"
						/>
						<Box className="px-2 py-0.5 bg-primary/5 rounded-full border border-primary/10">
							<p className="text-[9px] font-medium text-primary/70 uppercase tracking-widest">
								{t.playerComparison.vs}
							</p>
						</Box>
						<PlayerNameCard
							name={player2.display_name}
							avatar={player2.avatar}
							size="md"
							variant="vertical"
							avatarBorder="transparent"
						/>
					</Stack>

					{/* Stats */}
					{totalMatches > 0 ? (
						<Stack
							direction="column"
							alignItems="center"
							spacing={3}
							className="w-full"
						>
							<Stack
								direction="column"
								alignItems="center"
								spacing={0.5}
							>
								<p className="text-base font-bold font-mono">
									<span className={player1.elo >= player2.elo ? "text-green-500" : "text-red-500"}>
										{formatElo(player1.elo, true)}
									</span>
									{" "}-{" "}
									<span className={player2.elo >= player1.elo ? "text-green-500" : "text-red-500"}>
										{formatElo(player2.elo, true)}
									</span>
								</p>
								<p className="text-[9px] text-muted-foreground/70 uppercase tracking-wider">
									{t.playerComparison.elo}
								</p>
							</Stack>
							<Stack
								direction="column"
								alignItems="center"
								spacing={0.5}
							>
								<p className="text-base font-bold font-mono">
									<span className={player1.wins >= player2.wins ? "text-green-500" : "text-red-500"}>
										{player1.wins}
									</span>
									{" "}-{" "}
									<span className={player2.wins >= player1.wins ? "text-green-500" : "text-red-500"}>
										{player2.wins}
									</span>
								</p>
								<p className="text-[9px] text-muted-foreground/70 uppercase tracking-wider">
									{t.playerComparison.matches}
								</p>
							</Stack>
							<Stack
								direction="column"
								alignItems="center"
								spacing={0.5}
							>
								<p className="text-base font-bold font-mono">
									<span className={player1.setsWon >= player2.setsWon ? "text-green-500" : "text-red-500"}>
										{player1.setsWon}
									</span>
									{" "}-{" "}
									<span className={player2.setsWon >= player1.setsWon ? "text-green-500" : "text-red-500"}>
										{player2.setsWon}
									</span>
								</p>
								<p className="text-[9px] text-muted-foreground/70 uppercase tracking-wider">
									{t.playerComparison.sets}
								</p>
							</Stack>
						</Stack>
					) : (
						<p className="text-xs text-muted-foreground/60 text-center">
							{t.playerComparison.noMatches}
						</p>
					)}
				</Stack>

				{/* Desktop: Horizontal Layout */}
				<Stack
					direction="row"
					alignItems="center"
					justifyContent="space-between"
					spacing={4}
					className="hidden md:flex w-full"
				>
					{/* Viewed Player */}
					<Stack
						direction="column"
						alignItems="center"
						spacing={2}
						className="flex-1"
					>
						<PlayerNameCard
							name={player1.display_name}
							avatar={player1.avatar}
							size="lg"
							variant="vertical"
							avatarBorder="primary"
						/>
					</Stack>

					{/* VS Section with Head-to-Head Record */}
					<Stack
						direction="column"
						alignItems="center"
						justifyContent="center"
						spacing={3}
						className="flex-shrink-0 px-4"
					>
						<Box className="px-2 py-0.5 bg-primary/5 rounded-full border border-primary/10">
							<p className="text-[10px] font-medium text-primary/70 uppercase tracking-widest">
								{t.playerComparison.vs}
							</p>
						</Box>
						<Stack
							direction="column"
							alignItems="center"
							spacing={3}
						>
							<Stack
								direction="column"
								alignItems="center"
								spacing={0.5}
							>
								<p className="text-lg font-bold font-mono">
									<span className={player1.elo >= player2.elo ? "text-green-500" : "text-red-500"}>
										{formatElo(player1.elo, true)}
									</span>
									{" "}-{" "}
									<span className={player2.elo >= player1.elo ? "text-green-500" : "text-red-500"}>
										{formatElo(player2.elo, true)}
									</span>
								</p>
								<p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">
									{t.playerComparison.elo}
								</p>
							</Stack>
							{totalMatches > 0 ? (
								<>
									<Stack
										direction="column"
										alignItems="center"
										spacing={0.5}
									>
										<p className="text-lg font-bold font-mono">
											<span className={player1.wins >= player2.wins ? "text-green-500" : "text-red-500"}>
												{player1.wins}
											</span>
											{" "}-{" "}
											<span className={player2.wins >= player1.wins ? "text-green-500" : "text-red-500"}>
												{player2.wins}
											</span>
										</p>
										<p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">
											{t.playerComparison.matches}
										</p>
									</Stack>
									<Stack
										direction="column"
										alignItems="center"
										spacing={0.5}
									>
										<p className="text-lg font-bold font-mono">
											<span className={player1.setsWon >= player2.setsWon ? "text-green-500" : "text-red-500"}>
												{player1.setsWon}
											</span>
											{" "}-{" "}
											<span className={player2.setsWon >= player1.setsWon ? "text-green-500" : "text-red-500"}>
												{player2.setsWon}
											</span>
										</p>
										<p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">
											{t.playerComparison.sets}
										</p>
									</Stack>
								</>
							) : (
								<p className="text-xs text-muted-foreground/60 text-center">
									{t.playerComparison.noMatches}
								</p>
							)}
						</Stack>
					</Stack>

					{/* Current User */}
					<Stack
						direction="column"
						alignItems="center"
						spacing={2}
						className="flex-1"
					>
						<PlayerNameCard
							name={player2.display_name}
							avatar={player2.avatar}
							size="lg"
							variant="vertical"
							avatarBorder="transparent"
						/>
					</Stack>
				</Stack>
			</CardContent>
		</Card>
	);
}
