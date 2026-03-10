"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/vendor/shadcn/badge";
import { Stack } from "@/components/ui/stack";
import { Box } from "@/components/ui/box";
import { Loading } from "@/components/ui/loading";
import { supabase } from "@/lib/supabase/client";
import type { MissionSnapshot } from "@/lib/rivalries/types";
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

function getTierBadgeVariant(tier: MissionSnapshot["playerTier"]) {
	if (tier === "top") return "default";
	if (tier === "mid") return "secondary";
	return "outline";
}

export function RivalryMissionsWidget() {
	const [snapshot, setSnapshot] = useState<MissionSnapshot | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchSnapshot = async () => {
			try {
				setLoading(true);
				setError(null);

				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session?.access_token) {
					setSnapshot(null);
					return;
				}

				const response = await fetch("/api/missions", {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				});

				if (!response.ok) {
					throw new Error("Failed to fetch missions");
				}

				const data = await response.json();
				setSnapshot(data.snapshot || null);
			} catch (fetchError) {
				console.error("Error loading missions:", fetchError);
				setError(t.missions.error.fetchFailed);
			} finally {
				setLoading(false);
			}
		};

		fetchSnapshot();
	}, []);

	return (
		<Card className="border-border/50 bg-card shadow-sm">
			<CardContent className="p-5 !pt-5">
				<Stack direction="column" spacing={4}>
					<Stack direction="row" alignItems="center" justifyContent="between">
						<Stack direction="column" spacing={1}>
							<p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
								{t.missions.title}
							</p>
							<p className="text-lg font-semibold">{t.missions.subtitle}</p>
						</Stack>
						{snapshot && (
							<Badge variant={getTierBadgeVariant(snapshot.playerTier)}>
								{t.missions.tiers[snapshot.playerTier]}
							</Badge>
						)}
					</Stack>

					{loading ? (
						<Loading inline label={t.missions.loading} />
					) : error ? (
						<p className="text-sm text-destructive">{error}</p>
					) : !snapshot || snapshot.missions.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							{t.missions.empty}
						</p>
					) : (
						<>
							<Stack direction="column" spacing={3}>
								{snapshot.missions.map((mission) => (
									(() => {
										const copy = renderMissionCopy(mission);
										return (
											<Box
												key={mission.id}
												className="rounded-2xl border border-border/60 bg-muted/20 p-4"
											>
												<Stack direction="column" spacing={2}>
													<Stack
														direction="row"
														alignItems="center"
														justifyContent="between"
													>
														<p className="font-semibold leading-tight">
															{copy.title}
														</p>
														<Badge variant="outline">
															{mission.score}
														</Badge>
													</Stack>
													<p className="text-sm text-muted-foreground">
														{copy.body}
													</p>
												</Stack>
											</Box>
										);
									})()
								))}
							</Stack>

							<Box className="rounded-xl border border-border/50 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
								<Stack
									direction="row"
									alignItems="center"
									justifyContent="between"
								>
									<span>
										#{snapshot.playerRank} • {snapshot.playerElo.toFixed(0)} Elo
									</span>
									<span>
										{t.missions.updated}: {formatGeneratedAt(snapshot.generatedAt)}
									</span>
								</Stack>
							</Box>
						</>
					)}
				</Stack>
			</CardContent>
		</Card>
	);
}
