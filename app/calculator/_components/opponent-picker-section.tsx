import { AnimatePresence, motion } from "framer-motion";
import type { RefObject } from "react";
import { Box } from "@/components/ui/box";
import { Icon } from "@/components/ui/icon";
import { PlayerNameCard } from "@/components/ui/player-name-card";
import { Stack } from "@/components/ui/stack";
import { cn } from "@/lib/utils";
import type { PlayerWithRating } from "@/app/calculator/_lib/types";

type OpponentPickerSectionProps = {
	availableOpponents: PlayerWithRating[];
	selectedCount: number;
	scrollRef: RefObject<HTMLDivElement>;
	canScrollLeft: boolean;
	canScrollRight: boolean;
	onScroll: () => void;
	onToggleOpponent: (opponentId: string) => void;
};

export function OpponentPickerSection({
	availableOpponents,
	selectedCount,
	scrollRef,
	canScrollLeft,
	canScrollRight,
	onScroll,
	onToggleOpponent,
}: OpponentPickerSectionProps) {
	return (
		<Box className="overflow-hidden">
			<Stack
				direction="row"
				alignItems="center"
				justifyContent="between"
				className="px-1 mb-4"
			>
				<h3 className="text-lg font-bold text-foreground">
					Izaberi protivnike
				</h3>
				<motion.div
					key={selectedCount}
					initial={{ scale: 1.2 }}
					animate={{ scale: 1 }}
					className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md"
				>
					{selectedCount} izabrano
				</motion.div>
			</Stack>

			<div className="w-full max-w-full relative">
				<div
					className={cn(
						"absolute left-0 top-0 bottom-4 w-16 bg-gradient-to-r from-background via-background/60 to-transparent z-10 pointer-events-none transition-opacity duration-200",
						canScrollLeft ? "opacity-100" : "opacity-0",
					)}
				/>
				<div
					className={cn(
						"absolute right-0 top-0 bottom-4 w-16 bg-gradient-to-l from-background via-background/60 to-transparent z-10 pointer-events-none transition-opacity duration-200",
						canScrollRight ? "opacity-100" : "opacity-0",
					)}
				/>
				<div
					ref={scrollRef}
					onScroll={onScroll}
					className="w-full overflow-x-auto scrollbar-hide"
				>
					<div className="flex gap-4 pb-4 w-max">
						<AnimatePresence>
							{availableOpponents.map((player) => (
								<motion.button
									key={player.id}
									initial={{
										opacity: 0,
										scale: 0.8,
									}}
									animate={{
										opacity: 1,
										scale: 1,
									}}
									exit={{
										opacity: 0,
										scale: 0.8,
									}}
									transition={{
										duration: 0.2,
									}}
									onClick={() => onToggleOpponent(player.id)}
									className="flex-shrink-0"
									whileTap={{
										scale: 0.95,
									}}
								>
									<PlayerNameCard
										name={player.name}
										avatar={player.avatar}
										id={player.id}
										size="lg"
										variant="vertical"
										avatarBorder="transparent"
										addon={
											<span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
												Elo {Math.round(player.elo)}
											</span>
										}
									/>
								</motion.button>
							))}
						</AnimatePresence>
					</div>
				</div>
			</div>

			{availableOpponents.length === 0 && (
				<Box className="mt-1 bg-secondary/30 rounded-2xl p-4 border border-border/30">
					<Stack
						direction="row"
						alignItems="start"
						spacing={3}
					>
						<Icon
							icon="solar:info-circle-bold"
							className="size-5 text-primary shrink-0 mt-0.5"
						/>
						<p className="text-sm text-muted-foreground leading-relaxed">
							Svi dostupni protivnici su već izabrani.
						</p>
					</Stack>
				</Box>
			)}
		</Box>
	);
}
