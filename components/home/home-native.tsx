"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { useWebHaptics } from "web-haptics/react";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/components/ui/avatar";
import {
	SessionCard,
	type SessionCardSession,
} from "@/components/sessions/session-card";
import { PageLoading } from "@/components/ui/loading";
import { PageContainer } from "@/components/ui/page-container";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { useHomeEntrance } from "@/components/home/use-home-entrance";
import { useAuth } from "@/lib/auth/useAuth";
import { renderMissionCopy } from "@/lib/rivalries/copy";
import { getSerbianNameCase } from "@/lib/serbian-name-cases";
import type { GeneratedMission, MissionSnapshot } from "@/lib/rivalries/types";
import { supabase } from "@/lib/supabase/client";
import { readStaleCache, writeStaleCache } from "@/lib/client/stale-cache";
import { cn } from "@/lib/utils";

type HomePlayer = {
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

type EloHistoryPoint = {
	match: number;
	elo: number;
	date: string;
	sessionId: string | null;
	delta: number;
};

type TrendPoint = {
	elo: number;
	delta: number | null;
};

type HomeTrend = {
	points: TrendPoint[];
	matchCount: number;
	sessionCount: number | null;
	delta: number | null;
	rangeLabel: string;
};

type HomeData = {
	players: HomePlayer[];
	history: EloHistoryPoint[];
	missions: MissionSnapshot | null;
	recentSessions: SessionCardSession[];
};

const EMPTY_HOME_DATA: HomeData = {
	players: [],
	history: [],
	missions: null,
	recentSessions: [],
};

const HOME_REFRESH_INTERVAL_MS = 15_000;
const HOME_CACHE_VERSION = 1;
const HOME_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function getHomeCacheKey(userId: string) {
	return `home-native:${userId}`;
}

function readCachedHome(userId: string | undefined) {
	if (!userId) return null;
	return readStaleCache<HomeData>(getHomeCacheKey(userId), {
		maxAgeMs: HOME_CACHE_MAX_AGE_MS,
		version: HOME_CACHE_VERSION,
	});
}

function initials(name: string) {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part.charAt(0))
		.join("")
		.toLocaleUpperCase("sr-Latn-RS");
}

function missionTypeLabel(type: GeneratedMission["type"]) {
	switch (type) {
		case "climb_rank":
			return "Napredovanje";
		case "defend_rank":
			return "Odbrana pozicije";
		case "settle_score":
			return "Međusobni duel";
		case "break_streak":
			return "Prekid niza";
		case "close_gap":
			return "Elo izazov";
	}
}

function matchNoun(count: number) {
	const finalTwoDigits = count % 100;
	if (finalTwoDigits >= 11 && finalTwoDigits <= 14) return "MEČEVA";
	const finalDigit = count % 10;
	if (finalDigit === 1) return "MEČ";
	if (finalDigit >= 2 && finalDigit <= 4) return "MEČA";
	return "MEČEVA";
}

