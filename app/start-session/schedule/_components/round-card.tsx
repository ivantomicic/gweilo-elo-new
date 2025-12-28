"use client";

import { Box } from "@/components/ui/box";
import { Stack } from "@/components/ui/stack";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MatchRow } from "./match-row";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

type Player = {
	id: string;
	name: string;
	avatar: string | null;
};

type Match = {
	type: "singles" | "doubles";
	players: Player[]; // 2 for singles, 4 for doubles
};

type RoundCardProps = {
	roundNumber: number;
	matches: Match[];
	restingPlayers?: Player[];
	isActive?: boolean;
};

export function RoundCard({
	roundNumber,
	matches,
	restingPlayers,
	isActive = false,
}: RoundCardProps) {
	return (
		<Stack direction="row" spacing={4} className="relative z-10">
			{/* Round number indicator */}
			<Box
				className={cn(
					"size-12 rounded-full bg-background border-4 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(59,130,246,0.3)]",
					isActive ? "border-primary" : "border-border"
				)}
			>
				<span
					className={cn(
						"text-sm font-bold",
						isActive ? "text-foreground" : "text-muted-foreground"
					)}
				>
					{roundNumber}
				</span>
			</Box>

			{/* Round card */}
			<Box className="flex-1 bg-card rounded-[20px] p-4 border border-border/50">
				{/* Matches */}
				<Stack direction="column" spacing={3}>
					{matches.map((match, index) => (
						<MatchRow key={index} type={match.type} players={match.players} />
					))}
				</Stack>
			</Box>
		</Stack>
	);
}

