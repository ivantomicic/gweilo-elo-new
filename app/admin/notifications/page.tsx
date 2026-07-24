"use client";

import { AdminGuard } from "@/components/auth/admin-guard";
import { AppShell } from "@/components/app-shell";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { NotificationComposer } from "@/components/admin/notification-composer";
import { Box } from "@/components/ui/box";

function AdminNotificationsContent() {
	return (
		<AppShell title="Notifications">
			<Box className="mb-4 md:hidden">
				<AdminTabs />
			</Box>
			<div className="mx-auto w-full max-w-3xl">
				<NotificationComposer />
			</div>
		</AppShell>
	);
}

export default function AdminNotificationsPage() {
	return (
		<AdminGuard>
			<AdminNotificationsContent />
		</AdminGuard>
	);
}