function makeTrend(player: HomePlayer, history: EloHistoryPoint[]): HomeTrend {
	const availablePoints = history.filter((point) => point.match > 0);
	const selectedSessionKeys = new Set<string>();
	const reversedPoints: EloHistoryPoint[] = [];

	for (let index = availablePoints.length - 1; index >= 0; index -= 1) {
		const point = availablePoints[index];
		const sessionKey = point.sessionId ?? point.date;
		if (
			!selectedSessionKeys.has(sessionKey) &&
			selectedSessionKeys.size >= 8
		) {
			break;
		}
		selectedSessionKeys.add(sessionKey);
		reversedPoints.push(point);
	}

	const selectedPoints = reversedPoints.reverse();
	if (selectedPoints.length > 0) {
		const first = selectedPoints[0];
		const points: TrendPoint[] = [
			{ elo: first.elo - (first.delta ?? 0), delta: null },
			...selectedPoints.map((point) => ({
				elo: point.elo,
				delta: point.delta,
			})),
		];
		const sessionCount = selectedSessionKeys.size;
		const sessionLabel =
			sessionCount === 1
				? "POSLEDNJI TERMIN"
				: sessionCount >= 2 && sessionCount <= 4
					? `POSLEDNJA ${sessionCount} TERMINA`
					: `POSLEDNJIH ${sessionCount} TERMINA`;
		const delta = Math.round(points.at(-1)!.elo - points[0].elo);

		return {
			points,
			matchCount: selectedPoints.length,
			sessionCount,
			delta,
			rangeLabel: `${sessionLabel} · ${selectedPoints.length} ${matchNoun(selectedPoints.length)}`,
		};
	}

	const recentDeltas = player.recent_form ?? [];
	if (recentDeltas.length === 0) {
		return {
			points: [{ elo: player.elo, delta: null }],
			matchCount: 0,
			sessionCount: null,
			delta: null,
			rangeLabel: "JOŠ NEMA ELO ISTORIJE",
		};
	}

	let earlierElo = player.elo;
	const points: TrendPoint[] = [{ elo: player.elo, delta: recentDeltas.at(-1)! }];
	for (let index = recentDeltas.length - 1; index >= 0; index -= 1) {
		earlierElo -= recentDeltas[index];
		points.unshift({ elo: earlierElo, delta: null });
	}
	recentDeltas.forEach((delta, index) => {
		points[index + 1] = { ...points[index + 1], delta };
	});

	return {
		points,
		matchCount: recentDeltas.length,
		sessionCount: null,
		delta: Math.round(points.at(-1)!.elo - points[0].elo),
		rangeLabel:
			recentDeltas.length === 1
				? "POSLEDNJA ELO PROMENA"
				: `POSLEDNJIH ${recentDeltas.length} ELO PROMENA`,
	};
}

async function fetchRecentSessions(): Promise<SessionCardSession[]> {
	const { data: sessionRows, error: sessionsError } = await supabase
		.from("sessions")
		.select(
			"id, player_count, created_at, status, best_player_id, best_player_display_name, best_player_delta, worst_player_id, worst_player_display_name, worst_player_delta",
		)
		.eq("status", "completed")
		.order("created_at", { ascending: false })
		.limit(3);

	if (sessionsError) throw sessionsError;
	if (!sessionRows?.length) return [];

	const sessionIds = sessionRows.map((row) => row.id);
	const performerIds = Array.from(
		new Set(
			sessionRows
				.flatMap((row) => [row.best_player_id, row.worst_player_id])
				.filter((id): id is string => Boolean(id)),
		),
	);
	const [matchesResult, profilesResult] = await Promise.all([
		supabase
			.from("session_matches")
			.select("session_id, match_type")
			.in("session_id", sessionIds),
		performerIds.length > 0
			? supabase
					.from("profiles")
					.select("id, display_name, avatar_url")
					.in("id", performerIds)
			: Promise.resolve({ data: [], error: null }),
	]);

	const counts = new Map<string, { singles: number; doubles: number }>();
	for (const sessionId of sessionIds) {
		counts.set(sessionId, { singles: 0, doubles: 0 });
	}
	for (const match of matchesResult.data ?? []) {
		const count = counts.get(match.session_id);
		if (!count) continue;
		if (match.match_type === "singles") count.singles += 1;
		if (match.match_type === "doubles") count.doubles += 1;
	}

	const profiles = new Map<
		string,
		{ name: string; avatar: string | null }
	>();
	for (const profile of profilesResult.data ?? []) {
		profiles.set(profile.id, {
			name: profile.display_name || "User",
			avatar: profile.avatar_url || null,
		});
	}

	return sessionRows.map((row) => {
		const count = counts.get(row.id) ?? { singles: 0, doubles: 0 };
		const bestProfile = row.best_player_id
			? profiles.get(row.best_player_id)
			: null;
		const worstProfile = row.worst_player_id
			? profiles.get(row.worst_player_id)
			: null;

		return {
			id: row.id,
			player_count: row.player_count,
			created_at: row.created_at,
			status: "completed" as const,
			singles_match_count: count.singles,
			doubles_match_count: count.doubles,
			best_player:
				row.best_player_display_name || row.best_player_id
					? {
							id: row.best_player_id,
							name:
								bestProfile?.name ?? row.best_player_display_name ?? null,
							avatar: bestProfile?.avatar ?? null,
							delta: row.best_player_delta ?? null,
						}
					: null,
			worst_player:
				row.worst_player_display_name || row.worst_player_id
					? {
							id: row.worst_player_id,
							name:
								worstProfile?.name ?? row.worst_player_display_name ?? null,
							avatar: worstProfile?.avatar ?? null,
							delta: row.worst_player_delta ?? null,
						}
					: null,
		};
	});
}

