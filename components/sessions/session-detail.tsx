"use client";

import Image from "next/image";
import * as React from "react";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/components/ui/avatar";
import { Loading } from "@/components/ui/loading";
import { cn } from "@/lib/utils";

export type SessionDetailOutcome = "win" | "loss" | "draw";

export type SessionDetailPlayer = {
	id: string;
	name: string;
	avatar: string | null;
	isPlaceholder?: boolean;
};

export type SessionPerformancePlayer = SessionDetailPlayer & {
	matches: number;
	wins: number;
	draws: number;
	losses: number;
	eloAfter: number | null;
	eloChange: number | null;
};

export type SessionPerformanceTeam = {
	id: string;
	name: string;
	players: [SessionDetailPlayer, SessionDetailPlayer];
	matches: number;
	wins: number;
	draws: number;
	losses: number;
	eloAfter: number;
	eloChange: number;
};

export type SessionScoreboardMatchData = {
	id: string;
	roundNumber: number;
	matchType: "singles" | "doubles";
	teamOne: SessionDetailPlayer[];
	teamTwo: SessionDetailPlayer[];
	teamOneScore: number | null;
	teamTwoScore: number | null;
	isRated?: boolean;
	pairedFirstHalfLabel?: string;
	teamOneEloChange?: number;
	teamTwoEloChange?: number;
	hasVideo?: boolean;
	onActivate?: () => void;
};

export type SessionResultRound = {
	number: number;
	matches: SessionScoreboardMatchData[];
};

const outcomeAssets: Record<SessionDetailOutcome, string> = {
	win: "/session-detail/match-result-win.png",
	loss: "/session-detail/match-result-loss.png",
	draw: "/session-detail/match-result-draw.png",
};

const outcomeLabels: Record<SessionDetailOutcome, string> = {
	win: "Pobeda",
	loss: "Poraz",
	draw: "Nerešeno",
};

const rankAssets = [
	"/session-detail/rank-gold.png",
	"/session-detail/rank-silver.png",
	"/session-detail/rank-bronze.png",
];

function initials(name: string) {
	return name
		.trim()
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0] ?? "")
		.join("")
		.toUpperCase();
}

function formatElo(value: number | null) {
	return value === null
		? "—"
		: Math.round(value).toLocaleString("sr-Latn-RS");
}

