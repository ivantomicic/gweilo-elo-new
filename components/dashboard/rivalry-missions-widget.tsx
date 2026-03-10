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

	if (loading) {
		return (
			<Box className="bg-card rounded-[24px] border border-border/50 shadow-sm p-6 aspect-[7/5] flex flex-col">
				<div className="flex flex-1 items-center justify-center">
					<Loading inline label={t.missions.loading} />
				</div>
			</Box>
		);
	}

	if (error) {
		return (
			<Box className="bg-card rounded-[24px] border border-border/50 shadow-sm p-6 aspect-[7/5] flex flex-col">
				<div className="flex flex-1 items-center">
					<p className="text-sm text-destructive">{error}</p>
				</div>
			</Box>
		);
	}

	if (!snapshot || snapshot.missions.length === 0) {
		return null;
	}

	return (
		<Stack direction="column" spacing={3} className="aspect-[7/5]">
			{snapshot.missions.map((mission) => {
				const copy = renderMissionCopy(mission);
				return (
					<Box
						key={mission.id}
						className="bg-card rounded-[24px] border border-border/50 shadow-sm p-6 flex-1 flex flex-col justify-center"
					>
						<Stack direction="column" spacing={3}>
							<p className="text-lg font-semibold leading-tight">{copy.title}</p>
							<p className="text-sm leading-6 text-muted-foreground">
								{copy.body}
							</p>
						</Stack>
					</Box>
				);
			})}
		</Stack>
	);
}
