"use client";

import type { ReactNode, Ref } from "react";
import { useRef } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type ActiveSessionPlayer = {
	id: string;
	name: string;
	avatar: string | null;
};

export type ActiveSessionSide = {
	name: string;
	players: ActiveSessionPlayer[];
	rating?: number;
	winDelta?: number;
	drawDelta?: number;
	lossDelta?: number;
};

export type ActiveSessionPreviewMatch = {
	id: string;
	teamOne: string;
	teamTwo: string;
	isRated: boolean;
};

function initials(name: string) {
	return name
		.trim()
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0] ?? "")
		.join("")
		.toUpperCase();
}

function formatRating(value: number) {
	return Math.round(value).toLocaleString("sr-Latn-RS");
}

function formatDelta(value: number) {
	const rounded = Math.round(value * 100) / 100;
	const absolute = Number.isInteger(rounded)
		? Math.abs(rounded).toFixed(0)
		: Math.abs(rounded).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
	return `${rounded >= 0 ? "+" : "-"}${absolute}`;
}

function PlayerAvatarStack({ players }: { players: ActiveSessionPlayer[] }) {
	return (
		<span className="flex shrink-0 -space-x-2.5" aria-hidden="true">
			{players.map((player) => (
				<Avatar
					key={player.id}
					className="size-10 border-2 border-[rgb(19_19_21)] bg-[rgb(var(--ds-native-raised))]"
				>
					<AvatarImage
						src={player.avatar ?? undefined}
						fallbackSeed={player.name}
						alt={player.name}
						className="object-cover"
					/>
					<AvatarFallback className="bg-[rgb(var(--ds-native-raised))] font-session-display text-ios-display-19 font-black text-[rgb(var(--ds-native-bone))]">
						{initials(player.name) || "?"}
					</AvatarFallback>
				</Avatar>
			))}
		</span>
	);
}

function PredictionStrip({ side }: { side: ActiveSessionSide }) {
	if (
		side.winDelta === undefined ||
		side.drawDelta === undefined ||
		side.lossDelta === undefined
	) {
		return null;
	}

	return (
		<span
			className="flex items-center gap-[7px] font-session-label text-ios-caption2 font-bold leading-none tabular-nums"
			aria-label={`Pobeda ${formatDelta(side.winDelta)} Elo, nerešeno ${formatDelta(side.drawDelta)} Elo, poraz ${formatDelta(side.lossDelta)} Elo`}
		>
			<span className="text-[rgb(var(--ds-native-lime))]">
				P {formatDelta(side.winDelta)}
			</span>
			<span className="text-[rgb(var(--ds-native-amber))]">
				N {formatDelta(side.drawDelta)}
			</span>
			<span className="text-[rgb(var(--ds-native-coral))]">
				I {formatDelta(side.lossDelta)}
			</span>
		</span>
	);
}

function MatchSide({
	side,
	score,
	onScoreChange,
	disabled,
	inputRef,
}: {
	side: ActiveSessionSide;
	score: number | null;
	onScoreChange: (value: string) => void;
	disabled?: boolean;
	inputRef?: Ref<HTMLInputElement>;
}) {
	return (
		<div className="flex min-w-0 items-center gap-3">
			<PlayerAvatarStack players={side.players} />

			<div className="min-w-0 flex-1">
				<div className="flex min-w-0 items-baseline gap-1.5">
					<p className="truncate text-ios-body font-semibold leading-tight text-[rgb(var(--ds-native-bone))]">
						{side.name}
					</p>
					{side.rating !== undefined ? (
						<span className="shrink-0 text-ios-footnote font-semibold tabular-nums text-[rgb(var(--ds-native-muted))]">
							{formatRating(side.rating)} Elo
						</span>
					) : null}
				</div>
				<div className="mt-1">
					<PredictionStrip side={side} />
				</div>
			</div>

			<input
				ref={inputRef}
				type="number"
				inputMode="numeric"
				pattern="[0-9]*"
				min={0}
				max={999}
				placeholder="0"
				value={score ?? ""}
				onChange={(event) => onScoreChange(event.target.value)}
				disabled={disabled}
				aria-label={`Rezultat za ${side.name}`}
				className="size-[58px] shrink-0 rounded-[11px] border border-[rgb(var(--ds-native-purple)/0.34)] bg-[rgb(var(--ds-native-raised))] text-center font-session-display text-ios-display-30 font-black leading-none tabular-nums text-[rgb(var(--ds-native-bone))] outline-none transition-[border-color,box-shadow,opacity] duration-press ease-ds-out placeholder:text-[rgb(var(--ds-native-muted)/0.55)] focus:border-2 focus:border-[rgb(var(--ds-native-lime))] focus:ring-0 disabled:cursor-not-allowed disabled:opacity-55"
			/>
		</div>
	);
}

