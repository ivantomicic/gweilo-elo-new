"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Hand } from "lucide-react";
import {
	CartesianGrid,
	Customized,
	Line,
	LineChart,
	ReferenceDot,
	ReferenceLine,
	ResponsiveContainer,
	XAxis,
	YAxis,
} from "recharts";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/components/ui/avatar";
import { Loading } from "@/components/ui/loading";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { cn } from "@/lib/utils";
import { getRecentSessionForm } from "@/lib/statistics/recent-form";
import { ChartScrubOverlay } from "@/components/player/chart-scrub-overlay";
import { ChartScrubBanner, type ChartScrubMatch } from "@/components/player/chart-scrub-banner";
import {
	serbianMatchCount,
	summarizePlayerSessions,
	type PlayerSessionSummary,
} from "@/lib/player/session-history";

export type PlayerProfileStats = {
	player_id: string;
	display_name: string;
	avatar: string | null;
	matches_played: number;
	wins: number;
	losses: number;
	draws: number;
	elo: number;
	recent_form: number[];
	recent_form_scores?: number[];
};

export type PlayerEloPoint = ChartScrubMatch & {
	sessionId?: string | null;
	opponentId?: string | null;
};

export type HeadToHeadData = {
	player1: HeadToHeadPlayer;
	player2: HeadToHeadPlayer;
	totalMatches: number;
};

type HeadToHeadPlayer = {
	id: string;
	display_name: string;
	avatar: string | null;
	elo: number;
	wins: number;
	losses: number;
	draws: number;
	setsWon: number;
	setsLost: number;
};

type PlayerProfileNativeProps = {
	player: {
		id: string;
		display_name: string;
		avatar: string | null;
	};
	stats: PlayerProfileStats | null;
	rank: number | null;
	history: PlayerEloPoint[];
	currentElo: number;
	currentUserId: string | null;
	loadHeadToHead: () => Promise<HeadToHeadData>;
};

type Outcome = "win" | "draw" | "loss";
type HistoryView = "all" | "against-me" | "sessions";
type MatchScope = Exclude<HistoryView, "sessions">;

const tone = {
	bone: "rgb(var(--ds-native-bone))",
	muted: "rgb(var(--ds-native-muted))",
	purple: "rgb(var(--ds-native-purple-bright))",
	lime: "rgb(var(--ds-native-lime))",
	coral: "rgb(var(--ds-native-coral))",
	amber: "rgb(var(--ds-native-amber))",
};

const outcomeAssets: Record<Outcome, string> = {
	win: "/player-profile/match-result-win.png",
	draw: "/player-profile/match-result-draw.png",
	loss: "/player-profile/match-result-loss.png",
};

const outcomeLabels: Record<Outcome, string> = {
	win: "Pobede",
	draw: "Nerešeno",
	loss: "Porazi",
};

function initials(name: string) {
	return name
		.trim()
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part.charAt(0).toUpperCase())
		.join("");
}

function performanceColor(delta: number | undefined) {
	if ((delta ?? 0) > 5) return tone.lime;
	if ((delta ?? 0) < -5) return tone.coral;
	return tone.amber;
}

function outcomeColor(outcome: Outcome | null | undefined) {
	if (outcome === "win") return tone.lime;
	if (outcome === "loss") return tone.coral;
	if (outcome === "draw") return tone.amber;
	return tone.bone;
}

