import { motion, useReducedMotion } from "framer-motion";
import type { MatchResult } from "@/lib/elo/calculation";
import { CalculatorPlayerAvatar } from "@/app/calculator/_components/calculator-player-avatar";
import { eloDeltaClass, formatDelta, formatElo } from "@/app/calculator/_lib/utils";
import type { PlayerWithRating } from "@/app/calculator/_lib/types";
import { PredictionSelector } from "@/app/calculator/_components/prediction-selector";
import { cn } from "@/lib/utils";

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
	const shouldReduceMotion = useReducedMotion();
	const selectedDelta =
		result === "win" ? winDelta : result === "loss" ? lossDelta : drawDelta;

	return (
		<motion.article
			initial={shouldReduceMotion ? false : { opacity: 0, x: 14 }}
			animate={{ opacity: 1, x: 0 }}
			exit={shouldReduceMotion ? undefined : { opacity: 0, x: 14 }}
			transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
			className="calculator-flat-surface rounded-[18px] p-[14px]"
			aria-label={`Projekcija protiv igrača ${opponent.name}`}
		>
			<div className="mb-[14px] flex min-w-0 items-center gap-3">
				<CalculatorPlayerAvatar
					name={opponent.name}
					avatar={opponent.avatar}
					size={48}
				/>
				<div className="min-w-0 flex-1">
					<h3 className="calculator-system-heading truncate text-ios-body font-bold leading-5 text-[rgb(var(--ds-native-bone))]">
						PROTIV {opponent.name}
					</h3>
					<p className="mt-0.5 text-ios-caption font-semibold leading-[14px] tabular-nums text-[rgb(var(--ds-native-muted))]">
						{formatElo(opponent.elo)} Elo
					</p>
				</div>
				<strong
					aria-live="polite"
					className={cn(
						"shrink-0 font-session-display text-[24px] font-black leading-none tabular-nums",
						eloDeltaClass(selectedDelta),
					)}
				>
					{formatDelta(selectedDelta)}
				</strong>
				<button
					type="button"
					onClick={() => onRemove(opponent.id)}
					className="calculator-pressable flex size-8 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--ds-native-raised))] text-lg font-semibold leading-none text-[rgb(var(--ds-native-muted))] outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ds-native-purple-bright))]"
					aria-label={`Ukloni ${opponent.name}`}
				>
					<span aria-hidden="true">×</span>
				</button>
			</div>

			<PredictionSelector
				result={result}
				winDelta={winDelta}
				drawDelta={drawDelta}
				lossDelta={lossDelta}
				onChange={(nextResult) =>
					onSetPrediction(opponent.id, nextResult)
				}
			/>
		</motion.article>
	);
}