export function ActiveSessionMatchEditor({
	teamOne,
	teamTwo,
	teamOneScore,
	teamTwoScore,
	onTeamOneScoreChange,
	onTeamTwoScoreChange,
	teamOneInputRef,
	teamTwoInputRef,
	disabled,
	pairedScoreReminder,
	className,
}: {
	teamOne: ActiveSessionSide;
	teamTwo: ActiveSessionSide;
	teamOneScore: number | null;
	teamTwoScore: number | null;
	onTeamOneScoreChange: (value: string) => void;
	onTeamTwoScoreChange: (value: string) => void;
	teamOneInputRef?: Ref<HTMLInputElement>;
	teamTwoInputRef?: Ref<HTMLInputElement>;
	disabled?: boolean;
	pairedScoreReminder?: ReactNode;
	className?: string;
}) {
	return (
		<section
			className={cn(
				"session-detail-scoreboard p-3.5",
				className,
			)}
			aria-label={`${teamOne.name} protiv ${teamTwo.name}`}
		>
			<div className="space-y-2.5">
				<MatchSide
					side={teamOne}
					score={teamOneScore}
					onScoreChange={onTeamOneScoreChange}
					disabled={disabled}
					inputRef={teamOneInputRef}
				/>

				<div className="flex items-center gap-2.5" aria-hidden="true">
					<span className="h-px flex-1 bg-white/[0.13]" />
					<span className="font-session-label text-ios-caption2 font-bold tracking-[0.7px] text-[rgb(var(--ds-native-muted))]">
						VS
					</span>
					<span className="h-px flex-1 bg-white/[0.13]" />
				</div>

				{pairedScoreReminder ? (
					<div className="flex justify-center">{pairedScoreReminder}</div>
				) : null}

				<MatchSide
					side={teamTwo}
					score={teamTwoScore}
					onScoreChange={onTeamTwoScoreChange}
					disabled={disabled}
					inputRef={teamTwoInputRef}
				/>
			</div>
		</section>
	);
}

