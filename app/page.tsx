"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { AuthScreen } from "@/components/auth/auth-screen";
import { HomeNative } from "@/components/home/home-native";
import { FullScreenLoading } from "@/components/ui/loading";
import { useAuth } from "@/lib/auth/useAuth";
import { t } from "@/lib/i18n";

export default function HomePage() {
	const { isAuthenticated } = useAuth();
	const router = useRouter();

	useEffect(() => {
		if (!isAuthenticated) return;
		router.prefetch("/statistics");
		router.prefetch("/sessions");
	}, [isAuthenticated, router]);

	if (isAuthenticated === null) {
		return (
			<FullScreenLoading
				label="Vraćam tvoj klub…"
				className="bg-[rgb(3_3_4)]"
			/>
		);
	}

	if (!isAuthenticated) return <AuthScreen />;

	return (
		<AppShell
			title={t.pages.dashboard}
			showHeader={false}
			insetClassName="home-native-shell"
			bodyClassName="bg-[rgb(3_3_4)]"
			containerClassName="bg-[rgb(3_3_4)]"
			contentClassName="!gap-0 !py-0"
			contentPadding={false}
		>
			<HomeNative />
		</AppShell>
	);
}
