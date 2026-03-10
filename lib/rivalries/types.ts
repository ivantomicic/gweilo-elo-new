export type PlayerTier = "provisional" | "top" | "mid" | "bottom";

export type MissionType =
	| "climb_rank"
	| "defend_rank"
	| "settle_score"
	| "break_streak"
	| "close_gap";

export type MissionPriorityBucket = "competitive" | "story" | "fallback";

export type MissionScoreBreakdown = {
	basePriority: number;
	closeness: number;
	recency: number;
	realism: number;
	tierFit: number;
	total: number;
};

export type MissionGapReference = {
	id: string;
	name: string;
	gapElo: number;
};

export type MissionCandidate = {
	id: string;
	type: MissionType;
	priorityBucket: MissionPriorityBucket;
	title: string;
	body: string;
	opponentId: string | null;
	opponentName: string | null;
	basePriority: number;
	score: number;
	scoreBreakdown: MissionScoreBreakdown;
	reasoning: string[];
	metrics: Record<string, number | string | boolean | null>;
	selected: boolean;
};

export type GeneratedMission = Omit<MissionCandidate, "selected">;

export type MissionSnapshotContext = {
	closestAbove: MissionGapReference | null;
	closestBelow: MissionGapReference | null;
};

export type MissionSnapshot = {
	playerId: string;
	playerName: string;
	playerAvatarUrl: string | null;
	playerElo: number;
	playerRank: number;
	matchesPlayed: number;
	playerTier: PlayerTier;
	generatedAt: string;
	generatedReason: string;
	generatedBy: string | null;
	missions: GeneratedMission[];
	candidates: MissionCandidate[];
	context: MissionSnapshotContext;
};