export function ActiveSessionRoundHeader({
	roundNumber,
	currentRoundNumber,
	totalRounds,
	roundNumbers,
	matchSummary,
	onRoundSelect,
}: {
	roundNumber: number;
	currentRoundNumber: number;
	totalRounds: number;
	roundNumbers: number[];
	matchSummary: string;
	onRoundSelect: (round: number) => void;
}) {
	const isCurrent = roundNumber === currentRoundNumber;
	const isPast = roundNumber < currentRoundNumber;
	const roundIndex = roundNumbers.indexOf(roundNumber);
	const previousRound = roundIndex > 0 ? roundNumbers[roundIndex - 1] : undefined;
	const nextRound = roundIndex >= 0 ? roundNumbers[roundIndex + 1] : undefined;

	return (
		<header className="space-y-3">
			<div className="flex items-center justify-between gap-3">
				<div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
					<h1
						aria-live="polite"
						aria-atomic="true"
						className="font-session-display text-ios-display-30 font-black leading-[1.05] text-[rgb(var(--ds-native-bone))]"
					>
						Runda {roundNumber}
					</h1>
					{!isCurrent ? (
						<span
							className={cn(
								"font-session-label text-ios-caption2 font-bold uppercase tracking-[0.7px]",
								isPast
									? "text-[rgb(var(--ds-native-muted))]"
									: "text-[rgb(var(--ds-native-lime))]",
							)}
						>
							{isPast ? "● Završena" : "● Predstoji"}
						</span>
					) : null}
				</div>
				<div
					className="flex shrink-0 gap-1"
					role="group"
					aria-label="Navigacija po rundama"
				>
					<Button
						type="button"
						variant="secondary"
						size="icon"
						className="touch-safe size-11"
						aria-label="Prethodna runda"
						title="Prethodna runda"
						disabled={previousRound === undefined}
						onClick={() => {
							if (previousRound !== undefined) onRoundSelect(previousRound);
						}}
					>
						<Icon icon="solar:alt-arrow-left-linear" aria-hidden="true" />
					</Button>
					<Button
						type="button"
						variant="secondary"
						size="icon"
						className="touch-safe size-11"
						aria-label="Sledeća runda"
						title="Sledeća runda"
						disabled={nextRound === undefined}
						onClick={() => {
							if (nextRound !== undefined) onRoundSelect(nextRound);
						}}
					>
						<Icon icon="solar:alt-arrow-right-linear" aria-hidden="true" />
					</Button>
				</div>
			</div>

			<div
				className="flex gap-1"
				role="tablist"
				aria-label={`Runda ${roundNumber} od ${roundNumbers.length}`}
			>
				{roundNumbers.map((candidate) => (
					<button
						key={candidate}
						type="button"
						role="tab"
						aria-selected={candidate === roundNumber}
						aria-label={`Prikaži rundu ${candidate}`}
						onClick={() => onRoundSelect(candidate)}
						className="touch-safe group relative -my-[20.5px] flex h-11 flex-1 items-center outline-none"
					>
						<span
							className={cn(
								"h-[3px] w-full rounded-full transition-[background-color,opacity] duration-press ease-ds-out group-active:opacity-70 group-focus-visible:ring-2 group-focus-visible:ring-[rgb(var(--ds-native-purple-bright))] group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-[rgb(var(--ds-native-background))]",
								candidate <= roundNumber
									? "bg-[rgb(var(--ds-native-purple-bright))]"
									: "bg-[rgb(var(--ds-native-raised))]",
							)}
						/>
					</button>
				))}
			</div>

			<div className="flex items-center justify-between text-ios-footnote font-semibold tabular-nums text-[rgb(var(--ds-native-muted))]">
				<span>{matchSummary}</span>
				<span>
					{roundNumber} od {totalRounds}
				</span>
			</div>
		</header>
	);
}

export function ActiveSessionNextRound({
	roundNumber,
	matches,
}: {
	roundNumber: number;
	matches: ActiveSessionPreviewMatch[];
}) {
	if (!matches.length) return null;

	return (
		<section
			className="session-detail-scoreboard p-3.5"
			aria-label={`Sledeća, runda ${roundNumber}`}
		>
			<div className="mb-[11px] flex items-center gap-[7px]">
				<Icon
					icon="solar:forward-bold"
					className="size-3 text-[rgb(var(--ds-native-lime))]"
					aria-hidden="true"
				/>
				<span className="font-session-label text-ios-label-11 font-semibold tracking-[1.1px] text-[rgb(var(--ds-native-lime))]">
					SLEDEĆA
				</span>
				<span className="ml-auto text-ios-caption2 font-semibold tabular-nums text-[rgb(var(--ds-native-muted))]">
					RUNDA {roundNumber}
				</span>
			</div>
			<div className="flex flex-wrap gap-x-3 gap-y-[7px]">
				{matches.map((match) => (
					<div
						key={match.id}
						className="flex min-w-0 items-center gap-1.5 text-ios-footnote font-medium text-[rgb(var(--ds-native-bone))]"
						aria-label={`${match.teamOne} protiv ${match.teamTwo}${match.isRated ? "" : ", bez ELO-a"}`}
					>
						{!match.isRated ? (
							<span className="mr-0.5 text-ios-caption2 font-bold text-[rgb(var(--ds-native-amber))]">
								BEZ ELO-A
							</span>
						) : null}
						<span className="max-w-28 truncate">{match.teamOne}</span>
						<span className="text-ios-caption2 font-bold text-[rgb(var(--ds-native-muted))]">
							VS
						</span>
						<span className="max-w-28 truncate">{match.teamTwo}</span>
					</div>
				))}
			</div>
		</section>
	);
}

