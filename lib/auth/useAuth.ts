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
} from "react";
import type { ReactNode } from "react";
import {
	isAuthRetryableFetchError,
	type Session,
} from "@supabase/supabase-js";
import {
	getEffectiveAvatar,
	getProviderAvatarFromMetadata,
} from "@/lib/profile-avatar";
import { supabase } from "@/lib/supabase/client";
import {
	getUserRoleFromAuthUser,
	isPlatformAccessDisabled,
	type UserRole,
} from "./roles";

export type AuthUser = {
	id: string;
	name: string;
	nameVocative?: string | null;
	email: string;
	avatar: string | null;
	role: UserRole;
};

type AuthContextValue = {
	isAuthenticated: boolean | null;
	session: Session | null;
	user: AuthUser | null;
	role: UserRole | null;
	refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function getUserFromSession(session: Session): Promise<AuthUser> {
	const user = session.user;
	const { data: profile } = await supabase
		.from("profiles")
		.select("display_name, avatar_url, name_vocative")
		.eq("id", user.id)
		.maybeSingle();

	const name =
		profile?.display_name ||
		user.user_metadata?.display_name ||
		user.user_metadata?.name ||
		user.user_metadata?.full_name ||
		user.email?.split("@")[0] ||
		"User";
	const avatar = getEffectiveAvatar(
		profile?.avatar_url,
		getProviderAvatarFromMetadata(user.user_metadata),
	);

	return {
		id: user.id,
		name,
		nameVocative: profile?.name_vocative ?? null,
		email: user.email || "",
		avatar,
		role: getUserRoleFromAuthUser(user),
	};
}

function getFallbackUserFromSession(session: Session): AuthUser {
	const user = session.user;

	return {
		id: user.id,
		name:
			user.user_metadata?.display_name ||
			user.user_metadata?.name ||
			user.user_metadata?.full_name ||
			user.email?.split("@")[0] ||
			"User",
		nameVocative: null,
		email: user.email || "",
		avatar: getProviderAvatarFromMetadata(user.user_metadata),
		role: getUserRoleFromAuthUser(user),
	};
}

/**
 * Centralized auth state hook
 * 
 * Provides reactive authentication state that updates automatically
 * when user logs in or out. All pages should use this hook to check
 * auth status and protect routes.
 * 
 * Returns:
 * - isAuthenticated: boolean | null (null = loading, true = logged in, false = logged out)
 * - session: current session object or null
 */
export function AuthProvider({ children }: { children: ReactNode }) {
	const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
	const [session, setSession] = useState<Session | null>(null);
	const [user, setUser] = useState<AuthUser | null>(null);
	const sessionVersionRef = useRef(0);

	const applySession = useCallback(async (nextSession: Session | null) => {
		const sessionVersion = ++sessionVersionRef.current;
		const isCurrentSession = () =>
			sessionVersion === sessionVersionRef.current;

		if (!nextSession?.user) {
			setSession(null);
			setIsAuthenticated(false);
			setUser(null);
			return;
		}

		// Publish a rotated access token before doing network-backed user/profile
		// enrichment. Consumers must never keep sending the previous token while
		// TOKEN_REFRESHED is being processed.
		setSession(nextSession);
		setIsAuthenticated((current) => (current === true ? true : null));

		try {
			const {
				data: { user: verifiedUser },
				error: userError,
			} = await supabase.auth.getUser(nextSession.access_token);

			if (!isCurrentSession()) return;

			if (userError || !verifiedUser) {
				if (userError && isAuthRetryableFetchError(userError)) {
					setIsAuthenticated(true);
					setUser(
						(current) =>
							current ?? getFallbackUserFromSession(nextSession),
					);
					return;
				}

				const {
					data: { session: currentSession },
					error: currentSessionError,
				} = await supabase.auth.getSession();

				if (!isCurrentSession()) return;

				if (
					currentSessionError &&
					isAuthRetryableFetchError(currentSessionError)
				) {
					setIsAuthenticated(true);
					setUser(
						(current) =>
							current ?? getFallbackUserFromSession(nextSession),
					);
					return;
				}

				if (!currentSession) {
					setSession(null);
					setIsAuthenticated(false);
					setUser(null);
					return;
				}

				// A newer token may already be in storage before its auth event has
				// completed. Its own event will perform verification.
				if (currentSession.access_token !== nextSession.access_token) {
					return;
				}

				const {
					data: { session: refreshedSession },
					error: refreshError,
				} = await supabase.auth.refreshSession();

				if (!isCurrentSession()) return;

				if (refreshedSession) {
					// TOKEN_REFRESHED publishes and verifies the rotated session.
					return;
				}

				if (refreshError && isAuthRetryableFetchError(refreshError)) {
					setIsAuthenticated(true);
					setUser(
						(current) =>
							current ?? getFallbackUserFromSession(nextSession),
					);
					return;
				}

				// Non-retryable refresh failures remove the Supabase session and emit
				// SIGNED_OUT. Mirror that state if the event has not landed yet.
				setSession(null);
				setIsAuthenticated(false);
				setUser(null);
				return;
			}

			if (isPlatformAccessDisabled(verifiedUser)) {
				await supabase.auth.signOut({ scope: "local" });
				if (!isCurrentSession()) return;
				setSession(null);
				setIsAuthenticated(false);
				setUser(null);
				return;
			}

			const verifiedSession = { ...nextSession, user: verifiedUser };
			const nextUser = await getUserFromSession(verifiedSession);
			if (!isCurrentSession()) return;
			setSession(verifiedSession);
			setIsAuthenticated(true);
			setUser(nextUser);
		} catch (error) {
			console.error("Failed to load current user:", error);
			if (!isCurrentSession()) return;
			// A transient user/profile request must not turn a valid persisted
			// session into a logout. Server endpoints still verify authorization.
			setIsAuthenticated(true);
			setUser(
				(current) => current ?? getFallbackUserFromSession(nextSession),
			);
		}
	}, []);

	useEffect(() => {
		let isMounted = true;

		const applyMountedSession = async (nextSession: Session | null) => {
			if (!isMounted) return;
			await applySession(nextSession);
		};

		// Supabase emits INITIAL_SESSION after restoring persisted auth, followed by
		// login, logout, and token refresh events for subsequent changes.
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, session) => {
			void applyMountedSession(session);
		});

		return () => {
			isMounted = false;
			sessionVersionRef.current += 1;
			subscription.unsubscribe();
		};
	}, [applySession]);

	const refreshUser = useCallback(async () => {
		if (!session?.user) {
			setUser(null);
			return;
		}

		const nextUser = await getUserFromSession(session);
		setUser(nextUser);
	}, [session]);

	const value = useMemo<AuthContextValue>(
		() => ({
			isAuthenticated,
			session,
			user,
			role: user?.role ?? null,
			refreshUser,
		}),
		[isAuthenticated, refreshUser, session, user],
	);

	return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
	const context = useContext(AuthContext);

	if (context) {
		return context;
	}

	throw new Error("useAuth must be used within AuthProvider");
}
