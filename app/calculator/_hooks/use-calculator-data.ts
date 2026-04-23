import { useCallback, useEffect, useMemo, useState } from "react";
import { calculateEloDelta, type MatchResult } from "@/lib/elo/calculation";
import { supabase } from "@/lib/supabase/client";
import type {
	CalculatorPlayer,
	PlayerRating,
	PlayerWithRating,
	PredictedResults,
	ProfileRow,
} from "@/app/calculator/_lib/types";

type UseCalculatorDataResult = {
	currentPlayer: PlayerWithRating | null;
	availableOpponents: PlayerWithRating[];
	selectedOpponents: PlayerWithRating[];
	selectedOpponentIds: string[];
	predictedResults: PredictedResults;
	loading: boolean;
	error: string | null;
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
	const [currentUserId, setCurrentUserId] = useState<string | null>(null);
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

				setCurrentUserId(session.user.id);

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
				const calculatorPlayers = (players || []) as CalculatorPlayer[];
				const userIds = calculatorPlayers.map((player) => player.id);

				const [ratingsResult, profilesResult] = await Promise.all([
					supabase
						.from("player_ratings")
						.select("player_id, elo, matches_played")
						.in("player_id", userIds),
					supabase
						.from("profiles")
						.select("id, display_name, avatar_url")
						.in("id", userIds),
				]);

				const ratingsMap = new Map<string, PlayerRating>();
				(ratingsResult.data || []).forEach((rating: any) => {
					ratingsMap.set(rating.player_id, rating as PlayerRating);
				});

				const profilesMap = new Map<string, ProfileRow>();
				(profilesResult.data || []).forEach((profile: any) => {
					profilesMap.set(profile.id, profile as ProfileRow);
				});

				const mergedPlayers = calculatorPlayers
					.map((player) => {
						const rating = ratingsMap.get(player.id);
						const profile = profilesMap.get(player.id);
						return {
							id: player.id,
							name: profile?.display_name || player.name || "User",
							avatar: profile?.avatar_url || player.avatar || null,
							elo: rating?.elo ?? 1500,
							matchesPlayed: rating?.matches_played ?? 0,
						};
					})
					.sort((a, b) => b.elo - a.elo);

				setPlayers(mergedPlayers);
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
		() => players.find((player) => player.id === currentUserId) || null,
		[players, currentUserId],
	);

	const opponents = useMemo(
		() => players.filter((player) => player.id !== currentUserId),
		[players, currentUserId],
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
		currentPlayer,
		availableOpponents,
		selectedOpponents,
		selectedOpponentIds,
		predictedResults,
		loading,
		error,
		toggleOpponent,
		removeOpponent,
		setPredictionForOpponent,
		getOpponentDelta,
		totalProjectedDelta,
	};
}
