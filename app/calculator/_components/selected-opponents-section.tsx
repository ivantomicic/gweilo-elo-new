import { AnimatePresence } from "framer-motion";
import type { MatchResult } from "@/lib/elo/calculation";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { eloDeltaClass, formatDelta, formatElo, opponentLabel } from "@/app/calculator/_lib/utils";
import type {
	PlayerWithRating,
	PredictedResults,
} from "@/app/calculator/_lib/types";
import { SelectedOpponentCard } from "@/app/calculator/_components/selected-opponent-card";

type SelectedOpponentsSectionProps = {
	player: PlayerWithRating;
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
	player,
	selectedOpponents,
	predictedResults,
	totalProjectedDelta,
	onRemoveOpponent,
	onSetPredictionForOpponent,
	getOpponentDelta,
}: SelectedOpponentsSectionProps) {
	if (selectedOpponents.length === 0) {
		return (
		<section className="flex items-center gap-[14px] py-2" aria-live="polite">
			<Icon
				icon="ph:ping-pong-fill"
				className="size-7 shrink-0 text-[rgb(var(--ds-native-lime))]"
				aria-hidden="true"
			/>
			<div className="min-w-0">
				<h2 className="calculator-system-heading text-ios-body font-bold leading-5 text-[rgb(var(--ds-native-bone))]">
					Dodaj prvog protivnika
				</h2>
				<p className="mt-[3px] text-ios-subheadline leading-5 text-[rgb(var(--ds-native-muted))]">
					Dodirni avatar iznad da vidiš mogući dobitak ili gubitak.
				</p>
			</div>
		</section>
		);
	}

	const projectedElo = Math.round(player.elo + totalProjectedDelta);

	return (
		<section aria-labelledby="calculator-projection-heading">
			<div className="mb-7 flex items-center gap-[18px] py-1">
				<div>
					<h2
						id="calculator-projection-heading"
						className="font-session-label text-ios-label-12 font-semibold uppercase leading-[15px] tracking-[1.8px] text-[rgb(var(--ds-native-purple-bright))]"
					>
						Projekcija
					</h2>
					<p className="mt-1 text-ios-subheadline font-semibold leading-5 text-[rgb(var(--ds-native-muted))]">
						{selectedOpponents.length} {opponentLabel(selectedOpponents.length)}
					</p>
				</div>
				<div className="ml-auto text-right">
					<p className="font-session-display text-ios-display-30 font-black leading-none tabular-nums text-[rgb(var(--ds-native-bone))]">
						{formatElo(projectedElo)} Elo
					</p>
					<p
						aria-live="polite"
						className={cn(
							"mt-0.5 text-ios-subheadline font-black leading-5 tabular-nums",
							eloDeltaClass(totalProjectedDelta),
						)}
					>
						{formatDelta(totalProjectedDelta)}
					</p>
				</div>
			</div>

			<div className="grid gap-[14px]">
				<AnimatePresence initial={false}>
					{selectedOpponents.map((opponent) => {
						const result = predictedResults[opponent.id] || "draw";
						return (
							<SelectedOpponentCard
								key={opponent.id}
								opponent={opponent}
								result={result}
								winDelta={getOpponentDelta(opponent, "win")}
								drawDelta={getOpponentDelta(opponent, "draw")}
								lossDelta={getOpponentDelta(opponent, "loss")}
								onRemove={onRemoveOpponent}
								onSetPrediction={onSetPredictionForOpponent}
							/>
						);
					})}
				</AnimatePresence>
			</div>
		</section>
	);
}
