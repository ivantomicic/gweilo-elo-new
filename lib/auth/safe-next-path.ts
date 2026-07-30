const SAFE_ORIGIN = "https://gweilo.local";

export function getSafeNextPath(
	value: string | null | undefined,
	fallback = "/",
) {
	if (!value?.startsWith("/") || value.startsWith("//")) {
		return fallback;
	}

	try {
		const resolved = new URL(value, SAFE_ORIGIN);
		if (resolved.origin !== SAFE_ORIGIN) {
			return fallback;
		}

		return `${resolved.pathname}${resolved.search}${resolved.hash}`;
	} catch {
		return fallback;
	}
}
