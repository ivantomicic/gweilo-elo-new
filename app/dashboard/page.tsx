"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * DEPRECATED: /dashboard route
 * 
 * This route is kept for backwards compatibility but redirects to root.
 * The root route (/) now handles both auth and dashboard rendering.
 * 
 * All dashboard functionality should be accessed via the root route.
 */
export default function DashboardPage() {
	const router = useRouter();

	useEffect(() => {
		router.replace("/");
	}, [router]);

	return (
		<div className="flex min-h-screen items-center justify-center bg-background">
			<p className="text-muted-foreground">Redirecting...</p>
		</div>
	);
}
