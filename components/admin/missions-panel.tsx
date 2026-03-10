"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/vendor/shadcn/badge";
import { Stack } from "@/components/ui/stack";
import { Box } from "@/components/ui/box";
import { Loading } from "@/components/ui/loading";
import type { MissionSnapshot, PlayerTier } from "@/lib/rivalries/types";
import { renderMissionCopy } from "@/lib/rivalries/copy";
import { t } from "@/lib/i18n";

function formatGeneratedAt(dateString: string) {
	return new Date(dateString).toLocaleString("sr-Latn-RS", {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function getTierBadgeVariant(tier: PlayerTier) {
	if (tier === "top") return "default";
	if (tier === "mid") return "secondary";
	return "outline";
}

function getPriorityLabel(priority: string) {
	if (priority === "competitive") return "Competitive";
	if (priority === "story") return "Story";
	return "Fallback";
}

function getMissionTypeLabel(type: string) {
	switch (type) {
		case "climb_rank":
			return "Climb";
		case "defend_rank":
			return "Defend";
		case "settle_score":
			return "Settle score";
		case "break_streak":
			return "Break streak";
		default:
			return "Close gap";
	}
}

function getNumberMetric(
	metrics: Record<string, number | string | boolean | null>,
	key: string,
) {
	const value = metrics[key];
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function getMissionDebugSummary(
	mission: Pick<MissionSnapshot["missions"][number], "type" | "metrics">,
) {
	if (mission.type !== "break_streak") {
		return null;
	}

	const currentStreak = getNumberMetric(mission.metrics, "lossStreak");
	const totalLosses = getNumberMetric(mission.metrics, "totalLosses");

	if (currentStreak === null && totalLosses === null) {
		return null;
	}

	return `Trenutni niz: ${currentStreak ?? "?"} • Ukupno poraza protiv ovog igrača: ${totalLosses ?? "?"}`;
}

export function MissionsPanel() {
	const [snapshots, setSnapshots] = useState<MissionSnapshot[]>([]);
	const [loading, setLoading] = useState(true);
	const [regenerating, setRegenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchSnapshots = async () => {
		try {
			setLoading(true);
			setError(null);

			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session?.access_token) {
				setError(t.admin.missions.error.notAuthenticated);
				return;
			}

			const response = await fetch("/api/admin/missions", {
				headers: {
					Authorization: `Bearer ${session.access_token}`,
				},
			});

			if (!response.ok) {
				if (response.status === 401) {
					setError(t.admin.missions.error.unauthorized);
				} else {
					setError(t.admin.missions.error.fetchFailed);
				}
				return;
			}

			const data = await response.json();
			setSnapshots(data.snapshots || []);
		} catch (fetchError) {
			console.error("Error fetching mission snapshots:", fetchError);
			setError(t.admin.missions.error.fetchFailed);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchSnapshots();
	}, []);

	const handleRegenerate = async () => {
		try {
			setRegenerating(true);

			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session?.access_token) {
				toast.error(t.admin.missions.error.notAuthenticated);
				return;
			}

			const response = await fetch("/api/admin/missions", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${session.access_token}`,
				},
			});

			if (!response.ok) {
				throw new Error("Failed to regenerate missions");
			}

			const data = await response.json();
			setSnapshots(data.snapshots || []);
			toast.success(t.admin.missions.success.regenerated);
		} catch (regenerateError) {
			console.error("Error regenerating missions:", regenerateError);
			toast.error(t.admin.missions.error.regenerateFailed);
		} finally {
			setRegenerating(false);
		}
	};

	const summary = useMemo(() => {
		return snapshots.reduce(
			(accumulator, snapshot) => {
				accumulator.players += 1;
				accumulator[snapshot.playerTier] += 1;
				if (
					!accumulator.lastGeneratedAt ||
					new Date(snapshot.generatedAt).getTime() >
						new Date(accumulator.lastGeneratedAt).getTime()
				) {
					accumulator.lastGeneratedAt = snapshot.generatedAt;
				}
				return accumulator;
			},
			{
				players: 0,
				provisional: 0,
				top: 0,
				mid: 0,
				bottom: 0,
				lastGeneratedAt: "" as string,
			},
		);
	}, [snapshots]);

	if (loading) {
		return (
			<div className="py-12">
				<Loading inline label={t.admin.missions.loading} />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center py-12">
				<p className="text-destructive">{error}</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<Stack
				direction="row"
				alignItems="center"
				justifyContent="between"
				className="flex-wrap gap-4"
			>
				<div className="grid grid-cols-2 gap-3 md:grid-cols-5">
					{[
						["Players", String(summary.players)],
						["Top", String(summary.top)],
						["Mid", String(summary.mid)],
						["Bottom", String(summary.bottom)],
						["Provisional", String(summary.provisional)],
					].map(([label, value]) => (
						<Box
							key={label}
							className="rounded-xl border border-border/60 bg-card px-4 py-3"
						>
							<p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
								{label}
							</p>
							<p className="mt-1 text-xl font-semibold">{value}</p>
						</Box>
					))}
				</div>

				<Stack direction="column" spacing={2} className="items-end">
					<Button onClick={handleRegenerate} disabled={regenerating}>
						{regenerating
							? t.admin.missions.regenerating
							: t.admin.missions.regenerate}
					</Button>
					{summary.lastGeneratedAt ? (
						<p className="text-xs text-muted-foreground">
							{t.admin.missions.generated}:{" "}
							{formatGeneratedAt(summary.lastGeneratedAt)}
						</p>
					) : null}
				</Stack>
			</Stack>

			{snapshots.length === 0 ? (
				<Card>
					<CardContent className="py-10 text-center text-muted-foreground">
						{t.admin.missions.empty}
					</CardContent>
				</Card>
			) : (
				<div className="space-y-4">
					{snapshots.map((snapshot) => (
						<Card key={snapshot.playerId}>
							<CardHeader className="space-y-0 pb-3">
								<Stack
									direction="row"
									alignItems="center"
									justifyContent="between"
									className="flex-wrap gap-4"
								>
									<Stack direction="row" alignItems="center" spacing={3}>
										<Avatar className="h-12 w-12">
											<AvatarImage
												src={snapshot.playerAvatarUrl || undefined}
												alt={snapshot.playerName}
											/>
											<AvatarFallback>
												{snapshot.playerName.charAt(0).toUpperCase()}
											</AvatarFallback>
										</Avatar>
										<Stack direction="column" spacing={1}>
											<CardTitle className="text-lg">
												{snapshot.playerName}
											</CardTitle>
											<Stack direction="row" alignItems="center" spacing={2}>
												<Badge variant="outline">
													#{snapshot.playerRank}
												</Badge>
												<Badge variant="outline">
													{snapshot.playerElo.toFixed(0)} Elo
												</Badge>
												<Badge
													variant={getTierBadgeVariant(
														snapshot.playerTier,
													)}
												>
													{t.missions.tiers[snapshot.playerTier]}
												</Badge>
												<Badge variant="outline">
													{snapshot.matchesPlayed} mečeva
												</Badge>
											</Stack>
										</Stack>
									</Stack>

									<Stack direction="column" spacing={1} className="items-end">
										<p className="text-sm font-medium">
											{t.admin.missions.generated}
										</p>
										<p className="text-sm text-muted-foreground">
											{formatGeneratedAt(snapshot.generatedAt)}
										</p>
									</Stack>
								</Stack>
							</CardHeader>

							<CardContent className="space-y-4">
								<Box className="rounded-xl border border-border/50 bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
									<Stack
										direction="row"
										alignItems="center"
										justifyContent="between"
										className="flex-wrap gap-3"
									>
										<span>
											Iznad:{" "}
											{snapshot.context.closestAbove
												? `${snapshot.context.closestAbove.name} (+${snapshot.context.closestAbove.gapElo})`
												: "nema"}
										</span>
										<span>
											Ispod:{" "}
											{snapshot.context.closestBelow
												? `${snapshot.context.closestBelow.name} (-${snapshot.context.closestBelow.gapElo})`
												: "nema"}
										</span>
									</Stack>
								</Box>

								<div className="grid gap-3 md:grid-cols-2">
									{snapshot.missions.length === 0 ? (
										<Box className="rounded-2xl border border-dashed border-border/60 bg-background/50 p-4 text-sm text-muted-foreground">
											No missions for this player right now.
										</Box>
									) : (
										snapshot.missions.map((mission) => {
											const copy = renderMissionCopy(mission);
											return (
												<Box
													key={mission.id}
													className="rounded-2xl border border-border/60 bg-background/70 p-4"
												>
											<Stack direction="column" spacing={2}>
														<Stack
															direction="row"
															alignItems="center"
															justifyContent="between"
															className="flex-wrap gap-2"
														>
															<p className="font-semibold">{copy.title}</p>
															<Stack
																direction="row"
																alignItems="center"
																spacing={2}
															>
																<Badge variant="secondary">
																	{getMissionTypeLabel(mission.type)}
																</Badge>
																<Badge variant="outline">
																	{mission.score}
																</Badge>
															</Stack>
														</Stack>
														<p className="text-sm text-muted-foreground">
															{copy.body}
														</p>
														{getMissionDebugSummary(mission) ? (
															<p className="text-xs text-muted-foreground">
																{getMissionDebugSummary(mission)}
															</p>
														) : null}
													</Stack>
												</Box>
											);
										})
									)}
								</div>

								{snapshot.candidates.length > 0 ? (
									<details className="rounded-2xl border border-border/60 bg-muted/15 px-4 py-3">
										<summary className="cursor-pointer list-none font-medium">
											{t.admin.missions.candidates} ({snapshot.candidates.length})
										</summary>
										<div className="mt-4 space-y-3">
											{snapshot.candidates.map((candidate) => {
												const copy = renderMissionCopy(candidate);
												return (
													<Box
														key={candidate.id}
														className="rounded-xl border border-border/50 bg-background/80 p-4"
													>
														<Stack direction="column" spacing={2}>
															<Stack
																direction="row"
																alignItems="center"
																justifyContent="between"
																className="flex-wrap gap-2"
															>
																<Stack
																	direction="row"
																	alignItems="center"
																	spacing={2}
																	className="flex-wrap"
																>
																	<Badge
																		variant={
																			candidate.selected
																				? "default"
																				: "outline"
																		}
																	>
																		{candidate.selected
																			? t.admin.missions.selected
																			: "Candidate"}
																	</Badge>
																	<Badge variant="secondary">
																		{getMissionTypeLabel(candidate.type)}
																	</Badge>
																	<Badge variant="outline">
																		{getPriorityLabel(
																			candidate.priorityBucket,
																		)}
																	</Badge>
																</Stack>
																<Badge variant="outline">
																	{candidate.score}
																</Badge>
															</Stack>

															<div>
																<p className="font-medium">{copy.title}</p>
																<p className="text-sm text-muted-foreground">
																	{copy.body}
																</p>
																{getMissionDebugSummary(candidate) ? (
																	<p className="mt-1 text-xs text-muted-foreground">
																		{getMissionDebugSummary(candidate)}
																	</p>
																) : null}
															</div>

															<p className="text-xs text-muted-foreground">
																base {candidate.scoreBreakdown.basePriority} • closeness{" "}
																{candidate.scoreBreakdown.closeness} • recency{" "}
																{candidate.scoreBreakdown.recency} • realism{" "}
																{candidate.scoreBreakdown.realism} • tier{" "}
																{candidate.scoreBreakdown.tierFit}
															</p>

															<div className="space-y-1 text-xs text-muted-foreground">
																{candidate.reasoning.map((reason) => (
																	<p key={reason}>{reason}</p>
																))}
															</div>
														</Stack>
													</Box>
												);
											})}
										</div>
									</details>
								) : null}
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}
