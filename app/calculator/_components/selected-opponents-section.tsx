import { AnimatePresence } from "framer-motion";
import type { MatchResult } from "@/lib/elo/calculation";
import { Box } from "@/components/ui/box";
import { Icon } from "@/components/ui/icon";
import { Stack } from "@/components/ui/stack";
import { cn } from "@/lib/utils";
import { formatDelta } from "@/app/calculator/_lib/utils";
import type {
	PlayerWithRating,
	PredictedResults,
} from "@/app/calculator/_lib/types";
import { SelectedOpponentCard } from "@/app/calculator/_components/selected-opponent-card";

type SelectedOpponentsSectionProps = {
	selectedOpponents: PlayerWithRating[];
	predictedResults: PredictedResults;
	totalProjectedDelta: number;
	onRemoveOpponent: (opponentId: string) => void;
	onSetPredictionForOpponent: (
		opponentId: string,
		result: MatchResult,
	) => void;
	getOpponentDelta: (
		opponent: PlayerWithRating,
		result: MatchResult,
	) => number;
};

export function SelectedOpponentsSection({
	selectedOpponents,
	predictedResults,
	totalProjectedDelta,
	onRemoveOpponent,
	onSetPredictionForOpponent,
	getOpponentDelta,
}: SelectedOpponentsSectionProps) {
	return (
		<Box className="overflow-hidden">
			<Stack
				direction="row"
				alignItems="center"
				justifyContent="between"
				className="px-1 mb-4"
			>
				<h3 className="text-lg font-bold text-foreground">
					Odabrani protivnici
				</h3>
				<Box className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
					{selectedOpponents.length}
				</Box>
			</Stack>

			{selectedOpponents.length === 0 ? (
				<Box className="bg-secondary/30 rounded-2xl p-4 border border-border/30">
					<Stack
						direction="row"
						alignItems="start"
						spacing={3}
					>
						<Icon
							icon="solar:target-bold"
							className="size-5 text-primary shrink-0 mt-0.5"
						/>
						<p className="text-sm text-muted-foreground leading-relaxed">
							Izaberi bar jednog protivnika da postaviš ishod
							(Win / Draw / Loss).
						</p>
					</Stack>
				</Box>
			) : (
				<Stack
					direction="column"
					spacing={3}
				>
					<AnimatePresence>
						{selectedOpponents.map((opponent) => {
							const result =
								predictedResults[opponent.id] || "draw";
							return (
								<SelectedOpponentCard
									key={opponent.id}
									opponent={opponent}
									result={result}
									winDelta={getOpponentDelta(
										opponent,
										"win",
									)}
									drawDelta={getOpponentDelta(
										opponent,
										"draw",
									)}
									lossDelta={getOpponentDelta(
										opponent,
										"loss",
									)}
									onRemove={onRemoveOpponent}
									onSetPrediction={
										onSetPredictionForOpponent
									}
								/>
							);
						})}
					</AnimatePresence>

					<Box className="bg-card rounded-2xl border border-primary/20 p-4">
						<Stack
							direction="row"
							alignItems="center"
							justifyContent="between"
						>
							<p className="text-sm font-semibold text-muted-foreground">
								Finalna projekcija
							</p>
							<p
								className={cn(
									"text-2xl font-bold leading-none",
									totalProjectedDelta > 0
										? "text-emerald-500"
										: totalProjectedDelta < 0
											? "text-red-500"
											: "text-muted-foreground",
								)}
							>
								{formatDelta(totalProjectedDelta)}
							</p>
						</Stack>
					</Box>
				</Stack>
			)}
		</Box>
	);
}
