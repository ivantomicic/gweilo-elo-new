"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Box } from "@/components/ui/box";
import { Loading } from "@/components/ui/loading";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Stack } from "@/components/ui/stack";
import { TeamNameCard } from "@/components/ui/team-name-card";
import { PerformanceTrend } from "@/components/player/performance-trend";
import { useAuth } from "@/lib/auth/useAuth";
import { formatElo } from "@/lib/elo/format";
import { t } from "@/lib/i18n";

type TeamData = {
	id: string;
	display_name: string;
	player1: {
		id: string;
		display_name: string;
		avatar: string | null;
	};
	player2: {
		id: string;
		display_name: string;
		avatar: string | null;
	};
	matches_played: number;
	wins: number;
	losses: number;
	draws: number;
	sets_won: number;
	sets_lost: number;
	elo: number;
};

function TeamPageContent() {
	const params = useParams();
	const teamId = params.id as string;
	const { session } = useAuth();
	const accessToken = session?.access_token;
	const [teamData, setTeamData] = useState<TeamData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchTeamData = async () => {
			try {
				setLoading(true);
				setError(null);

				if (!accessToken) {
					setError(t.statistics.error.notAuthenticated);
					return;
				}

				const response = await fetch(`/api/team/${teamId}`, {
					headers: {
						Authorization: `Bearer ${accessToken}`,
					},
				});

				if (!response.ok) {
					if (response.status === 404) {
						setError(t.teamPage.error.notFound);
					} else {
						setError(t.teamPage.error.fetchFailed);
					}
					return;
				}

				const data = (await response.json()) as TeamData;
				setTeamData(data);
			} catch (fetchError) {
				console.error("Error fetching team data:", fetchError);
				setError(t.teamPage.error.fetchFailed);
			} finally {
				setLoading(false);
			}
		};

		if (teamId) {
			void fetchTeamData();
		}
	}, [accessToken, teamId]);

	return (
		<AppShell title={teamData?.display_name ?? t.statistics.table.team}>
			{loading ? (
				<Loading label={t.teamPage.loading} />
			) : error || !teamData ? (
				<Box>
					<p className="text-destructive">
						{error || t.teamPage.error.notFound}
					</p>
				</Box>
			) : (
				<>
							<SurfaceCard>
								<Stack direction="column" spacing={5}>
									<Stack direction="column" spacing={2}>
										<p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
											{t.teamPage.stats.overview}
										</p>
										<TeamNameCard
											player1={{
												id: teamData.player1.id,
												name: teamData.player1.display_name,
												avatar: teamData.player1.avatar,
											}}
											player2={{
												id: teamData.player2.id,
												name: teamData.player2.display_name,
												avatar: teamData.player2.avatar,
											}}
											size="lg"
										/>
									</Stack>

									<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
										<Box className="rounded-2xl border border-border/50 bg-background/60 p-4">
											<p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
												{t.statistics.table.elo}
											</p>
											<p className="mt-2 text-2xl font-bold font-heading">
												{formatElo(teamData.elo, true)}
											</p>
										</Box>
										<Box className="rounded-2xl border border-border/50 bg-background/60 p-4">
											<p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
												{t.statistics.table.matches}
											</p>
											<p className="mt-2 text-2xl font-bold font-heading">
												{teamData.matches_played}
											</p>
										</Box>
										<Box className="rounded-2xl border border-border/50 bg-background/60 p-4">
											<p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
												{t.statistics.table.wins}
											</p>
											<p className="mt-2 text-2xl font-bold font-heading text-emerald-500">
												{teamData.wins}
											</p>
										</Box>
										<Box className="rounded-2xl border border-border/50 bg-background/60 p-4">
											<p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
												{t.statistics.table.losses}
											</p>
											<p className="mt-2 text-2xl font-bold font-heading text-red-500">
												{teamData.losses}
											</p>
										</Box>
										<Box className="rounded-2xl border border-border/50 bg-background/60 p-4">
											<p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
												{t.statistics.table.draws}
											</p>
											<p className="mt-2 text-2xl font-bold font-heading text-muted-foreground">
												{teamData.draws}
											</p>
										</Box>
										<Box className="rounded-2xl border border-border/50 bg-background/60 p-4">
											<p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
												{t.teamPage.stats.sets}
											</p>
											<p className="mt-2 text-2xl font-bold font-heading">
												{teamData.sets_won}/{teamData.sets_lost}
											</p>
										</Box>
									</div>
								</Stack>
							</SurfaceCard>

							<PerformanceTrend
								primaryPlayerName={teamData.display_name}
								historyUrl={`/api/team/${teamId}/elo-history`}
								primaryCacheKey={`team_elo_history_${teamId}`}
								emptyStateLabel={t.teamPage.notEnoughData}
							/>
				</>
			)}
		</AppShell>
	);
}

export default function TeamPage() {
	return (
		<AuthGuard>
			<TeamPageContent />
		</AuthGuard>
	);
}