function SectionHeading({ children, id, className }: { children: string; id?: string; className?: string }) {
	return (
		<h2
			id={id}
			className={cn("font-session-label text-ios-label-12 font-semibold uppercase leading-[15px] tracking-[1.8px] text-ds-section-accent", className)}
		>
			{children}
		</h2>
	);
}

type MascotOutcome = "win" | "draw" | "loss";

const mascotMediaClassName =
	"home-media-enter home-enter-mascot pointer-events-none absolute right-0 top-0 size-[124px] max-w-none object-contain mix-blend-screen max-[359px]:size-[88px]";

function OutcomeMascotMedia({
	outcome,
	reduceMotion,
}: {
	outcome: MascotOutcome;
	reduceMotion: boolean;
}) {
	const [videoPlaying, setVideoPlaying] = useState(false);
	const poster = `/session-detail/match-result-${outcome}.png`;

	return (
		<>
			<Image
				src={poster}
				alt=""
				width={124}
				height={124}
				sizes="124px"
				priority
				className={cn(
					mascotMediaClassName,
					!reduceMotion && videoPlaying && "invisible",
				)}
				aria-hidden="true"
			/>
			{!reduceMotion ? (
				<video
					className={cn(
						mascotMediaClassName,
						!videoPlaying && "invisible",
					)}
					autoPlay
					loop
					muted
					playsInline
					preload="auto"
					poster={poster}
					onPlaying={() => setVideoPlaying(true)}
					onError={() => setVideoPlaying(false)}
					aria-hidden="true"
				>
					<source src={`/home/match-result-${outcome}.mp4`} type="video/mp4" />
				</video>
			) : null}
		</>
	);
}

function OutcomeMascot({
	delta,
	formScore,
}: {
	delta: number | null;
	formScore: number | null;
}) {
	const shouldReduceMotion = useReducedMotion();
	const resolvedFormScore = formScore ?? (delta === null ? 0 : Math.min(1, Math.max(-1, delta / 5)));
	const outcome: MascotOutcome =
		resolvedFormScore >= 0.3
			? "win"
			: resolvedFormScore <= -0.3
				? "loss"
				: "draw";
	const roundedDelta = delta === null ? null : Math.round(delta);
	const outcomeLabel = outcome === "win" ? "Pobeda" : outcome === "loss" ? "Poraz" : "Nerešeno";

	return (
		<div
			className="relative -mt-1.5 size-[88px] shrink-0 max-[359px]:size-16"
			role="img"
			aria-label={
				roundedDelta === null
					? "Nema učinka sa poslednjeg termina"
					: `${outcomeLabel}, ${roundedDelta > 0 ? "+" : ""}${roundedDelta} Elo na poslednjem terminu`
			}
		>
			<OutcomeMascotMedia
				key={outcome}
				outcome={outcome}
				reduceMotion={Boolean(shouldReduceMotion)}
			/>

			{roundedDelta !== null ? (
				<span
					className={cn(
						"home-enter home-enter-mascot absolute -bottom-0.5 right-0 rounded-full px-[5px] py-[3px] text-ios-caption2 font-black leading-none tabular-nums text-[rgb(var(--ds-native-background))]",
						outcome === "win"
							? "bg-ds-control-selected"
							: outcome === "loss"
								? "bg-ds-button-destructive"
								: "bg-[rgb(var(--ds-native-amber))]",
					)}
				>
					{roundedDelta > 0 ? "+" : ""}{roundedDelta}
				</span>
			) : null}
		</div>
	);
}

