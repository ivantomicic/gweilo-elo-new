import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { RIVALRY_CONFIG, getBasePriority } from "@/lib/rivalries/config";
import type {
	GeneratedMission,
	MissionCandidate,
	MissionGapReference,
	MissionPriorityBucket,
	MissionScoreBreakdown,
	MissionSnapshot,
	MissionSnapshotContext,
	MissionType,
	PlayerTier,
} from "@/lib/rivalries/types";

type AuthUserRecord = {
	id: string;
	email?: string;
	user_metadata?: Record<string, unknown>;
	app_metadata?: Record<string, unknown>;
};

type ProfileRecord = {
	id: string;
	display_name: string | null;
	avatar_url: string | null;
};

type RatingRecord = {
	player_id: string;
	elo: number | string | null;
	matches_played: number | null;
};

type SessionRelation = {
	completed_at: string | null;
	created_at: string;
};

type SinglesMatchRow = {
	id: string;
	player_ids: string[] | null;
	team1_score: number | null;
	team2_score: number | null;
	sessions: SessionRelation | SessionRelation[] | null;
};

type MissionPlayer = {
	id: string;
	name: string;
	avatarUrl: string | null;
	elo: number;
	matchesPlayed: number;
	rank: number;
	tier: PlayerTier;
};

type PairMatch = {
	matchId: string;
	playedAt: string;
	player1Id: string;
	player2Id: string;
	team1Score: number;
	team2Score: number;
	winnerId: string | null;
	loserId: string | null;
	setMargin: number;
};

type PairStats = {
	playerAId: string;
	playerBId: string;
	matches: PairMatch[];
};

type PerspectivePairStats = {
	opponentId: string;
	totalMatches: number;
	wins: number;
	losses: number;
	draws: number;
	winGap: number;
	lastPlayedAt: string | null;
	latestLossStreak: number;
	latestWinStreak: number;
	recentCloseLossInStreak: boolean;
};

type PersistedSnapshotRow = {
	player_id: string;
	player_name: string;
	player_avatar_url: string | null;
	player_elo: number;
	player_rank: number;
	matches_played: number;
	player_tier: PlayerTier;
	generated_at: string;
	generated_reason: string;
	generated_by: string | null;
	missions: GeneratedMission[];
	candidates: MissionCandidate[];
	context: MissionSnapshotContext;
};

const SNAPSHOT_TABLE = "rivalry_mission_snapshots";

function toNumber(value: unknown, fallback = 0): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	}

	return fallback;
}

function getUserRole(user: AuthUserRecord): string {
	const readRole = (value: unknown): string | null =>
		typeof value === "string" ? value : null;

	const readRolesArray = (value: unknown): string | null => {
		if (!Array.isArray(value)) {
			return null;
		}

		if (value.includes("admin")) return "admin";
		if (value.includes("mod")) return "mod";
		if (value.includes("guest")) return "guest";
		if (value.includes("user")) return "user";
		return null;
	};

	return (
		readRole(user.user_metadata?.role) ||
		readRole(user.app_metadata?.role) ||
		readRolesArray(user.user_metadata?.roles) ||
		readRolesArray(user.app_metadata?.roles) ||
		"user"
	);
}

function getPairKey(playerAId: string, playerBId: string) {
	return [playerAId, playerBId].sort().join(":");
}

function getRecencyScore(lastPlayedAt: string | null, now: Date) {
	if (!lastPlayedAt) {
		return 0;
	}

	const lastPlayedTime = new Date(lastPlayedAt).getTime();
	if (Number.isNaN(lastPlayedTime)) {
		return 0;
	}

	const daysAgo = (now.getTime() - lastPlayedTime) / (1000 * 60 * 60 * 24);
	if (daysAgo <= RIVALRY_CONFIG.recency.hotDays) return 18;
	if (daysAgo <= RIVALRY_CONFIG.recency.warmDays) return 10;
	if (daysAgo <= RIVALRY_CONFIG.recency.coolDays) return 4;
	return 0;
}