function formatDelta(value: number | null | undefined) {
	if (value === null || value === undefined) return "BEZ ELO-A";
	const rounded = Math.round(value);
	return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function outcomeFor(
	score: number | null,
	opponentScore: number | null,
): SessionDetailOutcome | null {
	if (score === null || opponentScore === null) return null;
	if (score > opponentScore) return "win";
	if (score < opponentScore) return "loss";
	return "draw";
}

function teamName(players: SessionDetailPlayer[]) {
	return players.map((player) => player.name).join(" + ") || "Nepoznat igrač";
}

function formGradient({
	matches,
	wins,
	draws,
	losses,
}: Pick<
	SessionPerformancePlayer,
	"matches" | "wins" | "draws" | "losses"
>) {
	const recordedResults = wins + draws + losses;
	const colors = [
		...Array(Math.max(0, wins)).fill("rgb(var(--ds-native-lime))"),
		...Array(Math.max(0, draws)).fill("rgb(var(--ds-native-amber))"),
		...Array(Math.max(0, losses)).fill("rgb(var(--ds-native-coral))"),
		...Array(Math.max(0, matches - recordedResults)).fill(
			"rgb(var(--ds-native-surface))",
		),
	] as string[];

	const resultColors = colors.length
		? colors
		: ["rgb(var(--ds-native-surface))"];
	const stops: string[] = [`${resultColors[0]} 0%`];

	for (let index = 0; index < resultColors.length - 1; index += 1) {
		const boundary = (index + 1) / resultColors.length;
		stops.push(
			`${resultColors[index]} ${Math.max(0, boundary - 0.1) * 100}%`,
			`${resultColors[index + 1]} ${Math.min(1, boundary + 0.1) * 100}%`,
		);
	}

	stops.push(`${resultColors[resultColors.length - 1]} 100%`);
	return `linear-gradient(to right, ${stops.join(", ")})`;
}

function deltaClass(value: number | null | undefined) {
	if (value === null || value === undefined || value === 0) {
		return "text-[rgb(var(--ds-native-muted))]";
	}
	return value > 0
		? "text-[rgb(var(--ds-native-lime))]"
		: "text-[rgb(var(--ds-native-coral))]";
}

function outcomeClass(outcome: SessionDetailOutcome | null) {
	if (outcome === "win") return "text-[rgb(var(--ds-native-lime))]";
	if (outcome === "loss") return "text-[rgb(var(--ds-native-coral))]";
	if (outcome === "draw") return "text-[rgb(var(--ds-native-amber))]";
	return "text-[rgb(var(--ds-native-bone))]";
}

function NativeAvatar({
	player,
	size,
	className,
}: {
	player: SessionDetailPlayer;
	size: number;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"relative rounded-full",
				className,
			)}
			style={{ width: size, height: size }}
		>
			<Avatar className="size-full border-0 bg-[rgb(var(--ds-native-raised))]">
				<AvatarImage
					src={player.avatar ?? undefined}
					fallbackSeed={player.name}
					alt={player.name}
					className="object-cover"
				/>
				<AvatarFallback className="bg-[rgb(var(--ds-native-raised))] font-session-display font-black text-[rgb(var(--ds-native-bone))]">
					{initials(player.name) || "?"}
				</AvatarFallback>
			</Avatar>
			<span
				className="pointer-events-none absolute inset-0 rounded-full"
				style={{
					padding: "0.9px",
					background:
						"linear-gradient(to bottom right, rgb(var(--ds-native-purple) / 0.65), rgb(255 255 255 / 0.13))",
					WebkitMask:
						"linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
					WebkitMaskComposite: "xor",
					maskComposite: "exclude",
				}}
				aria-hidden="true"
			/>
		</div>
	);
}

function RankBadge({ rank }: { rank: number }) {
	if (rank >= 1 && rank <= 3) {
		return (
			<Image
				src={rankAssets[rank - 1]}
				alt={`${rank}. mesto`}
				width={17}
				height={17}
				className="size-[17px] object-contain"
				unoptimized
			/>
		);
	}

	return (
		<span
			className="flex min-h-[17px] min-w-[17px] items-center justify-center rounded-full border-[1.5px] border-black/90 bg-[rgb(var(--ds-native-raised))] px-1 font-session-label text-ios-label-10 font-semibold tabular-nums text-[rgb(var(--ds-native-bone))]"
			aria-label={`${rank}. mesto`}
		>
			{rank}
		</span>
	);
}

function RankedPlayerAvatar({
	player,
	rank,
	selected,
}: {
	player: SessionDetailPlayer;
	rank: number;
	selected?: boolean;
}) {
	return (
		<div className="relative ml-0.5 size-[38px] shrink-0" aria-hidden="true">
			<span
				className={cn(
					"absolute -inset-1 rounded-full bg-gradient-to-br from-[rgb(var(--ds-native-cyan))] to-[rgb(var(--ds-native-lime))] opacity-0 blur-[6px] transition-opacity duration-press ease-ds-out",
					selected && "opacity-[0.42]",
				)}
			/>
			<NativeAvatar
				player={player}
				size={38}
				className={cn(
					"relative transition-transform duration-press ease-ds-out",
					selected &&
						"scale-[1.04] ring-[1.4px] ring-[rgb(var(--ds-native-cyan))] ring-offset-[1.5px] ring-offset-transparent",
				)}
			/>
			<span className="absolute -left-1 -top-1">
				<RankBadge rank={rank} />
			</span>
		</div>
	);
}

