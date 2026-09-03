"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FullScreenLoading } from "@/components/ui/loading";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import { useAuth } from "@/lib/auth/useAuth";
import { canStartSession } from "@/lib/auth/roles";

export function SessionCreationGuard({
	children,
}: {
	children: React.ReactNode;
}) {
	const router = useRouter();
	const { role, session } = useAuth();
	const [isChecking, setIsChecking] = useState(true);

	useEffect(() => {
		if (!session || role === null) return;
		if (!canStartSession(role)) {
			router.replace("/");
			return;
		}
		setIsChecking(true);

		let cancelled = false;
		const checkActiveSession = async () => {
			try {
				const response = await authenticatedFetch("/api/sessions/active", {
					cache: "no-store",
				});
				if (response.status === 401) {
					if (!cancelled) setIsChecking(false);
					return;
				}
				if (!response.ok) {
					// Session creation is guarded atomically on the server. A temporary
					// preflight failure must not permanently hide the creation flow.
					if (!cancelled) setIsChecking(false);
					return;
				}
				const body = (await response.json()) as {
					session?: { id: string } | null;
				};
				if (cancelled) return;
				if (body.session?.id) {
					router.replace(`/session/${body.session.id}`);
					return;
				}
				setIsChecking(false);
			} catch {
				if (cancelled) return;
				setIsChecking(false);
			}
		};

		void checkActiveSession();
		return () => {
			cancelled = true;
		};
	}, [role, router, session]);

	// Also fail closed during a role change, before the redirect effect runs.
	if (!session || !canStartSession(role) || isChecking) {
		return <FullScreenLoading label="Checking session…" />;
	}
	return <>{children}</>;
}