function HomeHeader({ player, loading }: { player: HomePlayer | null; loading: boolean }) {
	const { user } = useAuth();
	const firstName = (player?.display_name ?? user?.name ?? "Igrač")
		.trim()
		.split(/\s+/)[0] || "Igrač";
	const greetingName = getSerbianNameCase(
		firstName,
		{ vocative: user?.nameVocative },
		"vocative",
	);
	const lastDelta = player?.recent_form?.at(-1) ?? null;
	const recentScores = player?.recent_form_scores;
	const lastScore =
		recentScores && recentScores.length === player?.recent_form?.length
			? recentScores.at(-1) ?? null
			: null;

	return (
		<header className="flex min-h-[106px] items-start justify-between gap-2 pt-[18px] max-[359px]:min-h-[92px] max-[359px]:gap-1">
			<div className="home-enter home-enter-greeting relative z-10 min-w-0 space-y-1.5">
				<p className="font-session-label text-ios-label-12 font-semibold uppercase leading-[15px] tracking-[2.2px] text-ds-control-selected">
					Gweilo Novi Sad
				</p>
				<h1 className="truncate font-session-heading text-ios-display-40 font-bold uppercase leading-[48px] tracking-[0.2px] text-ds-button-foreground max-[359px]:text-[32px] max-[359px]:leading-[38px]">
					Poy {greetingName}
				</h1>
			</div>
			{player || !loading ? (
				<OutcomeMascot delta={lastDelta} formScore={lastScore} />
			) : (
				<div className="size-[88px] max-[359px]:size-16" />
			)}
		</header>
	);
}

function PodiumPlayer({ player, rank, animateNumbers }: { player: HomePlayer; rank: number; animateNumbers: boolean }) {
	const shouldReduceMotion = useReducedMotion();
	const { trigger } = useWebHaptics();
	const avatarSize = rank === 1 ? 58 : 48;
	const podiumHeight = rank === 1 ? 88 : rank === 2 ? 64 : 48;
	const accent = rank === 1 ? "#e0a838" : rank === 2 ? "#adb8c7" : "#b86133";

	return (
		<Link
			href={`/player/${player.player_id}`}
			onClick={() => void trigger()}
			className="home-pressable flex min-w-0 flex-1 flex-col items-center gap-[5px] rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-section-accent"
			aria-label={`Mesto ${rank}, ${player.display_name}, ${Math.round(player.elo)} Elo. Otvara profil igrača.`}
		>
			<div
				className="relative flex items-center justify-center"
				style={{ width: avatarSize, height: avatarSize }}
			>
				<Avatar
					className={cn(
						"home-enter home-enter-podium bg-ds-surface-raised",
						rank !== 1 && "ring-1 ring-white/30",
					)}
					style={{ width: avatarSize, height: avatarSize }}
				>
					<AvatarImage
						src={player.avatar || undefined}
						alt={player.display_name}
						fallbackSeed={player.display_name}
					/>
					<AvatarFallback className="bg-ds-surface-raised font-session-display text-ds-button-foreground">
						{initials(player.display_name)}
					</AvatarFallback>
				</Avatar>
				{rank === 1 && !shouldReduceMotion ? (
					<video
						className="home-media-enter home-enter-podium pointer-events-none absolute left-1/2 top-1/2 h-[176px] w-[132px] max-w-none -translate-x-1/2 -translate-y-[72%] object-contain mix-blend-screen"
						autoPlay
						loop
						muted
						playsInline
						preload="auto"
						aria-hidden="true"
					>
						<source src="/home/podium-gold-frame.mp4" type="video/mp4" />
					</video>
				) : null}
			</div>
			<p className="home-enter home-enter-podium w-full truncate text-center text-ios-caption font-bold leading-[14px] text-ds-button-foreground">
				{player.display_name}
			</p>
			<div
				className="home-enter home-enter-podium relative w-full bg-gradient-to-b from-[rgb(var(--ds-native-raised)/0.88)] to-[rgb(var(--ds-native-background)/0.96)]"
				style={{ height: podiumHeight }}
				data-number-entrance
			>
				<span className="absolute inset-x-0 top-0 h-0.5" style={{ backgroundColor: accent }} />
				<span className="absolute inset-x-0 top-[11px] text-center text-ios-caption font-black leading-[14px] tabular-nums text-ds-button-foreground">
					<AnimatedNumber value={player.elo} animate={animateNumbers} />
				</span>
			</div>
		</Link>
	);
}

