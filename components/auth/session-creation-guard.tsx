"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StateBlock } from "@/components/ui/state-block";
import { useAuth } from "@/lib/auth/useAuth";

export function SessionCreationGuard({
	children,
}: {
	children: React.ReactNode;
}) {
	const router = useRouter();
	const { role, session } = useAuth();
	const [isChecking, setIsChecking] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!session || role === null) return;
		if (role !== "admin" && role !== "mod") {
			router.replace("/");
			return;
		}

		let cancelled = false;
		const checkActiveSession = async () => {
			try {
				const response = await fetch("/api/sessions/active", {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
					cache: "no-store",
				});
				if (!response.ok) {
					throw new Error("Could not check the active session.");
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
			} catch (checkError) {
				if (cancelled) return;
				setError(
					checkError instanceof Error
						? checkError.message
						: "Could not check the active session.",
				);
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
	if (error) {
		return <StateBlock variant="error" size="lg" title={error} />;
	}
	return <>{children}</>;
}
