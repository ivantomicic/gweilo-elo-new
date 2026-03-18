"use client";

import { useEffect, useState } from "react";
import { Box } from "@/components/ui/box";
import { Stack } from "@/components/ui/stack";
import { Icon } from "@/components/ui/icon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";
import { formatNoShowPoints } from "@/lib/no-shows/sessions-per-week";

type NoShowUser = {
	id: string;
	name: string;
	avatar: string | null;
	noShowCount: number;
	totalPoints: number;
	lastNoShowDate: string;
};

type NoShowAlertWidgetProps = {
	users?: NoShowUser[];
};

const DASHBOARD_CARD_HEIGHT_CLASS = "min-h-[clamp(17rem,32vw,20rem)]";

export function NoShowAlertWidget({ users }: NoShowAlertWidgetProps) {
	const [worstOffender, setWorstOffender] = useState<NoShowUser | null>(
		users?.[0] ?? null
	);
	const [loading, setLoading] = useState(users === undefined);

	useEffect(() => {
		if (users !== undefined) {
			setWorstOffender(users[0] ?? null);
			setLoading(false);
			return;
		}

		const fetchNoShowStats = async () => {
			try {
				setLoading(true);

				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					setWorstOffender(null);
					return;
				}

				const response = await fetch("/api/no-shows", {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				});

				if (!response.ok) {
					setWorstOffender(null);
					return;
				}

				const data = await response.json();
				const users = data.users || [];
				// Worst offender is the first one (sorted by weighted points descending)
				const worst = users[0] || null;
				setWorstOffender(worst);
			} catch (error) {
				console.error("Error fetching no-show stats:", error);
				setWorstOffender(null);
			} finally {
				setLoading(false);
			}
		};

		fetchNoShowStats();
	}, [users]);

	if (loading) {
		return (
			<Box
				className={`bg-card rounded-[24px] border border-border/50 shadow-sm relative overflow-hidden p-6 h-full ${DASHBOARD_CARD_HEIGHT_CLASS} flex flex-col`}
			>
				<Box className="absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--destructive)/0.18),transparent_58%)] pointer-events-none" />
				<Box className="absolute -right-10 top-10 size-32 rounded-full bg-destructive/10 blur-3xl pointer-events-none" />
				<Box className="absolute -left-8 bottom-6 size-24 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

				<Box className="relative z-10 flex items-start justify-between gap-4">
					<Box className="h-4 w-24 rounded-full bg-muted-foreground/20" />
					<Box className="h-6 w-14 rounded-full bg-muted-foreground/20" />
				</Box>

				<Stack
					direction="column"
					alignItems="center"
					justifyContent="center"
					spacing={5}
					className="relative z-10 w-full flex-1 pt-6"
				>
					<Box className="relative shrink-0">
						<Box className="size-24 rounded-full bg-destructive/20 border-2 border-destructive/30 animate-pulse" />
						<Box className="absolute -bottom-1 -right-1 bg-destructive/50 size-7 rounded-full border-2 border-card animate-pulse" />
					</Box>
					<Box className="space-y-2 text-center">
						<Box className="mx-auto h-6 w-28 rounded bg-muted-foreground/20" />
						<Box className="mx-auto h-3 w-16 rounded bg-muted-foreground/15" />
					</Box>
					<Box className="w-full max-w-[15rem] rounded-[28px] border border-destructive/10 bg-white/[0.03] px-6 py-6 text-center">
						<Box className="mx-auto h-14 w-20 rounded bg-muted-foreground/20" />
						<Box className="mx-auto mt-3 h-3 w-14 rounded bg-muted-foreground/15" />
					</Box>
				</Stack>
			</Box>
		);
	}

	if (!worstOffender) {
		return null;
	}

	const showPointsMode =
		Math.abs(worstOffender.totalPoints - worstOffender.noShowCount) > 0.001;

	return (
		<Box
			className={`bg-card rounded-[24px] border border-border/50 shadow-sm relative overflow-hidden p-6 h-full ${DASHBOARD_CARD_HEIGHT_CLASS} flex flex-col`}
		>
			<Box className="absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--destructive)/0.18),transparent_58%)] pointer-events-none" />
			<Box className="absolute -right-10 top-10 size-32 rounded-full bg-destructive/10 blur-3xl pointer-events-none" />
			<Box className="absolute -left-8 bottom-6 size-24 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
			<Box className="absolute inset-0 bg-gradient-to-br from-destructive/10 via-destructive/5 to-card pointer-events-none" />
			<Box
				className="absolute right-[-10px] top-[-52px] text-[286px] font-semibold leading-none tracking-[-0.1em] pointer-events-none select-none md:right-[-14px] md:top-[-66px] md:text-[364px]"
				aria-hidden="true"
			>
				<span
					className="bg-clip-text text-transparent"
					style={{
						backgroundImage:
							"linear-gradient(135deg, rgba(254,202,202,0.1), rgba(248,113,113,0.06), rgba(127,29,29,0.03))",
					}}
				>
					{formatNoShowPoints(worstOffender.totalPoints)}
				</span>
			</Box>

			<Box className="relative z-10 flex items-start justify-between gap-4">
				<Box className="w-full space-y-2 text-center">
					<Box className="text-xl font-semibold leading-tight text-foreground">
						{t.ispale.noShowAlert}
					</Box>
					{showPointsMode ? (
						<Box className="inline-flex items-center gap-2 rounded-full border border-destructive/20 bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive">
							<Icon
								icon="solar:graph-up-bold"
								className="size-3.5"
							/>
							{t.ispale.pointsMode}
						</Box>
					) : null}
				</Box>
				<Box className="absolute right-0 top-0 rounded-full border border-destructive/20 bg-destructive/10 p-2 text-destructive">
					<Icon icon="solar:danger-bold" className="size-4" />
				</Box>
			</Box>

			<Stack
				direction="column"
				alignItems="center"
				justifyContent="center"
				spacing={5}
				className="relative z-10 w-full flex-1 pt-6"
			>
				<Box className="relative shrink-0">
					<Box className="absolute inset-[-10px] rounded-full border border-amber-400/35" />
					<Box className="absolute inset-[-20px] rounded-full border border-destructive/10" />
					<Avatar className="size-24 border-2 border-destructive/30 shadow-[0_0_0_6px_rgba(239,68,68,0.08)]">
						<AvatarImage
							src={worstOffender.avatar || undefined}
							alt={worstOffender.name}
						/>
						<AvatarFallback>
							{worstOffender.name.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>
					<Box className="absolute -bottom-1 -right-1 bg-destructive text-white size-7 rounded-full flex items-center justify-center text-xs border-2 border-card shadow-lg">
						<Icon icon="solar:danger-bold" className="size-4" />
					</Box>
				</Box>

				<Box className="space-y-2 text-center">
					<p className="text-2xl font-bold leading-tight text-balance">
						{worstOffender.name}
					</p>
				</Box>

			</Stack>
		</Box>
	);
}