function TopThree({ players, animateNumbers }: { players: HomePlayer[]; animateNumbers: boolean }) {
	const placements = players.slice(0, 3).map((player, index) => ({
		player,
		rank: index + 1,
	}));
	const ordered = placements.length === 3 ? [placements[1], placements[0], placements[2]] : placements;

	return (
		<section className="space-y-3" aria-labelledby="home-top-three-title">
			<SectionHeading id="home-top-three-title" className="home-enter home-enter-podium">Vrh tabele</SectionHeading>
			{players.length === 0 ? (
				<p className="text-ios-subheadline text-ds-button-muted">
					Još nema kvalifikovanih igrača u singl statistici.
				</p>
			) : (
				<div className="flex items-end gap-2 pt-[34px]">
					{ordered.map(({ player, rank }) => (
						<PodiumPlayer key={player.player_id} player={player} rank={rank} animateNumbers={animateNumbers} />
					))}
				</div>
			)}
		</section>
	);
}

function plotCoordinates(points: TrendPoint[]) {
	if (points.length <= 1) return [];
	const width = 200;
	const height = 54;
	const insetX = 3.5;
	const insetY = 4;
	const values = points.map((point) => point.elo);
	const minimum = Math.min(...values);
	const maximum = Math.max(...values);
	const valueRange = Math.max(maximum - minimum, 1);
	const horizontalStep = (width - insetX * 2) / (values.length - 1);

	return values.map((value, index) => ({
		x: insetX + index * horizontalStep,
		y: height - insetY - ((value - minimum) / valueRange) * (height - insetY * 2),
	}));
}

function segmentPath(
	coordinates: Array<{ x: number; y: number }>,
	index: number,
) {
	const previous = coordinates[index - 1] ?? coordinates[index];
	const current = coordinates[index];
	const next = coordinates[index + 1];
	const following = coordinates[index + 2] ?? next;
	const clampX = (value: number) => Math.min(198, Math.max(2, value));
	const clampY = (value: number) => Math.min(51, Math.max(3, value));
	const control1 = {
		x: clampX(current.x + (next.x - previous.x) / 6),
		y: clampY(current.y + (next.y - previous.y) / 6),
	};
	const control2 = {
		x: clampX(next.x - (following.x - current.x) / 6),
		y: clampY(next.y - (following.y - current.y) / 6),
	};
	return `M ${current.x} ${current.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${next.x} ${next.y}`;
}

function bandColor(delta: number | null) {
	if (delta !== null && delta > 5) return "rgb(var(--ds-native-lime))";
	if (delta !== null && delta < -5) return "rgb(var(--ds-native-coral))";
	return "rgb(var(--ds-native-amber))";
}

