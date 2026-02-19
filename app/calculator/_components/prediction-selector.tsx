import { motion } from "framer-motion";
import type { MatchResult } from "@/lib/elo/calculation";
import { cn } from "@/lib/utils";
import { RESULT_OPTIONS } from "@/app/calculator/_lib/constants";

type PredictionSelectorProps = {
	result: MatchResult;
	onChange: (result: MatchResult) => void;
};

export function PredictionSelector({
	result,
	onChange,
}: PredictionSelectorProps) {
	const activeResultIndex = RESULT_OPTIONS.findIndex(
		(option) => option.value === result,
	);

	return (
		<div className="relative w-full rounded-xl bg-secondary/30 p-1">
			<motion.div
				initial={false}
				animate={{
					x: `${Math.max(0, activeResultIndex) * 100}%`,
				}}
				transition={{
					type: "spring",
					stiffness: 420,
					damping: 34,
				}}
				className={cn(
					"absolute left-1 top-1 bottom-1 w-[calc((100%-0.5rem)/3)] rounded-lg shadow-sm transition-colors duration-200",
					result === "win"
						? "bg-emerald-500 shadow-emerald-500/35"
						: result === "loss"
							? "bg-red-500 shadow-red-500/35"
							: "bg-muted shadow-muted/35",
				)}
			/>
			<div className="relative z-10 grid grid-cols-3 gap-0">
				{RESULT_OPTIONS.map((option) => {
					const isActive = result === option.value;
					return (
						<button
							key={option.value}
							onClick={() => onChange(option.value)}
							className={cn(
								"h-9 w-full rounded-lg text-sm font-bold transition-colors",
								isActive
									? result === "draw"
										? "text-foreground"
										: "text-primary-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{option.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}
