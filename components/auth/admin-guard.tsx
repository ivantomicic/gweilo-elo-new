"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUserRole } from "@/lib/auth/getUserRole";
import { AuthScreen } from "@/components/auth/auth-screen";

/**
 * AdminGuard component
 * 
 * Protects admin routes by checking user role.
 * Shows login screen if not authenticated, redirects to home if not admin.
 * 
 * Security: Role is read from Supabase JWT token, cannot be spoofed client-side.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
	const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
	const router = useRouter();

	useEffect(() => {
		const checkRole = async () => {
			const role = await getUserRole();
			
			if (!role) {
				// Not authenticated - show login screen
				setIsAuthorized(false);
				return;
			}

			if (role !== "admin") {
				// Not admin - redirect to home
				setIsAuthorized(false);
				router.push("/");
				return;
			}

			// User is admin
			setIsAuthorized(true);
		};

		checkRole();
	}, [router]);

	// Show loading state while checking role
	if (isAuthorized === null) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<p className="text-muted-foreground">Loading...</p>
			</div>
		);
	}

	// Show login screen if not authenticated, or redirect if not admin
	if (!isAuthorized) {
		return <AuthScreen />;
	}

	// Render admin content if authorized
	return <>{children}</>;
}

