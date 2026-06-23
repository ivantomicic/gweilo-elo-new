"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/app-shell";
import { t } from "@/lib/i18n";

export default function Page() {
	return (
		<AuthGuard>
			<AppShell title={t.pages.dashboard} contentPadding={false} />
		</AuthGuard>
	);
}
