"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
	SessionPerformanceTableView,
	type SessionPerformancePlayer,
	type SessionPerformanceTeam,
} from "@/components/sessions/session-detail";
import { supabase } from "@/lib/supabase/client";
import {
	getOrFetchSessionSummary,
	readCachedSessionSummary,
	type SessionPlayerSummary,
	type SessionTeamSummary,
	type SummaryView,
} from "../_lib/session-summary-client";

type SessionSummaryTableProps = {
	sessionId: string;
	activeView: SummaryView;
	onPlayerClick?: (playerId: string) => void;
	selectedPlayerFilter?: string | null;
	onSelectedPlayerSummaryChange?: (summary: string | null) => void;
};

function getCachedLoadedViews(sessionId: string) {
	const loadedViews: SummaryView[] = [];

	if (readCachedSessionSummary(sessionId, "singles")?.singles) {
		loadedViews.push("singles");
	}
	if (readCachedSessionSummary(sessionId, "doubles_player")?.doubles_player) {
		loadedViews.push("doubles_player");
	}
	if (readCachedSessionSummary(sessionId, "doubles_team")?.doubles_team) {
		loadedViews.push("doubles_team");
	}

	return new Set<SummaryView>(loadedViews);
}

function sortByPerformance<
	T extends { wins: number; draws: number; elo_change: number | null },
>(entries: T[]) {
	return [...entries].sort(
		(a, b) =>
			b.wins - a.wins ||
			b.draws - a.draws ||
			(b.elo_change ?? 0) - (a.elo_change ?? 0),
	);
}

function playerPresentation(
	player: SessionPlayerSummary,
): SessionPerformancePlayer {
	return {
		id: player.player_id,
		name: player.display_name,
		avatar: player.avatar,
		isPlaceholder: player.is_placeholder,
		matches: player.matches_played,
		wins: player.wins,
		draws: player.draws,
		losses: player.losses,
		eloAfter: player.elo_after,
		eloChange: player.elo_change,
	};
}

function teamPresentation(team: SessionTeamSummary): SessionPerformanceTeam {
	return {
		id: team.team_id,
		name: `${team.player1_name} + ${team.player2_name}`,
		players: [
			{
				id: team.player1_id,
				name: team.player1_name,
				avatar: team.player1_avatar,
			},
			{
				id: team.player2_id,
				name: team.player2_name,
				avatar: team.player2_avatar,
			},
		],
		matches: team.matches_played,
		wins: team.wins,
		draws: team.draws,
		losses: team.losses,
		eloAfter: team.elo_after,
		eloChange: team.elo_change,
	};
}

function selectedPlayerSummary(
	player: SessionPerformancePlayer | undefined,
	view: SummaryView,
) {
	if (!player || view === "doubles_team") return null;
	const label = view === "singles" ? "Singl" : "Dubl";
	if (player.eloAfter === null || player.eloChange === null) {
		return `${label} bez ELO-a`;
	}

	const elo = Math.round(player.eloAfter).toLocaleString("sr-Latn-RS");
	const delta = Math.round(player.eloChange);
	return `${label} ${elo} (${delta > 0 ? `+${delta}` : delta})`;
}