function RankedTeamAvatar({
	team,
	rank,
}: {
	team: SessionPerformanceTeam;
	rank: number;
}) {
	return (
		<div className="relative ml-0.5 h-[38px] w-[46px] shrink-0" aria-hidden="true">
			<NativeAvatar
				player={team.players[0]}
				size={32}
				className="absolute left-0.5 top-[3px]"
			/>
			<NativeAvatar
				player={team.players[1]}
				size={32}
				className="absolute right-0.5 top-[3px]"
			/>
			<span className="absolute -left-1 -top-1">
				<RankBadge rank={rank} />
			</span>
		</div>
	);
}

function RecordSummary({
	matches,
	wins,
	draws,
	losses,
}: Pick<
	SessionPerformancePlayer,
	"matches" | "wins" | "draws" | "losses"
>) {
	return (
		<span className="flex items-center gap-0.5 text-ios-caption2 leading-none tabular-nums">
			<span className="text-[rgb(var(--ds-native-muted))]">{matches}</span>
			<span className="text-[rgb(var(--ds-native-lime))]">{wins}</span>
			<span className="text-[rgb(var(--ds-native-muted))]">–</span>
			<span className="text-[rgb(var(--ds-native-amber))]">{draws}</span>
			<span className="text-[rgb(var(--ds-native-muted))]">–</span>
			<span className="text-[rgb(var(--ds-native-coral))]">{losses}</span>
		</span>
	);
}

function FormBar({
	matches,
	wins,
	draws,
	losses,
}: Pick<
	SessionPerformancePlayer,
	"matches" | "wins" | "draws" | "losses"
>) {
	return (
		<span
			className="block h-2 w-14 rounded-[3px]"
			style={{ backgroundImage: formGradient({ matches, wins, draws, losses }) }}
			aria-hidden="true"
		/>
	);
}

function EloResult({
	eloAfter,
	eloChange,
}: {
	eloAfter: number | null;
	eloChange: number | null;
}) {
	return (
		<span className="flex w-[60px] shrink-0 flex-col items-end gap-px">
			<span className="font-session-display text-ios-display-19 font-black leading-none tabular-nums text-[rgb(var(--ds-native-bone))]">
				{formatElo(eloAfter)}
			</span>
			<span
				className={cn(
					"text-ios-caption2 font-bold leading-none tabular-nums",
					deltaClass(eloChange),
				)}
			>
				{formatDelta(eloChange)}
			</span>
		</span>
	);
}

export function SessionDetailHero({
	date,
	status = "completed",
}: {
	date: string | Date;
	status?: "active" | "completed";
}) {
	const resolvedDate = typeof date === "string" ? new Date(date) : date;
	const dateLabel = new Intl.DateTimeFormat("sr-Latn-RS", {
		weekday: "long",
		day: "numeric",
		month: "long",
	}).format(resolvedDate);
	const active = status === "active";

	return (
		<header className="pt-2.5">
			<div
				className={cn(
					"mb-[7px] flex items-center gap-[7px] font-session-label text-ios-caption2 font-bold uppercase tracking-[0.12em]",
					active
						? "text-[rgb(var(--ds-native-lime))]"
						: "text-[rgb(var(--ds-native-purple))]",
				)}
			>
				<span className="size-[7px] rounded-full bg-current" aria-hidden="true" />
				<span>{active ? "U toku" : "Završen termin"}</span>
			</div>
			<h1 className="font-session-display text-ios-display-34 font-black uppercase leading-[1.02] tracking-[-0.25px] text-[rgb(var(--ds-native-bone))]">
				{dateLabel}
			</h1>
		</header>
	);
}

export type SessionPerformanceTab = {
	value: string;
	label: string;
};

