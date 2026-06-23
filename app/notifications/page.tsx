"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/app-shell";
import { t } from "@/lib/i18n";

export default function NotificationsPage() {
	return (
		<AuthGuard>
			<AppShell title={t.pages.notifications} contentPadding={false}>
				<div className="px-4 lg:px-6">
					<h1 className="text-4xl font-bold font-heading">
						{t.pages.notifications}
					</h1>
				</div>
			</AppShell>
		</AuthGuard>
	);
}
