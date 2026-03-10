"use client";

import { useEffect, useState } from "react";
import { Stack } from "@/components/ui/stack";
import { Box } from "@/components/ui/box";
import { Loading } from "@/components/ui/loading";
import { supabase } from "@/lib/supabase/client";
import type { MissionSnapshot } from "@/lib/rivalries/types";
import { renderMissionCopy } from "@/lib/rivalries/copy";
import { t } from "@/lib/i18n";

const DASHBOARD_CARD_HEIGHT_CLASS = "min-h-[clamp(17rem,32vw,20rem)]";
const MISSION_CARD_BASE_CLASS =
	"relative overflow-hidden rounded-[24px] border border-white/10 shadow-sm";

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

function getMissionTheme(mission: MissionSnapshot["missions"][number]) {
	const direction =
		typeof mission.metrics.direction === "string" ? mission.metrics.direction : null;

	switch (mission.type) {
		case "climb_rank":
			return {
				gradient: "from-sky-500/20 via-blue-500/8 to-card",
				glow: "bg-sky-500/18",
				statClass: "border-sky-300/20 bg-sky-400/10 text-sky-50",
			};
		case "defend_rank":
			return {
				gradient: "from-emerald-500/18 via-teal-500/8 to-card",
				glow: "bg-emerald-500/16",
				statClass: "border-emerald-300/20 bg-emerald-400/10 text-emerald-50",
			};
		case "settle_score":
			return {
				gradient: "from-fuchsia-500/16 via-violet-500/8 to-card",
				glow: "bg-fuchsia-500/14",
				statClass: "border-fuchsia-300/20 bg-fuchsia-400/10 text-fuchsia-50",
			};
		case "break_streak":
			return {
				gradient: "from-orange-500/18 via-amber-500/8 to-card",
				glow: "bg-orange-500/16",
				statClass: "border-orange-300/20 bg-orange-400/10 text-orange-50",
			};
		default:
			return {
				gradient: "from-amber-500/18 via-yellow-500/8 to-card",
				glow: "bg-amber-500/14",
				statClass: "border-amber-300/20 bg-amber-400/10 text-amber-50",
			};
	}
}

function getMissionStat(mission: MissionSnapshot["missions"][number]) {
	switch (mission.type) {
		case "climb_rank":
		case "defend_rank":
		case "close_gap": {
			const gapElo = getNumberMetric(mission.metrics, "gapElo");
			return gapElo === null ? null : `${gapElo} Elo`;
		}
		case "settle_score": {
			const wins = getNumberMetric(mission.metrics, "wins");
			const losses = getNumberMetric(mission.metrics, "losses");
			return wins === null || losses === null ? null : `${wins}-${losses}`;
		}
		case "break_streak": {
			const lossStreak = getNumberMetric(mission.metrics, "lossStreak");
			return lossStreak === null ? null : `${lossStreak} u nizu`;
		}
		default:
			return null;
	}
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

	if (loading) {
		return (
			<Box
				className={`${MISSION_CARD_BASE_CLASS} bg-card p-6 h-full ${DASHBOARD_CARD_HEIGHT_CLASS} flex flex-col`}
			>
				<div className="flex flex-1 items-center justify-center">
					<Loading inline label={t.missions.loading} />
				</div>
			</Box>
		);
	}

	if (error) {
		return (
			<Box
				className={`${MISSION_CARD_BASE_CLASS} bg-card p-6 h-full ${DASHBOARD_CARD_HEIGHT_CLASS} flex flex-col`}
			>
				<div className="flex flex-1 items-center">
					<p className="text-sm text-destructive">{error}</p>
				</div>
			</Box>
		);
	}

	if (!snapshot || snapshot.missions.length === 0) {
		return null;
	}

	const isSingleMission = snapshot.missions.length === 1;

	return (
		<Stack
			direction="column"
			spacing={3}
			className={`h-full ${DASHBOARD_CARD_HEIGHT_CLASS}`}
		>
			{snapshot.missions.map((mission) => {
				const copy = renderMissionCopy(mission);
				const theme = getMissionTheme(mission);
				const stat = getMissionStat(mission);
				const opponentInitial = mission.opponentName?.charAt(0).toUpperCase() || "M";
				return (
					<Box
						key={mission.id}
						className={`${MISSION_CARD_BASE_CLASS} bg-card p-5 md:p-6 flex flex-col flex-1 ${isSingleMission ? "justify-center h-full" : "justify-between"}`}
					>
						<Box className={`absolute inset-0 bg-gradient-to-br ${theme.gradient}`} />
						<Box
							className={`absolute -right-8 top-4 h-28 w-28 rounded-full blur-3xl ${theme.glow}`}
						/>
						<Box className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
						<Box className="absolute -right-2 -top-5 text-[112px] font-semibold leading-none tracking-[-0.06em] text-white/[0.08] md:text-[132px]">
							{opponentInitial}
						</Box>
						{stat ? (
							<Box className="absolute right-5 top-5 z-20 md:right-6 md:top-6">
								<span
									className={`rounded-full border px-3 py-1 text-xs font-semibold ${theme.statClass}`}
								>
									{stat}
								</span>
							</Box>
						) : null}

						<Stack direction="column" spacing={4} className="relative z-10 h-full">
							<Stack direction="column" spacing={3} className="relative z-10">
								<p className="pr-24 text-xl font-semibold leading-tight text-foreground md:pr-28">
									{copy.title}
								</p>
								<p className="max-w-[30ch] text-sm leading-6 text-foreground/70">
									{copy.body}
								</p>
							</Stack>
						</Stack>
					</Box>
				);
			})}
		</Stack>
	);
}
