export const SERBIAN_NAME_CASE_KEYS = [
	"genitive",
	"dative",
	"accusative",
	"vocative",
	"instrumental",
	"locative",
] as const;

export type SerbianNameCaseKey = (typeof SERBIAN_NAME_CASE_KEYS)[number];

export type SerbianNameCases = Record<SerbianNameCaseKey, string | null>;

export function getSerbianNameCase(
	nominative: string,
	nameCases: Partial<SerbianNameCases> | null | undefined,
	grammaticalCase: SerbianNameCaseKey,
) {
	const inflectedName = nameCases?.[grammaticalCase]?.trim();
	return inflectedName || nominative;
}
