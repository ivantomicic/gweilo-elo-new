"use client";

import { useAuth } from "@/lib/auth/useAuth";
import { AuthScreen } from "@/components/auth/auth-screen";
import { FullScreenLoading } from "@/components/ui/loading";

/**
 * AuthGuard component
 * 
 * Protects routes by checking authentication state.
 * Shows login screen if not authenticated, otherwise renders children.
 * 
 * All internal pages should be wrapped with this component.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
	const { isAuthenticated } = useAuth();

	// Show loading state briefly to prevent flicker
	if (isAuthenticated === null) {
		return <FullScreenLoading label="Vraćam tvoj klub…" />;
	}

	// Show login screen if not authenticated
	if (!isAuthenticated) {
		return <AuthScreen />;
	}

	// Render protected content if authenticated
	return <>{children}</>;
}