function HomeSparkline({ points }: { points: TrendPoint[] }) {
	const coordinates = plotCoordinates(points);
	if (coordinates.length <= 1) return <div className="h-[54px] flex-1" aria-hidden="true" />;

	return (
		<svg
			viewBox="0 0 200 54"
			preserveAspectRatio="none"
			className="h-[54px] min-w-0 flex-1 overflow-visible pb-0.5"
			aria-hidden="true"
		>
			<path d="M 0 27 H 200" stroke="rgb(245 242 232 / 0.08)" strokeWidth="1" strokeDasharray="3 4" />
			{coordinates.slice(0, -1).map((_, index) => (
				<path
					key={index}
					d={segmentPath(coordinates, index)}
					fill="none"
					stroke={bandColor(points[index + 1]?.delta ?? null)}
					strokeWidth="3"
					strokeLinecap="round"
					strokeLinejoin="round"
					vectorEffect="non-scaling-stroke"
				/>
			))}
		</svg>
	);
}

function MyStanding({
	player,
	rank,
	history,
	animateNumbers,
}: {
	player: HomePlayer;
	rank: number;
	history: EloHistoryPoint[];
	animateNumbers: boolean;
}) {
	const { trigger } = useWebHaptics();
	const trend = useMemo(() => makeTrend(player, history), [history, player]);
	const trendText = trend.delta === null ? "—" : `${trend.delta > 0 ? "+" : ""}${trend.delta}`;
	const trendColor = bandColor(trend.delta);

	return (
		<section className="home-enter home-enter-standing space-y-3" aria-labelledby="home-my-standing-title" data-number-entrance>
			<SectionHeading id="home-my-standing-title">Moja pozicija</SectionHeading>
			<Link
				href={`/player/${player.player_id}`}
				onClick={() => void trigger()}
				className="home-standing home-pressable block py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-section-accent"
				aria-label={`Moja pozicija, mesto ${rank}, ${Math.round(player.elo)} Elo, trend ${trendText}, ${trend.rangeLabel.toLocaleLowerCase("sr-Latn-RS")}. Otvara tvoj profil igrača.`}
			>
				<div className="flex items-baseline gap-2">
					<span className="font-session-heading text-ios-display-20 font-bold leading-[25px] tabular-nums text-ds-control-selected">
						#{rank}
					</span>
					<span className="font-session-label text-ios-label-10 font-semibold leading-3 tracking-[1px] text-ds-button-muted">
						MESTO
					</span>
					<span className="ml-auto text-ios-caption font-black leading-[14px] tabular-nums" style={{ color: trendColor }}>
						{trendText}
					</span>
					<span className="text-ios-caption2 font-bold text-ds-button-muted" aria-hidden="true">›</span>
				</div>

				<div className="mt-3.5 flex items-end gap-[18px]">
					<div className="shrink-0">
						<p className="font-session-display text-ios-display-40 font-black leading-[43px] tabular-nums text-ds-button-foreground">
							<AnimatedNumber value={player.elo} animate={animateNumbers} />
						</p>
						<p className="font-session-label text-ios-label-10 font-semibold leading-3 tracking-[1.2px] text-ds-section-accent">
							ELO
						</p>
					</div>
					<HomeSparkline points={trend.points} />
				</div>

				<p className="mt-3.5 font-session-label text-ios-label-9 font-semibold leading-[11px] tracking-[1px] text-ds-button-muted">
					{trend.rangeLabel}
				</p>
			</Link>
		</section>
	);
}

