"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { useWebHaptics } from "web-haptics/react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/app-shell";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/components/ui/avatar";
import { StateBlock } from "@/components/ui/state-block";
import { Loading } from "@/components/ui/loading";
import { ScrollFadeHero } from "@/components/ui/scroll-fade-hero";
import { PageContainer } from "@/components/ui/page-container";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { RankingEntranceItem, RANKING_ENTRANCE_ROW_LIMIT, useRankingEntrance } from "@/components/statistics/ranking-entrance";
import { useAuth } from "@/lib/auth/useAuth";
import { t } from "@/lib/i18n";
import { readStaleCache, writeStaleCache } from "@/lib/client/stale-cache";
import { cn } from "@/lib/utils";
import {
	classifyOpportunityAdjustedForm,
	fallbackOpportunityAdjustedForm,
} from "@/lib/elo/form";

const tableContentTransition = {
	duration: 0.28,
	ease: [0.16, 1, 0.3, 1] as const,
};

type PlayerStats = {
	player_id: string;
	display_name: string;
	avatar: string | null;
	matches_played: number;
	wins: number;
	losses: number;
	draws: number;
	sets_won: number;
	sets_lost: number;
	elo: number;
	rank_movement?: number;
	rank_duration_days?: number | null;
	rank_duration_capped?: boolean;
	recent_form: number[];
	recent_form_scores?: number[];
};

type TeamStats = {
	team_id: string;
	player1: {
		id: string;
		display_name: string;
		avatar: string | null;
	};
	player2: {
		id: string;
		display_name: string;
		avatar: string | null;
	};
	matches_played: number;
	wins: number;
	losses: number;
	draws: number;
	sets_won: number;
	sets_lost: number;
	elo: number;
	rank_movement?: number;
	rank_duration_days?: number | null;
	rank_duration_capped?: boolean;
	recent_form: number[];
	recent_form_scores?: number[];
};

type StatisticsData = {
	singles: PlayerStats[];
	doublesPlayers: PlayerStats[];
	doublesTeams: TeamStats[];
};

type StatisticsRankingView = "singles" | "doubles_player" | "doubles_team";

type StatisticsLoaded = {
	singles: boolean;
	doublesPlayers: boolean;
	doublesTeams: boolean;
};

type StatisticsCache = {
	statistics: StatisticsData;
	loaded: StatisticsLoaded;
};

const EMPTY_STATISTICS: StatisticsData = {
	singles: [],
	doublesPlayers: [],
	doublesTeams: [],
};

const EMPTY_LOADED: StatisticsLoaded = {
	singles: false,
	doublesPlayers: false,
	doublesTeams: false,
};

const STATISTICS_CACHE_VERSION = 7;
const STATISTICS_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const STATISTICS_REFRESH_INTERVAL_MS = 15_000;
const STATISTICS_VIEWS: StatisticsRankingView[] = [
	"singles",
	"doubles_player",
	"doubles_team",
];

function RecentFormDots({
	values,
	formScores,
}: {
	values: number[];
	formScores?: number[];
}) {
	const recentValues = values.slice(-5);
	const recentScores = formScores?.length === values.length
		? (formScores?.slice(-5) ?? [])
		: recentValues.map(fallbackOpportunityAdjustedForm);
	const paddedValues: Array<number | null> = [
		...Array(Math.max(0, 5 - recentValues.length)).fill(null),
		...recentValues,
	];
	const paddedScores: Array<number | null> = [
		...Array(Math.max(0, 5 - recentScores.length)).fill(null),
		...recentScores,
	];

	const toneFor = (value: number | null) => {
		if (value === null) {
			return {
				color: "rgb(148 145 161 / 0.18)",
				label: "Nema podatka",
			};
		}
		const band = classifyOpportunityAdjustedForm(value);
		if (band === "good") {
			return { color: "rgb(194 255 31)", label: "Dobra forma" };
		}
		if (band === "bad") {
			return { color: "rgb(255 69 92)", label: "Loša forma" };
		}
		return { color: "rgb(255 179 26)", label: "Neutralna forma" };
	};

	const tones = paddedScores.map(toneFor);
	const gradientStops = [`${tones[0].color} 0%`];

	for (let index = 0; index < tones.length - 1; index += 1) {
		const boundary = (index + 1) * 20;
		gradientStops.push(
			`${tones[index].color} ${boundary - 10}%`,
			`${tones[index + 1].color} ${boundary + 10}%`
		);
	}
	gradientStops.push(`${tones[tones.length - 1].color} 100%`);

	return (
		<div
			className="mx-auto flex h-2 w-14 overflow-hidden rounded-[3px]"
			style={{
				backgroundImage: `linear-gradient(90deg in oklab, ${gradientStops.join(", ")})`,
			}}
			aria-label={`Forma u poslednjih pet termina: ${paddedValues
				.map((value) => (value === null ? "nema podatka" : value.toFixed(1)))
				.join(", ")}`}
		>
			{paddedValues.map((value, index) => {
				const tone = tones[index];
				const deltaLabel =
					value === null
						? tone.label
						: `${tone.label}: ${value > 0 ? "+" : ""}${value.toFixed(1)} Elo`;

				return (
					<span
						key={index}
						className="h-full min-w-0 flex-1"
						title={deltaLabel}
						aria-hidden="true"
					/>
				);
			})}
		</div>
	);
}

