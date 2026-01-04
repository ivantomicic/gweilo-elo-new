"use client";

import { Box } from "@/components/ui/box";
import { Stack } from "@/components/ui/stack";
import { Icon } from "@/components/ui/icon";
import { PlayerNameCard } from "@/components/ui/player-name-card";
import { TeamNameCard } from "@/components/ui/team-name-card";
import { getVideoThumbnailUrl } from "@/lib/video";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { t } from "@/lib/i18n";

export type VideoItem = {
	matchId: string;
	sessionId: string;
	roundNumber: number;
	matchType: "singles" | "doubles";
	team1Name: string;
	team2Name: string;
	team1Avatar: string | null;
	team2Avatar: string | null;
	team1Player1Avatar: string | null;
	team1Player2Avatar: string | null;
	team2Player1Avatar: string | null;
	team2Player2Avatar: string | null;
	team1Score: number | null;
	team2Score: number | null;
	videoUrl: string;
	sessionDate: string;
};

type VideoCardProps = {
	video: VideoItem;
	formatDateWeekday: (dateString: string) => string;
	formatDateShort: (dateString: string) => string;
};

// Helper to parse team name into players (for doubles)
const parseTeamName = (
	teamName: string,
	player1Avatar: string | null,
	player2Avatar: string | null
) => {
	const parts = teamName.split(" & ").map((p) => p.trim());
	return {
		player1: { name: parts[0] || teamName, avatar: player1Avatar },
		player2: { name: parts[1] || "", avatar: player2Avatar },
	};
};

export function VideoCard({
	video,
	formatDateWeekday,
	formatDateShort,
}: VideoCardProps) {
	const thumbnailUrl = getVideoThumbnailUrl(video.videoUrl);
	const dateLabel = `${formatDateWeekday(
		video.sessionDate
	)}, ${formatDateShort(video.sessionDate)}`;
	const isSingles = video.matchType === "singles";

	return (
		<Box
			onClick={() => {
				window.open(video.videoUrl, "_blank", "noopener,noreferrer");
			}}
			className="group relative bg-card rounded-[24px] border border-border/50 overflow-hidden shadow-sm touch-safe active:scale-[0.98] transition-all cursor-pointer hover-only"
		>
			{/* Thumbnail Section */}
			<Box className="aspect-video relative w-full overflow-hidden">
				{thumbnailUrl ? (
					<Image
						src={thumbnailUrl}
						alt={`Match: ${video.team1Name} vs ${video.team2Name}`}
						fill
						className="object-cover group-hover:scale-105 transition-transform duration-500"
					/>
				) : (
					<Box className="absolute inset-0 flex items-center justify-center bg-muted">
						<p className="text-muted-foreground text-sm">
							No thumbnail
						</p>
					</Box>
				)}

				{/* Gradient Overlay */}
				<Box className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

				{/* Date Badge */}
				<Box className="absolute top-3 left-3 px-2.5 py-1 bg-black/40 backdrop-blur-md rounded-lg border border-white/10 text-[10px] font-bold text-white/80 uppercase tracking-wider">
					{dateLabel}
				</Box>

				{/* Match Type Badge */}
				<Box
					className={cn(
						"absolute top-3 right-3 px-2.5 py-1 backdrop-blur-md rounded-lg border uppercase tracking-wider text-[10px] font-bold",
						video.matchType === "singles"
							? "bg-primary/20 border-primary/30 text-primary"
							: "bg-chart-5/20 border-chart-5/30 text-chart-5"
					)}
				>
					{video.matchType === "singles"
						? t.sessions.singles
						: t.sessions.doubles}
				</Box>

				{/* Play Button Overlay */}
				<Box className="absolute inset-0 flex items-center justify-center opacity-60 group-hover:opacity-100 transition-opacity">
					<Icon
						icon="solar:play-bold"
						className="size-6 text-white ml-1"
					/>
				</Box>

				{/* Player Info & Score Overlay */}
				{video.team1Score !== null && video.team2Score !== null ? (
					<Box className="absolute inset-x-0 bottom-0 p-4 pt-10">
						<Stack
							direction="column"
							alignItems="center"
							spacing={3}
						>
							{/* Score */}
							<Stack
								direction="row"
								alignItems="center"
								spacing={4}
							>
								{isSingles ? (
									<PlayerNameCard
										name={video.team1Name}
										avatar={video.team1Avatar}
										size="sm"
									/>
								) : (
									<TeamNameCard
										{...parseTeamName(
											video.team1Name,
											video.team1Player1Avatar,
											video.team1Player2Avatar
										)}
										size="sm"
									/>
								)}
								<Box className="bg-white/5 backdrop-blur-sm rounded-2xl px-4 py-1 border border-white/10">
									<span className="text-lg font-black font-heading tracking-tighter text-white">
										{video.team1Score} : {video.team2Score}
									</span>
								</Box>
								{isSingles ? (
									<PlayerNameCard
										name={video.team2Name}
										avatar={video.team2Avatar}
										size="sm"
										reverse={true}
									/>
								) : (
									<TeamNameCard
										{...parseTeamName(
											video.team2Name,
											video.team2Player1Avatar,
											video.team2Player2Avatar
										)}
										size="sm"
									/>
								)}
							</Stack>
						</Stack>
					</Box>
				) : null}
			</Box>
		</Box>
	);
}
