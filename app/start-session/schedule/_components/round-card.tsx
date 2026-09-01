"use client";

import { MatchRow } from "./match-row";

type Player = {
	id: string;
	name: string;
	avatar: string | null;
	isPlaceholder?: boolean;
};

type Match = {
	type: "singles" | "doubles";
	players: Player[];
};

type RoundCardProps = {
	roundNumber: number;
	matches: Match[];
	restingPlayers?: Player[];
	isActive?: boolean;
	isDynamic?: boolean;
	dynamicNote?: {
		title: string;
		description: string;
	};
	isShuffling?: boolean;
	shuffleKey?: number;
};

/** Native StartSessionView schedule-round translation: flat rows and dividers. */
export function RoundCard({
	roundNumber,
	matches,
	isDynamic = false,
	dynamicNote,
	shuffleKey = 0,
}: RoundCardProps) {
	const matchCountLabel = matches.length === 1 ? "meč" : "meča";
	const dynamicTitle =
		dynamicNote?.title ?? `Parovi se određuju nakon ${roundNumber - 1}. runde`;
	const dynamicDescription =
		dynamicNote?.description ??
		"Raspored ove runde zavisi od rezultata prethodnih mečeva.";

	return (
		<article
			className="border-b border-ds-button-hairline/[0.13] pb-[22px]"
			aria-labelledby={`round-${roundNumber}-title`}
		>
			<header className="flex min-h-11 items-baseline justify-center gap-2 py-[11px]">
				<h2
					id={`round-${roundNumber}-title`}
					className="font-body text-ios-body font-bold"
				>
					Runda {roundNumber}
				</h2>
				<span aria-hidden="true" className="text-white/25">
					·
				</span>
				<span
					className={
						isDynamic
							? "text-ios-caption2 font-bold text-[rgb(var(--ds-native-amber))]"
							: "text-ios-caption2 font-bold tabular-nums text-[rgb(var(--ds-native-muted))]"
					}
				>
					{isDynamic ? "zavisi od rezultata" : `${matches.length} ${matchCountLabel}`}
				</span>
			</header>

			{isDynamic ? (
				<div className="mx-auto max-w-xs pb-3 text-center">
					<p className="font-body text-ios-subheadline font-bold">{dynamicTitle}</p>
					<p className="mt-1.5 text-ios-caption leading-5 text-[rgb(var(--ds-native-muted))]">
						{dynamicDescription}
					</p>
				</div>
			) : (
				<div className="divide-y divide-ds-button-hairline/[0.13]">
					{matches.map((match, index) => (
						<MatchRow
							key={`${shuffleKey}-${roundNumber}-${index}`}
							type={match.type}
							players={match.players}
						/>
					))}
				</div>
			)}
		</article>
	);
}
