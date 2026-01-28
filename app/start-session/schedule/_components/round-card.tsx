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
	isDynamic?: boolean; // Indicates this round will be determined dynamically
	isShuffling?: boolean;
	shuffleKey?: number;
};

export function RoundCard({
	roundNumber,
	matches,
	restingPlayers,
	isActive = false,
	isDynamic = false,
	isShuffling = false,
	shuffleKey = 0,
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
				{/* Dynamic indicator badge */}
				{isDynamic && (
					<Box className="mb-3 flex items-center gap-2">
						<Box className="flex items-center gap-1.5 bg-primary/10 text-primary px-2.5 py-1 rounded-full border border-primary/20">
							<svg
								className="size-3"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M13 10V3L4 14h7v7l9-11h-7z"
								/>
							</svg>
							<span className="text-[10px] font-bold uppercase tracking-wider">
								Dynamic
							</span>
						</Box>
					</Box>
				)}

				{/* Matches */}
				<Stack direction="column" spacing={3}>
					{isDynamic ? (
						<>
							<Box className="text-sm text-muted-foreground py-2 space-y-1">
								<p className="font-medium text-foreground/80">
									Schedule will be determined after Round {roundNumber - 1} is
									completed.
								</p>
								<p className="text-xs">
									Winners from Round {roundNumber - 1} doubles will stay in
									doubles and play against players from Round {roundNumber - 1}{" "}
									singles.
								</p>
							</Box>
							{/* Show placeholder matches for reference */}
							<Box className="opacity-50">
								{matches.map((match, index) => (
									<MatchRow
										key={index}
										type={match.type}
										players={match.players}
									/>
								))}
							</Box>
						</>
					) : (
						matches.map((match, index) => (
							<MatchRow 
								key={index} 
								type={match.type} 
								players={match.players}
								isShuffling={isShuffling}
								shuffleKey={shuffleKey}
							/>
						))
					)}
				</Stack>
			</Box>
		</Stack>
	);
}

