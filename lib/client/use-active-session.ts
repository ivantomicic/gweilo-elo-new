"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/useAuth";

export type ActiveSession = {
	id: string;
	player_count: number;
	created_at: string;
	status: "active";
};

const ACTIVE_SESSION_REFRESH_INTERVAL_MS = 15_000;

export function useActiveSession() {
	const { isAuthenticated, session } = useAuth();
	const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const latestRequestID = useRef(0);

	const refresh = useCallback(
		async (options?: { showLoading?: boolean; signal?: AbortSignal }) => {
			const requestID = ++latestRequestID.current;
			if (!isAuthenticated || !session) {
				setActiveSession(null);
				setLoading(false);
				setError(null);
				return;
			}

			if (options?.showLoading) {
				setLoading(true);
			}

			try {
				const response = await fetch("/api/sessions/active", {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
					cache: "no-store",
					signal: options?.signal,
				});

				if (!response.ok) {
					throw new Error("Could not check the active session.");
				}

				const body = (await response.json()) as {
					session?: ActiveSession | null;
				};
				if (requestID !== latestRequestID.current) return;
				setActiveSession(body.session ?? null);
				setError(null);
			} catch (refreshError) {
				if (
					options?.signal?.aborted ||
					requestID !== latestRequestID.current
				) {
					return;
				}
				setError(
					refreshError instanceof Error
						? refreshError.message
						: "Could not check the active session.",
				);
			} finally {
				if (
					!options?.signal?.aborted &&
					requestID === latestRequestID.current
				) {
					setLoading(false);
				}
			}
		},
		[isAuthenticated, session],
	);

	useEffect(() => {
		const controller = new AbortController();
		const refreshIfVisible = () => {
			if (document.visibilityState === "visible") {
				void refresh({ signal: controller.signal });
			}
		};

		void refresh({ showLoading: true, signal: controller.signal });
		window.addEventListener("focus", refreshIfVisible);
		document.addEventListener("visibilitychange", refreshIfVisible);
		const intervalID = window.setInterval(
			refreshIfVisible,
			ACTIVE_SESSION_REFRESH_INTERVAL_MS,
		);

		return () => {
			controller.abort();
			window.clearInterval(intervalID);
			window.removeEventListener("focus", refreshIfVisible);
			document.removeEventListener("visibilitychange", refreshIfVisible);
		};
	}, [refresh]);

	return {
		activeSession,
		loading,
		error,
		refresh,
	};
}
