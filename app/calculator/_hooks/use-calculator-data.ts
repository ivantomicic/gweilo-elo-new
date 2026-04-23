import { useCallback, useEffect, useMemo, useState } from "react";
import { calculateEloDelta, type MatchResult } from "@/lib/elo/calculation";
import { supabase } from "@/lib/supabase/client";
import type {
	CalculatorPlayer,
	PlayerWithRating,
	PredictedResults,
} from "@/app/calculator/_lib/types";

type UseCalculatorDataResult = {
	players: PlayerWithRating[];
	currentPlayer: PlayerWithRating | null;
	availableOpponents: PlayerWithRating[];
	selectedOpponents: PlayerWithRating[];
	selectedOpponentIds: string[];
	predictedResults: PredictedResults;
	loading: boolean;
	error: string | null;
	selectPlayer: (playerId: string) => void;
	toggleOpponent: (opponentId: string) => void;
	removeOpponent: (opponentId: string) => void;
	setPredictionForOpponent: (opponentId: string, result: MatchResult) => void;
	getOpponentDelta: (
		opponent: PlayerWithRating,
		result: MatchResult,
	) => number;
	totalProjectedDelta: number;
};

export function useCalculatorData(): UseCalculatorDataResult {
	const [players, setPlayers] = useState<PlayerWithRating[]>([]);
	const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
	const [selectedOpponentIds, setSelectedOpponentIds] = useState<string[]>(
		[],
	);
	const [predictedResults, setPredictedResults] = useState<PredictedResults>(
		{},
	);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchData = async () => {
			try {
				setLoading(true);
				setError(null);

				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					setError("Niste prijavljeni.");
					return;
				}

				const usersResponse = await fetch(
					"/api/calculator/players",
					{
						headers: {
							Authorization: `Bearer ${session.access_token}`,
						},
					},
				);

				if (!usersResponse.ok) {
					setError("Ne mogu da učitam igrače.");
					return;
				}

				const { players } = await usersResponse.json();
				const mergedPlayers = ((players || []) as CalculatorPlayer[])
					.sort((a, b) => b.elo - a.elo);

				setPlayers(mergedPlayers);
				setSelectedPlayerId((previous) => {
					if (
						previous &&
						mergedPlayers.some((player) => player.id === previous)
					) {
						return previous;
					}

					if (
						mergedPlayers.some(
							(player) => player.id === session.user.id,
						)
					) {
						return session.user.id;
					}

					return mergedPlayers[0]?.id ?? null;
				});
			} catch (fetchError) {
				console.error("Calculator fetch error:", fetchError);
				setError("Greška pri učitavanju podataka.");
			} finally {
				setLoading(false);
			}
		};

		fetchData();
	}, []);

	const currentPlayer = useMemo(
		() => players.find((player) => player.id === selectedPlayerId) || null,
		[players, selectedPlayerId],
	);

	const opponents = useMemo(
		() => players.filter((player) => player.id !== selectedPlayerId),
		[players, selectedPlayerId],
	);

	const availableOpponents = useMemo(
		() =>
			opponents.filter(
				(player) => !selectedOpponentIds.includes(player.id),
			),
		[opponents, selectedOpponentIds],
	);

	const selectedOpponents = useMemo(() => {
		const selectedSet = new Set(selectedOpponentIds);
		return opponents.filter((player) => selectedSet.has(player.id));
	}, [opponents, selectedOpponentIds]);

	const selectPlayer = useCallback((playerId: string) => {
		setSelectedPlayerId(playerId);
		setSelectedOpponentIds([]);
		setPredictedResults({});
	}, []);

	const toggleOpponent = useCallback((opponentId: string) => {
		setSelectedOpponentIds((previous) => {
			if (previous.includes(opponentId)) {
				const next = previous.filter((id) => id !== opponentId);
				setPredictedResults((current) => {
					const copy = { ...current };
					delete copy[opponentId];
					return copy;
				});
				return next;
			}

			setPredictedResults((current) => ({
				...current,
				[opponentId]: current[opponentId] || "draw",
			}));
			return [...previous, opponentId];
		});
	}, []);

	const removeOpponent = useCallback((opponentId: string) => {
		setSelectedOpponentIds((previous) =>
			previous.filter((id) => id !== opponentId),
		);
		setPredictedResults((current) => {
			const copy = { ...current };
			delete copy[opponentId];
			return copy;
		});
	}, []);

	const setPredictionForOpponent = useCallback(
		(opponentId: string, result: MatchResult) => {
			setPredictedResults((previous) => ({
				...previous,
				[opponentId]: result,
			}));
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
		return selectedOpponents.reduce((sum, opponent) => {
			const result = predictedResults[opponent.id] || "draw";
			return sum + getOpponentDelta(opponent, result);
		}, 0);
	}, [
		currentPlayer,
		selectedOpponents,
		predictedResults,
		getOpponentDelta,
	]);

	return {
		players,
		currentPlayer,
		availableOpponents,
		selectedOpponents,
		selectedOpponentIds,
		predictedResults,
		loading,
		error,
		selectPlayer,
		toggleOpponent,
		removeOpponent,
		setPredictionForOpponent,
		getOpponentDelta,
		totalProjectedDelta,
	};
}
