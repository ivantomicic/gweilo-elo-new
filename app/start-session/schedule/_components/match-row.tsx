"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Player = {
	id: string;
	name: string;
	avatar: string | null;
	isPlaceholder?: boolean;
};

type MatchRowProps = {
	type: "singles" | "doubles";
	players: Player[];
	isShuffling?: boolean;
	shuffleKey?: number;
};

export function MatchRow({ type, players }: MatchRowProps) {
	const firstSide = type === "doubles" ? players.slice(0, 2) : players.slice(0, 1);
	const secondSide = type === "doubles" ? players.slice(2, 4) : players.slice(1, 2);
	const isExhibition = players.some((player) => player.isPlaceholder);
	const label = `${type === "doubles" ? "Dubl" : "Singl"}, ${sideName(
		firstSide,
	)} protiv ${sideName(secondSide)}${isExhibition ? ", bez ELO-a" : ""}`;

	return (
		<div
			className="py-3"
			role="group"
			aria-label={label}
		>
			{isExhibition && (
				<p className="mb-2 text-center text-ios-label-9 font-bold uppercase tracking-[0.12em] text-[rgb(var(--ds-native-amber))]">
					Bez ELO-a
				</p>
			)}
			<div className="flex items-center gap-2">
				<MatchSide players={firstSide} alignment="right" />
				<span
					aria-hidden="true"
					className="w-5 shrink-0 text-center text-ios-caption2 font-black text-[rgb(var(--ds-native-muted))]"
				>
					VS
				</span>
				<MatchSide players={secondSide} alignment="left" />
			</div>
		</div>
	);
}

function MatchSide({
	players,
	alignment,
}: {
	players: Player[];
	alignment: "left" | "right";
}) {
	const names = (
		<span
			className={`min-w-0 text-ios-caption font-semibold leading-4 ${
				alignment === "right" ? "text-right" : "text-left"
			}`}
		>
			{sideName(players)}
		</span>
	);
	const avatars = <AvatarStack players={players} />;

	return (
		<div
			className={`flex min-w-0 flex-1 items-center gap-[7px] ${
				alignment === "right" ? "justify-end" : "justify-start"
			}`}
		>
			{alignment === "right" ? (
				<>
					{names}
					{avatars}
				</>
			) : (
				<>
					{avatars}
					{names}
				</>
			)}
		</div>
	);
}

function AvatarStack({ players }: { players: Player[] }) {
	return (
		<span className="flex shrink-0 -space-x-[7px]">
			{players.map((player) => (
				<Avatar
					key={player.id}
					className="size-[30px] border-[1.5px] border-[rgb(var(--ds-native-background))]"
				>
					<AvatarImage src={player.avatar ?? undefined} alt="" />
					<AvatarFallback className="bg-ds-surface-raised text-ios-label-10 font-semibold text-[rgb(var(--ds-native-bone))]">
						{player.name.charAt(0).toUpperCase()}
					</AvatarFallback>
				</Avatar>
			))}
		</span>
	);
}

function sideName(players: Player[]) {
	return players.map((player) => player.name).join(" i ");
}
