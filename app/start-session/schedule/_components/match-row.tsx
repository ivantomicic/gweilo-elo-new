"use client";

import { motion, AnimatePresence } from "framer-motion";
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
	isShuffling?: boolean;
	shuffleKey?: number;
};

// Slot machine spin effect - blur up then vanish
const getSpinOut = () => {
	const delay = Math.random() * 0.1;
	
	return {
		y: [0, -8, -20, -40],
		opacity: [1, 0.8, 0.4, 0],
		scale: [1, 0.95, 0.85, 0.7],
		filter: ["blur(0px)", "blur(1px)", "blur(3px)", "blur(6px)"],
		transition: { 
			duration: 0.35, 
			delay,
			ease: [0.4, 0, 1, 1] // ease-in (accelerate)
		}
	};
};

export function MatchRow({ type, players, isShuffling = false, shuffleKey = 0 }: MatchRowProps) {
	if (type === "singles") {
		const [player1, player2] = players;
		return (
			<Box className="flex items-center justify-between bg-background/50 rounded-xl p-3 border border-border/30">
				<Box className="flex-1 flex justify-end">
					<AnimatePresence mode="wait">
						<motion.div
							key={`${shuffleKey}-${player1.id}`}
							initial={{ opacity: 0, scale: 0.7, y: 30, filter: "blur(4px)" }}
							animate={isShuffling 
								? getSpinOut()
								: { 
									opacity: 1, 
									scale: 1,
									y: 0,
									filter: "blur(0px)"
								}
							}
							transition={isShuffling ? undefined : { 
								type: "spring", 
								stiffness: 400, 
								damping: 15,
								mass: 0.8,
								delay: 0.05 + Math.random() * 0.1
							}}
						>
							<PlayerNameCard
								name={player1.name}
								avatar={player1.avatar}
								id={player1.id}
								variant="horizontal"
								size="md"
								reverse
							/>
						</motion.div>
					</AnimatePresence>
				</Box>
				<Box className="px-4">
					<Box className="text-[10px] font-black text-muted-foreground bg-muted px-2 py-1 rounded">
						VS
					</Box>
				</Box>
				<Box className="flex-1">
					<AnimatePresence mode="wait">
						<motion.div
							key={`${shuffleKey}-${player2.id}`}
							initial={{ opacity: 0, scale: 0.7, y: 30, filter: "blur(4px)" }}
							animate={isShuffling 
								? getSpinOut()
								: { 
									opacity: 1, 
									scale: 1,
									y: 0,
									filter: "blur(0px)"
								}
							}
							transition={isShuffling ? undefined : { 
								type: "spring", 
								stiffness: 400, 
								damping: 15,
								mass: 0.8,
								delay: 0.05 + Math.random() * 0.1
							}}
						>
							<PlayerNameCard
								name={player2.name}
								avatar={player2.avatar}
								id={player2.id}
								variant="horizontal"
								size="md"
							/>
						</motion.div>
					</AnimatePresence>
				</Box>
			</Box>
		);
	}

	// Doubles: 4 players
	const [player1, player2, player3, player4] = players;
	return (
		<Box className="flex items-center justify-between bg-background/50 rounded-xl p-3 border border-border/30">
			<Box className="flex-1 flex justify-end">
				<AnimatePresence mode="wait">
					<motion.div
						key={`${shuffleKey}-${player1.id}-${player2.id}`}
						initial={{ opacity: 0, scale: 0.7, y: 30, filter: "blur(4px)" }}
						animate={isShuffling 
							? getSpinOut()
							: { 
								opacity: 1, 
								scale: 1,
								y: 0,
								filter: "blur(0px)"
							}
						}
						transition={isShuffling ? undefined : { 
							type: "spring", 
							stiffness: 400, 
							damping: 15,
							mass: 0.8,
							delay: 0.05 + Math.random() * 0.1
						}}
					>
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
					</motion.div>
				</AnimatePresence>
			</Box>
			<Box className="px-4">
				<Box className="text-[10px] font-black text-muted-foreground bg-muted px-2 py-1 rounded">
					VS
				</Box>
			</Box>
			<Box className="flex-1">
				<AnimatePresence mode="wait">
					<motion.div
						key={`${shuffleKey}-${player3.id}-${player4.id}`}
						initial={{ opacity: 0, scale: 0.7, y: 30, filter: "blur(4px)" }}
						animate={isShuffling 
							? getSpinOut()
							: { 
								opacity: 1, 
								scale: 1,
								y: 0,
								filter: "blur(0px)"
							}
						}
						transition={isShuffling ? undefined : { 
							type: "spring", 
							stiffness: 400, 
							damping: 15,
							mass: 0.8,
							delay: 0.05 + Math.random() * 0.1
						}}
					>
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
					</motion.div>
				</AnimatePresence>
			</Box>
		</Box>
	);
}

