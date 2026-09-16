"use client";

import dynamic from "next/dynamic";
import { AuthProvider } from "@/lib/auth/useAuth";
import { ActiveSessionProvider } from "@/lib/client/use-active-session";

const AppTracker = dynamic(
	() => import("@/components/analytics/app-tracker").then((mod) => mod.AppTracker),
	{ ssr: false },
);
const MobileNav = dynamic(
	() => import("@/components/mobile-nav").then((mod) => mod.MobileNav),
	{ ssr: false },
);

export function ClientShell({ children }: { children: React.ReactNode }) {
	return (
		<AuthProvider>
			<AppTracker />
			<ActiveSessionProvider>
				{children}
				<MobileNav />
			</ActiveSessionProvider>
		</AuthProvider>
	);
}
