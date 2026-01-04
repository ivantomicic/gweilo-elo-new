"use client";

import { Box } from "@/components/ui/box";
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
	const team1Won =
		team1Score !== null && team2Score !== null && team1Score > team2Score;
	const team2Won =
		team1Score !== null && team2Score !== null && team2Score > team1Score;

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
				onClick &&
					"cursor-pointer hover:border-border active:scale-[0.99] transition-all"
			)}
		>
			<Box className="px-3 py-3 flex items-center gap-3">
				{/* Team 1 */}
				<Box className="flex items-center gap-2 flex-1">
					{isSingles ? (
						<PlayerNameCard
							name={team1Players[0]?.name || "Unknown"}
							avatar={team1Players[0]?.avatar || null}
							size="sm"
							avatarBorder={team1Won ? "primary" : "transparent"}
							className={cn(!team1Won && "opacity-60")}
							addon={
								team1Change ? (
									<span
										className={cn(
											"text-[10px]",
											team1Change.startsWith("+")
												? "text-emerald-500"
												: "text-red-500"
										)}
									>
										{team1Change}
									</span>
								) : undefined
							}
						/>
					) : (
						<TeamNameCard
							player1={{
								name: team1Players[0]?.name || "",
								avatar: team1Players[0]?.avatar || null,
							}}
							player2={{
								name: team1Players[1]?.name || "",
								avatar: team1Players[1]?.avatar || null,
							}}
							size="sm"
							className={cn(!team1Won && "opacity-60")}
							addon={
								team1Change ? (
									<span
										className={cn(
											"text-[10px]",
											team1Change.startsWith("+")
												? "text-emerald-500"
												: "text-red-500"
										)}
									>
										{team1Change}
									</span>
								) : undefined
							}
						/>
					)}
				</Box>

				{/* Score & Match Type */}
				<Box className="flex flex-col items-center gap-0.5 px-3">
					<span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">
						{matchType === "singles"
							? t.sessions.singles
							: t.sessions.doubles}
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
						<PlayerNameCard
							name={team2Players[0]?.name || "Unknown"}
							avatar={team2Players[0]?.avatar || null}
							size="sm"
							reverse
							avatarBorder={team2Won ? "primary" : "transparent"}
							addon={
								team2Change ? (
									<span
										className={cn(
											"text-[10px]",
											team2Change.startsWith("+")
												? "text-emerald-500"
												: "text-red-500"
										)}
									>
										{team2Change}
									</span>
								) : undefined
							}
						/>
					) : (
						<TeamNameCard
							player1={{
								name: team2Players[0]?.name || "",
								avatar: team2Players[0]?.avatar || null,
							}}
							player2={{
								name: team2Players[1]?.name || "",
								avatar: team2Players[1]?.avatar || null,
							}}
							size="sm"
							className="flex-row-reverse"
							addon={
								team2Change ? (
									<span
										className={cn(
											"text-[10px] text-right",
											team2Change.startsWith("+")
												? "text-emerald-500"
												: "text-red-500"
										)}
									>
										{team2Change}
									</span>
								) : undefined
							}
						/>
					)}
				</Box>
			</Box>
		</Box>
	);
}
