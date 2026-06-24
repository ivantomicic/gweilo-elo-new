"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	getOrFetchSessionSummary,
	readCachedSessionSummary,
	type SessionPlayerSummary,
	type SessionTeamSummary,
	type SummaryView,
} from "../_lib/session-summary-client";
import {
	EloChangeCell,
	PlayerTableIdentity,
	RankCell,
	TeamTableIdentity,
} from "@/components/ui/stats-table-cells";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Box } from "@/components/ui/box";
import { Loading } from "@/components/ui/loading";
import { supabase } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";

type SessionSummaryTableProps = {
	sessionId: string;
	activeView: SummaryView;
	onPlayerClick?: (playerId: string) => void;
	selectedPlayerFilter?: string | null;
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

export function SessionSummaryTable({
	sessionId,
	activeView,
	onPlayerClick,
	selectedPlayerFilter,
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
			readCachedSessionSummary(sessionId, "doubles_team")?.doubles_team ??
			null,
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

	const getAccessToken = useCallback(async () => {
		if (accessTokenRef.current) {
			return accessTokenRef.current;
		}

		const {
			data: { session },
		} = await supabase.auth.getSession();
		if (!session) {
			throw new Error("Not authenticated");
		}
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
			setLoadingByView((prev) => ({ ...prev, [view]: true }));
			setErrorByView((prev) => {
				const next = { ...prev };
				delete next[view];
				return next;
			});

			try {
				const data = await getOrFetchSessionSummary(
					sessionId,
					view,
					getAccessToken,
				);
				if (view === "singles") {
					setSinglesSummary(data.singles || []);
				} else if (view === "doubles_player") {
					setDoublesPlayerSummary(data.doubles_player || []);
				} else {
					setDoublesTeamSummary(data.doubles_team || []);
				}
				loadedViewsRef.current.add(view);
			} catch (err) {
				console.error(`Error fetching ${view} summary:`, err);
				setErrorByView((prev) => ({
					...prev,
					[view]:
						err instanceof Error
							? err.message
							: "Failed to load session summary",
				}));
			} finally {
				inFlightViewsRef.current.delete(view);
				setLoadingByView((prev) => ({ ...prev, [view]: false }));
			}
		},
		[getAccessToken, sessionId],
	);

	// Reset summary state when session changes.
	useEffect(() => {
		setSinglesSummary(
			readCachedSessionSummary(sessionId, "singles")?.singles ?? null,
		);
		setDoublesPlayerSummary(
			readCachedSessionSummary(sessionId, "doubles_player")?.doubles_player ??
				null,
		);
		setDoublesTeamSummary(
			readCachedSessionSummary(sessionId, "doubles_team")?.doubles_team ??
				null,
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

	// Load singles immediately for fastest first paint.
	useEffect(() => {
		fetchSummaryForView("singles");
	}, [fetchSummaryForView]);

	// Lazy-load other summaries when user opens that tab.
	useEffect(() => {
		fetchSummaryForView(activeView);
	}, [activeView, fetchSummaryForView]);

	const currentView = activeView;
	const currentError = errorByView[currentView] ?? null;
	const isCurrentViewLoading = loadingByView[currentView];
	const currentViewLoaded =
		currentView === "singles"
			? singlesSummary !== null
			: currentView === "doubles_player"
				? doublesPlayerSummary !== null
				: doublesTeamSummary !== null;

	// Sort by wins (descending) for display
	const sortByWins = <T extends { wins: number }>(arr: T[]): T[] => {
		return [...arr].sort((a, b) => b.wins - a.wins);
	};

	if (isCurrentViewLoading && !currentViewLoaded) {
		return (
			<Box>
				<Loading inline label={t.sessions.session.loading} />
			</Box>
		);
	}

	if (currentError) {
		return (
			<Box>
				<p className="text-destructive">{currentError}</p>
			</Box>
		);
	}

	// Return just the table content based on current view
	const renderTable = () => {
		if (currentView === "singles") {
			const sortedPlayers = sortByWins(singlesSummary ?? []);
			if (sortedPlayers.length === 0) {
				return (
					<p className="text-muted-foreground text-sm px-4 py-5">
						No summary data available.
					</p>
				);
			}
			return (
				<Table>
					<TableHeader className="bg-muted/30">
						<TableRow>
							<TableHead className="text-left w-8">#</TableHead>
							<TableHead className="text-left">
								{t.statistics.table.player}
							</TableHead>
							<TableHead className="text-center hidden md:table-cell">
								{t.statistics.table.wins}
							</TableHead>
							<TableHead className="text-center hidden md:table-cell">
								{t.statistics.table.losses}
							</TableHead>
							<TableHead className="text-center hidden md:table-cell">
								{t.statistics.table.draws}
							</TableHead>
							<TableHead className="text-center">
								{t.statistics.table.elo}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{sortedPlayers.map((player, index) => (
							<TableRow key={player.player_id}>
								<RankCell index={index} />
								<TableCell>
									<PlayerTableIdentity
										name={player.display_name}
										avatar={player.avatar}
										id={player.player_id}
										size="sm"
										onClick={
											onPlayerClick
												? () => onPlayerClick(player.player_id)
												: undefined
										}
										selected={selectedPlayerFilter === player.player_id}
										mobileRecord={player}
									/>
								</TableCell>
								<TableCell className="text-center font-bold font-mono hidden md:table-cell text-emerald-500">
									{player.wins}
								</TableCell>
								<TableCell className="text-center font-bold font-mono hidden md:table-cell text-red-500">
									{player.losses}
								</TableCell>
								<TableCell className="text-center font-bold font-mono hidden md:table-cell text-muted-foreground">
									{player.draws}
								</TableCell>
								<EloChangeCell
									change={player.elo_change}
									eloAfter={player.elo_after}
								/>
							</TableRow>
						))}
					</TableBody>
				</Table>
			);
		}

		if (currentView === "doubles_player") {
			const sortedPlayers = sortByWins(doublesPlayerSummary ?? []);
			if (sortedPlayers.length === 0) {
				return (
					<p className="text-muted-foreground text-sm px-4 py-5">
						No summary data available.
					</p>
				);
			}
			return (
				<Table>
					<TableHeader className="bg-muted/30">
						<TableRow>
							<TableHead className="text-left w-8">#</TableHead>
							<TableHead className="text-left">
								{t.statistics.table.player}
							</TableHead>
							<TableHead className="text-center hidden md:table-cell">
								W
							</TableHead>
							<TableHead className="text-center hidden md:table-cell">
								L
							</TableHead>
							<TableHead className="text-center hidden md:table-cell">
								D
							</TableHead>
							<TableHead className="text-center">
								{t.statistics.table.elo}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{sortedPlayers.map((player, index) => (
							<TableRow key={player.player_id}>
								<RankCell index={index} />
								<TableCell>
									<PlayerTableIdentity
										name={player.display_name}
										avatar={player.avatar}
										id={player.player_id}
										size="sm"
										onClick={
											onPlayerClick
												? () => onPlayerClick(player.player_id)
												: undefined
										}
										selected={selectedPlayerFilter === player.player_id}
										mobileRecord={player}
									/>
								</TableCell>
								<TableCell className="text-center font-bold font-mono hidden md:table-cell text-emerald-500">
									{player.wins}
								</TableCell>
								<TableCell className="text-center font-bold font-mono hidden md:table-cell text-red-500">
									{player.losses}
								</TableCell>
								<TableCell className="text-center font-bold font-mono hidden md:table-cell text-muted-foreground">
									{player.draws}
								</TableCell>
								<EloChangeCell
									change={player.elo_change}
									eloAfter={player.elo_after}
								/>
							</TableRow>
						))}
					</TableBody>
				</Table>
			);
		}

		if (currentView === "doubles_team") {
			const sortedTeams = sortByWins(doublesTeamSummary ?? []);
			if (sortedTeams.length === 0) {
				return (
					<p className="text-muted-foreground text-sm px-4 py-5">
						No summary data available.
					</p>
				);
			}
			return (
				<Table>
					<TableHeader className="bg-muted/30">
						<TableRow>
							<TableHead className="text-left w-8">#</TableHead>
							<TableHead className="text-left">
								{t.statistics.table.team}
							</TableHead>
							<TableHead className="text-center hidden md:table-cell">
								W
							</TableHead>
							<TableHead className="text-center hidden md:table-cell">
								L
							</TableHead>
							<TableHead className="text-center hidden md:table-cell">
								D
							</TableHead>
							<TableHead className="text-center">
								{t.statistics.table.elo}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{sortedTeams.map((team, index) => (
							<TableRow key={team.team_id}>
								<RankCell index={index} />
								<TableCell>
									<TeamTableIdentity
										player1={{
											name: team.player1_name,
											avatar: team.player1_avatar,
										}}
										player2={{
											name: team.player2_name,
											avatar: team.player2_avatar,
										}}
										size="sm"
										mobileRecord={team}
									/>
								</TableCell>
								<TableCell className="text-center font-bold font-mono hidden md:table-cell text-emerald-500">
									{team.wins}
								</TableCell>
								<TableCell className="text-center font-bold font-mono hidden md:table-cell text-red-500">
									{team.losses}
								</TableCell>
								<TableCell className="text-center font-bold font-mono hidden md:table-cell text-muted-foreground">
									{team.draws}
								</TableCell>
								<EloChangeCell
									change={team.elo_change}
									eloAfter={team.elo_after}
								/>
							</TableRow>
						))}
					</TableBody>
				</Table>
			);
		}

		return null;
	};

	return (
		<Box className="rounded-lg border border-border/50 overflow-hidden bg-card">
			{renderTable()}
		</Box>
	);
}
