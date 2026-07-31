import type { GeneratedMission, MissionCandidate } from "./types";

type MissionLike = Pick<
	GeneratedMission | MissionCandidate,
	"type" | "opponentName" | "metrics" | "title" | "body"
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
	const metrics = mission.metrics || {};
	const gapElo = getNumberMetric(metrics, "gapElo");

	switch (mission.type) {
		case "climb_rank":
			return {
				title: `Približi se igraču ${opponentName}`,
				body: `${opponentName} ima prednost od ${gapElo} Elo poena. Cilj je da smanjiš razliku.`,
			};
		case "defend_rank":
			return {
				title: `Sačuvaj poziciju ispred ${opponentName}`,
				body: `Imaš prednost od ${gapElo} Elo poena. Cilj je da je zadržiš.`,
			};
		case "settle_score":
			return {
				title: `Duel sa ${opponentName}`,
				body: `Međusobni rezultat je ${getNumberMetric(metrics, "wins")}–${getNumberMetric(metrics, "losses")}. Cilj je da popraviš svoj rezultat u narednom meču.`,
			};
		case "break_streak":
			return {
				title: `Niz za prekid: ${opponentName}`,
				body: `${opponentName} ima niz od ${getNumberMetric(metrics, "lossStreak")} uzastopnih pobeda protiv tebe. Cilj je da prekineš niz.`,
			};
		case "close_gap": {
			const direction = getStringMetric(metrics, "direction", "ispred");
			const isThreat = direction === "iza";
			return {
				title: isThreat
					? `Sačuvaj prednost ispred ${opponentName}`
					: `Smanji razliku do ${opponentName}`,
				body: isThreat
					? `Imaš prednost od ${gapElo} Elo poena. Cilj je da je zadržiš.`
					: `${opponentName} ima prednost od ${gapElo} Elo poena. Cilj je da smanjiš razliku.`,
			};
		}
		default:
			return {
				title: mission.title || "Misija",
				body: mission.body || "",
			};
	}
}
