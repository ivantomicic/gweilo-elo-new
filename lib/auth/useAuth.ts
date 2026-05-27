"use client";

import {
	createContext,
	createElement,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
	getEffectiveAvatar,
	getProviderAvatarFromMetadata,
} from "@/lib/profile-avatar";
import { getSessionSafely, supabase } from "@/lib/supabase/client";
import { getUserRoleFromAuthUser, type UserRole } from "./roles";

export type AuthUser = {
	id: string;
	name: string;
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
		.select("display_name, avatar_url")
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
		email: user.email || "",
		avatar,
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

	const applySession = useCallback(async (nextSession: Session | null) => {
		setSession(nextSession);
		setIsAuthenticated(Boolean(nextSession));

		if (!nextSession?.user) {
			setUser(null);
			return;
		}

		try {
			const nextUser = await getUserFromSession(nextSession);
			setUser(nextUser);
		} catch (error) {
			console.error("Failed to load current user:", error);
			setUser({
				id: nextSession.user.id,
				name:
					nextSession.user.user_metadata?.display_name ||
					nextSession.user.user_metadata?.name ||
					nextSession.user.email?.split("@")[0] ||
					"User",
				email: nextSession.user.email || "",
				avatar: getProviderAvatarFromMetadata(nextSession.user.user_metadata),
				role: getUserRoleFromAuthUser(nextSession.user),
			});
		}
	}, []);

	useEffect(() => {
		let isMounted = true;

		const applyMountedSession = async (nextSession: Session | null) => {
			if (!isMounted) return;
			await applySession(nextSession);
		};

		// Check initial auth state
		const checkAuth = async () => {
			const nextSession = await getSessionSafely();
			await applyMountedSession(nextSession);
		};
		checkAuth();

		// Listen for auth state changes (login, logout, token refresh)
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, session) => {
			void applyMountedSession(session);
		});

		return () => {
			isMounted = false;
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