function MissionCard({ mission, index, single }: { mission: GeneratedMission; index: number; single: boolean }) {
	const copy = renderMissionCopy(mission);
	const tone = single ? "accent" : ["accent", "cyan", "amber", "coral"][index % 4];

	return (
		<article
			className="home-mission-card min-h-32 shrink-0 snap-start p-[14px]"
			data-tone={tone}
			aria-label={`${missionTypeLabel(mission.type)}. ${copy.title}`}
		>
			<div className="space-y-2">
				<p className="font-session-label text-ios-label-9 font-semibold uppercase leading-[11px] tracking-[1.2px] text-ds-button-foreground/60">
					{missionTypeLabel(mission.type)}
				</p>
				<h3 className="font-session-heading text-ios-display-20 font-bold leading-[25px] text-ds-button-foreground">
					{copy.title}
				</h3>
				<p className="line-clamp-2 text-ios-caption leading-[15px] text-ds-button-foreground/60">
					{copy.body}
				</p>
			</div>
		</article>
	);
}

function CardCarousel({ children, labelledBy }: { children: React.ReactNode; labelledBy: string }) {
	return (
		<div
			className="home-carousel -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 scrollbar-hide"
			aria-labelledby={labelledBy}
		>
			{children}
		</div>
	);
}

export function HomeNative() {
	const { session, user } = useAuth();
	const cachedHome = readCachedHome(user?.id);
	const [data, setData] = useState<HomeData>(() => cachedHome ?? EMPTY_HOME_DATA);
	const dataRef = useRef(data);
	const [loading, setLoading] = useState(() => !cachedHome);
	const [error, setError] = useState<string | null>(null);
	const requestSequence = useRef(0);

	const loadHome = useCallback(
		async ({ showLoading = false }: { showLoading?: boolean } = {}) => {
			if (!session?.access_token || !user?.id) return;
			const requestId = ++requestSequence.current;
			if (showLoading) setLoading(true);

			const headers = {
				Authorization: `Bearer ${session.access_token}`,
				"Cache-Control": "no-cache",
			};
			const [statisticsResult, historyResult, missionsResult, sessionsResult] =
				await Promise.allSettled([
					fetch(`/api/statistics?view=singles&ts=${Date.now()}`, {
						headers,
						cache: "no-store",
					}).then(async (response) => {
						if (!response.ok) throw new Error("Failed to fetch rankings");
						const body = await response.json();
						return (body.singles ?? []) as HomePlayer[];
					}),
					fetch(`/api/player/elo-history?ts=${Date.now()}`, {
						headers,
						cache: "no-store",
					}).then(async (response) => {
						if (!response.ok) throw new Error("Failed to fetch Elo history");
						const body = await response.json();
						return (body.data ?? []) as EloHistoryPoint[];
					}),
					fetch(`/api/missions?ts=${Date.now()}`, {
						headers,
						cache: "no-store",
					}).then(async (response) => {
						if (!response.ok) throw new Error("Failed to fetch missions");
						const body = await response.json();
						return (body.snapshot ?? null) as MissionSnapshot | null;
					}),
					fetchRecentSessions(),
				]);

			if (requestId !== requestSequence.current) return;
			const coreFailed = statisticsResult.status === "rejected";
			const previous = dataRef.current;
			const nextData = {
				players:
					statisticsResult.status === "fulfilled"
						? statisticsResult.value
						: previous.players,
				history:
					historyResult.status === "fulfilled"
						? historyResult.value
						: previous.history,
				missions:
					missionsResult.status === "fulfilled"
						? missionsResult.value
						: previous.missions,
				recentSessions:
					sessionsResult.status === "fulfilled"
						? sessionsResult.value
						: previous.recentSessions,
			};
			dataRef.current = nextData;
			setData(nextData);
			writeStaleCache<HomeData>(getHomeCacheKey(user.id), nextData, {
				version: HOME_CACHE_VERSION,
			});
			setError(coreFailed ? "Podaci trenutno nisu dostupni." : null);
			setLoading(false);
		},
		[session?.access_token, user?.id],
	);

	useEffect(() => {
		// Cached rankings are already useful UI. Keep them visible while fresh
		// values replace them in the background instead of hiding the header badge.
		void loadHome({ showLoading: dataRef.current.players.length === 0 });
		const refreshIfVisible = () => {
			if (document.visibilityState === "visible") void loadHome();
		};
		window.addEventListener("focus", refreshIfVisible);
		window.addEventListener("pageshow", refreshIfVisible);
		document.addEventListener("visibilitychange", refreshIfVisible);
		const intervalId = window.setInterval(refreshIfVisible, HOME_REFRESH_INTERVAL_MS);

		return () => {
			requestSequence.current += 1;
			window.clearInterval(intervalId);
			window.removeEventListener("focus", refreshIfVisible);
			window.removeEventListener("pageshow", refreshIfVisible);
			document.removeEventListener("visibilitychange", refreshIfVisible);
		};
	}, [loadHome]);

	const currentPlayerIndex = data.players.findIndex(
		(player) => player.player_id === user?.id,
	);
	const currentPlayer = currentPlayerIndex >= 0 ? data.players[currentPlayerIndex] : null;

	return (
		<HomeContent
			data={data}
			currentPlayer={currentPlayer}
			currentPlayerIndex={currentPlayerIndex}
			loading={loading}
			error={error}
			onRetry={() => void loadHome({ showLoading: true })}
		/>
	);
}

