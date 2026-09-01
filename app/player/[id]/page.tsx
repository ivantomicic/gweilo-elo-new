"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/app-shell";
import {
	PlayerProfileNative,
	type HeadToHeadData,
	type PlayerEloPoint,
	type PlayerProfileStats,
} from "@/components/player/player-profile-native";
import { StateBlock } from "@/components/ui/state-block";
import { PageLoading } from "@/components/ui/loading";
import { useAuth } from "@/lib/auth/useAuth";
import { t } from "@/lib/i18n";

type PlayerData = {
	id: string;
	display_name: string;
	avatar: string | null;
};

type StatisticsResponse = {
	singles?: PlayerProfileStats[];
};

type EloHistoryResponse = {
	data?: PlayerEloPoint[];
	currentElo?: number;
};

type LoadedProfile = {
	player: PlayerData;
	stats: PlayerProfileStats | null;
	rank: number | null;
	history: PlayerEloPoint[];
	currentElo: number;
};

function PlayerPageContent() {
	const params = useParams();
	const playerId = params.id as string;
	const { session } = useAuth();
	const accessToken = session?.access_token;
	const currentUserId = session?.user.id ?? null;
	const [profile, setProfile] = useState<LoadedProfile | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			if (!accessToken) {
				setError(t.statistics.error.notAuthenticated);
				setLoading(false);
				return;
			}

			setLoading(true);
			setError(null);

			try {
				const headers = { Authorization: `Bearer ${accessToken}` };
				const [playerResponse, statisticsResponse, historyResponse] =
					await Promise.all([
						fetch(`/api/player/${playerId}`, { headers, cache: "no-store" }),
						fetch("/api/statistics?view=singles", {
							headers,
							cache: "no-store",
						}),
						fetch(`/api/player/elo-history?playerId=${encodeURIComponent(playerId)}`, {
							headers,
							cache: "no-store",
						}),
					]);

				if (!playerResponse.ok) {
					throw new Error(playerResponse.status === 404 ? "Igrač nije pronađen." : "Nije moguće učitati igrača.");
				}
				if (!historyResponse.ok) {
					throw new Error("Nije moguće učitati Elo istoriju.");
				}

				const player = (await playerResponse.json()) as PlayerData;
				const statistics = statisticsResponse.ok
					? ((await statisticsResponse.json()) as StatisticsResponse)
					: {};
				const historyData = (await historyResponse.json()) as EloHistoryResponse;
				const singles = statistics.singles ?? [];
				const statsIndex = singles.findIndex((entry) => entry.player_id === playerId);
				const stats = statsIndex >= 0 ? singles[statsIndex] : null;
				const history = historyData.data ?? [];

				if (!cancelled) {
					setProfile({
						player: {
							id: player.id,
							display_name: player.display_name || "Nepoznat igrač",
							avatar: player.avatar || null,
						},
						stats,
						rank: statsIndex >= 0 ? statsIndex + 1 : null,
						history,
						currentElo: stats?.elo ?? historyData.currentElo ?? history.at(-1)?.elo ?? 1500,
					});
				}
			} catch (loadError) {
				console.error("Error loading player profile:", loadError);
				if (!cancelled) {
					setError(loadError instanceof Error ? loadError.message : "Nije moguće učitati igrača.");
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		};

		if (playerId) void load();
		return () => {
			cancelled = true;
		};
	}, [accessToken, playerId]);

	const loadHeadToHead = useCallback(async () => {
		if (!accessToken || !currentUserId || currentUserId === playerId) {
			throw new Error("Poređenje nije dostupno.");
		}
		const response = await fetch(
			`/api/player/${playerId}/head-to-head?opponentId=${encodeURIComponent(currentUserId)}`,
			{
				headers: { Authorization: `Bearer ${accessToken}` },
				cache: "no-store",
			},
		);
		if (!response.ok) throw new Error("Nije moguće učitati međusobni skor.");
		return (await response.json()) as HeadToHeadData;
	}, [accessToken, currentUserId, playerId]);

	return (
		<AppShell
			title={profile?.player.display_name ?? t.statistics.table.player}
			showHeader={false}
			contentPadding={false}
			insetClassName="player-profile-native-shell"
			bodyClassName="player-profile-native-content"
			contentClassName="!gap-0 !py-0"
		>
			{loading ? (
				<PageLoading label="Učitavam igrača…" />
			) : error || !profile ? (
				<div className="flex min-h-[70vh] items-center justify-center px-5">
					<StateBlock variant="error" size="lg" title={error || "Igrač nije pronađen."} />
				</div>
			) : (
				<PlayerProfileNative
					player={profile.player}
					stats={profile.stats}
					rank={profile.rank}
					history={profile.history}
					currentElo={profile.currentElo}
					currentUserId={currentUserId}
					loadHeadToHead={loadHeadToHead}
				/>
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
