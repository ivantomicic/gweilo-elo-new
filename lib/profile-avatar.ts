export function getProviderAvatarFromMetadata(
	userMetadata: Record<string, unknown> | null | undefined
): string | null {
	const candidates = [
		userMetadata?.avatar_url_google,
		userMetadata?.picture,
		userMetadata?.avatar_url,
	];

	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			return candidate;
		}
	}

	return null;
}

export function getEffectiveAvatar(
	manualAvatarUrl: string | null | undefined,
	providerAvatarUrl: string | null | undefined
): string | null {
	return manualAvatarUrl || providerAvatarUrl || null;
}