function getTier(elo: number, matchesPlayed: number): PlayerTier {
	if (matchesPlayed < RIVALRY_CONFIG.provisionalMatches) {
		return "provisional";
	}

	if (elo >= RIVALRY_CONFIG.tiers.topMinElo) {
		return "top";
	}

	if (elo >= RIVALRY_CONFIG.tiers.midMinElo) {
		return "mid";
	}

	return "bottom";
}

function getSessionsRelationValue(
	value: SessionRelation | SessionRelation[] | null,
): SessionRelation | null {
	if (!value) {
		return null;
	}

	return Array.isArray(value) ? value[0] || null : value;
}

function buildMissionId(
	type: MissionType,
	playerId: string,
	opponentId: string | null,
) {
	return `${type}:${playerId}:${opponentId || "none"}`;
}

function createBreakdown(
	basePriority: number,
	closeness: number,
	recency: number,
	realism: number,
	tierFit: number,
): MissionScoreBreakdown {
	return {
		basePriority,
		closeness,
		recency,
		realism,
		tierFit,
		total: basePriority + closeness + recency + realism + tierFit,
	};
}

function makeGapReference(player: MissionPlayer | null, gapElo: number): MissionGapReference | null {
	if (!player) {
		return null;
	}

	return {
		id: player.id,
		name: player.name,
		gapElo,
	};
}

function dedupeCandidates(candidates: MissionCandidate[]) {
	const candidateMap = new Map<string, MissionCandidate>();

	for (const candidate of candidates) {
		const existing = candidateMap.get(candidate.id);
		if (!existing || candidate.score > existing.score) {
			candidateMap.set(candidate.id, candidate);
		}
	}

	return Array.from(candidateMap.values());
}

function candidateToMission(candidate: MissionCandidate): GeneratedMission {
	return {
		id: candidate.id,
		type: candidate.type,
		priorityBucket: candidate.priorityBucket,
		title: candidate.title,
		body: candidate.body,
		opponentId: candidate.opponentId,
		opponentName: candidate.opponentName,
		basePriority: candidate.basePriority,
		score: candidate.score,
		scoreBreakdown: candidate.scoreBreakdown,
		reasoning: candidate.reasoning,
		metrics: candidate.metrics,
	};
}

async function listEligiblePlayers(adminClient: SupabaseClient) {
	const {
		data: { users },
		error: usersError,
	} = await adminClient.auth.admin.listUsers();

	if (usersError) {
		throw new Error(`Failed to fetch auth users: ${usersError.message}`);
	}

	const eligibleUsers = (users || [])
		.filter((user) => getUserRole(user as AuthUserRecord) !== "guest")
		.map((user) => user as AuthUserRecord);

	const playerIds = eligibleUsers.map((user) => user.id);
	if (playerIds.length === 0) {
		return [] as MissionPlayer[];
	}

	const [{ data: profiles, error: profilesError }, { data: ratings, error: ratingsError }] =
		await Promise.all([
			adminClient
				.from("profiles")
				.select("id, display_name, avatar_url")
				.in("id", playerIds),
			adminClient
				.from("player_ratings")
				.select("player_id, elo, matches_played")
				.in("player_id", playerIds),
		]);

	if (profilesError) {
		throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
	}

	if (ratingsError) {
		throw new Error(`Failed to fetch player ratings: ${ratingsError.message}`);
	}

	const profileMap = new Map(
		((profiles || []) as ProfileRecord[]).map((profile) => [profile.id, profile]),
	);
	const ratingsMap = new Map(
		((ratings || []) as RatingRecord[]).map((rating) => [rating.player_id, rating]),
	);

	const players = eligibleUsers
		.map((user) => {
			const profile = profileMap.get(user.id);
			const rating = ratingsMap.get(user.id);
			const name =
				profile?.display_name ||
				(typeof user.user_metadata?.display_name === "string"
					? user.user_metadata.display_name
					: typeof user.user_metadata?.name === "string"
						? user.user_metadata.name
						: user.email?.split("@")[0]) ||
				"User";
			const avatarUrl =
				profile?.avatar_url ||
				(typeof user.user_metadata?.avatar_url === "string"
					? user.user_metadata.avatar_url
					: null);
			const elo = toNumber(rating?.elo, 1500);
			const matchesPlayed = rating?.matches_played ?? 0;

			return {
				id: user.id,
				name,
				avatarUrl,
				elo,
				matchesPlayed,
				rank: 0,
				tier: "bottom" as PlayerTier,
			};
		})
		.sort((a, b) => {
			if (b.elo !== a.elo) {
				return b.elo - a.elo;
			}
			if (b.matchesPlayed !== a.matchesPlayed) {
				return b.matchesPlayed - a.matchesPlayed;
			}
			return a.name.localeCompare(b.name, "sr-Latn-RS");
		})
		.map((player, index) => ({
			...player,
			rank: index + 1,
			tier: getTier(player.elo, player.matchesPlayed),
		}));

	return players;
}

