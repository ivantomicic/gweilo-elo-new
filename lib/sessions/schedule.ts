export type SessionPlayer = {
	id: string;
	name: string;
	avatar: string | null;
	isPlaceholder?: boolean;
};

export type SessionMatch = {
	type: "singles" | "doubles";
	players: SessionPlayer[];
};

export type SessionRound = {
	id: string;
	roundNumber: number;
	matches: SessionMatch[];
	restingPlayers?: SessionPlayer[];
	isDynamic?: boolean;
	dynamicNote?: {
		title: string;
		description: string;
	};
};

export type SixPlayerTeamKey = "A" | "B" | "C";
export type FourPlayerFormat = "singles" | "mixed";
export type SixPlayerFormat = "singles" | "mixed";

export type ScheduleOptions = {
	fourPlayerFormat?: FourPlayerFormat;
	sixPlayerFormat?: SixPlayerFormat;
	sixPlayerRound5SinglesTeam?: SixPlayerTeamKey;
};

export function getSixPlayerCandidateTeams(
	players: SessionPlayer[],
): Record<SixPlayerTeamKey, [string, string]> | null {
	if (players.length !== 6) {
		return null;
	}

	return {
		A: [players[0].id, players[1].id],
		B: [players[2].id, players[3].id],
		C: [players[4].id, players[5].id],
	};
}

function generateScheduleFor2Players(players: SessionPlayer[]): SessionRound[] {
	if (players.length !== 2) return [];
	const [A, B] = players;

	return [
		{
			id: "1",
			roundNumber: 1,
			matches: [{ type: "singles", players: [A, B] }],
		},
	];
}

function generateScheduleFor3Players(players: SessionPlayer[]): SessionRound[] {
	if (players.length !== 3) return [];
	const [A, B, C] = players;

	return [
		{
			id: "1",
			roundNumber: 1,
			matches: [{ type: "singles", players: [A, B] }],
		},
		{
			id: "2",
			roundNumber: 2,
			matches: [{ type: "singles", players: [C, A] }],
		},
		{
			id: "3",
			roundNumber: 3,
			matches: [{ type: "singles", players: [B, C] }],
		},
	];
}

function generateScheduleFor4Players(
	players: SessionPlayer[],
	format: FourPlayerFormat = "mixed",
): SessionRound[] {
	if (players.length !== 4) return [];
	const [A, B, C, D] = players;

	const rounds: SessionRound[] = [
		{
			id: "1",
			roundNumber: 1,
			matches: [
				{ type: "singles", players: [A, B] },
				{ type: "singles", players: [C, D] },
			],
		},
		{
			id: "2",
			roundNumber: 2,
			matches: [
				{ type: "singles", players: [A, C] },
				{ type: "singles", players: [B, D] },
			],
		},
		{
			id: "3",
			roundNumber: 3,
			matches: [
				{ type: "singles", players: [A, D] },
				{ type: "singles", players: [B, C] },
			],
		},
	];

	if (format === "singles") {
		const secondRotation = rounds.map((round) => ({
			...round,
			id: String(round.roundNumber + 3),
			roundNumber: round.roundNumber + 3,
			matches: round.matches.map((match) => ({
				...match,
				players: [...match.players],
			})),
		}));

		return [...rounds, ...secondRotation];
	}

	return [
		...rounds,
		{
			id: "4",
			roundNumber: 4,
			matches: [{ type: "doubles", players: [A, B, C, D] }],
		},
		{
			id: "5",
			roundNumber: 5,
			matches: [{ type: "doubles", players: [A, C, B, D] }],
		},
		{
			id: "6",
			roundNumber: 6,
			matches: [{ type: "doubles", players: [A, D, B, C] }],
		},
	];
}

function generateScheduleFor5Players(players: SessionPlayer[]): SessionRound[] {
	if (players.length !== 5) return [];
	const [A, B, C, D, E] = players;

	const firstRotation: SessionRound[] = [
		{
			id: "1",
			roundNumber: 1,
			matches: [
				{ type: "singles", players: [B, C] },
				{ type: "singles", players: [D, E] },
			],
		},
		{
			id: "2",
			roundNumber: 2,
			matches: [
				{ type: "singles", players: [A, D] },
				{ type: "singles", players: [C, E] },
			],
		},
		{
			id: "3",
			roundNumber: 3,
			matches: [
				{ type: "singles", players: [A, E] },
				{ type: "singles", players: [B, D] },
			],
		},
		{
			id: "4",
			roundNumber: 4,
			matches: [
				{ type: "singles", players: [A, C] },
				{ type: "singles", players: [B, E] },
			],
		},
		{
			id: "5",
			roundNumber: 5,
			matches: [
				{ type: "singles", players: [A, B] },
				{ type: "singles", players: [C, D] },
			],
		},
	];

	const secondRotation = firstRotation.map((round) => ({
		...round,
		id: String(round.roundNumber + 5),
		roundNumber: round.roundNumber + 5,
		matches: round.matches.map((match) => ({
			...match,
			players: [...match.players],
		})),
	}));

	return [...firstRotation, ...secondRotation];
}

