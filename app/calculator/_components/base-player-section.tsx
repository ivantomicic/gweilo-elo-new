import { AnimatePresence, motion } from "framer-motion";
import { Box } from "@/components/ui/box";
import { Icon } from "@/components/ui/icon";
import { Stack } from "@/components/ui/stack";
import { cn } from "@/lib/utils";
import type { PlayerWithRating } from "@/app/calculator/_lib/types";

type BasePlayerSectionProps = {
	currentPlayer: PlayerWithRating;
	availablePlayers: PlayerWithRating[];
	isPickerOpen: boolean;
	onTogglePicker: () => void;
	onSelectPlayer: (playerId: string) => void;
};

export function BasePlayerSection({
	currentPlayer,
	availablePlayers,
	isPickerOpen,
	onTogglePicker,
	onSelectPlayer,
}: BasePlayerSectionProps) {
	return (
		<Box className="overflow-hidden">
			<button
				onClick={onTogglePicker}
				className="flex w-full items-center justify-between rounded-2xl border border-border/50 bg-card px-4 py-3 text-left transition-colors hover:bg-secondary/40"
				type="button"
			>
				<div className="min-w-0 flex items-center gap-2">
					<span className="text-xs font-bold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
						Računaj za
					</span>
					<span className="truncate text-base font-semibold text-foreground">
						{currentPlayer.name}
					</span>
				</div>
				<div className="flex items-center gap-3">
					<div className="hidden text-right sm:block">
						<p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
							Elo {Math.round(currentPlayer.elo)}
						</p>
					</div>
					<Icon
						icon={
							isPickerOpen
								? "solar:alt-arrow-up-linear"
								: "solar:alt-arrow-down-linear"
						}
						className="size-4 shrink-0 text-muted-foreground"
					/>
				</div>
			</button>

			<AnimatePresence initial={false}>
				{isPickerOpen && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2 }}
						className="overflow-hidden"
					>
						<div className="pt-3">
							<div className="ml-auto w-full max-w-sm rounded-2xl border border-border/50 bg-card p-2">
								<div className="flex flex-col">
									{availablePlayers.map((player) => (
										<button
											key={player.id}
											onClick={() => onSelectPlayer(player.id)}
											className={cn(
												"flex items-center justify-between rounded-xl px-3 py-3 text-left transition-colors",
												"hover:bg-secondary/50",
											)}
											type="button"
										>
											<div className="min-w-0">
												<p className="truncate text-sm font-semibold text-foreground">
													{player.name}
												</p>
											</div>
											<span className="shrink-0 text-xs font-bold uppercase tracking-widest text-muted-foreground">
												Elo {Math.round(player.elo)}
											</span>
										</button>
									))}
								</div>
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</Box>
	);
}
