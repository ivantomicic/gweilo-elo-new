"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StateBlock } from "@/components/ui/state-block";
import { useAuth } from "@/lib/auth/useAuth";
import { supabase } from "@/lib/supabase/client";
import { clearAllCaches } from "@/lib/utils/clear-cache";

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
		if (role !== "admin" && role !== "mod") {
			router.replace("/");
			return;
		}
		setIsChecking(true);

		let cancelled = false;
		const checkActiveSession = async () => {
			try {
				const response = await fetch("/api/sessions/active", {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
					cache: "no-store",
				});
				if (response.status === 401) {
					if (cancelled) return;
					clearAllCaches();
					await supabase.auth.signOut({ scope: "local" });
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

	if (isChecking) {
		return <StateBlock variant="loading" size="lg" title="Checking session…" />;
	}
	return <>{children}</>;
}
