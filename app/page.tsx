"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { AuthScreen } from "@/components/auth/auth-screen";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { t } from "@/lib/i18n";

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
 * 3. Render AuthScreen if not authenticated, shadcn dashboard-01 if authenticated
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
	// Replaced old DashboardView with shadcn dashboard-01
	if (isAuthenticated) {
		return (
			<SidebarProvider>
				<AppSidebar variant="inset" />
				<SidebarInset>
					<SiteHeader title={t.pages.dashboard} />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6"></div>
						</div>
					</div>
				</SidebarInset>
			</SidebarProvider>
		);
	}

	return <AuthScreen />;
}