function generateScheduleFor6Players(
	players: SessionPlayer[],
	format: SixPlayerFormat = "mixed",
	round5SinglesTeam: SixPlayerTeamKey = "C",
): SessionRound[] {
	if (players.length !== 6) return [];
	const [A, B, C, D, E, F] = players;

	if (format === "singles") {
		const firstRotation: SessionRound[] = [
			{
				id: "1",
				roundNumber: 1,
				matches: [
					{ type: "singles", players: [A, F] },
					{ type: "singles", players: [B, E] },
					{ type: "singles", players: [C, D] },
				],
			},
			{
				id: "2",
				roundNumber: 2,
				matches: [
					{ type: "singles", players: [A, E] },
					{ type: "singles", players: [F, D] },
					{ type: "singles", players: [B, C] },
				],
			},
			{
				id: "3",
				roundNumber: 3,
				matches: [
					{ type: "singles", players: [A, D] },
					{ type: "singles", players: [E, C] },
					{ type: "singles", players: [F, B] },
				],
			},
			{
				id: "4",
				roundNumber: 4,
				matches: [
					{ type: "singles", players: [A, C] },
					{ type: "singles", players: [D, B] },
					{ type: "singles", players: [E, F] },
				],
			},
			{
				id: "5",
				roundNumber: 5,
				matches: [
					{ type: "singles", players: [A, B] },
					{ type: "singles", players: [C, F] },
					{ type: "singles", players: [D, E] },
				],
			},
		];
		const secondRotation = firstRotation.map((round) => ({
			...round,
			id: String(round.roundNumber + 5),
			roundNumber: round.roundNumber + 5,
			matches: round.matches.map((match) => ({
				...match,
				players: [...match.players],
			})),
		}));

		return [...firstRotation, ...secondRotation];
	}

	const teams: Record<SixPlayerTeamKey, [SessionPlayer, SessionPlayer]> = {
		A: [A, B],
		B: [C, D],
		C: [E, F],
	};
	const round5SinglesPlayers = teams[round5SinglesTeam];
	const doublesTeamKeys = (["A", "B", "C"] as SixPlayerTeamKey[]).filter(
		(teamKey) => teamKey !== round5SinglesTeam,
	);
	const round5DoublesTeam1Players = teams[doublesTeamKeys[0]];
	const round5DoublesTeam2Players = teams[doublesTeamKeys[1]];

	return [
		{
			id: "1",
			roundNumber: 1,
			matches: [
				{ type: "singles", players: [A, C] },
				{ type: "singles", players: [B, E] },
				{ type: "singles", players: [D, F] },
			],
		},
		{
			id: "2",
			roundNumber: 2,
			matches: [
				{ type: "singles", players: [A, D] },
				{ type: "singles", players: [B, F] },
				{ type: "singles", players: [C, E] },
			],
		},
		{
			id: "3",
			roundNumber: 3,
			matches: [
				{ type: "singles", players: [A, E] },
				{ type: "singles", players: [B, D] },
				{ type: "singles", players: [C, F] },
			],
		},
		{
			id: "4",
			roundNumber: 4,
			matches: [
				{ type: "singles", players: [A, F] },
				{ type: "singles", players: [B, C] },
				{ type: "singles", players: [D, E] },
			],
		},
		{
			id: "5",
			roundNumber: 5,
			matches: [
				{
					type: "doubles",
					players: [
						...round5DoublesTeam1Players,
						...round5DoublesTeam2Players,
					],
				},
				{ type: "singles", players: [...round5SinglesPlayers] },
			],
		},
		{
			id: "6",
			roundNumber: 6,
			matches: [
				{
					type: "doubles",
					players: [
						...round5DoublesTeam1Players,
						...round5SinglesPlayers,
					],
				},
				{ type: "singles", players: [...round5DoublesTeam2Players] },
			],
			isDynamic: true,
		},
		{
			id: "7",
			roundNumber: 7,
			matches: [
				{
					type: "doubles",
					players: [
						...round5DoublesTeam2Players,
						...round5SinglesPlayers,
					],
				},
				{ type: "singles", players: [...round5DoublesTeam1Players] },
			],
			isDynamic: true,
			dynamicNote: {
				title: "Schedule will be determined after Round 5 is completed.",
				description:
					"Round 5 doubles winners will play singles, and doubles losers will play doubles against Round 5 singles.",
			},
		},
	];
}

export function generateSchedule(
	players: SessionPlayer[],
	options?: ScheduleOptions,
): SessionRound[] {
	switch (players.length) {
		case 2:
			return generateScheduleFor2Players(players);
		case 3:
			return generateScheduleFor3Players(players);
		case 4:
			return generateScheduleFor4Players(
				players,
				options?.fourPlayerFormat,
			);
		case 5:
			return generateScheduleFor5Players(players);
		case 6:
			return generateScheduleFor6Players(
				players,
				options?.sixPlayerFormat,
				options?.sixPlayerRound5SinglesTeam,
			);
		default:
			return [];
	}
}
