import type { RefObject } from "react";
import { CalculatorPlayerAvatar } from "@/app/calculator/_components/calculator-player-avatar";
import type { PlayerWithRating } from "@/app/calculator/_lib/types";
import { formatElo } from "@/app/calculator/_lib/utils";
import { cn } from "@/lib/utils";

type OpponentPickerSectionProps = {
	availableOpponents: PlayerWithRating[];
	selectedCount: number;
	scrollRef: RefObject<HTMLDivElement>;
	canScrollRight: boolean;
	onScroll: () => void;
	onToggleOpponent: (opponentId: string) => void;
};

export function OpponentPickerSection({
	availableOpponents,
	selectedCount,
	scrollRef,
	canScrollRight,
	onScroll,
	onToggleOpponent,
}: OpponentPickerSectionProps) {
	return (
		<section aria-labelledby="calculator-opponents-heading">
			<div className="mb-3 flex items-baseline justify-between gap-4">
				<h2
					id="calculator-opponents-heading"
					className="font-session-label text-ios-label-12 font-semibold uppercase leading-[15px] tracking-[1.8px] text-[rgb(var(--ds-native-purple-bright))]"
				>
					Izaberi protivnike
				</h2>
				<span
					aria-live="polite"
					className={cn(
						"shrink-0 text-ios-caption2 font-black leading-none tabular-nums",
						selectedCount === 0
							? "text-[rgb(var(--ds-native-muted))]"
							: "text-[rgb(var(--ds-native-lime))]",
					)}
				>
					{selectedCount} izabrano
				</span>
			</div>

			{availableOpponents.length === 0 ? (
				<p className="py-[18px] text-ios-subheadline font-semibold leading-5 text-[rgb(var(--ds-native-muted))]">
					Svi dostupni protivnici su već izabrani.
				</p>
			) : (
				<div className="relative h-[102px]">
					<div
						ref={scrollRef}
						onScroll={onScroll}
						className="calculator-opponents-scroll scrollbar-hide flex h-full snap-x snap-proximity gap-[10px] overflow-x-auto overscroll-x-contain pr-6"
					>
						{availableOpponents.map((player) => (
							<button
								type="button"
								key={player.id}
								onClick={() => onToggleOpponent(player.id)}
								className="calculator-pressable flex h-[102px] w-[72px] shrink-0 snap-start flex-col items-center gap-[7px] rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--ds-native-purple-bright))]"
								aria-label={`Dodaj protivnika ${player.name}`}
							>
								<CalculatorPlayerAvatar
									name={player.name}
									avatar={player.avatar}
									size={58}
								/>
								<span className="w-full truncate text-center text-ios-caption font-bold leading-[14px] text-[rgb(var(--ds-native-bone))]">
									{player.name}
								</span>
								<span className="text-ios-caption2 font-bold leading-3 tabular-nums text-[rgb(var(--ds-native-muted))]">
									{formatElo(player.elo)}
								</span>
							</button>
						))}
					</div>
					<div
						aria-hidden="true"
						className={cn(
							"pointer-events-none absolute inset-y-0 right-0 w-7 bg-gradient-to-r from-transparent to-[rgb(var(--ds-native-background))] transition-opacity duration-150",
							canScrollRight ? "opacity-100" : "opacity-0",
						)}
					/>
				</div>
			)}
		</section>
	);
}
