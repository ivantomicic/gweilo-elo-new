"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { Box } from "@/components/ui/box";
import { Loading } from "@/components/ui/loading";
import { PlayerNameCard } from "@/components/ui/player-name-card";
import { Stack } from "@/components/ui/stack";
import { PerformanceTrend } from "@/components/player/performance-trend";
import { PlayerComparison } from "@/components/player/player-comparison";
import { supabase } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";

type PlayerData = {
	id: string;
	display_name: string;
	avatar: string | null;
};

function PlayerPageContent() {
	const params = useParams();
	const playerId = params.id as string;
	const [playerData, setPlayerData] = useState<PlayerData | null>(null);
	const [currentUserId, setCurrentUserId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchPlayerData = async () => {
			try {
				setLoading(true);
				setError(null);

				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					setError(t.statistics.error.notAuthenticated);
					return;
				}

				// Get current user ID for comparison
				setCurrentUserId(session.user.id);

				const response = await fetch(`/api/player/${playerId}`, {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
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
	}, [playerId]);

	if (loading) {
		return (
			<SidebarProvider>
				<AppSidebar variant="inset" />
				<SidebarInset>
					<SiteHeader title={t.statistics.table.player} />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
								<Loading label={t.statistics.loading} />
							</div>
						</div>
					</div>
				</SidebarInset>
			</SidebarProvider>
		);
	}

	if (error || !playerData) {
		return (
			<SidebarProvider>
				<AppSidebar variant="inset" />
				<SidebarInset>
					<SiteHeader title={t.statistics.table.player} />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
								<Box>
									<p className="text-destructive">
										{error || "Player not found"}
									</p>
								</Box>
							</div>
						</div>
					</div>
				</SidebarInset>
			</SidebarProvider>
		);
	}

	return (
		<SidebarProvider>
			<AppSidebar variant="inset" />
			<SidebarInset>
				<SiteHeader title={playerData.display_name} />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
							{currentUserId && currentUserId !== playerId && (
								<PlayerComparison
									viewedPlayerId={playerId}
									currentUserId={currentUserId}
								/>
							)}
							<PerformanceTrend
								playerId={playerId}
								primaryPlayerName={playerData.display_name}
								secondaryPlayerId={
									currentUserId && currentUserId !== playerId
										? currentUserId
										: undefined
								}
							/>
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

export default function PlayerPage() {
	return (
		<AuthGuard>
			<PlayerPageContent />
		</AuthGuard>
	);
}
