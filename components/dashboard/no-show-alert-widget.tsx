"use client";

import { useEffect, useState } from "react";
import { Box } from "@/components/ui/box";
import { Stack } from "@/components/ui/stack";
import { Icon } from "@/components/ui/icon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { t } from "@/lib/i18n";

type NoShowUser = {
	id: string;
	name: string;
	avatar: string | null;
	noShowCount: number;
	lastNoShowDate: string;
};

export function NoShowAlertWidget() {
	const [worstOffender, setWorstOffender] = useState<NoShowUser | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
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
				// Worst offender is the first one (sorted by count descending)
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
	}, []);

	if (loading) {
		return (
			<Box className="bg-card rounded-[24px] border border-border/50 shadow-sm relative overflow-hidden p-6 aspect-[7/5] flex flex-col">
				{/* Blurred destructive background circle */}
				<Box className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-destructive/20 blur-[60px] rounded-full pointer-events-none" />
				<Box className="flex items-center justify-center mb-4 relative z-10">
					<Box className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
						{t.ispale.noShowAlert}
					</Box>
				</Box>

				<Stack
					direction="column"
					alignItems="center"
					justifyContent="center"
					spacing={4}
					className="relative z-10 w-full flex-1"
				>
					{/* Avatar skeleton */}
					<Box className="relative shrink-0">
						<Box className="size-20 rounded-full bg-destructive/20 border-2 border-destructive/30 animate-pulse" />
						<Box className="absolute -bottom-1 -right-1 bg-destructive/50 size-6 rounded-full border-2 border-card animate-pulse" />
					</Box>

					{/* Content skeleton */}
					<Stack
						direction="column"
						spacing={1}
						alignItems="center"
						className="w-full"
					>
						<Box className="h-5 w-32 bg-muted-foreground/20 rounded animate-pulse" />
						<Box className="h-3 w-24 bg-muted-foreground/20 rounded animate-pulse" />
					</Stack>
				</Stack>
			</Box>
		);
	}

	if (!worstOffender) {
		return null;
	}

	return (
		<Box className="bg-card rounded-[24px] border border-border/50 shadow-sm relative overflow-hidden p-6 aspect-[7/5] flex flex-col">
			{/* Blurred destructive background circle */}
			<Box className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-destructive/20 blur-[60px] rounded-full pointer-events-none" />
			<Box className="flex items-center justify-center mb-4 relative z-10">
				<Box className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
					{t.ispale.noShowAlert}
				</Box>
			</Box>

			<Stack
				direction="column"
				alignItems="center"
				justifyContent="center"
				spacing={4}
				className="relative z-10 w-full flex-1"
			>
				{/* Avatar with danger badge */}
				<Box className="relative shrink-0">
					<Avatar className="size-20 border-2 border-destructive/30">
						<AvatarImage
							src={worstOffender.avatar || undefined}
							alt={worstOffender.name}
						/>
						<AvatarFallback>
							{worstOffender.name.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>
					<Box className="absolute -bottom-1 -right-1 bg-destructive text-white size-6 rounded-full flex items-center justify-center text-xs border-2 border-card">
						<Icon icon="solar:danger-bold" />
					</Box>
				</Box>

				{/* Content */}
				<Stack
					direction="column"
					spacing={1}
					alignItems="center"
					className="w-full"
				>
					<p className="text-lg font-bold text-center">
						{worstOffender.name}
					</p>
					<p className="text-xs text-muted-foreground text-center">
						{t.ispale.last}: {formatRelativeTime(worstOffender.lastNoShowDate)} •{" "}
						{worstOffender.noShowCount}{" "}
						{worstOffender.noShowCount === 1
							? t.ispale.miss
							: t.ispale.misses}
					</p>
				</Stack>
			</Stack>
		</Box>
	);
}
