"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";
import { getAdminAccessState } from "@/lib/auth/admin-access";
import { AuthScreen } from "@/components/auth/auth-screen";
import { FullScreenLoading, PageLoading } from "@/components/ui/loading";

/**
 * Reuse the root provider's verified auth state across admin navigation.
 * This is a presentation gate; protected API handlers enforce authorization.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
	const { isAuthenticated, role } = useAuth();
	const access = getAdminAccessState(isAuthenticated, role);
	const router = useRouter();

	useEffect(() => {
		if (access === "denied") router.replace("/");
	}, [access, router]);

	// Show loading state while checking role
	if (access === "loading") {
		return <FullScreenLoading label="Proveravam pristup…" />;
	}

	if (access === "signed-out") {
		return <AuthScreen />;
	}
	if (access === "denied") {
		return <PageLoading label="Vraćam na početnu…" />;
	}

	// Render admin content if authorized
	return <>{children}</>;
}
