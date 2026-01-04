"use client";

import { Box } from "@/components/ui/box";
import { Stack } from "@/components/ui/stack";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PlayerNameCard } from "@/components/ui/player-name-card";
import { TeamNameCard } from "@/components/ui/team-name-card";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

type Player = {
	id: string;
	name: string;
	avatar: string | null;
	elo?: number;
};

type MatchHistoryCardProps = {
	matchType: "singles" | "doubles";
	team1Players: Player[];
	team2Players: Player[];
	team1Score: number | null;
	team2Score: number | null;
	team1EloChange?: number;
	team2EloChange?: number;
	onClick?: () => void;
	hasVideo?: boolean;
};

// Helper to parse team name into players (for doubles)
const parseTeamName = (players: Player[]) => {
	return {
		player1: {
			name: players[0]?.name || "",
			avatar: players[0]?.avatar || null,
		},
		player2: {
			name: players[1]?.name || "",
			avatar: players[1]?.avatar || null,
		},
	};
};

export function MatchHistoryCard({
	matchType,
	team1Players,
	team2Players,
	team1Score,
	team2Score,
	team1EloChange,
	team2EloChange,
	onClick,
	hasVideo,
}: MatchHistoryCardProps) {
	const isSingles = matchType === "singles";
	const team1Won = team1Score !== null && team2Score !== null && team1Score > team2Score;
	const team2Won = team1Score !== null && team2Score !== null && team2Score > team1Score;

	const formatEloChange = (change?: number) => {
		if (change === undefined || change === null) return null;
		const rounded = Math.round(change);
		return rounded > 0 ? `+${rounded}` : `${rounded}`;
	};

	const team1Change = formatEloChange(team1EloChange);
	const team2Change = formatEloChange(team2EloChange);

	return (
		<Box
			onClick={onClick}
			className={cn(
				"bg-card rounded-xl border border-border/40 overflow-hidden",
				onClick && "cursor-pointer hover:border-border active:scale-[0.99] transition-all"
			)}
		>
			<Box className="px-3 py-3 flex items-center gap-3">
				{/* Team 1 */}
				<Box className="flex items-center gap-2 flex-1">
					{isSingles ? (
						<>
							<Avatar
								className={cn(
									"size-9 rounded-full border-2",
									team1Won
										? "border-emerald-500/40"
										: "border-red-500/40 grayscale opacity-60"
								)}
							>
								<AvatarImage
									src={team1Players[0]?.avatar || undefined}
									alt={team1Players[0]?.name}
								/>
								<AvatarFallback>
									{team1Players[0]?.name?.charAt(0).toUpperCase() || "?"}
								</AvatarFallback>
							</Avatar>
							<Box className="flex flex-col">
								<span className="text-xs font-bold leading-tight">
									{team1Players[0]?.name || "Unknown"}
								</span>
								{team1Change && (
									<span
										className={cn(
											"text-[10px] font-mono font-semibold",
											team1Change.startsWith("+")
												? "text-emerald-500"
												: "text-red-500"
										)}
									>
										{team1Change}
									</span>
								)}
							</Box>
						</>
					) : (
						<>
							<Stack direction="row" spacing={-2}>
								{team1Players.map((player) => (
									<Avatar
										key={player.id}
										className={cn(
											"size-9 rounded-full border-2",
											team1Won
												? "border-emerald-500/40"
												: "border-red-500/40 grayscale opacity-60"
										)}
									>
										<AvatarImage
											src={player.avatar || undefined}
											alt={player.name}
										/>
										<AvatarFallback>
											{player.name?.charAt(0).toUpperCase() || "?"}
										</AvatarFallback>
									</Avatar>
								))}
							</Stack>
							<Box className="flex flex-col">
								<span className="text-xs font-bold leading-tight">
									{team1Players[0]?.name || ""} & {team1Players[1]?.name || ""}
								</span>
								{team1Change && (
									<span
										className={cn(
											"text-[10px] font-mono font-semibold",
											team1Change.startsWith("+")
												? "text-emerald-500"
												: "text-red-500"
										)}
									>
										{team1Change}
									</span>
								)}
							</Box>
						</>
					)}
				</Box>

				{/* Score & Match Type */}
				<Box className="flex flex-col items-center gap-0.5 px-3">
					<span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">
						{matchType === "singles" ? t.sessions.singles : t.sessions.doubles}
					</span>
					{team1Score !== null && team2Score !== null ? (
						<span className="text-lg font-bold font-mono">
							{team1Score}-{team2Score}
						</span>
					) : (
						<span className="text-lg font-bold font-mono text-muted-foreground">
							-
						</span>
					)}
				</Box>

				{/* Team 2 */}
				<Box className="flex items-center gap-2 flex-1 justify-end">
					{isSingles ? (
						<>
							<Box className="flex flex-col items-end">
								<span className="text-xs font-bold leading-tight">
									{team2Players[0]?.name || "Unknown"}
								</span>
								{team2Change && (
									<span
										className={cn(
											"text-[10px] font-mono font-semibold",
											team2Change.startsWith("+")
												? "text-emerald-500"
												: "text-red-500"
										)}
									>
										{team2Change}
									</span>
								)}
							</Box>
							<Avatar
								className={cn(
									"size-9 rounded-full border-2",
									team2Won
										? "border-emerald-500/40"
										: "border-red-500/40 grayscale opacity-60"
								)}
							>
								<AvatarImage
									src={team2Players[0]?.avatar || undefined}
									alt={team2Players[0]?.name}
								/>
								<AvatarFallback>
									{team2Players[0]?.name?.charAt(0).toUpperCase() || "?"}
								</AvatarFallback>
							</Avatar>
						</>
					) : (
						<>
							<Box className="flex flex-col items-end">
								<span className="text-xs font-bold leading-tight">
									{team2Players[0]?.name || ""} & {team2Players[1]?.name || ""}
								</span>
								{team2Change && (
									<span
										className={cn(
											"text-[10px] font-mono font-semibold",
											team2Change.startsWith("+")
												? "text-emerald-500"
												: "text-red-500"
										)}
									>
										{team2Change}
									</span>
								)}
							</Box>
							<Stack direction="row" spacing={-2}>
								{team2Players.map((player) => (
									<Avatar
										key={player.id}
										className={cn(
											"size-9 rounded-full border-2",
											team2Won
												? "border-emerald-500/40"
												: "border-red-500/40 grayscale opacity-60"
										)}
									>
										<AvatarImage
											src={player.avatar || undefined}
											alt={player.name}
										/>
										<AvatarFallback>
											{player.name?.charAt(0).toUpperCase() || "?"}
										</AvatarFallback>
									</Avatar>
								))}
							</Stack>
						</>
					)}
				</Box>
			</Box>
		</Box>
	);
}