const rankingViews: Array<{
	value: StatisticsRankingView;
	label: string;
}> = [
	{ value: "singles", label: "Singlovi" },
	{ value: "doubles_player", label: "Dublovi" },
	{ value: "doubles_team", label: "Timovi" },
];

const rankingEloFormatter = new Intl.NumberFormat("sr-Latn-RS", {
	maximumFractionDigits: 0,
});

function rankingInitials(name: string) {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part.charAt(0))
		.join("")
		.toLocaleUpperCase("sr-Latn-RS");
}

function NativeRankBadge({ rank }: { rank: number }) {
	const badge =
		rank === 1
			? "/session-detail/rank-gold.png"
			: rank === 2
				? "/session-detail/rank-silver.png"
				: rank === 3
					? "/session-detail/rank-bronze.png"
					: null;

	return (
		<span className="absolute -left-1 -top-1 z-10 flex size-[17px] items-center justify-center">
			{badge ? (
				<Image src={badge} alt="" width={17} height={17} aria-hidden="true" />
			) : (
				<span className="flex min-h-[17px] min-w-[17px] items-center justify-center rounded-full bg-ds-button-surface px-1 font-session-label text-ios-label-10 font-semibold leading-none text-ds-button-foreground ring-[1.5px] ring-[rgb(3_3_4/0.88)]">
					{rank}
				</span>
			)}
		</span>
	);
}

function NativeRankingAvatar({
	name,
	avatar,
	seed,
	rank,
}: {
	name: string;
	avatar: string | null;
	seed: string;
	rank: number;
}) {
	return (
		<span className="relative ml-0.5 shrink-0" aria-hidden="true">
			<Avatar className="size-[38px] border-[0.9px] border-ds-button-accent/65 bg-ds-button-surface">
				<AvatarImage
					src={avatar || undefined}
					alt=""
					fallbackSeed={seed || name}
				/>
				<AvatarFallback className="bg-ds-button-surface font-session-display text-ios-caption font-black text-ds-button-foreground">
					{rankingInitials(name)}
				</AvatarFallback>
			</Avatar>
			<NativeRankBadge rank={rank} />
		</span>
	);
}

function NativeMovementBadge({ movement }: { movement?: number }) {
	if (!movement) return null;

	const positive = movement > 0;
	return (
		<span
			className={cn(
				"inline-flex min-h-[18px] min-w-[27px] shrink-0 items-center justify-center gap-0.5 rounded-full px-[5px] text-ios-caption2 font-bold leading-none tabular-nums",
				positive
					? "bg-ds-control-selected/10 text-ds-control-selected"
					: "bg-ds-button-destructive/10 text-ds-button-destructive",
			)}
			aria-hidden="true"
		>
			<span className="text-[8px] font-black">{positive ? "↑" : "↓"}</span>
			{Math.abs(movement)}
		</span>
	);
}