export function ActiveSessionBrowseNotice() {
	return (
		<div className="flex items-start gap-2 rounded-[10px] bg-[rgb(var(--ds-native-lime)/0.07)] p-3 text-ios-footnote text-[rgb(var(--ds-native-muted))]">
			<Icon icon="solar:eye-bold" className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
			<span>
				Pregled rasporeda — rezultati se unose kada runda postane aktivna.
			</span>
		</div>
	);
}

export function ActiveSessionRestingLine({
	players,
}: {
	players: ActiveSessionPlayer[];
}) {
	if (!players.length) return null;
	return (
		<p className="flex min-w-0 items-baseline gap-2 text-ios-footnote text-[rgb(var(--ds-native-muted))]">
			<span className="text-ios-caption2" aria-hidden="true">
				Ⅱ
			</span>
			<strong>Odmaraju</strong>
			<span className="truncate">{players.map((player) => player.name).join(", ")}</span>
		</p>
	);
}

export function ActiveSessionSubmitBar({
	isReady,
	isSubmitting,
	isFinalRound,
	onSubmit,
}: {
	isReady: boolean;
	isSubmitting: boolean;
	isFinalRound: boolean;
	onSubmit: () => void;
}) {
	const label = isSubmitting
		? "Čuvam…"
		: isReady
			? isFinalRound
				? "Završi termin"
				: "Sačuvaj i nastavi"
			: "Unesi sve rezultate";

	return (
		<button
			type="button"
			onClick={onSubmit}
			disabled={!isReady || isSubmitting}
			className="touch-safe flex h-14 w-full items-center rounded-full bg-[rgb(var(--ds-native-lime))] px-5 text-ios-body font-bold text-[rgb(var(--ds-native-background))] outline-none transition-[transform,opacity,background-color] duration-press ease-ds-out active:scale-[0.965] active:opacity-[0.82] focus-visible:ring-2 focus-visible:ring-[rgb(var(--ds-native-lime))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--ds-native-background))] disabled:cursor-not-allowed disabled:bg-[rgb(var(--ds-native-raised))] disabled:text-[rgb(var(--ds-native-muted))] disabled:active:scale-100 motion-reduce:active:scale-100"
			aria-label={label}
		>
			<span>{label}</span>
			<span className="ml-auto text-2xl leading-none" aria-hidden="true">
				{isFinalRound ? "✓" : "→"}
			</span>
		</button>
	);
}

export function ActiveSessionRoundCanvas({
	children,
	onPrevious,
	onNext,
	className,
}: {
	children: ReactNode;
	onPrevious?: () => void;
	onNext?: () => void;
	className?: string;
}) {
	const touchStart = useRef<{ x: number; y: number } | null>(null);

	return (
		<div
			className={className}
			onTouchStart={(event) => {
				const touch = event.touches[0];
				touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
			}}
			onTouchEnd={(event) => {
				const start = touchStart.current;
				touchStart.current = null;
				if (!start) return;
				const touch = event.changedTouches[0];
				if (!touch) return;
				const deltaX = touch.clientX - start.x;
				const deltaY = touch.clientY - start.y;
				if (Math.abs(deltaX) < 52 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) {
					return;
				}
				if (deltaX < 0) onNext?.();
				else onPrevious?.();
			}}
		>
			{children}
		</div>
	);
}
