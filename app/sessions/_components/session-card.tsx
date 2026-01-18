"use client";

import { useRouter } from "next/navigation";
import { Box } from "@/components/ui/box";
import { Stack } from "@/components/ui/stack";
import { Icon } from "@/components/ui/icon";
import { t } from "@/lib/i18n";

type BestWorstPlayer = {
	best_player_id: string | null;
	best_player_display_name: string | null;
	best_player_delta: number | null;
	worst_player_id: string | null;
	worst_player_display_name: string | null;
	worst_player_delta: number | null;
};

type Session = {
	id: string;
	player_count: number;
	created_at: string;
	status: "active" | "completed";
	completed_at?: string | null;
	singles_match_count: number;
	doubles_match_count: number;
	best_worst_player?: BestWorstPlayer | null;
};

type SessionCardProps = {
	session: Session;
	formatDateWeekday: (dateString: string) => string;
	formatDateDay: (dateString: string) => string;
	formatDateYear: (dateString: string) => string;
};

export function SessionCard({
	session,
	formatDateWeekday,
	formatDateDay,
	formatDateYear,
}: SessionCardProps) {
	const router = useRouter();

	const singlesCount = session.singles_match_count ?? 0;
	const doublesCount = session.doubles_match_count ?? 0;
	const hasMatches = singlesCount > 0 || doublesCount > 0;

	const bestWorst = session.best_worst_player;
	const hasBestWorst =
		bestWorst &&
		(bestWorst.best_player_delta !== null ||
			bestWorst.worst_player_delta !== null);
	
	// Show skeleton for completed sessions while best/worst data is loading
	const isLoadingBestWorst = session.status === "completed" && bestWorst === null;

	return (
		<Box
			onClick={() => router.push(`/session/${session.id}`)}
			className="group relative bg-card rounded-[24px] border border-border/50 p-4 transition-all cursor-pointer shadow-sm touch-safe hover-only active:scale-[0.98] active:bg-accent/50"
		>
			<Stack direction="row" alignItems="center" spacing={4}>
				{/* Date Section */}
				<Box className="flex flex-col items-center justify-center min-w-[72px] border-r border-border/30 pr-4">
					<span className="text-[10px] font-bold text-primary uppercase tracking-wider mb-0.5">
						{formatDateWeekday(session.created_at)}
					</span>
					<span className="text-xl font-bold font-heading">
						{formatDateDay(session.created_at)}
					</span>
					<Stack
						direction="row"
						alignItems="center"
						spacing={1}
						className="mt-1 text-[10px] text-muted-foreground font-medium"
					>
						<Icon
							icon="solar:clock-circle-linear"
							className="size-3"
						/>
						<span>{formatDateYear(session.created_at)}</span>
					</Stack>
				</Box>

				{/* Stats Section */}
				<Box className="flex-1 min-w-0 py-1">
					<Stack direction="column" spacing={1.5}>
						{/* Player Count */}
						<Stack
							direction="row"
							alignItems="center"
							spacing={1.5}
						>
							<Icon
								icon="solar:users-group-two-rounded-bold-duotone"
								className="size-4 text-muted-foreground"
							/>
							<span className="text-xs font-semibold">
								{session.player_count}{" "}
								<span className="text-muted-foreground font-normal">
									{t.sessions.players}
								</span>
							</span>
						</Stack>

						{/* Match Counts */}
						{hasMatches && (
							<Box className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground font-medium bg-secondary/30 w-fit px-2 py-1 rounded-lg">
								{singlesCount > 0 && (
									<span>
										{t.sessions.singles}: {singlesCount}
									</span>
								)}
								{singlesCount > 0 && doublesCount > 0 && (
									<span className="w-1 h-1 rounded-full bg-border" />
								)}
								{doublesCount > 0 && (
									<span>
										{t.sessions.doubles}: {doublesCount}
									</span>
								)}
							</Box>
						)}

						{/* Best/Worst Players */}
						{isLoadingBestWorst && (
							<Stack
								direction="row"
								alignItems="center"
								spacing={2}
								className="mt-2 flex-wrap"
							>
								{/* Skeleton for best player badge */}
								<Box className="h-[20px] w-[100px] bg-muted-foreground/20 rounded-lg animate-pulse" />
								{/* Skeleton for worst player badge */}
								<Box className="h-[20px] w-[100px] bg-muted-foreground/20 rounded-lg animate-pulse" />
							</Stack>
						)}
						{hasBestWorst && (
							<Stack
								direction="row"
								alignItems="center"
								spacing={2}
								className="mt-2 flex-wrap"
							>
								{bestWorst.best_player_delta !== null && (
									<Box className="flex items-center gap-1.5 text-[10px] bg-secondary/30 w-fit px-2 py-1 rounded-lg">
										<Icon
											icon="solar:star-bold"
											className="size-3.5 text-yellow-400"
										/>
										<span className="text-foreground font-semibold">
											{bestWorst.best_player_display_name ||
												t.sessions.unknown}
										</span>
										<span className="text-emerald-400 font-semibold ml-1">
											(+
											{Math.round(
												Number(
													bestWorst.best_player_delta
												)
											)}
											)
										</span>
									</Box>
								)}
								{bestWorst.worst_player_delta !== null && (
									<Box className="flex items-center gap-1.5 text-[10px] bg-secondary/30 w-fit px-2 py-1 rounded-lg">
										<Icon
											icon="solar:arrow-down-bold"
											className="size-3.5 text-red-400"
										/>
										<span className="text-foreground font-semibold">
											{bestWorst.worst_player_display_name ||
												t.sessions.unknown}
										</span>
										<span className="text-red-400 font-semibold ml-1">
											(
											{Math.round(
												Number(
													bestWorst.worst_player_delta
												)
											)}
											)
										</span>
									</Box>
								)}
							</Stack>
						)}
					</Stack>
				</Box>

				{/* Arrow Icon */}
				<Icon
					icon="solar:alt-arrow-right-linear"
					className="size-4 text-muted-foreground/50"
				/>
			</Stack>
		</Box>
	);
}
