import { RIVALRY_CONFIG } from "./config";
import type {
	GeneratedMission,
	MissionCandidate,
} from "./types";

function missionIdentity(
	mission: Pick<GeneratedMission | MissionCandidate, "type" | "opponentId">,
) {
	return `${mission.type}:${mission.opponentId || "none"}`;
}

export function dedupeMissionCandidates(candidates: MissionCandidate[]) {
	const candidateMap = new Map<string, MissionCandidate>();

	for (const candidate of candidates) {
		const key = missionIdentity(candidate);
		const existing = candidateMap.get(key);
		if (!existing || candidate.score > existing.score) {
			candidateMap.set(key, candidate);
		}
	}

	return Array.from(candidateMap.values());
}

function candidateToMission(candidate: MissionCandidate): GeneratedMission {
	const { selected: _selected, ...mission } = candidate;
	return mission;
}

/**
 * Select a small, varied set of missions. A player never receives two cards
 * about the same opponent or two cards with the same objective type.
 */
export function selectMissionCandidates(candidates: MissionCandidate[]) {
	const sorted = [...dedupeMissionCandidates(candidates)].sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		return a.title.localeCompare(b.title, "sr-Latn-RS");
	});

	const selected: MissionCandidate[] = [];
	const trySelect = (candidate: MissionCandidate | undefined) => {
		if (!candidate || selected.length >= RIVALRY_CONFIG.maxMissionsPerPlayer) {
			return;
		}

		if (
			selected.some(
				(item) =>
					item.type === candidate.type ||
					(item.opponentId !== null && item.opponentId === candidate.opponentId),
			)
		) {
			return;
		}

		selected.push(candidate);
	};

	trySelect(sorted.find((candidate) => candidate.priorityBucket === "competitive"));
	trySelect(sorted.find((candidate) => candidate.priorityBucket === "story"));
	for (const candidate of sorted) trySelect(candidate);

	const selectedIds = new Set(selected.map((candidate) => candidate.id));
	return {
		missions: selected.map(candidateToMission),
		candidates: sorted.map((candidate) => ({
			...candidate,
			selected: selectedIds.has(candidate.id),
		})),
	};
}

/** Remove duplicate legacy rows before they reach the homepage. */
export function sanitizeStoredMissions(missions: GeneratedMission[]) {
	const seenIdentities = new Set<string>();
	const seenTypes = new Set<string>();
	const seenOpponents = new Set<string>();

	return missions.filter((mission) => {
		const identity = missionIdentity(mission);
		if (
			seenIdentities.has(identity) ||
			seenTypes.has(mission.type) ||
			(mission.opponentId !== null && seenOpponents.has(mission.opponentId))
		) {
			return false;
		}

		seenIdentities.add(identity);
		seenTypes.add(mission.type);
		if (mission.opponentId !== null) seenOpponents.add(mission.opponentId);
		return true;
	}).slice(0, RIVALRY_CONFIG.maxMissionsPerPlayer);
}