function NativeRankingsTabs({
	activeView,
	onViewChange,
}: {
	activeView: StatisticsRankingView;
	onViewChange: (view: StatisticsRankingView) => void;
}) {
	const shouldReduceMotion = useReducedMotion();
	const [keyboardNavigation, setKeyboardNavigation] = useState(false);
	const handleTabKeyDown = (
		event: React.KeyboardEvent<HTMLButtonElement>,
		index: number,
	) => {
		if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
			return;
		}

		event.preventDefault();
		setKeyboardNavigation(true);
		const nextIndex =
			event.key === "Home"
				? 0
				: event.key === "End"
					? rankingViews.length - 1
					: (index + (event.key === "ArrowRight" ? 1 : -1) + rankingViews.length) %
						rankingViews.length;
		const nextView = rankingViews[nextIndex].value;
		onViewChange(nextView);
		requestAnimationFrame(() => {
			document.querySelector<HTMLButtonElement>(
				`[data-statistics-tab="${nextView}"]`,
			)?.focus();
		});
	};

	return (
		<div className="relative z-10 pt-[22px]">
			<div
				className="grid grid-cols-3 border-b border-white/[0.13]"
				role="tablist"
				aria-label="Kategorija statistike"
			>
				{rankingViews.map((view, index) => {
					const selected = activeView === view.value;
					return (
						<button
							key={view.value}
							type="button"
							role="tab"
							aria-selected={selected}
							aria-controls="statistics-ranking-panel"
							tabIndex={selected ? 0 : -1}
							data-statistics-tab={view.value}
							onClick={() => onViewChange(view.value)}
							onPointerDown={() => setKeyboardNavigation(false)}
							onKeyDown={(event) => handleTabKeyDown(event, index)}
							className={cn(
								"relative flex min-h-11 items-end justify-center pb-2 font-session-label text-ios-label-12 font-semibold uppercase leading-[15px] tracking-[0.68px] transition-colors duration-150 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-section-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(3_3_4)] active:opacity-80",
								selected ? "text-ds-button-foreground" : "text-ds-button-muted",
							)}
						>
							{view.label}
							{selected && (
								<motion.span
									layoutId="statistics-category-indicator"
									className="absolute inset-x-0 -bottom-px h-0.5 bg-ds-control-selected"
									transition={shouldReduceMotion || keyboardNavigation ? { duration: 0 } : tableContentTransition}
								/>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}

function NativeRankingRow({
	item,
	rank,
	onSelect,
	showsDisclosure,
	animateNumbers,
}: {
	item: PlayerStats | TeamStats;
	rank: number;
	onSelect?: () => void;
	showsDisclosure: boolean;
	animateNumbers: boolean;
}) {
	const isTeam = "team_id" in item;
	const name = isTeam
		? `${item.player1.display_name} + ${item.player2.display_name}`
		: item.display_name;
	const avatar = isTeam ? null : item.avatar;
	const seed = isTeam ? item.team_id : item.player_id;
	const movement = item.rank_movement;
	const movementLabel = movement
		? movement > 0
			? `, napredovao za ${movement} mesta`
			: `, pao za ${Math.abs(movement)} mesta`
		: "";
	const label = `Pozicija ${rank}, ${name}, ${Math.round(item.elo)} Elo, ${item.wins} pobeda, ${item.draws} nerešenih, ${item.losses} poraza${movementLabel}`;

	const content = (
		<>
			<div className="flex min-w-0 items-center gap-[9px]">
				<NativeRankingAvatar
					name={name}
					avatar={avatar}
					seed={seed}
					rank={rank}
				/>
				<div className="min-w-0 space-y-0.5 text-left">
					<div className="flex min-w-0 items-center gap-1.5">
						<span className="truncate text-ios-body font-semibold leading-[19px] text-ds-button-foreground">
							{name}
						</span>
						<NativeMovementBadge movement={movement} />
					</div>
					<div className="flex items-center gap-0.5 text-ios-caption2 leading-3 tabular-nums">
						<span className="text-ds-button-muted">{item.matches_played}</span>
						<span className="text-ds-control-selected">{item.wins}</span>
						<span className="text-ds-button-muted">–</span>
						<span className="text-[rgb(var(--ds-native-amber))]">{item.draws}</span>
						<span className="text-ds-button-muted">–</span>
						<span className="text-ds-button-destructive">{item.losses}</span>
					</div>
				</div>
			</div>

			<RecentFormDots
				values={item.recent_form}
				formScores={item.recent_form_scores}
			/>

			<span className="text-right font-session-display text-ios-display-19 font-black leading-6 text-ds-button-foreground tabular-nums">
				{animateNumbers ? <AnimatedNumber value={item.elo} /> : rankingEloFormatter.format(Math.round(item.elo))}
			</span>

			<span
				className={cn(
					"text-right text-xl font-bold leading-none text-white/25",
					!showsDisclosure && "invisible",
				)}
				aria-hidden="true"
			>
				›
			</span>
		</>
	);

	const rowClassName =
		"grid min-h-[64px] w-full grid-cols-[minmax(0,1fr)_56px_60px_8px] items-center gap-2 border-b border-white/[0.13] py-[13px] text-left last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-section-accent";

	return onSelect ? (
		<button type="button" className={`${rowClassName} active:opacity-80`} onClick={onSelect} aria-label={label}>
			{content}
		</button>
	) : (
		<div className={rowClassName} role="group" aria-label={label}>
			{content}
		</div>
	);
}

function NativeRankingsList({
	items,
	activeView,
	onPlayerSelect,
	onTeamSelect,
	animateEntrance,
}: {
	items: Array<PlayerStats | TeamStats>;
	activeView: StatisticsRankingView;
	onPlayerSelect: (playerId: string) => void;
	onTeamSelect: (teamId: string) => void;
	animateEntrance: boolean;
}) {
	const showsDisclosure = activeView !== "doubles_player";

	return (
		<div>
			<div
				className="grid grid-cols-[minmax(0,1fr)_56px_60px_8px] items-center gap-2 border-b border-white/[0.13] py-[9px] font-session-label text-ios-label-11 font-semibold uppercase leading-[14px] tracking-[0.8px] text-ds-button-muted"
				aria-hidden="true"
			>
				<span>{activeView === "doubles_team" ? "Tim" : "Igrač"}</span>
				<span className="text-center">Forma</span>
				<span className="text-right">Elo</span>
				<span />
			</div>

			<ul aria-label="Elo rang lista">
				{items.map((item, index) => {
					const isTeam = "team_id" in item;
					const key = isTeam ? item.team_id : item.player_id;
					const onSelect = showsDisclosure
						? isTeam
							? () => onTeamSelect(item.team_id)
							: () => onPlayerSelect(item.player_id)
						: undefined;
					return (
						<RankingEntranceItem key={key} index={index} animate={animateEntrance}>
							<NativeRankingRow
								item={item}
								rank={index + 1}
								onSelect={onSelect}
								showsDisclosure={showsDisclosure}
								animateNumbers={animateEntrance && index < RANKING_ENTRANCE_ROW_LIMIT}
							/>
						</RankingEntranceItem>
					);
				})}
			</ul>
		</div>
	);
}

function getStatisticsCacheKey(userId: string) {
	return `statistics-page:${userId}`;
}

function readCachedStatistics(userId: string | undefined) {
	if (!userId) {
		return null;
	}

	return readStaleCache<StatisticsCache>(getStatisticsCacheKey(userId), {
		maxAgeMs: STATISTICS_CACHE_MAX_AGE_MS,
		version: STATISTICS_CACHE_VERSION,
	});
}

function getViewKey(view: StatisticsRankingView): keyof StatisticsLoaded {
	return view === "singles"
		? "singles"
		: view === "doubles_player"
		? "doublesPlayers"
		: "doublesTeams";
}

function StatisticsPageContent() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const { session } = useAuth();
	const accessToken = session?.access_token;
	const userId = session?.user.id;
	const { trigger } = useWebHaptics();

	// Page-level view filter. URL uses hyphens for doubles views.
	const urlView = searchParams.get("view");
	let activeView: StatisticsRankingView = "singles";
	if (urlView === "doubles-player") {
		activeView = "doubles_player";
	} else if (urlView === "doubles-team") {
		activeView = "doubles_team";
	}

	const handleViewChange = (
		view: StatisticsRankingView
	) => {
		if (view === activeView) return;
		finishEntrance();
		void trigger();
		const params = new URLSearchParams(searchParams.toString());
		if (view === "singles") {
			params.delete("view");
		} else if (view === "doubles_player") {
			params.set("view", "doubles-player");
		} else if (view === "doubles_team") {
			params.set("view", "doubles-team");
		}
		router.push(`?${params.toString()}`, { scroll: false });
	};

	const handlePlayerClick = (playerId: string) => {
		void trigger();
		router.push(`/player/${playerId}`);
	};

	const handleTeamClick = (teamId: string) => {
		void trigger();
		router.push(`/team/${teamId}`);
	};

	const cachedStatistics = readCachedStatistics(userId);
	const [statistics, setStatistics] = useState<StatisticsData>(
		() => cachedStatistics?.statistics ?? EMPTY_STATISTICS,
	);
	const activeRankingView = activeView;
	const [loading, setLoading] = useState<StatisticsLoaded>(() => ({
		singles:
			getViewKey(activeRankingView) === "singles" &&
			!cachedStatistics?.loaded.singles,
		doublesPlayers:
			getViewKey(activeRankingView) === "doublesPlayers" &&
			!cachedStatistics?.loaded.doublesPlayers,
		doublesTeams:
			getViewKey(activeRankingView) === "doublesTeams" &&
			!cachedStatistics?.loaded.doublesTeams,
	}));
	const [loaded, setLoaded] = useState<StatisticsLoaded>(
		() => cachedStatistics?.loaded ?? EMPTY_LOADED,
	);
	const [error, setError] = useState<string | null>(null);
	const statisticsRef = useRef(statistics);
	const loadedRef = useRef(loaded);
	const prefetchedViewsRef = useRef(new Set<StatisticsRankingView>());
	const { animateEntrance, finishEntrance } = useRankingEntrance(
		loaded[getViewKey(activeRankingView)] && !error,
		activeRankingView,
	);

	useEffect(() => {
		statisticsRef.current = statistics;
	}, [statistics]);

	useEffect(() => {
		loadedRef.current = loaded;
	}, [loaded]);

	// Fetch statistics for a specific view
	const fetchStatistics = useCallback(async (
		view: StatisticsRankingView,
		options?: { force?: boolean; showLoading?: boolean },
	) => {
		const viewKey = getViewKey(view);
		const currentLoaded = loadedRef.current[viewKey];
		if (currentLoaded && !options?.force) {
			return; // Already loaded, skip
		}

		try {
			const showLoading = options?.showLoading ?? !currentLoaded;
			if (showLoading) {
				setLoading((prev) => ({ ...prev, [viewKey]: true }));
			}
			setError(null);

			if (!accessToken) {
				setError(t.statistics.error.notAuthenticated);
				return;
			}

			// Map view to API parameter
			const apiView =
				view === "singles"
					? "singles"
					: view === "doubles_player"
					? "doubles_player"
					: "doubles_team";

			// Fetch statistics from API route with view parameter
			const response = await fetch(
				`/api/statistics?view=${encodeURIComponent(apiView)}`,
				{
					cache: "no-store",
					headers: {
						Authorization: `Bearer ${accessToken}`,
					},
				}
			);

			if (!response.ok) {
				if (response.status === 401) {
					setError(t.statistics.error.unauthorized);
				} else {
					const errorData = await response.json();
					setError(
						errorData.error || t.statistics.error.fetchFailed
					);
				}
				return;
			}

			const data = await response.json();
			const currentStatistics = statisticsRef.current;
			const nextStatistics = {
				...currentStatistics,
				singles: data.singles || currentStatistics.singles,
				doublesPlayers:
					data.doublesPlayers || currentStatistics.doublesPlayers,
				doublesTeams: data.doublesTeams || currentStatistics.doublesTeams,
			};
			const nextLoaded = {
				...loadedRef.current,
				[viewKey]: true,
			};

			statisticsRef.current = nextStatistics;
			loadedRef.current = nextLoaded;
			setStatistics(nextStatistics);
			setLoaded(nextLoaded);

			if (userId) {
				writeStaleCache<StatisticsCache>(
					getStatisticsCacheKey(userId),
					{ statistics: nextStatistics, loaded: nextLoaded },
					{ version: STATISTICS_CACHE_VERSION },
				);
			}
		} catch (err) {
			console.error("Error fetching statistics:", err);
			if (options?.showLoading !== false) {
				setError(t.statistics.error.fetchFailed);
			}
		} finally {
			setLoading((prev) => ({ ...prev, [viewKey]: false }));
		}
	}, [accessToken, userId]);

	useEffect(() => {
		if (!userId) {
			return;
		}

		const cached = readCachedStatistics(userId);
		if (cached) {
			statisticsRef.current = cached.statistics;
			loadedRef.current = cached.loaded;
			setStatistics(cached.statistics);
			setLoaded(cached.loaded);
			setLoading({
				singles: false,
				doublesPlayers: false,
				doublesTeams: false,
			});
		} else {
			statisticsRef.current = EMPTY_STATISTICS;
			loadedRef.current = EMPTY_LOADED;
			setStatistics(EMPTY_STATISTICS);
			setLoaded(EMPTY_LOADED);
			setLoading({
				singles: false,
				doublesPlayers: false,
				doublesTeams: false,
			});
		}
		prefetchedViewsRef.current = new Set();
	}, [userId]);

	// Load initial statistics for active view
	useEffect(() => {
		const viewKey = getViewKey(activeRankingView);
		const hasCachedData = loadedRef.current[viewKey];
		fetchStatistics(activeRankingView, {
			force: hasCachedData,
			showLoading: !hasCachedData,
		});
	}, [activeView, activeRankingView, fetchStatistics]);

	useEffect(() => {
		const activeViewKey = getViewKey(activeRankingView);
		if (!accessToken || !loaded[activeViewKey]) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			for (const view of STATISTICS_VIEWS) {
				if (
					view === activeRankingView ||
					loadedRef.current[getViewKey(view)] ||
					prefetchedViewsRef.current.has(view)
				) {
					continue;
				}

				prefetchedViewsRef.current.add(view);
				void fetchStatistics(view, { showLoading: false });
			}
		}, 300);

		return () => window.clearTimeout(timeoutId);
	}, [accessToken, activeRankingView, fetchStatistics, loaded]);

	// Statistics can change while this route is retained by client navigation or
	// while another device completes a session. Reconcile the visible category
	// quietly instead of leaving the hydrated local snapshot on screen.
	useEffect(() => {
		if (!accessToken) {
			return;
		}

		const refreshIfVisible = () => {
			if (document.visibilityState === "visible") {
				void fetchStatistics(activeRankingView, {
					force: true,
					showLoading: false,
				});
			}
		};

		window.addEventListener("focus", refreshIfVisible);
		window.addEventListener("pageshow", refreshIfVisible);
		document.addEventListener("visibilitychange", refreshIfVisible);
		const intervalId = window.setInterval(
			refreshIfVisible,
			STATISTICS_REFRESH_INTERVAL_MS,
		);

		return () => {
			window.clearInterval(intervalId);
			window.removeEventListener("focus", refreshIfVisible);
			window.removeEventListener("pageshow", refreshIfVisible);
			document.removeEventListener("visibilitychange", refreshIfVisible);
		};
	}, [accessToken, activeRankingView, fetchStatistics]);

	const isInitialLoading =
		loading[getViewKey(activeRankingView)] &&
		!loaded[getViewKey(activeRankingView)];

	const currentData: Array<PlayerStats | TeamStats> =
		activeRankingView === "singles"
			? statistics.singles
			: activeRankingView === "doubles_player"
				? statistics.doublesPlayers
				: statistics.doublesTeams;

	return (
		<AppShell
			title={t.statistics.title}
			showHeader={false}
			insetClassName="statistics-native-shell"
			bodyClassName="bg-[rgb(3_3_4)]"
			containerClassName="bg-[rgb(3_3_4)]"
			contentClassName="!gap-0 !py-0"
			contentPadding={false}
		>
			<PageContainer className="statistics-native-content pb-10">
				<ScrollFadeHero
					title="Statistika"
					eyebrow="Trenutni Elo"
					videoSrc="/rankings-header.mp4"
					titleTracking="-0.5px"
					eyebrowTracking="1.8px"
				/>
				<NativeRankingsTabs
					activeView={activeRankingView}
					onViewChange={handleViewChange}
				/>

				<section
					id="statistics-ranking-panel"
					role="tabpanel"
					aria-label={rankingViews.find((view) => view.value === activeRankingView)?.label}
					className="relative z-10 pt-6"
				>
					{isInitialLoading ? (
						<Loading
							label={t.statistics.loading}
							size="lg"
							className="py-[60px]"
						/>
					) : error ? (
						<StateBlock variant="error" size="lg" title={error} />
					) : currentData.length === 0 ? (
						<div className="py-[60px] text-center">
							<p className="text-base font-semibold text-ds-button-foreground">
								Nema rangiranih igrača
							</p>
							<p className="mx-auto mt-2 max-w-sm text-sm leading-5 text-ds-button-muted">
								Igrači će se pojaviti nakon dovoljnog broja završenih mečeva.
							</p>
						</div>
					) : (
						<NativeRankingsList
							items={currentData}
							activeView={activeRankingView}
							onPlayerSelect={handlePlayerClick}
							onTeamSelect={handleTeamClick}
							animateEntrance={animateEntrance}
						/>
					)}
				</section>
			</PageContainer>
		</AppShell>
	);
}

export default function StatisticsPage() {
	return (
		<AuthGuard>
			<StatisticsPageContent />
		</AuthGuard>
	);
}
