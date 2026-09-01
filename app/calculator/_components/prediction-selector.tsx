import type { MatchResult } from "@/lib/elo/calculation";
import { formatDelta } from "@/app/calculator/_lib/utils";
import { RESULT_OPTIONS } from "@/app/calculator/_lib/constants";
import { cn } from "@/lib/utils";

type PredictionSelectorProps = {
	result: MatchResult;
	winDelta: number;
	drawDelta: number;
	lossDelta: number;
	onChange: (result: MatchResult) => void;
};

const resultClasses: Record<MatchResult, { selected: string; idle: string }> = {
	win: {
		selected:
			"border-[rgb(var(--ds-native-lime))] bg-[rgb(var(--ds-native-lime))] text-[rgb(var(--ds-native-background))]",
		idle: "text-[rgb(var(--ds-native-lime))]",
	},
	draw: {
		selected:
			"border-[rgb(var(--ds-native-amber))] bg-[rgb(var(--ds-native-amber))] text-[rgb(var(--ds-native-background))]",
		idle: "text-[rgb(var(--ds-native-amber))]",
	},
	loss: {
		selected:
			"border-[rgb(var(--ds-native-coral))] bg-[rgb(var(--ds-native-coral))] text-[rgb(var(--ds-native-background))]",
		idle: "text-[rgb(var(--ds-native-coral))]",
	},
};

export function PredictionSelector({
	result,
	winDelta,
	drawDelta,
	lossDelta,
	onChange,
}: PredictionSelectorProps) {
	const deltas: Record<MatchResult, number> = {
		win: winDelta,
		draw: drawDelta,
		loss: lossDelta,
	};

	return (
		<div
			className="grid grid-cols-3 gap-2"
			role="group"
			aria-label="Izaberi rezultat"
		>
			{RESULT_OPTIONS.map((option) => {
				const isSelected = result === option.value;
				return (
					<button
						type="button"
						key={option.value}
						onClick={() => onChange(option.value)}
						aria-pressed={isSelected}
						aria-label={`${option.label}, ${formatDelta(deltas[option.value])} Elo`}
						className={cn(
							"calculator-pressable flex h-12 min-w-0 flex-col items-center justify-center gap-[3px] rounded-xl border-[0.8px] outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ds-native-purple-bright))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--ds-native-surface))]",
							isSelected
								? resultClasses[option.value].selected
								: cn(
										"border-white/[0.13] bg-[rgb(var(--ds-native-raised))]",
										resultClasses[option.value].idle,
									),
						)}
					>
						<span className="text-ios-caption font-black leading-[14px]">
							{option.shortLabel}
						</span>
						<span className="text-ios-caption2 font-bold leading-3 tabular-nums">
							{formatDelta(deltas[option.value])}
						</span>
					</button>
				);
			})}
		</div>
	);
}
