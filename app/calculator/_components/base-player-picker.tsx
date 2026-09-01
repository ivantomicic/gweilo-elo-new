import { ChevronsUpDown } from "lucide-react";
import { CalculatorPlayerAvatar } from "@/app/calculator/_components/calculator-player-avatar";
import type { PlayerWithRating } from "@/app/calculator/_lib/types";
import { formatElo } from "@/app/calculator/_lib/utils";

type BasePlayerPickerProps = {
	player: PlayerWithRating;
	players: PlayerWithRating[];
	onSelect: (playerId: string) => void;
};

export function BasePlayerPicker({
	player,
	players,
	onSelect,
}: BasePlayerPickerProps) {
	return (
		<section aria-labelledby="calculator-base-player-heading">
			<h2
				id="calculator-base-player-heading"
				className="mb-[10px] font-session-label text-ios-label-12 font-semibold uppercase leading-[15px] tracking-[1.8px] text-[rgb(var(--ds-native-purple-bright))]"
			>
				Računaj za
			</h2>
			<label className="calculator-flat-surface calculator-pressable relative flex cursor-pointer items-center gap-[14px] rounded-[18px] p-[14px] outline-none focus-within:ring-2 focus-within:ring-[rgb(var(--ds-native-purple-bright))] focus-within:ring-offset-2 focus-within:ring-offset-[rgb(var(--ds-native-background))]">
				<CalculatorPlayerAvatar
					name={player.name}
					avatar={player.avatar}
					size={58}
				/>
				<span className="min-w-0 flex-1">
					<span className="block truncate text-ios-display-20 font-bold leading-[25px] text-[rgb(var(--ds-native-bone))]">
						{player.name}
					</span>
					<span className="mt-[3px] block text-ios-caption font-semibold leading-[14px] tabular-nums text-[rgb(var(--ds-native-muted))]">
						{formatElo(player.elo)} Elo · {player.matchesPlayed} mečeva
					</span>
				</span>
				<ChevronsUpDown
					strokeWidth={3}
					className="size-4 shrink-0 text-[rgb(var(--ds-native-purple-bright))]"
					aria-hidden="true"
				/>
				<select
					value={player.id}
					onChange={(event) => onSelect(event.target.value)}
					className="absolute inset-0 size-full cursor-pointer opacity-0"
					aria-label="Izaberi igrača za računanje"
				>
					{players.map((candidate) => (
						<option key={candidate.id} value={candidate.id}>
							{candidate.name}
						</option>
					))}
				</select>
			</label>
		</section>
	);
}
