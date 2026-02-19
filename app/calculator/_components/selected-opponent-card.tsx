import { motion } from "framer-motion";
import type { MatchResult } from "@/lib/elo/calculation";
import { Icon } from "@/components/ui/icon";
import { PlayerNameCard } from "@/components/ui/player-name-card";
import { formatDelta } from "@/app/calculator/_lib/utils";
import type { PlayerWithRating } from "@/app/calculator/_lib/types";
import { PredictionSelector } from "@/app/calculator/_components/prediction-selector";

type SelectedOpponentCardProps = {
	opponent: PlayerWithRating;
	result: MatchResult;
	winDelta: number;
	drawDelta: number;
	lossDelta: number;
	onRemove: (opponentId: string) => void;
	onSetPrediction: (opponentId: string, result: MatchResult) => void;
};

export function SelectedOpponentCard({
	opponent,
	result,
	winDelta,
	drawDelta,
	lossDelta,
	onRemove,
	onSetPrediction,
}: SelectedOpponentCardProps) {
	return (
		<motion.div
			layout
			initial={{
				opacity: 0,
				y: 8,
			}}
			animate={{
				opacity: 1,
				y: 0,
			}}
			exit={{
				opacity: 0,
				y: -8,
			}}
			className="calculator-opponent-card rounded-2xl p-3 border border-border/50 bg-card"
		>
			<div className="calculator-opponent-top flex items-start gap-3">
				<div className="min-w-0 flex-1">
					<PlayerNameCard
						name={opponent.name}
						avatar={opponent.avatar}
						id={opponent.id}
						size="sm"
						addon={
							<div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
								<span className="text-muted-foreground">
									Elo {Math.round(opponent.elo)}
								</span>
								<span className="text-emerald-500">
									+{Math.abs(Math.round(winDelta))}
								</span>
								<span className="text-muted-foreground">
									{formatDelta(drawDelta)}
								</span>
								<span className="text-red-500">
									{formatDelta(lossDelta)}
								</span>
							</div>
						}
					/>
				</div>
				<div className="calculator-opponent-selector-inline">
					<PredictionSelector
						result={result}
						onChange={(nextResult) =>
							onSetPrediction(opponent.id, nextResult)
						}
					/>
				</div>
				<button
					onClick={() => onRemove(opponent.id)}
					className="size-8 rounded-full bg-secondary/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
					aria-label={`Ukloni ${opponent.name}`}
				>
					<Icon
						icon="solar:close-circle-bold"
						className="size-5"
					/>
				</button>
			</div>

			<div className="calculator-opponent-selector-below">
				<PredictionSelector
					result={result}
					onChange={(nextResult) =>
						onSetPrediction(opponent.id, nextResult)
					}
				/>
			</div>
		</motion.div>
	);
}
