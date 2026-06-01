"use client";

type CacheEntry<T> = {
	data: T;
	cachedAt: number;
	version: number;
};

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function readStaleCache<T>(
	key: string,
	options?: { maxAgeMs?: number; version?: number },
) {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		const raw = window.localStorage.getItem(key);
		if (!raw) {
			return null;
		}

		const entry = JSON.parse(raw) as CacheEntry<T>;
		const expectedVersion = options?.version ?? 1;
		if (entry.version !== expectedVersion) {
			window.localStorage.removeItem(key);
			return null;
		}

		const maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
		if (Date.now() - entry.cachedAt > maxAgeMs) {
			window.localStorage.removeItem(key);
			return null;
		}

		return entry.data;
	} catch {
		return null;
	}
}

export function writeStaleCache<T>(
	key: string,
	data: T,
	options?: { version?: number },
) {
	if (typeof window === "undefined") {
		return;
	}

	try {
		const entry: CacheEntry<T> = {
			data,
			cachedAt: Date.now(),
			version: options?.version ?? 1,
		};
		window.localStorage.setItem(key, JSON.stringify(entry));
	} catch {
		// Ignore storage quota/private-mode failures.
	}
}