export function SessionPerformanceTabs({
	tabs,
	value,
	onValueChange,
	panelId = "session-performance-panel",
}: {
	tabs: SessionPerformanceTab[];
	value: string;
	onValueChange: (value: string) => void;
	panelId?: string;
}) {
	const buttonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

	const moveFocus = (currentIndex: number, direction: -1 | 1) => {
		const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
		buttonRefs.current[nextIndex]?.focus();
		buttonRefs.current[nextIndex]?.click();
	};

	return (
		<div
			className="flex min-h-11 items-end gap-6 border-b border-white/[0.13]"
			role="tablist"
			aria-label="Pregled učinka"
		>
			{tabs.map((tab, index) => {
				const selected = tab.value === value;
				return (
					<button
						key={tab.value}
						ref={(element) => {
							buttonRefs.current[index] = element;
						}}
							type="button"
							role="tab"
							id={`${panelId}-tab-${tab.value}`}
							aria-controls={panelId}
							aria-selected={selected}
						tabIndex={selected ? 0 : -1}
						onClick={() => onValueChange(tab.value)}
						onKeyDown={(event) => {
							if (event.key === "ArrowRight") {
								event.preventDefault();
								moveFocus(index, 1);
							} else if (event.key === "ArrowLeft") {
								event.preventDefault();
								moveFocus(index, -1);
							} else if (event.key === "Home") {
								event.preventDefault();
								buttonRefs.current[0]?.focus();
								buttonRefs.current[0]?.click();
							} else if (event.key === "End") {
								event.preventDefault();
								buttonRefs.current[tabs.length - 1]?.focus();
								buttonRefs.current[tabs.length - 1]?.click();
							}
						}}
						className={cn(
							"touch-safe relative flex min-h-11 min-w-0 flex-1 items-center justify-center px-1 pb-[9px] pt-2 font-session-label text-ios-label-12 font-semibold uppercase tracking-[0.7px] outline-none transition-[transform,opacity,color] duration-press ease-ds-out active:scale-[0.97] active:opacity-[0.84] focus-visible:ring-2 focus-visible:ring-[rgb(var(--ds-native-purple-bright))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--ds-native-background))] motion-reduce:active:scale-100",
							selected
								? "text-[rgb(var(--ds-native-bone))] after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:bg-[rgb(var(--ds-native-lime))]"
								: "text-[rgb(var(--ds-native-muted))]",
						)}
					>
						{tab.label}
					</button>
				);
			})}
		</div>
	);
}