function formatDelta(delta: number | undefined) {
	if (delta === undefined || !Number.isFinite(delta)) return "—";
	const rounded = Math.round(delta);
	return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function formatElo(value: number) {
	return Math.round(value).toLocaleString("sr-Latn-RS");
}

function deltaDirection(delta: number) {
	if (delta > 0) return "Dobitak";
	if (delta < 0) return "Gubitak";
	return "Bez promene";
}

function formatDate(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "—";
	return new Intl.DateTimeFormat("sr-Latn-RS", {
		day: "numeric",
		month: "short",
		year: "numeric",
	}).format(date);
}

function ProfileAvatar({
	name,
	avatar,
	size,
	className,
}: {
	name: string;
	avatar: string | null;
	size: number;
	className?: string;
}) {
	return (
		<Avatar
			className={cn("shrink-0 rounded-[22px]", className)}
			style={{ width: size, height: size }}
		>
			<AvatarImage
				src={avatar ?? undefined}
				fallbackSeed={name}
				alt={name}
				className="object-cover"
			/>
			<AvatarFallback className="rounded-[inherit] bg-[rgb(var(--ds-native-raised))] font-session-display text-ios-display-34 font-black text-[rgb(var(--ds-native-bone))]">
				{initials(name) || "?"}
			</AvatarFallback>
		</Avatar>
	);
}

function RecentFormBar({ stats }: { stats: PlayerProfileStats }) {
	const entries = getRecentSessionForm(stats.recent_form, stats.recent_form_scores);
	const colors = entries.map((entry) => !entry
		? "rgb(var(--ds-native-muted) / 0.18)"
		: entry.band === "good" ? tone.lime : entry.band === "bad" ? tone.coral : tone.amber);
	const labels = { good: "Dobra forma", neutral: "Neutralna forma", bad: "Loša forma" };
	const stops = colors.map((color, index) => `${color} ${index * 20 + 10}%`).join(", ");

	return (
		<div className="space-y-2">
			<div
				aria-hidden="true"
				className="h-2 w-full rounded-[3px]"
				style={{ backgroundImage: `linear-gradient(to right, ${stops})` }}
			/>
			<ol className="grid grid-cols-5 gap-2" aria-label="Forma poslednjih pet termina, od najstarijeg ka najnovijem">
				{entries.map((entry, index) => (
					<li
						key={index}
						className="text-center text-ios-caption2 font-semibold tabular-nums"
						style={{ color: entry ? colors[index] : tone.muted }}
						aria-label={entry ? `${labels[entry.band]}, ${formatDelta(entry.delta)} Elo` : "Nema podatka"}
						title={entry ? `${labels[entry.band]}, ${formatDelta(entry.delta)} Elo` : "Nema podatka"}
					>
						{entry ? formatDelta(entry.delta) : "—"}
					</li>
				))}
			</ol>
		</div>
	);
}

function ProfileHeader({
	player,
	stats,
	currentElo,
}: Pick<PlayerProfileNativeProps, "player" | "stats" | "currentElo">) {
	return (
		<header className="space-y-4 pb-1 pt-3">
			<div className="flex min-w-0 flex-col items-center text-center">
				<div
					className="profile-enter profile-enter-portrait"
					style={{
						WebkitMaskImage: "linear-gradient(to bottom, black 25%, rgb(0 0 0 / 0.65) 48%, rgb(0 0 0 / 0.2) 65%, transparent 82%)",
						maskImage: "linear-gradient(to bottom, black 25%, rgb(0 0 0 / 0.65) 48%, rgb(0 0 0 / 0.2) 65%, transparent 82%)",
					}}
				>
					<ProfileAvatar
						name={player.display_name}
						avatar={player.avatar}
						size={200}
						className="rounded-full"
					/>
				</div>
				<h1 className="profile-enter profile-enter-name relative z-10 -mt-8 w-full min-w-0 font-session-display text-ios-display-40 font-black uppercase leading-[1.08] tracking-[-0.4px] text-[rgb(var(--ds-native-bone))] [overflow-wrap:anywhere]">
					{player.display_name}
				</h1>
			</div>

			<dl className="profile-enter profile-enter-elo text-center" data-number-entrance>
				<div className="min-w-0">
					<dt className="font-session-label text-ios-label-12 font-semibold uppercase tracking-[1.4px] text-[rgb(var(--ds-native-muted))]">
						Singl Elo
					</dt>
					<dd className="mt-1 font-session-display text-[44px] font-black leading-[48px] tracking-[-0.6px] tabular-nums text-[rgb(var(--ds-native-bone))]">
						<AnimatedNumber value={stats?.elo ?? currentElo} />
					</dd>
				</div>
			</dl>

			{stats && stats.recent_form.length > 0 && (
				<div className="profile-enter profile-enter-form space-y-3 pt-1">
					<p className="font-session-label text-ios-label-12 font-semibold uppercase leading-4 tracking-[0.8px] text-[rgb(var(--ds-native-muted))]">
						Forma <span aria-hidden="true">·</span> Poslednjih 5 termina <span className="float-right normal-case tracking-normal">Elo Δ</span>
					</p>
					<RecentFormBar stats={stats} />
				</div>
			)}
		</header>
	);
}

function RecordStrip({ stats }: { stats: PlayerProfileStats | null }) {
	const metrics: Array<{ outcome: Outcome; value: number }> = [
		{ outcome: "win", value: stats?.wins ?? 0 },
		{ outcome: "draw", value: stats?.draws ?? 0 },
		{ outcome: "loss", value: stats?.losses ?? 0 },
	];

	return (
		<section
			className="profile-enter profile-enter-record grid grid-cols-3 gap-3 border-y border-white/[0.13] py-4"
			data-number-entrance
			aria-label="Rezultati igrača"
		>
			{metrics.map(({ outcome, value }) => (
				<div
					key={outcome}
					className="flex min-w-0 flex-col items-center gap-1.5"
					aria-label={`${outcomeLabels[outcome]}, ${value}`}
				>
					<Image
						src={outcomeAssets[outcome]}
						alt=""
						width={52}
						height={52}
						className="size-[52px] rounded-[9px] object-cover"
					/>
					<strong
						className="font-session-display text-ios-display-24 font-black leading-none tabular-nums"
						style={{ color: outcomeColor(outcome) }}
					>
						<AnimatedNumber value={value} />
					</strong>
					<span className="font-session-label text-ios-label-10 font-semibold tracking-[0.7px] text-[rgb(var(--ds-native-bone))]">
						{outcomeLabels[outcome]}
					</span>
				</div>
			))}
		</section>
	);
}

function EloHistoryChart({ history }: { history: PlayerEloPoint[] }) {
	const ordered = useMemo(
		() => [...history].filter((point) => point.match > 0).sort((a, b) => a.match - b.match),
		[history],
	);
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
	const selectedPoint = selectedIndex === null ? null : ordered[selectedIndex] ?? null;
	const [min, max] = useMemo(() => {
		const values = ordered.map((point) => point.elo);
		return [
			Math.floor((Math.min(...values) - 25) / 25) * 25,
			Math.ceil((Math.max(...values) + 25) / 25) * 25,
		];
	}, [ordered]);
	const firstMatch = ordered[0]?.match ?? 0;
	const lastMatch = ordered.at(-1)?.match ?? 0;
	const tickStep = (lastMatch - firstMatch) / 4;
	const xTicks = Array.from({ length: 5 }, (_, index) =>
		Math.round(firstMatch + tickStep * index),
	);
	const gradientStops = useMemo(() => ordered.slice(0, -1).flatMap((point, index) => {
		const start = (index / (ordered.length - 1)) * 100;
		const end = ((index + 1) / (ordered.length - 1)) * 100;
		const color = performanceColor(ordered[index + 1].delta);
		return [
			<stop key={`${point.match}-start`} offset={`${start}%`} stopColor={color} />,
			<stop key={`${point.match}-end`} offset={`${end}%`} stopColor={color} />,
		];
	}), [ordered]);

	if (ordered.length <= 1) {
		return (
			<section className="py-4 text-ios-subheadline text-[rgb(var(--ds-native-muted))]">
				Još nema Elo istorije. Prvi završen rezultat prikazaće ovaj grafikon.
			</section>
		);
	}

	return (
		<section aria-label="Kretanje singl Elo rejtinga" className="space-y-3">
			<ChartScrubBanner point={selectedPoint} />
			<div
				className="h-[220px] w-full select-none outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ds-native-purple-bright))]"
				tabIndex={0}
				role="slider"
				aria-label="Pregled mečeva na grafikonu Elo istorije"
				aria-valuemin={firstMatch}
				aria-valuemax={lastMatch}
				aria-valuenow={selectedPoint?.match ?? lastMatch}
				aria-valuetext={selectedPoint ? `Meč ${selectedPoint.match}, protiv ${selectedPoint.opponent || "nepoznatog protivnika"}, ${formatElo(selectedPoint.elo)} Elo, ${formatDelta(selectedPoint.delta)} Elo` : `Trenutni Elo ${formatElo(ordered.at(-1)?.elo ?? 0)}`}
				onKeyDown={(event) => {
					if (event.key === "Home" || event.key === "End") {
						event.preventDefault();
						setSelectedIndex(event.key === "Home" ? 0 : ordered.length - 1);
						return;
					}
					if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
					event.preventDefault();
					setSelectedIndex((current) => {
						const start = current ?? ordered.length - 1;
						return event.key === "ArrowLeft"
							? Math.max(0, start - 1)
							: Math.min(ordered.length - 1, start + 1);
					});
				}}
			>
				<ResponsiveContainer width="100%" height="100%">
					<LineChart
						data={ordered}
						margin={{ top: 10, right: 4, bottom: 2, left: -3 }}
					>
						<defs>
							<linearGradient id="player-profile-elo-line" x1="0" y1="0" x2="1" y2="0">
								{gradientStops}
							</linearGradient>
						</defs>
						<CartesianGrid vertical={false} stroke="rgb(255 255 255 / 0.13)" />
						<XAxis
							dataKey="match"
							type="number"
							domain={[firstMatch, lastMatch]}
							ticks={xTicks}
							axisLine={false}
							tickLine={false}
							tick={{ fill: tone.muted, fontSize: 12 }}
							tickMargin={9}
							allowDecimals={false}
						/>
						<YAxis
							domain={[min, max]}
							axisLine={false}
							tickLine={false}
							tick={{ fill: tone.muted, fontSize: 12 }}
							tickFormatter={formatElo}
							width={60}
							tickCount={5}
						/>
						<Line
							type="monotone"
							dataKey="elo"
							stroke="url(#player-profile-elo-line)"
							strokeWidth={3}
							dot={false}
							activeDot={false}
							isAnimationActive={false}
						/>
						{selectedPoint && (
							<ReferenceLine
								x={selectedPoint.match}
								stroke="rgb(245 242 232 / 0.38)"
								strokeDasharray="3 4"
							/>
						)}
						{selectedPoint && (
							<ReferenceDot x={selectedPoint.match} y={selectedPoint.elo} r={5} fill={performanceColor(selectedPoint.delta)} strokeWidth={0} />
						)}
						<Customized component={<ChartScrubOverlay points={ordered} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />} />
					</LineChart>
				</ResponsiveContainer>
			</div>
			<div className="flex min-h-6 items-center gap-2 text-[rgb(var(--ds-native-purple-bright))]">
				<Hand className="size-5" aria-hidden="true" />
				<span className="font-session-label text-ios-label-9 font-semibold tracking-[0.7px] text-[rgb(var(--ds-native-muted))]">
					SVIH {ordered.length} MEČEVA
				</span>
			</div>
			<div className="flex flex-wrap gap-x-3.5 gap-y-2" aria-label="Legenda grafikona">
				<Legend color={tone.lime} label="DOBITAK >5" />
				<Legend color={tone.amber} label="STABILNO ±5" />
				<Legend color={tone.coral} label="GUBITAK <−5" />
			</div>
			<p className="text-ios-caption text-[rgb(var(--ds-native-muted))]">Dodirni i prevuci levo–desno za detalje meča</p>
		</section>
	);
}

function Legend({ color, label }: { color: string; label: string }) {
	return (
		<span className="flex items-center gap-[5px]">
			<span className="h-[3px] w-3" style={{ backgroundColor: color }} />
			<span className="font-session-label text-ios-label-9 font-semibold tracking-[0.6px] text-[rgb(var(--ds-native-muted))]">
				{label}
			</span>
		</span>
	);
}

function CompactPlayer({ player }: { player: HeadToHeadPlayer }) {
	return (
		<div className="flex w-[68px] flex-col items-center gap-1">
			<ProfileAvatar
				name={player.display_name}
				avatar={player.avatar}
				size={38}
				className="rounded-[10px]"
			/>
			<span className="max-w-full truncate text-ios-caption2 font-semibold text-[rgb(var(--ds-native-bone))]">
				{player.display_name}
			</span>
		</div>
	);
}

function HeadToHeadSummary({ data }: { data: HeadToHeadData }) {
	if (data.totalMatches === 0) {
		return (
			<p className="rounded-[10px] bg-[rgb(var(--ds-native-raised))] p-3.5 text-ios-subheadline text-[rgb(var(--ds-native-muted))]">
				Još nema međusobnih singl mečeva.
			</p>
		);
	}

	const colorFor = (value: number, other: number) =>
		value > other ? tone.lime : value < other ? tone.coral : tone.bone;

	return (
		<div className="flex items-center gap-3 rounded-[10px] bg-[rgb(var(--ds-native-raised))] p-3.5">
			<CompactPlayer player={data.player1} />
			<div className="min-w-0 flex-1 text-center">
				<div className="font-session-display text-ios-display-30 font-black leading-none tabular-nums">
					<span style={{ color: colorFor(data.player1.wins, data.player2.wins) }}>{data.player1.wins}</span>
					<span className="px-[7px] text-[rgb(var(--ds-native-muted))]">–</span>
					<span style={{ color: colorFor(data.player2.wins, data.player1.wins) }}>{data.player2.wins}</span>
				</div>
				<div className="mt-0.5 font-session-label text-ios-label-11 font-semibold tabular-nums">
					<span style={{ color: colorFor(data.player1.elo, data.player2.elo) }}>{formatElo(data.player1.elo)}</span>
					<span className="px-[5px] text-[rgb(var(--ds-native-muted))]">ELO</span>
					<span style={{ color: colorFor(data.player2.elo, data.player1.elo) }}>{formatElo(data.player2.elo)}</span>
				</div>
				{data.player1.draws > 0 && (
					<div className="text-ios-caption2 tabular-nums text-[rgb(var(--ds-native-amber))]">
						{data.player1.draws} nerešeno
					</div>
				)}
			</div>
			<CompactPlayer player={data.player2} />
		</div>
	);
}

function MatchRow({ point }: { point: PlayerEloPoint }) {
	const outcome = point.result ?? null;
	const score = point.scoreFor != null && point.scoreAgainst != null
		? `${point.scoreFor}–${point.scoreAgainst}`
		: null;

	return (
		<li
			className="flex items-center gap-3 py-3"
			aria-label={`${outcome === "win" ? "Pobeda" : outcome === "loss" ? "Poraz" : outcome === "draw" ? "Nerešeno" : "Rezultat"} protiv ${point.opponent || "nepoznatog protivnika"}, ${score ? `rezultat ${score}, ` : ""}${formatDelta(point.delta)} Elo`}
		>
			{outcome ? (
				<Image
					src={outcomeAssets[outcome]}
					alt=""
					width={34}
					height={34}
					className="size-[34px] shrink-0 rounded-md object-cover"
				/>
			) : (
				<span
					className="flex size-[34px] shrink-0 items-center justify-center rounded-[5px] border text-ios-footnote font-semibold"
					style={{ color: performanceColor(point.delta), borderColor: `${performanceColor(point.delta)}6b`, backgroundColor: `${performanceColor(point.delta)}1f` }}
				>
					{(point.delta ?? 0) > 5 ? "↑" : (point.delta ?? 0) < -5 ? "↓" : "•"}
				</span>
			)}
			<div className="min-w-0 flex-1">
				<strong className="block truncate text-ios-body font-semibold text-[rgb(var(--ds-native-bone))]">
					VS {point.opponent || "nepoznatog protivnika"}
				</strong>
				<span className="mt-[3px] block text-ios-caption text-[rgb(var(--ds-native-muted))]">{formatDate(point.date)}</span>
			</div>
			<div className="shrink-0 text-right">
				<strong
					className="block font-session-display text-ios-display-23 font-black leading-none tabular-nums"
					style={{ color: outcome ? outcomeColor(outcome) : performanceColor(point.delta) }}
				>
					{score ?? formatDelta(point.delta)}
				</strong>
				<span className="mt-[3px] flex justify-end gap-1 font-mono text-ios-caption2 font-bold tabular-nums">
					{score && <span style={{ color: performanceColor(point.delta) }}>{formatDelta(point.delta)}</span>}
					<span className="text-[rgb(var(--ds-native-muted))]">{score ? "ELO" : "ELO PROMENA"}</span>
				</span>
			</div>
		</li>
	);
}

type UnderlineTabOption<T extends string> = {
	value: T;
	label: string;
};

function UnderlineTabs<T extends string>({
	options,
	value,
	onValueChange,
	ariaLabel,
	panelId,
}: {
	options: readonly UnderlineTabOption<T>[];
	value: T;
	onValueChange: (value: T) => void;
	ariaLabel: string;
	panelId: string;
}) {
	const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

	const selectAndFocus = (index: number) => {
		const option = options[index];
		if (!option) return;
		onValueChange(option.value);
		buttonRefs.current[index]?.focus();
	};

	return (
		<div className="flex gap-6 border-b border-white/[0.13]" role="tablist" aria-label={ariaLabel}>
			{options.map((option, index) => {
				const selected = value === option.value;
				return (
					<button
						key={option.value}
						ref={(element) => {
							buttonRefs.current[index] = element;
						}}
						type="button"
						role="tab"
						id={`${panelId}-tab-${option.value}`}
						aria-controls={panelId}
						aria-selected={selected}
						tabIndex={selected ? 0 : -1}
						onClick={() => onValueChange(option.value)}
						onKeyDown={(event) => {
							let targetIndex: number | null = null;
							if (event.key === "ArrowRight") targetIndex = (index + 1) % options.length;
							if (event.key === "ArrowLeft") targetIndex = (index - 1 + options.length) % options.length;
							if (event.key === "Home") targetIndex = 0;
							if (event.key === "End") targetIndex = options.length - 1;
							if (targetIndex === null) return;
							event.preventDefault();
							selectAndFocus(targetIndex);
						}}
						className={cn(
							"touch-safe relative flex min-h-11 min-w-0 flex-1 items-end justify-center pb-[9px] font-session-label text-ios-label-12 font-semibold uppercase tracking-[0.7px] outline-none transition-[transform,opacity,color] duration-press ease-ds-out active:scale-[0.97] active:opacity-80 focus-visible:ring-2 focus-visible:ring-[rgb(var(--ds-native-purple-bright))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--ds-native-background))] motion-reduce:active:scale-100",
							selected
								? "text-[rgb(var(--ds-native-bone))] after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-[rgb(var(--ds-native-lime))]"
								: "text-[rgb(var(--ds-native-muted))]",
						)}
					>
						{option.label}
					</button>
				);
			})}
		</div>
	);
}

function SessionRow({ session }: { session: PlayerSessionSummary }) {
	const direction = deltaDirection(session.eloDelta);
	const deltaColor = session.eloDelta > 0
		? tone.lime
		: session.eloDelta < 0
			? tone.coral
			: tone.amber;
	const label = `Termin ${formatDate(session.date)}, ${serbianMatchCount(session.matchCount)}, ${direction.toLocaleLowerCase("sr-Latn-RS")} ${Math.abs(session.eloDelta)} Elo, ${formatElo(session.endingElo)} Elo posle termina`;
	const content = (
		<>
			<span className="min-w-0 flex-1">
				<strong className="block text-ios-body font-semibold text-[rgb(var(--ds-native-bone))]">
					{formatDate(session.date)}
				</strong>
				<span className="mt-1 block text-ios-caption text-[rgb(var(--ds-native-muted))]">
					{serbianMatchCount(session.matchCount)} · Elo posle {formatElo(session.endingElo)}
				</span>
			</span>
			<span className="shrink-0 text-right tabular-nums">
				<strong
					className="block font-session-display text-ios-display-23 font-black leading-none"
					style={{ color: deltaColor }}
				>
					{formatDelta(session.eloDelta)}
				</strong>
				<span className="mt-1 block font-session-label text-ios-label-9 font-semibold uppercase tracking-[0.65px] text-[rgb(var(--ds-native-muted))]">
					{direction}
				</span>
			</span>
		</>
	);

	return (
		<li>
			{session.sessionId ? (
				<Link
					href={`/session/${session.sessionId}`}
					aria-label={label}
					className="touch-safe flex min-h-[76px] items-center gap-3 py-3 outline-none transition-[transform,opacity] duration-press ease-ds-out active:scale-[0.985] active:opacity-80 focus-visible:ring-2 focus-visible:ring-[rgb(var(--ds-native-purple-bright))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--ds-native-background))] motion-reduce:active:scale-100"
				>
					{content}
				</Link>
			) : (
				<div role="group" aria-label={label} className="flex min-h-[76px] items-center gap-3 py-3">
					{content}
				</div>
			)}
		</li>
	);
}

function MatchHistory({
	history,
	currentUserId,
	scope,
	comparison,
	comparisonLoading,
	comparisonError,
}: {
	history: PlayerEloPoint[];
	currentUserId: string | null;
	scope: MatchScope;
	comparison: HeadToHeadData | null;
	comparisonLoading: boolean;
	comparisonError: string | null;
}) {
	const [visibleCount, setVisibleCount] = useState(5);
	const results = useMemo(
		() => [...history].filter((point) => point.match > 0 && point.opponent).reverse(),
		[history],
	);
	const scopedResults = scope === "against-me" && currentUserId
		? results.filter((point) => point.opponentId === currentUserId)
		: results;
	const visible = scopedResults.slice(0, visibleCount);

	return (
		<div className="space-y-3.5">
		{scope === "against-me" && (
			<div>
				{comparisonLoading ? (
					<Loading
						label="Učitavam međusobni skor…"
						size="sm"
						className="rounded-[10px] bg-[rgb(var(--ds-native-raised))] p-3.5"
					/>
				) : comparisonError ? (
					<p className="rounded-[10px] bg-[rgb(var(--ds-native-raised))] p-3.5 text-ios-subheadline text-[rgb(var(--ds-native-muted))]">
						{comparisonError}
					</p>
				) : comparison ? (
					<HeadToHeadSummary data={comparison} />
				) : null}
			</div>
		)}

		{visible.length === 0 ? (
			<p className="py-2 text-ios-subheadline text-[rgb(var(--ds-native-muted))]">
				{scope === "against-me"
					? "Još niste odigrali međusobni singl meč."
					: "Poslednji singl rezultati pojaviće se ovde."}
			</p>
		) : (
			<ul className="divide-y divide-white/[0.13]">
				{visible.map((point) => (
					<MatchRow key={`${point.sessionId}-${point.match}-${point.opponentId}`} point={point} />
				))}
			</ul>
		)}

		{visible.length < scopedResults.length && (
			<button
				type="button"
				onClick={() => setVisibleCount((count) => count + 5)}
				className="touch-safe min-h-11 w-full rounded-[10px] bg-[rgb(var(--ds-native-raised))] text-ios-subheadline font-bold text-[rgb(var(--ds-native-bone))] outline-none transition-[transform,opacity] duration-press ease-ds-out active:scale-[0.97] active:opacity-80 focus-visible:ring-2 focus-visible:ring-[rgb(var(--ds-native-purple-bright))] motion-reduce:active:scale-100"
			>
				Učitaj još
			</button>
		)}
	</div>
	);
}

function SessionHistory({ history }: { history: PlayerEloPoint[] }) {
	const [visibleCount, setVisibleCount] = useState(5);
	const sessions = useMemo(() => summarizePlayerSessions(history), [history]);
	const visible = sessions.slice(0, visibleCount);

	return (
		<div className="space-y-3.5">
			{visible.length === 0 ? (
				<p className="py-2 text-ios-subheadline text-[rgb(var(--ds-native-muted))]">
					Učinak po terminima pojaviće se nakon prvog završenog singl meča.
				</p>
			) : (
				<ul className="divide-y divide-white/[0.13]" aria-label="Singl Elo učinak po terminima">
					{visible.map((session) => (
						<SessionRow key={session.key} session={session} />
					))}
				</ul>
			)}

			{visible.length < sessions.length && (
				<button
					type="button"
					onClick={() => setVisibleCount((count) => count + 5)}
					className="touch-safe min-h-11 w-full rounded-[10px] bg-[rgb(var(--ds-native-raised))] text-ios-subheadline font-bold text-[rgb(var(--ds-native-bone))] outline-none transition-[transform,opacity] duration-press ease-ds-out active:scale-[0.97] active:opacity-80 focus-visible:ring-2 focus-visible:ring-[rgb(var(--ds-native-purple-bright))] motion-reduce:active:scale-100"
				>
					Učitaj još
				</button>
			)}
		</div>
	);
}

function RecentActivity(props: {
	history: PlayerEloPoint[];
	currentUserId: string | null;
	playerId: string;
	loadHeadToHead: () => Promise<HeadToHeadData>;
}) {
	const [view, setView] = useState<HistoryView>("all");
	const [comparison, setComparison] = useState<HeadToHeadData | null>(null);
	const [comparisonLoading, setComparisonLoading] = useState(false);
	const [comparisonError, setComparisonError] = useState<string | null>(null);
	const canCompare = Boolean(props.currentUserId && props.currentUserId !== props.playerId);
	const tabs: readonly UnderlineTabOption<HistoryView>[] = canCompare
		? [
				{ value: "all", label: "Svi mečevi" },
				{ value: "against-me", label: "Protiv mene" },
				{ value: "sessions", label: "Termini" },
			]
		: [
				{ value: "all", label: "Svi mečevi" },
				{ value: "sessions", label: "Termini" },
			];

	const selectView = async (next: HistoryView) => {
		setView(next);
		if (next !== "against-me" || comparison || comparisonLoading) return;
		setComparisonLoading(true);
		setComparisonError(null);
		try {
			setComparison(await props.loadHeadToHead());
		} catch {
			setComparisonError("Nije moguće učitati međusobni skor.");
		} finally {
			setComparisonLoading(false);
		}
	};

	return (
		<section className="space-y-3.5" aria-label="Istorija igrača">
			<UnderlineTabs
				options={tabs}
				value={view}
				onValueChange={(next) => void selectView(next)}
				ariaLabel="Vrsta istorije"
				panelId="player-history-panel"
			/>
			<div
				id="player-history-panel"
				role="tabpanel"
				aria-labelledby={`player-history-panel-tab-${view}`}
			>
				{view === "sessions" ? (
					<SessionHistory history={props.history} />
				) : (
					<MatchHistory
						key={view}
						history={props.history}
						currentUserId={props.currentUserId}
						scope={view}
						comparison={comparison}
						comparisonLoading={comparisonLoading}
						comparisonError={comparisonError}
					/>
				)}
			</div>
		</section>
	);
}

export function PlayerProfileNative(props: PlayerProfileNativeProps) {
	const [skipEntrance, setSkipEntrance] = useState(false);

	useEffect(() => {
		// Decide once per player, not whenever chart or tab focus changes.
		setSkipEntrance(Boolean(document.querySelector(":focus-visible")));
	}, [props.player.id]);

	return (
		<main className="player-profile-native mx-auto w-full max-w-[848px] px-5 pb-11" data-skip-entrance={skipEntrance}>
			<div className="flex flex-col gap-[30px]">
				<ProfileHeader
					key={`header-${props.player.id}`}
					player={props.player}
					stats={props.stats}
					currentElo={props.currentElo}
				/>
				<RecordStrip key={`record-${props.player.id}`} stats={props.stats} />
				<div key={`chart-${props.player.id}`} className="profile-enter profile-enter-chart">
					<EloHistoryChart history={props.history} />
				</div>
				<div key={`matches-${props.player.id}`} className="profile-enter profile-enter-matches">
					<RecentActivity
						history={props.history}
						currentUserId={props.currentUserId}
						playerId={props.player.id}
						loadHeadToHead={props.loadHeadToHead}
					/>
				</div>
			</div>
		</main>
	);
}
