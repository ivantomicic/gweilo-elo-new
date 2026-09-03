"use client";

import {
	createContext,
	createElement,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import { useAuth } from "@/lib/auth/useAuth";

export type ActiveSession = {
	id: string;
	player_count: number;
	created_at: string;
	status: "active";
	current_round: number;
	total_rounds: number;
	singles_match_count: number;
	doubles_match_count: number;
};

const ACTIVE_SESSION_REFRESH_INTERVAL_MS = 15_000;

type ActiveSessionContextValue = {
	activeSession: ActiveSession | null;
	loading: boolean;
	error: string | null;
	refresh: (options?: {
		showLoading?: boolean;
		signal?: AbortSignal;
	}) => Promise<void>;
};

const ActiveSessionContext = createContext<ActiveSessionContextValue | null>(
	null,
);

export function ActiveSessionProvider({ children }: { children: ReactNode }) {
	const { isAuthenticated } = useAuth();
	const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const latestRequestID = useRef(0);

	const refresh = useCallback(
		async (options?: { showLoading?: boolean; signal?: AbortSignal }) => {
			const requestID = ++latestRequestID.current;
			if (!isAuthenticated) {
				setActiveSession(null);
				setLoading(false);
				setError(null);
				return;
			}

			if (options?.showLoading) {
				setLoading(true);
			}

			try {
				const response = await authenticatedFetch("/api/sessions/active", {
					cache: "no-store",
					signal: options?.signal,
				});

				if (!response.ok) {
					throw new Error(
						response.status === 401
							? "Authentication could not be refreshed."
							: "Could not check the active session.",
					);
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
				setActiveSession(null);
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
		[isAuthenticated],
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

	const value = useMemo<ActiveSessionContextValue>(
		() => ({
			activeSession,
			loading,
			error,
			refresh,
		}),
		[activeSession, error, loading, refresh],
	);

	return createElement(ActiveSessionContext.Provider, { value }, children);
}

export function useActiveSession() {
	const context = useContext(ActiveSessionContext);

	if (!context) {
		throw new Error(
			"useActiveSession must be used within ActiveSessionProvider",
		);
	}

	return context;
}
