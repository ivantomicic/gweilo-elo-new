"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { AuthScreen } from "@/components/auth/auth-screen";
import { DashboardView } from "@/components/dashboard/dashboard-view";

/**
 * Root route handler
 * 
 * Approach: Client-side auth state detection with automatic re-rendering.
 * 
 * Why this approach:
 * - Simple: No middleware needed, works with existing Supabase client
 * - Reactive: onAuthStateChange automatically updates UI on login/logout
 * - No flicker: Loading state prevents showing wrong screen briefly
 * - No redirects: Component swap is instant, feels like SPA
 * 
 * Flow:
 * 1. Check auth state on mount
 * 2. Listen for auth changes (login/logout)
 * 3. Render AuthScreen if not authenticated, DashboardView if authenticated
 * 4. Automatic transition when auth state changes
 */
export default function HomePage() {
	const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(
		null
	);

	useEffect(() => {
		// Check initial auth state
		const checkAuth = async () => {
			const {
				data: { session },
			} = await supabase.auth.getSession();
			setIsAuthenticated(!!session);
		};
		checkAuth();

		// Listen for auth state changes (login, logout, token refresh)
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, session) => {
			setIsAuthenticated(!!session);
		});

		return () => subscription.unsubscribe();
	}, []);

	// Show loading state briefly to prevent flicker
	if (isAuthenticated === null) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<p className="text-muted-foreground">Loading...</p>
			</div>
		);
	}

	// Render appropriate component based on auth state
	return isAuthenticated ? <DashboardView /> : <AuthScreen />;
}
