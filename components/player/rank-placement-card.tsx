"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loading } from "@/components/ui/loading";
import { Stack } from "@/components/ui/stack";
import { useAuth } from "@/lib/auth/useAuth";
import { t } from "@/lib/i18n";

type RankPlacement = {
	rank: number;
	days: number;
	sessions: number;
};

type RankPlacementCardProps = {
	playerId: string;
};

type RankTone = {
	dot: string;
	bar: string;
	text: string;
};

function getRankTone(rank: number): RankTone {
	if (rank === 1) {
		return {
			dot: "bg-yellow-500",
			bar: "bg-yellow-500",
			text: "text-yellow-500",
		};
	}

	if (rank === 2) {
		return {
			dot: "bg-zinc-400",
			bar: "bg-zinc-400",
			text: "text-zinc-500",
		};
	}

	if (rank === 3) {
		return {
			dot: "bg-orange-600",
			bar: "bg-orange-600",
			text: "text-orange-500",
		};
	}

	if (rank <= 5) {
		return {
			dot: "bg-sky-500",
			bar: "bg-sky-500",
			text: "text-sky-500",
		};
	}

	return {
		dot: "bg-emerald-500",
		bar: "bg-emerald-500",
		text: "text-emerald-500",
	};
}

function formatDays(days: number) {
	const durationDays = Math.max(1, days);
	const usesSingularDay =
		durationDays % 10 === 1 && durationDays % 100 !== 11;

	return `${durationDays} ${
		usesSingularDay
			? t.statistics.table.day
			: t.statistics.table.days
		}`;
}

function getPlacementLabel(rank: number) {
	return `${rank}. ${t.rankPlacements.place}`;
}

function formatSessions(sessions: number) {
	return `${sessions} ${
		sessions === 1
			? t.rankPlacements.session
			: t.rankPlacements.sessions
	}`;
}

export function RankPlacementCard({ playerId }: RankPlacementCardProps) {
	const { session } = useAuth();
	const accessToken = session?.access_token;
	const [placements, setPlacements] = useState<RankPlacement[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchRankPlacements = async () => {
			try {
				setLoading(true);
				setError(null);

				if (!accessToken) {
					setError(t.statistics.error.notAuthenticated);
					return;
				}

				const response = await fetch(
					`/api/player/${playerId}/rank-placements`,
					{
						cache: "no-store",
						headers: {
							Authorization: `Bearer ${accessToken}`,
						},
					}
				);

				if (!response.ok) {
					setError(t.rankPlacements.error);
					return;
				}

				const data = await response.json();
				setPlacements(data.placements || []);
			} catch (err) {
				console.error("Error fetching rank placements:", err);
				setError(t.rankPlacements.error);
			} finally {
				setLoading(false);
			}
		};

		if (playerId) {
			void fetchRankPlacements();
		}
	}, [accessToken, playerId]);

	if (loading) {
		return (
			<Card className="bg-card border-border/50">
				<CardContent className="pt-6">
					<Loading label={t.rankPlacements.loading} inline />
				</CardContent>
			</Card>
		);
	}

	if (error) {
		return (
			<Card className="bg-card border-border/50">
				<CardContent className="pt-6">
					<p className="text-sm text-destructive">{error}</p>
				</CardContent>
			</Card>
		);
	}

	const totalDays = placements.reduce(
		(total, placement) => total + placement.days,
		0
	);
	const maxDays = Math.max(...placements.map((placement) => placement.days), 1);
	const longestPlacement = placements.reduce<RankPlacement | null>(
		(longest, placement) => {
			if (!longest || placement.days > longest.days) {
				return placement;
			}

			return longest;
		},
		null
	);

	return (
		<Card className="bg-card border-border/50">
			<CardContent className="pt-4 md:pt-6 px-4 md:px-6">
				<Stack direction="column" spacing={4}>
					<Stack
						direction="row"
						alignItems="center"
						justifyContent="between"
						className="gap-3"
					>
						<p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
							{t.rankPlacements.title}
						</p>
						<p className="text-[11px] text-muted-foreground/70 font-medium">
							{t.rankPlacements.scope}
						</p>
					</Stack>

					{placements.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							{t.rankPlacements.empty}
						</p>
					) : (
						<Stack direction="column" spacing={4}>
							<div className="grid grid-cols-2 gap-4">
								<div>
									<p className="text-[11px] text-muted-foreground font-medium">
										{t.rankPlacements.longest}
									</p>
									<p className="mt-1 text-xl font-bold font-heading text-foreground">
										{longestPlacement
											? getPlacementLabel(longestPlacement.rank)
											: "-"}
									</p>
								</div>
								<div>
									<p className="text-[11px] text-muted-foreground font-medium">
										{t.rankPlacements.total}
									</p>
									<p className="mt-1 text-xl font-bold font-heading text-foreground">
										{formatDays(totalDays)}
									</p>
								</div>
							</div>

							<div
								className="flex h-3 w-full overflow-hidden rounded-full bg-muted/40"
								aria-label={t.rankPlacements.distribution}
							>
								{placements.map((placement) => {
									const tone = getRankTone(placement.rank);
									const percentage =
										totalDays > 0
											? (placement.days / totalDays) * 100
											: 0;

									return (
										<div
											key={placement.rank}
											className={tone.bar}
											style={{
												width: `${percentage}%`,
												minWidth: percentage > 0 ? 4 : 0,
											}}
											title={`${getPlacementLabel(
												placement.rank
											)}: ${formatDays(placement.days)}`}
										/>
									);
								})}
							</div>

							<Stack direction="column" spacing={3}>
								{placements.map((placement) => {
									const tone = getRankTone(placement.rank);

									return (
										<Stack
											key={placement.rank}
											direction="column"
											spacing={1.5}
										>
											<div className="flex items-center justify-between gap-3">
												<div className="flex min-w-0 items-center gap-2">
													<span
														className={`size-2.5 shrink-0 rounded-full ${tone.dot}`}
													/>
													<span className="truncate text-sm font-semibold text-foreground">
														{getPlacementLabel(placement.rank)}
													</span>
													<span className="shrink-0 text-[11px] text-muted-foreground">
														{formatSessions(placement.sessions)}
													</span>
												</div>
												<span
													className={`shrink-0 text-sm font-bold font-mono ${tone.text}`}
												>
													{formatDays(placement.days)}
												</span>
											</div>
											<div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
												<div
													className={`h-full rounded-full ${tone.bar}`}
													style={{
														width: `${Math.max(
															4,
															(placement.days / maxDays) * 100
														)}%`,
													}}
												/>
											</div>
										</Stack>
									);
								})}
							</Stack>
						</Stack>
					)}
				</Stack>
			</CardContent>
		</Card>
	);
}
