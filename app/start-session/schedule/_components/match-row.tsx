"use client";

import { Box } from "@/components/ui/box";
import { PlayerNameCard } from "@/components/ui/player-name-card";
import { TeamNameCard } from "@/components/ui/team-name-card";

type Player = {
	id: string;
	name: string;
	avatar: string | null;
};

type MatchRowProps = {
	type: "singles" | "doubles";
	players: Player[]; // 2 for singles, 4 for doubles
};

export function MatchRow({ type, players }: MatchRowProps) {
	if (type === "singles") {
		const [player1, player2] = players;
		return (
			<Box className="flex items-center justify-between bg-background/50 rounded-xl p-3 border border-border/30">
				<Box className="flex-1 flex justify-end">
					<PlayerNameCard
						name={player1.name}
						avatar={player1.avatar}
						id={player1.id}
						variant="horizontal"
						size="md"
						reverse
					/>
				</Box>
				<Box className="px-4">
					<Box className="text-[10px] font-black text-muted-foreground bg-muted px-2 py-1 rounded">
						VS
					</Box>
				</Box>
				<Box className="flex-1">
					<PlayerNameCard
						name={player2.name}
						avatar={player2.avatar}
						id={player2.id}
						variant="horizontal"
						size="md"
					/>
				</Box>
			</Box>
		);
	}

	// Doubles: 4 players
	const [player1, player2, player3, player4] = players;
	return (
		<Box className="flex items-center justify-between bg-background/50 rounded-xl p-3 border border-border/30">
			<Box className="flex-1 flex justify-end">
				<TeamNameCard
					player1={{
						name: player1.name,
						avatar: player1.avatar,
						id: player1.id,
					}}
					player2={{
						name: player2.name,
						avatar: player2.avatar,
						id: player2.id,
					}}
					variant="horizontal"
					size="md"
					reverse
				/>
			</Box>
			<Box className="px-4">
				<Box className="text-[10px] font-black text-muted-foreground bg-muted px-2 py-1 rounded">
					VS
				</Box>
			</Box>
			<Box className="flex-1">
				<TeamNameCard
					player1={{
						name: player3.name,
						avatar: player3.avatar,
						id: player3.id,
					}}
					player2={{
						name: player4.name,
						avatar: player4.avatar,
						id: player4.id,
					}}
					variant="horizontal"
					size="md"
				/>
			</Box>
		</Box>
	);
}