async function loadPairStats(
	adminClient: SupabaseClient,
	playerIds: Set<string>,
) {
	const { data, error } = await adminClient
		.from("session_matches")
		.select(
			`
				id,
				player_ids,
				team1_score,
				team2_score,
				sessions!inner (
					completed_at,
					created_at
				)
			`,
		)
		.eq("match_type", "singles")
		.eq("status", "completed");

	if (error) {
		throw new Error(`Failed to fetch completed singles matches: ${error.message}`);
	}

	const pairMap = new Map<string, PairStats>();

	for (const row of (data || []) as SinglesMatchRow[]) {
		if (!Array.isArray(row.player_ids) || row.player_ids.length < 2) {
			continue;
		}

		const [player1Id, player2Id] = row.player_ids;
		if (!playerIds.has(player1Id) || !playerIds.has(player2Id)) {
			continue;
		}

		const sessionRecord = getSessionsRelationValue(row.sessions);
		const playedAt =
			sessionRecord?.completed_at ||
			sessionRecord?.created_at ||
			new Date().toISOString();
		const team1Score = row.team1_score ?? 0;
		const team2Score = row.team2_score ?? 0;
		const winnerId =
			team1Score === team2Score
				? null
				: team1Score > team2Score
					? player1Id
					: player2Id;
		const loserId =
			winnerId === null
				? null
				: winnerId === player1Id
					? player2Id
					: player1Id;
		const key = getPairKey(player1Id, player2Id);
		const pair = pairMap.get(key) || {
			playerAId: [player1Id, player2Id].sort()[0],
			playerBId: [player1Id, player2Id].sort()[1],
			matches: [],
		};

		pair.matches.push({
			matchId: row.id,
			playedAt,
			player1Id,
			player2Id,
			team1Score,
			team2Score,
			winnerId,
			loserId,
			setMargin: Math.abs(team1Score - team2Score),
		});

		pairMap.set(key, pair);
	}

	for (const pair of pairMap.values()) {
		pair.matches.sort(
			(a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime(),
		);
	}

	return pairMap;
}

function getPerspectiveStats(
	pairStats: PairStats,
	playerId: string,
	opponentId: string,
): PerspectivePairStats {
	let wins = 0;
	let losses = 0;
	let draws = 0;
	let latestLossStreak = 0;
	let latestWinStreak = 0;
	let recentCloseLossInStreak = false;
	let countingLosses = true;
	let countingWins = true;

	for (const match of pairStats.matches) {
		if (match.winnerId === null) {
			draws += 1;
			countingLosses = false;
			countingWins = false;
			continue;
		}

		if (match.winnerId === playerId) {
			wins += 1;
			if (countingWins) {
				latestWinStreak += 1;
			}
			countingLosses = false;
			continue;
		}

		if (match.loserId === playerId && match.winnerId === opponentId) {
			losses += 1;
			if (countingLosses) {
				latestLossStreak += 1;
				if (match.setMargin <= 1) {
					recentCloseLossInStreak = true;
				}
			}
			countingWins = false;
		}
	}

	return {
		opponentId,
		totalMatches: pairStats.matches.length,
		wins,
		losses,
		draws,
		winGap: Math.abs(wins - losses),
		lastPlayedAt: pairStats.matches[0]?.playedAt || null,
		latestLossStreak,
		latestWinStreak,
		recentCloseLossInStreak,
	};
}

function buildCandidate(
	type: MissionType,
	player: MissionPlayer,
	opponent: MissionPlayer,
	priorityBucket: MissionPriorityBucket,
	breakdown: MissionScoreBreakdown,
	title: string,
	body: string,
	reasoning: string[],
	metrics: Record<string, number | string | boolean | null>,
): MissionCandidate {
	return {
		id: buildMissionId(type, player.id, opponent.id),
		type,
		priorityBucket,
		title,
		body,
		opponentId: opponent.id,
		opponentName: opponent.name,
		basePriority: breakdown.basePriority,
		score: breakdown.total,
		scoreBreakdown: breakdown,
		reasoning,
		metrics,
		selected: false,
	};
}

function createClimbCandidate(
	player: MissionPlayer,
	opponent: MissionPlayer,
	lastPlayedAt: string | null,
	now: Date,
) {
	const gapElo = Math.max(0, Math.round(opponent.elo - player.elo));
	const basePriority = getBasePriority("climb_rank", player.tier);
	const closeness = Math.max(0, RIVALRY_CONFIG.gaps.realisticElo - gapElo);
	const recency = getRecencyScore(lastPlayedAt, now);
	const realism = gapElo <= RIVALRY_CONFIG.gaps.closeElo ? 12 : gapElo <= RIVALRY_CONFIG.gaps.defendElo ? 7 : 2;
	const tierFit =
		player.tier === "mid"
			? 10
			: player.tier === "bottom" || player.tier === "provisional"
				? 12
				: 5;
	const breakdown = createBreakdown(
		basePriority,
		closeness,
		recency,
		realism,
		tierFit,
	);

	return buildCandidate(
		"climb_rank",
		player,
		opponent,
		"competitive",
		breakdown,
		`Stigni ${opponent.name}`,
		`${opponent.name} je ${gapElo} Elo ispred tebe. Jedan dobar termin može ozbiljno da zatvori taj minus.`,
		[
			`Najbliži igrač iznad tebe na tabeli.`,
			`Elo razlika je ${gapElo}.`,
			lastPlayedAt
				? `Poslednji duel je bio skoro, pa je priča i dalje živa.`
				: `Nemate skoro odigran duel, ali Elo razlika je dovoljno mala.`,
		],
		{
			gapElo,
			lastPlayedAt,
			opponentRank: opponent.rank,
		},
	);
}

function createDefendCandidate(
	player: MissionPlayer,
	opponent: MissionPlayer,
	lastPlayedAt: string | null,
	now: Date,
) {
	const gapElo = Math.max(0, Math.round(player.elo - opponent.elo));
	const basePriority = getBasePriority("defend_rank", player.tier);
	const closeness = Math.max(0, RIVALRY_CONFIG.gaps.defendElo - gapElo);
	const recency = getRecencyScore(lastPlayedAt, now);
	const realism = gapElo <= RIVALRY_CONFIG.gaps.closeElo ? 10 : 4;
	const tierFit =
		player.tier === "top" ? 12 : player.tier === "mid" ? 7 : 3;
	const breakdown = createBreakdown(
		basePriority,
		closeness,
		recency,
		realism,
		tierFit,
	);

	return buildCandidate(
		"defend_rank",
		player,
		opponent,
		"competitive",
		breakdown,
		`Zadrži prednost nad ${opponent.name}`,
		`${opponent.name} je ${gapElo} Elo iza tebe. Ako nastavi dobar niz, razlika može brzo da se istopi.`,
		[
			`Najbliži pratilac ispod tebe na tabeli.`,
			`Elo razlika je ${gapElo}.`,
			`Ovo je misija odbrane pozicije, ne jurcanje za vrhom.`,
		],
		{
			gapElo,
			lastPlayedAt,
			opponentRank: opponent.rank,
		},
	);
}

function createSettleScoreCandidate(
	player: MissionPlayer,
	opponent: MissionPlayer,
	pairStats: PerspectivePairStats,
	now: Date,
) {
	const gapElo = Math.abs(Math.round(player.elo - opponent.elo));
	const basePriority = getBasePriority("settle_score", player.tier);
	const closeness = pairStats.winGap === 0 ? 18 : 14;
	const recency = getRecencyScore(pairStats.lastPlayedAt, now);
	const realism = Math.max(4, 10 - Math.floor(gapElo / 10)) + Math.min(pairStats.totalMatches, 8);
	const tierFit =
		player.tier === "mid" || player.tier === "bottom" ? 8 : 4;
	const breakdown = createBreakdown(
		basePriority,
		closeness,
		recency,
		realism,
		tierFit,
	);

	return buildCandidate(
		"settle_score",
		player,
		opponent,
		"story",
		breakdown,
		`Reši duel sa ${opponent.name}`,
		`Protiv ${opponent.name} si na ${pairStats.wins}-${pairStats.losses}. Sledeći meč može da okrene rivalstvo.`,
		[
			`Rivalstvo je tesno na ${pairStats.wins}-${pairStats.losses}.`,
			`Odigrali ste ${pairStats.totalMatches} singl mečeva.`,
			`Mala Elo razlika drži ovu priču realnom.`,
		],
		{
			totalMatches: pairStats.totalMatches,
			wins: pairStats.wins,
			losses: pairStats.losses,
			draws: pairStats.draws,
			winGap: pairStats.winGap,
			gapElo,
			lastPlayedAt: pairStats.lastPlayedAt,
		},
	);
}

function createBreakStreakCandidate(
	player: MissionPlayer,
	opponent: MissionPlayer,
	pairStats: PerspectivePairStats,
	now: Date,
) {
	const gapElo = Math.abs(Math.round(player.elo - opponent.elo));
	const basePriority = getBasePriority("break_streak", player.tier);
	const closeness = Math.max(0, RIVALRY_CONFIG.gaps.breakStreakMaxElo - gapElo);
	const recency = getRecencyScore(pairStats.lastPlayedAt, now);
	const realism =
		pairStats.recentCloseLossInStreak
			? 14
			: gapElo <= RIVALRY_CONFIG.gaps.defendElo
				? 8
				: 3;
	const tierFit =
		player.tier === "bottom" || player.tier === "provisional" ? 10 : 5;
	const breakdown = createBreakdown(
		basePriority,
		closeness,
		recency,
		realism + pairStats.latestLossStreak * 4,
		tierFit,
	);

	return buildCandidate(
		"break_streak",
		player,
		opponent,
		"story",
		breakdown,
		`Prekini niz protiv ${opponent.name}`,
		`Vezao si ${pairStats.latestLossStreak} poraza protiv ${opponent.name}. Sledeći meč je prilika da presečeš taj niz.`,
		[
			`Trenutni niz poraza: ${pairStats.latestLossStreak}.`,
			pairStats.recentCloseLossInStreak
				? `U nizu postoji bar jedan tesan poraz, pa misija nije nerealna.`
				: `Niz je dug, ali Elo razlika je i dalje uhvatljiva.`,
			`Ovo je čista priča za povratak u ritam.`,
		],
		{
			lossStreak: pairStats.latestLossStreak,
			recentCloseLossInStreak: pairStats.recentCloseLossInStreak,
			gapElo,
			lastPlayedAt: pairStats.lastPlayedAt,
		},
	);
}

function createCloseGapCandidate(
	player: MissionPlayer,
	opponent: MissionPlayer,
	lastPlayedAt: string | null,
	now: Date,
) {
	const gapElo = Math.abs(Math.round(player.elo - opponent.elo));
	if (gapElo > RIVALRY_CONFIG.gaps.realisticElo) {
		return null;
	}

	const direction = opponent.elo >= player.elo ? "ispred" : "iza";
	const basePriority = getBasePriority("close_gap", player.tier);
	const closeness = Math.max(0, RIVALRY_CONFIG.gaps.realisticElo - gapElo);
	const recency = getRecencyScore(lastPlayedAt, now);
	const realism = gapElo <= RIVALRY_CONFIG.gaps.closeElo ? 12 : 7;
	const tierFit =
		player.tier === "bottom" || player.tier === "provisional" ? 12 : 6;
	const breakdown = createBreakdown(
		basePriority,
		closeness,
		recency,
		realism,
		tierFit,
	);

	return buildCandidate(
		"close_gap",
		player,
		opponent,
		"fallback",
		breakdown,
		`Najbliža meta: ${opponent.name}`,
		`${opponent.name} je ${gapElo} Elo ${direction} tebe. To je trenutno najbliža swing priča na tabeli.`,
		[
			`Najmanja Elo razlika koju trenutno imaš.`,
			`Ovo je fallback misija kada nema jače priče.`,
		],
		{
			gapElo,
			direction,
			lastPlayedAt,
			opponentRank: opponent.rank,
		},
	);
}

function selectMissions(candidates: MissionCandidate[]) {
	const sorted = [...candidates].sort((a, b) => {
		if (b.score !== a.score) {
			return b.score - a.score;
		}
		return a.title.localeCompare(b.title, "sr-Latn-RS");
	});

	const selected: MissionCandidate[] = [];
	const trySelect = (candidate: MissionCandidate | undefined) => {
		if (!candidate) {
			return;
		}
		if (selected.length >= RIVALRY_CONFIG.maxMissionsPerPlayer) {
			return;
		}
		if (
			selected.some(
				(item) =>
					item.type === candidate.type ||
					(item.opponentId !== null &&
						item.opponentId === candidate.opponentId),
			)
		) {
			return;
		}
		selected.push(candidate);
	};

	trySelect(sorted.find((candidate) => candidate.priorityBucket === "competitive"));
	trySelect(sorted.find((candidate) => candidate.priorityBucket === "story"));

	for (const candidate of sorted) {
		trySelect(candidate);
	}

	const selectedIds = new Set(selected.map((candidate) => candidate.id));

	return {
		missions: selected.map(candidateToMission),
		candidates: sorted.map((candidate) => ({
			...candidate,
			selected: selectedIds.has(candidate.id),
		})),
	};
}

function buildPlayerSnapshot(
	player: MissionPlayer,
	roster: MissionPlayer[],
	pairMap: Map<string, PairStats>,
	generatedAt: string,
	generatedReason: string,
	generatedBy: string | null,
	now: Date,
): PersistedSnapshotRow {
	const playerIndex = player.rank - 1;
	const above = playerIndex > 0 ? roster[playerIndex - 1] : null;
	const below = playerIndex < roster.length - 1 ? roster[playerIndex + 1] : null;
	const closestAboveGap = above ? Math.max(0, Math.round(above.elo - player.elo)) : 0;
	const closestBelowGap = below ? Math.max(0, Math.round(player.elo - below.elo)) : 0;
	const context: MissionSnapshotContext = {
		closestAbove: makeGapReference(above, closestAboveGap),
		closestBelow: makeGapReference(below, closestBelowGap),
	};

	const candidates: MissionCandidate[] = [];

	if (above) {
		const pair = pairMap.get(getPairKey(player.id, above.id));
		const pairPerspective = pair
			? getPerspectiveStats(pair, player.id, above.id)
			: null;
		candidates.push(
			createClimbCandidate(
				player,
				above,
				pairPerspective?.lastPlayedAt || null,
				now,
			),
		);
	}

	if (
		below &&
		closestBelowGap <= RIVALRY_CONFIG.gaps.defendEligibleElo
	) {
		const pair = pairMap.get(getPairKey(player.id, below.id));
		const pairPerspective = pair
			? getPerspectiveStats(pair, player.id, below.id)
			: null;
		candidates.push(
			createDefendCandidate(
				player,
				below,
				pairPerspective?.lastPlayedAt || null,
				now,
			),
		);
	}

	for (const opponent of roster) {
		if (opponent.id === player.id) {
			continue;
		}

		const pair = pairMap.get(getPairKey(player.id, opponent.id));
		if (!pair) {
			continue;
		}

		const perspective = getPerspectiveStats(pair, player.id, opponent.id);

		if (
			perspective.totalMatches >= RIVALRY_CONFIG.rivalry.minMatches &&
			perspective.winGap <= RIVALRY_CONFIG.rivalry.maxWinGap
		) {
			candidates.push(
				createSettleScoreCandidate(player, opponent, perspective, now),
			);
		}

		if (
			perspective.latestLossStreak >= RIVALRY_CONFIG.rivalry.minBreakStreak &&
			(Math.abs(player.elo - opponent.elo) <=
				RIVALRY_CONFIG.gaps.breakStreakMaxElo ||
				perspective.recentCloseLossInStreak)
		) {
			candidates.push(
				createBreakStreakCandidate(player, opponent, perspective, now),
			);
		}
	}

	const fallbackOpponents = [above, below]
		.filter((opponent): opponent is MissionPlayer => Boolean(opponent))
		.sort(
			(left, right) =>
				Math.abs(player.elo - left.elo) - Math.abs(player.elo - right.elo),
		);

	for (const opponent of fallbackOpponents) {
		const pair = pairMap.get(getPairKey(player.id, opponent.id));
		const lastPlayedAt = pair
			? getPerspectiveStats(pair, player.id, opponent.id).lastPlayedAt
			: null;
		const candidate = createCloseGapCandidate(
			player,
			opponent,
			lastPlayedAt,
			now,
		);
		if (candidate) {
			candidates.push(candidate);
		}
	}

	if (candidates.length < RIVALRY_CONFIG.maxMissionsPerPlayer) {
		const nearestOpponents = roster
			.filter((opponent) => opponent.id !== player.id)
			.sort(
				(left, right) =>
					Math.abs(player.elo - left.elo) - Math.abs(player.elo - right.elo),
			)
			.slice(0, 3);

		for (const opponent of nearestOpponents) {
			const pair = pairMap.get(getPairKey(player.id, opponent.id));
			const lastPlayedAt = pair
				? getPerspectiveStats(pair, player.id, opponent.id).lastPlayedAt
				: null;
			const candidate = createCloseGapCandidate(
				player,
				opponent,
				lastPlayedAt,
				now,
			);
			if (candidate) {
				candidates.push(candidate);
			}
		}
	}

	const dedupedCandidates = dedupeCandidates(candidates);
	const { missions, candidates: decoratedCandidates } =
		selectMissions(dedupedCandidates);

	return {
		player_id: player.id,
		player_name: player.name,
		player_avatar_url: player.avatarUrl,
		player_elo: Number(player.elo.toFixed(2)),
		player_rank: player.rank,
		matches_played: player.matchesPlayed,
		player_tier: player.tier,
		generated_at: generatedAt,
		generated_reason: generatedReason,
		generated_by: generatedBy,
		missions,
		candidates: decoratedCandidates,
		context,
	};
}

function mapSnapshotRowToSnapshot(row: PersistedSnapshotRow): MissionSnapshot {
	return {
		playerId: row.player_id,
		playerName: row.player_name,
		playerAvatarUrl: row.player_avatar_url,
		playerElo: toNumber(row.player_elo, 1500),
		playerRank: row.player_rank,
		matchesPlayed: row.matches_played,
		playerTier: row.player_tier,
		generatedAt: row.generated_at,
		generatedReason: row.generated_reason,
		generatedBy: row.generated_by,
		missions: row.missions || [],
		candidates: row.candidates || [],
		context: row.context || {
			closestAbove: null,
			closestBelow: null,
		},
	};
}

export async function generateAndStoreMissionSnapshots(options?: {
	adminClient?: SupabaseClient;
	generatedBy?: string | null;
	reason?: string;
}) {
	const adminClient = options?.adminClient || createAdminClient();
	const generatedBy = options?.generatedBy || null;
	const reason = options?.reason || "manual";
	const generatedAt = new Date().toISOString();
	const now = new Date(generatedAt);
	const players = await listEligiblePlayers(adminClient);
	const playerIdSet = new Set(players.map((player) => player.id));

	if (players.length === 0) {
		await adminClient.from(SNAPSHOT_TABLE).delete().neq("player_id", "00000000-0000-0000-0000-000000000000");
		return [] as MissionSnapshot[];
	}

	const pairMap = await loadPairStats(adminClient, playerIdSet);
	const rows = players.map((player) =>
		buildPlayerSnapshot(
			player,
			players,
			pairMap,
			generatedAt,
			reason,
			generatedBy,
			now,
		),
	);

	const { data: existingRows, error: existingRowsError } = await adminClient
		.from(SNAPSHOT_TABLE)
		.select("player_id");

	if (existingRowsError) {
		throw new Error(
			`Failed to fetch existing mission snapshots: ${existingRowsError.message}`,
		);
	}

	const stalePlayerIds = (existingRows || [])
		.map((row) => row.player_id as string)
		.filter((playerId) => !playerIdSet.has(playerId));

	if (stalePlayerIds.length > 0) {
		const { error: deleteError } = await adminClient
			.from(SNAPSHOT_TABLE)
			.delete()
			.in("player_id", stalePlayerIds);

		if (deleteError) {
			throw new Error(
				`Failed to delete stale mission snapshots: ${deleteError.message}`,
			);
		}
	}

	const { error: upsertError } = await adminClient
		.from(SNAPSHOT_TABLE)
		.upsert(rows, { onConflict: "player_id" });

	if (upsertError) {
		throw new Error(`Failed to store mission snapshots: ${upsertError.message}`);
	}

	return rows.map(mapSnapshotRowToSnapshot);
}

export async function fetchMissionSnapshots(options?: {
	adminClient?: SupabaseClient;
}) {
	const adminClient = options?.adminClient || createAdminClient();
	const { data, error } = await adminClient
		.from(SNAPSHOT_TABLE)
		.select("*")
		.order("player_rank", { ascending: true });

	if (error) {
		throw new Error(`Failed to fetch mission snapshots: ${error.message}`);
	}

	return ((data || []) as PersistedSnapshotRow[]).map(mapSnapshotRowToSnapshot);
}

export async function fetchMissionSnapshotForPlayer(
	playerId: string,
	options?: { adminClient?: SupabaseClient },
) {
	const adminClient = options?.adminClient || createAdminClient();
	const { data, error } = await adminClient
		.from(SNAPSHOT_TABLE)
		.select("*")
		.eq("player_id", playerId)
		.maybeSingle();

	if (error) {
		throw new Error(`Failed to fetch player mission snapshot: ${error.message}`);
	}

	return data ? mapSnapshotRowToSnapshot(data as PersistedSnapshotRow) : null;
}

export async function ensureMissionSnapshotsFresh(options?: {
	adminClient?: SupabaseClient;
}) {
	const adminClient = options?.adminClient || createAdminClient();

	const [{ data: latestSnapshotRows, error: snapshotError }, { data: latestSessions, error: sessionError }] =
		await Promise.all([
			adminClient
				.from(SNAPSHOT_TABLE)
				.select("generated_at")
				.order("generated_at", { ascending: false })
				.limit(1),
			adminClient
				.from("sessions")
				.select("completed_at")
				.eq("status", "completed")
				.order("completed_at", { ascending: false })
				.limit(1),
		]);

	if (snapshotError) {
		throw new Error(
			`Failed to inspect mission snapshot freshness: ${snapshotError.message}`,
		);
	}

	if (sessionError) {
		throw new Error(
			`Failed to inspect latest completed session: ${sessionError.message}`,
		);
	}

	const latestGeneratedAt = latestSnapshotRows?.[0]?.generated_at
		? new Date(latestSnapshotRows[0].generated_at).getTime()
		: null;
	const latestCompletedAt = latestSessions?.[0]?.completed_at
		? new Date(latestSessions[0].completed_at).getTime()
		: null;

	if (latestGeneratedAt === null) {
		return generateAndStoreMissionSnapshots({
			adminClient,
			reason: "on_demand",
		});
	}

	if (
		latestCompletedAt !== null &&
		Number.isFinite(latestCompletedAt) &&
		latestCompletedAt > latestGeneratedAt
	) {
		return generateAndStoreMissionSnapshots({
			adminClient,
			reason: "auto",
		});
	}

	return fetchMissionSnapshots({ adminClient });
}