/** Presentational homepage: the entrance never owns requests or refresh behavior. */
export function HomeContent({
	data, currentPlayer, currentPlayerIndex, loading, error, onRetry,
}: {
	data: HomeData;
	currentPlayer: HomePlayer | null;
	currentPlayerIndex: number;
	loading: boolean;
	error: string | null;
	onRetry: () => void;
}) {
	const skipEntrance = useHomeEntrance(!loading);

	return (
		<PageContainer className="home-native pb-10" data-skip-entrance={skipEntrance}>
				<HomeHeader player={currentPlayer} loading={loading} />

				{loading && data.players.length === 0 ? (
					<PageLoading
						label="Učitavam tvoj klub…"
						className="bg-[rgb(3_3_4)]"
					/>
				) : (
					<div className="flex flex-col gap-[26px]">
						<div className="flex flex-col gap-[-10px]">
							<TopThree players={data.players.slice(0, 3)} animateNumbers={!skipEntrance} />
							{currentPlayer ? (
								<div className="relative -mt-2.5 z-10">
									<MyStanding
										player={currentPlayer}
										rank={currentPlayerIndex + 1}
										history={data.history}
										animateNumbers={!skipEntrance}
									/>
								</div>
							) : null}
						</div>

						{data.missions?.missions.length ? (
							<section className="home-enter home-enter-missions space-y-3" aria-labelledby="home-missions-title">
								<SectionHeading id="home-missions-title">Moje misije</SectionHeading>
								<CardCarousel labelledBy="home-missions-title">
									{data.missions.missions.map((mission, index) => (
										<MissionCard
											key={mission.id}
											mission={mission}
											index={index}
											single={data.missions!.missions.length === 1}
										/>
									))}
								</CardCarousel>
							</section>
						) : null}

						{data.recentSessions.length ? (
							<section className="home-enter home-enter-sessions space-y-3" aria-labelledby="home-recent-sessions-title">
								<SectionHeading id="home-recent-sessions-title">Poslednji termini</SectionHeading>
								<CardCarousel labelledBy="home-recent-sessions-title">
									{data.recentSessions.map((recentSession) => (
										<SessionCard
											key={recentSession.id}
											session={recentSession}
											presentation="compact"
											className="home-carousel-card !w-[min(72vw,272px)] shrink-0 snap-start"
										/>
									))}
								</CardCarousel>
							</section>
						) : null}

						{error ? (
							<div className="flex items-start gap-3 border-t border-white/[0.13] py-3 text-ios-footnote text-ds-button-muted">
								<span className="flex-1">{error}</span>
								<button
									type="button"
									onClick={onRetry}
									className="home-pressable font-bold text-ds-section-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-section-accent"
								>
									Pokušaj ponovo
								</button>
							</div>
						) : null}
					</div>
				)}
		</PageContainer>
	);
}
