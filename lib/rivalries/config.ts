import type { MissionType, PlayerTier } from "@/lib/rivalries/types";

export const RIVALRY_CONFIG = {
	provisionalMatches: 8,
	tiers: {
		topMinElo: 1600,
		midMinElo: 1400,
	},
	gaps: {
		closeElo: 18,
		defendElo: 30,
		defendEligibleElo: 45,
		realisticElo: 55,
		breakStreakMaxElo: 60,
	},
	rivalry: {
		minMatches: 3,
		maxWinGap: 1,
		minBreakStreak: 3,
		maxBreakStreak: 5,
	},
	recency: {
		hotDays: 14,
		warmDays: 30,
		coolDays: 60,
	},
	maxMissionsPerPlayer: 2,
	basePriority: {
		climb_rank: {
			provisional: 72,
			top: 82,
			mid: 86,
			bottom: 84,
		},
		defend_rank: {
			provisional: 54,
			top: 88,
			mid: 78,
			bottom: 60,
		},
		settle_score: {
			provisional: 68,
			top: 74,
			mid: 78,
			bottom: 80,
		},
		break_streak: {
			provisional: 74,
			top: 70,
			mid: 74,
			bottom: 78,
		},
		close_gap: {
			provisional: 78,
			top: 60,
			mid: 66,
			bottom: 74,
		},
	} satisfies Record<MissionType, Record<PlayerTier, number>>,
} as const;

export function getBasePriority(type: MissionType, tier: PlayerTier) {
	return RIVALRY_CONFIG.basePriority[type][tier];
}
