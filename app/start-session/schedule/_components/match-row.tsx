"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Box } from "@/components/ui/box";
import { Stack } from "@/components/ui/stack";
import { cn } from "@/lib/utils";

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
				<Stack direction="column" alignItems="center" spacing={1} className="flex-1">
					<Avatar className="size-10">
						<AvatarImage src={player1.avatar || undefined} alt={player1.name} />
						<AvatarFallback>
							{player1.name.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>
					<span className="text-xs font-medium">{player1.name}</span>
				</Stack>
				<Box className="px-4">
					<Box className="text-[10px] font-black text-muted-foreground bg-muted px-2 py-1 rounded">
						VS
					</Box>
				</Box>
				<Stack direction="column" alignItems="center" spacing={1} className="flex-1">
					<Avatar className="size-10">
						<AvatarImage src={player2.avatar || undefined} alt={player2.name} />
						<AvatarFallback>
							{player2.name.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>
					<span className="text-xs font-medium">{player2.name}</span>
				</Stack>
			</Box>
		);
	}

	// Doubles: 4 players
	const [player1, player2, player3, player4] = players;
	return (
		<Box className="flex items-center justify-between bg-background/50 rounded-xl p-3 border border-border/30">
			<Stack direction="column" alignItems="center" spacing={1} className="flex-1">
				<Stack direction="row" spacing={-3} className="mb-1">
					<Avatar className="size-10 border-2 border-background">
						<AvatarImage src={player1.avatar || undefined} alt={player1.name} />
						<AvatarFallback>
							{player1.name.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>
					<Avatar className="size-10 border-2 border-background">
						<AvatarImage src={player2.avatar || undefined} alt={player2.name} />
						<AvatarFallback>
							{player2.name.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>
				</Stack>
				<span className="text-xs font-medium text-center leading-tight">
					{player1.name} & {player2.name}
				</span>
			</Stack>
			<Box className="px-4">
				<Box className="text-[10px] font-black text-muted-foreground bg-muted px-2 py-1 rounded">
					VS
				</Box>
			</Box>
			<Stack direction="column" alignItems="center" spacing={1} className="flex-1">
				<Stack direction="row" spacing={-3} className="mb-1">
					<Avatar className="size-10 border-2 border-background">
						<AvatarImage src={player3.avatar || undefined} alt={player3.name} />
						<AvatarFallback>
							{player3.name.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>
					<Avatar className="size-10 border-2 border-background">
						<AvatarImage src={player4.avatar || undefined} alt={player4.name} />
						<AvatarFallback>
							{player4.name.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>
				</Stack>
				<span className="text-xs font-medium text-center leading-tight">
					{player3.name} & {player4.name}
				</span>
			</Stack>
		</Box>
	);
}

