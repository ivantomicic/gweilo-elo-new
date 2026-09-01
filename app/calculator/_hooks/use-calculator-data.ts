import { useCallback, useEffect, useMemo, useState } from "react";
import { calculateEloDelta, type MatchResult } from "@/lib/elo/calculation";
import { useAuth } from "@/lib/auth/useAuth";
import type {
	CalculatorPlayer,
	PlayerWithRating,
	PredictedResults,
} from "@/app/calculator/_lib/types";

type CalculatorSelection = {
	playerId: string | null;
	opponentIds: string[];
	results: PredictedResults;
};

type UseCalculatorDataResult = {
	players: PlayerWithRating[];
	currentPlayer: PlayerWithRating | null;
	availableOpponents: PlayerWithRating[];
	selectedOpponents: PlayerWithRating[];
	selectedOpponentIds: string[];
	predictedResults: PredictedResults;
	loading: boolean;
	error: string | null;
	refresh: () => void;
	selectPlayer: (playerId: string) => void;
	toggleOpponent: (opponentId: string) => void;
	removeOpponent: (opponentId: string) => void;
	setPredictionForOpponent: (opponentId: string, result: MatchResult) => void;
	getOpponentDelta: (opponent: PlayerWithRating, result: MatchResult) => number;
	totalProjectedDelta: number;
};

export function useCalculatorData(): UseCalculatorDataResult {
	const { session } = useAuth();
	const accessToken = session?.access_token;
	const userId = session?.user.id;
	const [players, setPlayers] = useState<PlayerWithRating[]>([]);
	const [selection, setSelection] = useState<CalculatorSelection>({
		playerId: null,
		opponentIds: [],
		results: {},
	});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [refreshToken, setRefreshToken] = useState(0);

	useEffect(() => {
		const controller = new AbortController();
		const fetchData = async () => {
			try {
				setLoading(true);
				setError(null);
				if (!accessToken) {
					setError("Niste prijavljeni.");
					return;
				}

				const response = await fetch("/api/calculator/players", {
					headers: { Authorization: `Bearer ${accessToken}` },
					signal: controller.signal,
				});
				if (!response.ok) {
					setError("Ne mogu da učitam igrače.");
					return;
				}

				const { players: loadedPlayers } = await response.json();
				if (controller.signal.aborted) return;
				const sortedPlayers = ((loadedPlayers || []) as CalculatorPlayer[])
					.sort((a, b) => b.elo - a.elo);
				setPlayers(sortedPlayers);
				setSelection((current) => {
					const hasSelectedPlayer = sortedPlayers.some(
						(player) => player.id === current.playerId,
					);
					if (!hasSelectedPlayer) {
						return {
							playerId:
								sortedPlayers.find((player) => player.id === userId)?.id ??
								sortedPlayers[0]?.id ?? null,
							opponentIds: [],
							results: {},
						};
					}

					// Native refresh preserves the scenario and discards only players
					// no longer present in the latest response.
					const validIds = new Set(sortedPlayers.map((player) => player.id));
					const opponentIds = current.opponentIds.filter(
						(id) => validIds.has(id) && id !== current.playerId,
					);
					return {
						...current,
						opponentIds,
						results: Object.fromEntries(
							opponentIds.map((id) => [id, current.results[id] || "draw"]),
						),
					};
				});
			} catch (fetchError) {
				if (controller.signal.aborted) return;
				console.error("Calculator fetch error:", fetchError);
				setError("Greška pri učitavanju podataka.");
			} finally {
				if (!controller.signal.aborted) setLoading(false);
			}
		};

		void fetchData();
		return () => controller.abort();
	}, [accessToken, userId, refreshToken]);

	const refresh = useCallback(() => {
		setRefreshToken((current) => current + 1);
	}, []);

	const currentPlayer = useMemo(
		() => players.find((player) => player.id === selection.playerId) || null,
		[players, selection.playerId],
	);

	const availableOpponents = useMemo(
		() => players.filter((player) =>
			player.id !== selection.playerId && !selection.opponentIds.includes(player.id),
		),
		[players, selection.playerId, selection.opponentIds],
	);

	const selectedOpponents = useMemo(() => {
		const playersById = new Map(players.map((player) => [player.id, player]));
		return selection.opponentIds.flatMap((id) => {
			const player = playersById.get(id);
			return player && player.id !== selection.playerId ? [player] : [];
		});
	}, [players, selection.opponentIds, selection.playerId]);

	const selectPlayer = useCallback((playerId: string) => {
		setSelection((current) => current.playerId === playerId
			? current
			: { playerId, opponentIds: [], results: {} },
		);
	}, []);

	const toggleOpponent = useCallback((opponentId: string) => {
		setSelection((current) => {
			if (opponentId === current.playerId) return current;
			if (current.opponentIds.includes(opponentId)) {
				const results = { ...current.results };
				delete results[opponentId];
				return {
					...current,
					opponentIds: current.opponentIds.filter((id) => id !== opponentId),
					results,
				};
			}
			return {
				...current,
				opponentIds: [...current.opponentIds, opponentId],
				results: { ...current.results, [opponentId]: "draw" },
			};
		});
	}, []);

	const removeOpponent = useCallback((opponentId: string) => {
		setSelection((current) => {
			const results = { ...current.results };
			delete results[opponentId];
			return {
				...current,
				opponentIds: current.opponentIds.filter((id) => id !== opponentId),
				results,
			};
		});
	}, []);

	const setPredictionForOpponent = useCallback(
		(opponentId: string, result: MatchResult) => {
			setSelection((current) => current.opponentIds.includes(opponentId)
				? { ...current, results: { ...current.results, [opponentId]: result } }
				: current,
			);
		},
		[],
	);

	const getOpponentDelta = useCallback(
		(opponent: PlayerWithRating, result: MatchResult) => {
			if (!currentPlayer) return 0;
			return calculateEloDelta(
				currentPlayer.elo,
				opponent.elo,
				result,
				currentPlayer.matchesPlayed,
			);
		},
		[currentPlayer],
	);

	const totalProjectedDelta = useMemo(() => {
		if (!currentPlayer) return 0;
		return selectedOpponents.reduce((sum, opponent) =>
			sum + getOpponentDelta(opponent, selection.results[opponent.id] || "draw"),
		0);
	}, [currentPlayer, selectedOpponents, selection.results, getOpponentDelta]);

	return {
		players,
		currentPlayer,
		availableOpponents,
		selectedOpponents,
		selectedOpponentIds: selection.opponentIds,
		predictedResults: selection.results,
		loading,
		error,
		refresh,
		selectPlayer,
		toggleOpponent,
		removeOpponent,
		setPredictionForOpponent,
		getOpponentDelta,
		totalProjectedDelta,
	};
}
