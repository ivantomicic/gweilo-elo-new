"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

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
export function useAuth() {
	const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
	const [session, setSession] = useState<any>(null);

	useEffect(() => {
		// Check initial auth state
		const checkAuth = async () => {
			const {
				data: { session },
			} = await supabase.auth.getSession();
			setIsAuthenticated(!!session);
			setSession(session);
		};
		checkAuth();

		// Listen for auth state changes (login, logout, token refresh)
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, session) => {
			setIsAuthenticated(!!session);
			setSession(session);
		});

		return () => subscription.unsubscribe();
	}, []);

	return { isAuthenticated, session };
}

