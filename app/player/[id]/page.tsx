"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Box } from "@/components/ui/box";
import { Loading } from "@/components/ui/loading";
import { PerformanceTrend } from "@/components/player/performance-trend";
import { PlayerComparison } from "@/components/player/player-comparison";
import { RankPlacementCard } from "@/components/player/rank-placement-card";
import { useAuth } from "@/lib/auth/useAuth";
import { t } from "@/lib/i18n";

type PlayerData = {
	id: string;
	display_name: string;
	avatar: string | null;
};

function PlayerPageContent() {
	const params = useParams();
	const playerId = params.id as string;
	const { session } = useAuth();
	const accessToken = session?.access_token;
	const currentUserId = session?.user.id ?? null;
	const [playerData, setPlayerData] = useState<PlayerData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchPlayerData = async () => {
			try {
				setLoading(true);
				setError(null);

				if (!accessToken) {
					setError(t.statistics.error.notAuthenticated);
					return;
				}

				const response = await fetch(`/api/player/${playerId}`, {
					headers: {
						Authorization: `Bearer ${accessToken}`,
					},
				});

				if (!response.ok) {
					if (response.status === 404) {
						setError("Player not found");
					} else {
						setError("Failed to load player");
					}
					return;
				}

				const data = await response.json();
				if (data) {
					setPlayerData({
						id: data.id,
						display_name: data.display_name || "Unknown",
						avatar: data.avatar || null,
					});
				}
			} catch (err) {
				console.error("Error fetching player data:", err);
				setError("Failed to load player");
			} finally {
				setLoading(false);
			}
		};

		if (playerId) {
			fetchPlayerData();
		}
	}, [accessToken, playerId]);

	return (
		<AppShell title={playerData?.display_name ?? t.statistics.table.player}>
			{loading ? (
				<Loading label={t.statistics.loading} />
			) : error || !playerData ? (
				<Box>
					<p className="text-destructive">
						{error || "Player not found"}
					</p>
				</Box>
			) : (
				<>
					{currentUserId && currentUserId !== playerId && (
						<PlayerComparison
							viewedPlayerId={playerId}
							currentUserId={currentUserId}
						/>
					)}
					<RankPlacementCard playerId={playerId} />
					<PerformanceTrend
						playerId={playerId}
						primaryPlayerName={playerData.display_name}
						secondaryPlayerId={
							currentUserId && currentUserId !== playerId
								? currentUserId
								: undefined
						}
					/>
				</>
			)}
		</AppShell>
	);
}

export default function PlayerPage() {
	return (
		<AuthGuard>
			<PlayerPageContent />
		</AuthGuard>
	);
}
