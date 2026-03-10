"use client";

import { useEffect, useState } from "react";
import { Stack } from "@/components/ui/stack";
import { Box } from "@/components/ui/box";
import { Loading } from "@/components/ui/loading";
import { supabase } from "@/lib/supabase/client";
import type { MissionSnapshot } from "@/lib/rivalries/types";
import { renderMissionCopy } from "@/lib/rivalries/copy";
import { t } from "@/lib/i18n";

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
		<Box className="bg-card rounded-[24px] border border-border/50 shadow-sm p-6 aspect-[7/5] flex flex-col">
			{loading ? (
				<div className="flex flex-1 items-center justify-center">
					<Loading inline label={t.missions.loading} />
				</div>
			) : error ? (
				<div className="flex flex-1 items-center">
					<p className="text-sm text-destructive">{error}</p>
				</div>
			) : !snapshot || snapshot.missions.length === 0 ? (
				<div className="flex flex-1 items-center">
					<p className="text-sm text-muted-foreground">{t.missions.empty}</p>
				</div>
			) : (
				<Stack direction="column" spacing={3} className="flex-1 justify-center">
					{snapshot.missions.map((mission) => {
						const copy = renderMissionCopy(mission);
						return (
							<Box
								key={mission.id}
								className="rounded-[20px] border border-border/60 bg-muted/20 p-4"
							>
								<Stack direction="column" spacing={2}>
									<p className="font-semibold leading-tight">
										{copy.title}
									</p>
									<p className="text-sm text-muted-foreground">
										{copy.body}
									</p>
								</Stack>
							</Box>
						);
					})}
				</Stack>
			)}
		</Box>
	);
}
