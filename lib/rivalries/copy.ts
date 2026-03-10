import type { GeneratedMission, MissionCandidate } from "@/lib/rivalries/types";
import { RIVALRY_CONFIG } from "@/lib/rivalries/config";

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
				title: `Ispred tebe: ${opponentName}`,
				body:
					gapElo <= RIVALRY_CONFIG.gaps.closeElo
						? `${opponentName} je ${gapElo} Elo ispred tebe. Jedan dobar termin može ozbiljno da preokrene tabelu.`
						: `${opponentName} je ${gapElo} Elo ispred tebe. Jedan dobar termin može ozbiljno da zatvori taj minus.`,
			};
		case "defend_rank":
			return {
				title: `Iza tebe: ${opponentName}`,
				body: `${opponentName} je ${gapElo} Elo iza tebe. Ako nastavi dobar niz, razlika može brzo da se istopi.`,
			};
		case "settle_score":
			return {
				title: `Rivalstvo: ${opponentName}`,
				body: `Skor u ovom duelu je ${getNumberMetric(metrics, "wins")}-${getNumberMetric(metrics, "losses")}. Sledeći meč može ozbiljno da promeni odnos snaga.`,
			};
		case "break_streak":
			return {
				title: `Niz za prekid: ${opponentName}`,
				body: `Trenutni niz je ${getNumberMetric(metrics, "lossStreak")} poraza zaredom. Sledeći meč je prilika da ga prekineš.`,
			};
		case "close_gap": {
			const direction = getStringMetric(metrics, "direction", "ispred");
			const isThreat = direction === "iza";
			return {
				title: isThreat
					? `Najveća pretnja: ${opponentName}`
					: `Najbliža meta: ${opponentName}`,
				body: isThreat
					? `${opponentName} je ${gapElo} Elo iza tebe. Jedan dobar termin ga vraća ozbiljno u priču.`
					: `${opponentName} je ${gapElo} Elo ispred tebe. To je trenutno najbliža uhvatljiva meta na tabeli.`,
			};
		}
		default:
			return {
				title: mission.title || "Misija",
				body: mission.body || "",
			};
	}
}