export function SessionSummaryTable({
	sessionId,
	activeView,
	onPlayerClick,
	selectedPlayerFilter,
	onSelectedPlayerSummaryChange,
}: SessionSummaryTableProps) {
	const [singlesSummary, setSinglesSummary] = useState<
		SessionPlayerSummary[] | null
	>(() => readCachedSessionSummary(sessionId, "singles")?.singles ?? null);
	const [doublesPlayerSummary, setDoublesPlayerSummary] = useState<
		SessionPlayerSummary[] | null
	>(
		() =>
			readCachedSessionSummary(sessionId, "doubles_player")?.doubles_player ??
			null,
	);
	const [doublesTeamSummary, setDoublesTeamSummary] = useState<
		SessionTeamSummary[] | null
	>(
		() =>
			readCachedSessionSummary(sessionId, "doubles_team")?.doubles_team ?? null,
	);
	const [loadingByView, setLoadingByView] = useState<
		Record<SummaryView, boolean>
	>({
		singles: false,
		doubles_player: false,
		doubles_team: false,
	});
	const [errorByView, setErrorByView] = useState<
		Partial<Record<SummaryView, string>>
	>({});
	const accessTokenRef = useRef<string | null>(null);
	const loadedViewsRef = useRef<Set<SummaryView>>(
		getCachedLoadedViews(sessionId),
	);
	const inFlightViewsRef = useRef<Set<SummaryView>>(new Set());
	const summaryChangeRef = useRef(onSelectedPlayerSummaryChange);
	summaryChangeRef.current = onSelectedPlayerSummaryChange;

	const getAccessToken = useCallback(async () => {
		if (accessTokenRef.current) return accessTokenRef.current;

		const {
			data: { session },
		} = await supabase.auth.getSession();
		if (!session) throw new Error("Not authenticated");
		accessTokenRef.current = session.access_token;
		return session.access_token;
	}, []);

	const fetchSummaryForView = useCallback(
		async (view: SummaryView) => {
			if (
				loadedViewsRef.current.has(view) ||
				inFlightViewsRef.current.has(view)
			) {
				return;
			}

			inFlightViewsRef.current.add(view);
			setLoadingByView((current) => ({ ...current, [view]: true }));
			setErrorByView((current) => {
				const next = { ...current };
				delete next[view];
				return next;
			});

			try {
				const data = await getOrFetchSessionSummary(
					sessionId,
					view,
					getAccessToken,
				);
				if (view === "singles") setSinglesSummary(data.singles || []);
				else if (view === "doubles_player") {
					setDoublesPlayerSummary(data.doubles_player || []);
				} else setDoublesTeamSummary(data.doubles_team || []);
				loadedViewsRef.current.add(view);
			} catch (error) {
				console.error(`Error fetching ${view} summary:`, error);
				setErrorByView((current) => ({
					...current,
					[view]:
						error instanceof Error
							? error.message
							: "Failed to load session summary",
				}));
			} finally {
				inFlightViewsRef.current.delete(view);
				setLoadingByView((current) => ({ ...current, [view]: false }));
			}
		},
		[getAccessToken, sessionId],
	);

	useEffect(() => {
		setSinglesSummary(
			readCachedSessionSummary(sessionId, "singles")?.singles ?? null,
		);
		setDoublesPlayerSummary(
			readCachedSessionSummary(sessionId, "doubles_player")?.doubles_player ??
				null,
		);
		setDoublesTeamSummary(
			readCachedSessionSummary(sessionId, "doubles_team")?.doubles_team ?? null,
		);
		setLoadingByView({
			singles: false,
			doubles_player: false,
			doubles_team: false,
		});
		setErrorByView({});
		accessTokenRef.current = null;
		loadedViewsRef.current = getCachedLoadedViews(sessionId);
		inFlightViewsRef.current = new Set();
	}, [sessionId]);

	useEffect(() => {
		void fetchSummaryForView("singles");
	}, [fetchSummaryForView]);

	useEffect(() => {
		void fetchSummaryForView(activeView);
	}, [activeView, fetchSummaryForView]);

	const activePlayerSource =
		activeView === "singles" ? singlesSummary : doublesPlayerSummary;
	const activePlayers = sortByPerformance(activePlayerSource ?? []).map(
		playerPresentation,
	);
	const summary = selectedPlayerSummary(
		activePlayers.find((player) => player.id === selectedPlayerFilter),
		activeView,
	);

	useEffect(() => {
		summaryChangeRef.current?.(summary);
	}, [summary]);

	const error = errorByView[activeView];
	if (error) {
		return (
			<p
				className="py-5 text-sm text-[rgb(var(--ds-native-coral))]"
				role="alert"
			>
				{error}
			</p>
		);
	}

	if (activeView === "doubles_team") {
		const teams = sortByPerformance(doublesTeamSummary ?? []).map(
			teamPresentation,
		);
		return (
			<SessionPerformanceTableView
				view="team"
				teams={teams}
				activeTabValue={activeView}
				loading={loadingByView.doubles_team && doublesTeamSummary === null}
			/>
		);
	}

	return (
		<SessionPerformanceTableView
			view="player"
			players={activePlayers}
			activeTabValue={activeView}
			selectedPlayerId={selectedPlayerFilter}
			onPlayerSelect={onPlayerClick}
			loading={loadingByView[activeView] && activePlayerSource === null}
		/>
	);
}