export function SessionPerformanceTableView({
	view,
	players = [],
	teams = [],
	selectedPlayerId,
	onPlayerSelect,
	loading,
	emptyMessage = "Statistika još nije dostupna.",
	panelId = "session-performance-panel",
	activeTabValue,
}: {
	view: "player" | "team";
	players?: SessionPerformancePlayer[];
	teams?: SessionPerformanceTeam[];
	selectedPlayerId?: string | null;
	onPlayerSelect?: (playerId: string) => void;
	loading?: boolean;
	emptyMessage?: string;
	panelId?: string;
	activeTabValue?: string;
}) {
	const entries = view === "player" ? players : teams;

	return (
		<div
			id={panelId}
			className="w-full"
			role="tabpanel"
			aria-labelledby={
				activeTabValue ? `${panelId}-tab-${activeTabValue}` : undefined
			}
		>
			<div className="grid grid-cols-[46px_minmax(0,1fr)_56px_60px] items-center gap-2 border-b border-white/[0.13] py-[9px] font-session-label text-ios-label-11 font-semibold uppercase tracking-[0.8px] text-[rgb(var(--ds-native-muted))]">
				<span className="col-span-2">{view === "team" ? "Tim" : "Igrač"}</span>
				<span className="text-center">Forma</span>
				<span className="text-right">Elo</span>
			</div>

			{loading ? (
				<Loading
					label="Učitavam statistiku…"
					size="sm"
					className="py-5"
				/>
			) : entries.length === 0 ? (
				<p className="py-5 text-ios-subheadline text-[rgb(var(--ds-native-muted))]">
					{emptyMessage}
				</p>
			) : view === "player" ? (
				<ul className="m-0 list-none p-0">
					{players.map((player, index) => {
						const selected = selectedPlayerId === player.id;
						const label = `${player.name}, mesto ${index + 1}, ${player.wins} pobeda, ${player.draws} nerešenih, ${player.losses} poraza, ${formatDelta(player.eloChange)} Elo`;
						return (
							<li key={player.id} className="border-b border-white/[0.13] last:border-b-0">
								<button
									type="button"
									onClick={() => onPlayerSelect?.(player.id)}
									disabled={!onPlayerSelect}
									aria-label={label}
									aria-pressed={selected}
									className="touch-safe grid w-full grid-cols-[40px_minmax(0,1fr)_56px_60px] items-center gap-2 py-[13px] text-left outline-none transition-[transform,opacity] duration-press ease-ds-out active:scale-[0.97] active:opacity-[0.84] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--ds-native-purple-bright))] disabled:pointer-events-none motion-reduce:active:scale-100"
								>
									<RankedPlayerAvatar
										player={player}
										rank={index + 1}
										selected={selected}
									/>
									<span className="min-w-0">
										<span className="block truncate text-ios-body font-semibold leading-tight text-[rgb(var(--ds-native-bone))]">
											{player.name}
										</span>
										<span className="mt-0.5 block">
											<RecordSummary {...player} />
										</span>
									</span>
									<FormBar {...player} />
									<EloResult
										eloAfter={player.eloAfter}
										eloChange={player.eloChange}
									/>
								</button>
							</li>
						);
					})}
				</ul>
			) : (
				<ul className="m-0 list-none p-0">
					{teams.map((team, index) => (
						<li
							key={team.id}
							className="grid grid-cols-[48px_minmax(0,1fr)_56px_60px] items-center gap-2 border-b border-white/[0.13] py-[13px] last:border-b-0"
							aria-label={`${team.name}, mesto ${index + 1}, ${team.wins} pobeda, ${team.draws} nerešenih, ${team.losses} poraza, ${formatDelta(team.eloChange)} Elo`}
						>
							<RankedTeamAvatar team={team} rank={index + 1} />
							<span className="min-w-0">
								<span className="block truncate text-ios-body font-semibold leading-tight text-[rgb(var(--ds-native-bone))]">
									{team.name}
								</span>
								<span className="mt-0.5 block">
									<RecordSummary {...team} />
								</span>
							</span>
							<FormBar {...team} />
							<EloResult eloAfter={team.eloAfter} eloChange={team.eloChange} />
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function OutcomeArtwork({
	outcome,
	size = 30,
}: {
	outcome: SessionDetailOutcome | null;
	size?: number;
}) {
	if (!outcome) {
		return <span style={{ width: size, height: size }} aria-hidden="true" />;
	}

	return (
		<Image
			src={outcomeAssets[outcome]}
			alt={outcomeLabels[outcome]}
			width={size}
			height={size}
			className="object-cover"
			style={{ width: size, height: size, borderRadius: size * 0.18 }}
			unoptimized
		/>
	);
}

export function SessionScoreboardMatch({
	match,
}: {
	match: SessionScoreboardMatchData;
}) {
	const teamOneName = teamName(match.teamOne);
	const teamTwoName = teamName(match.teamTwo);
	const teamOneOutcome = outcomeFor(match.teamOneScore, match.teamTwoScore);
	const teamTwoOutcome = outcomeFor(match.teamTwoScore, match.teamOneScore);
	const accessibilityResult = `${teamOneName}, ${match.teamOneScore ?? "bez rezultata"}, protiv ${match.teamTwoScore ?? "bez rezultata"}, ${teamTwoName}${match.isRated === false ? ", bez ELO-a" : ""}`;
	const Component = match.onActivate ? "button" : "div";

	return (
		<Component
			{...(match.onActivate
				? { type: "button" as const, onClick: match.onActivate }
				: {})}
			className={cn(
				"session-detail-scoreboard grid w-full grid-cols-[minmax(0,1fr)_30px_26px_auto_26px_30px_minmax(0,1fr)] items-center gap-2.5 p-3 text-ios-subheadline font-semibold outline-none",
				match.onActivate &&
					"touch-safe cursor-pointer text-left transition-[transform,opacity,border-color] duration-press ease-ds-out active:scale-[0.97] active:opacity-[0.84] focus-visible:ring-2 focus-visible:ring-[rgb(var(--ds-native-purple-bright))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--ds-native-background))] motion-reduce:active:scale-100",
			)}
			aria-label={accessibilityResult}
		>
			<span className="min-w-0 truncate text-right text-[rgb(var(--ds-native-bone))]">
				{teamOneName}
			</span>
			<OutcomeArtwork outcome={teamOneOutcome} />
			<span
				className={cn(
					"min-w-[26px] text-center font-session-display text-ios-display-24 font-black leading-none tabular-nums",
					teamOneOutcome === "win"
						? "text-[rgb(var(--ds-native-lime))]"
						: "text-[rgb(var(--ds-native-bone))]",
				)}
			>
				{match.teamOneScore ?? "—"}
			</span>
			<span className="font-session-label text-ios-caption2 font-bold uppercase tracking-[0.7px] text-[rgb(var(--ds-native-muted))]">
				VS
			</span>
			<span
				className={cn(
					"min-w-[26px] text-center font-session-display text-ios-display-24 font-black leading-none tabular-nums",
					teamTwoOutcome === "win"
						? "text-[rgb(var(--ds-native-lime))]"
						: "text-[rgb(var(--ds-native-bone))]",
				)}
			>
				{match.teamTwoScore ?? "—"}
			</span>
			<OutcomeArtwork outcome={teamTwoOutcome} />
			<span className="min-w-0 truncate text-left text-[rgb(var(--ds-native-bone))]">
				{teamTwoName}
			</span>

			{match.pairedFirstHalfLabel ? (
				<span className="sr-only">{match.pairedFirstHalfLabel}</span>
			) : null}
			{match.isRated === false ? (
				<span className="sr-only">Bez ELO-a</span>
			) : null}
		</Component>
	);
}

export function SessionCompletedMatchResults({
	matches,
}: {
	matches: SessionScoreboardMatchData[];
}) {
	return (
		<section aria-labelledby="session-completed-match-results-title">
			<div className="mb-3.5 flex items-center justify-between gap-4">
				<h2
					id="session-completed-match-results-title"
					className="font-session-label text-ios-label-12 font-semibold uppercase tracking-[1.6px] text-[rgb(var(--ds-native-purple-bright))]"
				>
					Rezultati mečeva
				</h2>
				<span className="font-session-label text-ios-label-12 uppercase tracking-[0.6px] text-[rgb(var(--ds-native-muted))]">
					{matches.length} mečeva
				</span>
			</div>

			{matches.length === 0 ? (
				<p className="py-2 text-ios-subheadline text-[rgb(var(--ds-native-muted))]">
					Rezultati će se pojaviti ovde.
				</p>
			) : (
				<div className="space-y-2.5">
					{matches.map((match) => (
						<SessionScoreboardMatch key={match.id} match={match} />
					))}
				</div>
			)}
		</section>
	);
}

function matchSummary(matches: SessionScoreboardMatchData[]) {
	const singles = matches.filter((match) => match.matchType === "singles").length;
	const doubles = matches.length - singles;
	const parts: string[] = [];
	if (singles) parts.push(`${singles} ${singles === 1 ? "singl" : "singla"}`);
	if (doubles) parts.push(`${doubles} ${doubles === 1 ? "dubl" : "dubla"}`);
	return parts.join(" · ");
}

export function SessionResultsTimeline({
	rounds,
	defaultExpandedRounds = [],
}: {
	rounds: SessionResultRound[];
	defaultExpandedRounds?: number[];
}) {
	const [expandedRounds, setExpandedRounds] = React.useState<Set<number>>(
		() => new Set(defaultExpandedRounds),
	);

	return (
		<section aria-labelledby="session-match-results-title">
			<div className="mb-3.5 flex items-center justify-between gap-4">
				<h2
					id="session-match-results-title"
					className="font-session-label text-ios-label-12 font-semibold uppercase tracking-[1.6px] text-[rgb(var(--ds-native-purple-bright))]"
				>
					Rezultati mečeva
				</h2>
				<span className="font-session-label text-ios-label-12 uppercase tracking-[0.6px] text-[rgb(var(--ds-native-muted))]">
					{rounds.length} rundi
				</span>
			</div>

			{rounds.length === 0 ? (
				<p className="py-2 text-ios-subheadline text-[rgb(var(--ds-native-muted))]">
					Rezultati će se pojaviti ovde.
				</p>
			) : (
				<div>
					{rounds.map((round, index) => {
						const expanded = expandedRounds.has(round.number);
						const panelId = `session-round-${round.number}-matches`;
						return (
							<div
								key={round.number}
								className={cn(
									index < rounds.length - 1 && "border-b border-white/[0.13]",
								)}
							>
								<button
									type="button"
									aria-expanded={expanded}
									aria-controls={panelId}
									onClick={() => {
										setExpandedRounds((current) => {
											const next = new Set(current);
											if (next.has(round.number)) next.delete(round.number);
											else next.add(round.number);
											return next;
										});
									}}
									className="touch-safe grid min-h-[60px] w-full grid-cols-[32px_minmax(0,1fr)_auto_18px] items-center gap-[13px] py-3.5 text-left outline-none transition-[transform,opacity] duration-press ease-ds-out active:scale-[0.97] active:opacity-[0.84] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--ds-native-purple-bright))] motion-reduce:active:scale-100"
								>
									<span className="flex size-8 items-center justify-center rounded-[4px] bg-[rgb(var(--ds-native-surface))] font-session-label text-ios-label-15 font-semibold tabular-nums text-[rgb(var(--ds-native-bone))]">
										{round.number}
									</span>
									<span className="min-w-0">
										<span className="block text-ios-body font-semibold leading-tight text-[rgb(var(--ds-native-bone))]">
											Runda {round.number}
										</span>
										<span className="mt-0.5 block truncate text-ios-caption text-[rgb(var(--ds-native-muted))]">
											{matchSummary(round.matches)}
										</span>
									</span>
									<span className="font-session-label text-ios-label-11 uppercase tracking-[0.6px] text-[rgb(var(--ds-native-muted))]">
										Završeno
									</span>
									<span
										className={cn(
											"mx-auto size-2.5 rotate-45 border-b-2 border-r-2 border-white/35 transition-transform duration-standard ease-ds-out",
											expanded ? "-rotate-[135deg] translate-y-0.5" : "rotate-45 -translate-y-0.5",
										)}
										aria-hidden="true"
									/>
								</button>

								{expanded ? (
									<div id={panelId} className="space-y-3 pb-4">
										{round.matches.map((match) => (
											<SessionScoreboardMatch key={match.id} match={match} />
										))}
									</div>
								) : null}
							</div>
						);
					})}
				</div>
			)}
		</section>
	);
}

export function SessionPlayerMatchResults({
	player,
	matches,
	summary,
	onClear,
}: {
	player: SessionDetailPlayer;
	matches: SessionScoreboardMatchData[];
	summary?: string | null;
	onClear: () => void;
}) {
	return (
		<section aria-labelledby="session-player-results-title">
			<div className="mb-3.5 flex items-center justify-between gap-4">
				<h2
					id="session-player-results-title"
					className="font-session-label text-ios-label-12 font-semibold uppercase tracking-[1.6px] text-[rgb(var(--ds-native-purple-bright))]"
				>
					Mečevi igrača
				</h2>
				<span className="font-session-label text-ios-label-12 uppercase tracking-[0.6px] text-[rgb(var(--ds-native-muted))]">
					{matches.length} mečeva
				</span>
			</div>

			<div className="mb-1 flex min-h-11 items-center gap-3 py-0.5">
				<NativeAvatar player={player} size={44} />
				<span className="min-w-0 flex-1">
					<span className="block truncate text-ios-body font-semibold text-[rgb(var(--ds-native-bone))]">
						{player.name}
					</span>
					<span className="mt-[3px] block truncate text-ios-caption tabular-nums text-[rgb(var(--ds-native-muted))]">
						{summary ?? "ELO nije dostupan"}
					</span>
				</span>
				<button
					type="button"
					onClick={onClear}
					className="touch-safe min-h-8 rounded-lg border border-white/[0.13] px-2.5 text-ios-caption font-semibold text-[rgb(var(--ds-native-bone))] outline-none transition-[transform,opacity,background-color] duration-press ease-ds-out active:scale-[0.97] active:opacity-[0.84] focus-visible:ring-2 focus-visible:ring-[rgb(var(--ds-native-purple-bright))]"
				>
					Svi&nbsp; ×
				</button>
			</div>

			<div className="divide-y divide-white/[0.13]">
				{matches.map((match) => {
					const playerIsOnTeamOne = match.teamOne.some(
						(member) => member.id === player.id,
					);
					const ownScore = playerIsOnTeamOne
						? match.teamOneScore
						: match.teamTwoScore;
					const opponentScore = playerIsOnTeamOne
						? match.teamTwoScore
						: match.teamOneScore;
					const opponents = playerIsOnTeamOne ? match.teamTwo : match.teamOne;
					const outcome = outcomeFor(ownScore, opponentScore);
					const delta = playerIsOnTeamOne
						? match.teamOneEloChange
						: match.teamTwoEloChange;

					const row = (
						<div
							key={match.id}
							className="grid min-h-[62px] grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 py-3"
							aria-label={`${outcome ? outcomeLabels[outcome] : "Rezultat nije dostupan"} protiv ${teamName(opponents)}, rezultat ${ownScore ?? "—"} prema ${opponentScore ?? "—"}, ${formatDelta(delta)} Elo`}
						>
							<OutcomeArtwork outcome={outcome} size={38} />
							<span className="min-w-0">
								<span className="block truncate text-ios-body font-semibold text-[rgb(var(--ds-native-bone))]">
									VS {teamName(opponents)}
								</span>
								<span className="mt-0.5 block text-ios-caption text-[rgb(var(--ds-native-muted))]">
									Runda {match.roundNumber}
								</span>
							</span>
							<span className="flex flex-col items-end gap-0.5">
								<span className={cn("font-session-display text-ios-display-23 font-black leading-none tabular-nums", outcomeClass(outcome))}>
									{ownScore ?? "—"}–{opponentScore ?? "—"}
								</span>
								<span className="flex gap-1 text-ios-caption2 font-bold tabular-nums">
									<span className={deltaClass(delta)}>{formatDelta(delta)}</span>
									<span className="text-[rgb(var(--ds-native-muted))]">ELO</span>
								</span>
							</span>
						</div>
					);

					return match.onActivate ? (
						<button
							key={match.id}
							type="button"
							onClick={match.onActivate}
							className="touch-safe block w-full text-left outline-none transition-[transform,opacity] duration-press ease-ds-out active:scale-[0.97] active:opacity-[0.84] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--ds-native-purple-bright))] motion-reduce:active:scale-100"
						>
							{row}
						</button>
					) : (
						row
					);
				})}
			</div>
		</section>
	);
}
