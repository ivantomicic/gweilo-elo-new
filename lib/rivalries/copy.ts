import type { GeneratedMission, MissionCandidate } from "./types";
import { getSerbianNameCase } from "../serbian-name-cases";

type MissionLike = Pick<
	GeneratedMission | MissionCandidate,
	| "type"
	| "opponentName"
	| "opponentNameCases"
	| "metrics"
	| "title"
	| "body"
>;

function getNumberMetric(
	metrics: Record<string, number | string | boolean | null>,
	key: string,
	fallback = 0,
) {
	const value = metrics[key];
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	}
	return fallback;
}

function getStringMetric(
	metrics: Record<string, number | string | boolean | null>,
	key: string,
	fallback = "",
) {
	const value = metrics[key];
	return typeof value === "string" ? value : fallback;
}

export function renderMissionCopy(mission: MissionLike) {
	const opponentName = mission.opponentName || "Protivnik";
	const opponentGenitive = getSerbianNameCase(
		opponentName,
		mission.opponentNameCases,
		"genitive",
	);
	const opponentDative = getSerbianNameCase(
		opponentName,
		mission.opponentNameCases,
		"dative",
	);
	const opponentInstrumental = getSerbianNameCase(
		opponentName,
		mission.opponentNameCases,
		"instrumental",
	);
	const metrics = mission.metrics || {};
	const gapElo = getNumberMetric(metrics, "gapElo");

	switch (mission.type) {
		case "climb_rank":
			return {
				title: `Približi se ${opponentDative}`,
				body: `${opponentName} ima prednost od ${gapElo} Elo poena. Uozbilji se pred sledeći termin.`,
			};
		case "defend_rank":
			return {
				title: `Sačuvaj poziciju ispred ${opponentGenitive}`,
				body: `Imaš prednost od ${gapElo} Elo poena. Nemoj usrati sledeći termin.`,
			};
		case "settle_score":
			return {
				title: `Duel sa ${opponentInstrumental}`,
				body: `Međusobni rezultat je ${getNumberMetric(metrics, "wins")}–${getNumberMetric(metrics, "losses")}. Reguliši to na sledećem terminu.`,
			};
		case "break_streak":
			return {
				title: `Prekini niz protiv ${opponentGenitive}`,
				body: `${opponentName} ima niz od ${getNumberMetric(metrics, "lossStreak")} uzastopnih pobeda protiv tebe. Uozbilji se.`,
			};
		case "close_gap": {
			const direction = getStringMetric(metrics, "direction", "ispred");
			const isThreat = direction === "iza";
			return {
				title: isThreat
					? `Sačuvaj prednost ispred ${opponentGenitive}`
					: `Smanji razliku do ${opponentGenitive}`,
				body: isThreat
					? `Imaš prednost od ${gapElo} Elo poena. Nemoj da se osramotiš sledeći termin.`
					: `${opponentName} ima prednost od ${gapElo} Elo poena. Uozbilji se.`,
			};
		}
		default:
			return {
				title: mission.title || "Misija",
				body: mission.body || "",
			};
	}
}
