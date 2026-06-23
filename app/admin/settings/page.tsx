"use client";

import { AdminGuard } from "@/components/auth/admin-guard";
import { AppShell } from "@/components/app-shell";
import { Box } from "@/components/ui/box";
import { MaintenanceSettings } from "@/components/admin/maintenance-settings";
import { AdminTabs } from "@/components/admin/admin-tabs";

function AdminSettingsPageContent() {
	return (
		<AppShell title="Admin Settings">
			{/* Admin Navigation Tabs */}
			<Box className="mb-4 md:hidden">
				<AdminTabs />
			</Box>

			{/* Settings Content */}
			<div className="space-y-6">
				<MaintenanceSettings />
			</div>
		</AppShell>
	);
}

export default function AdminSettingsPage() {
	return (
		<AdminGuard>
			<AdminSettingsPageContent />
		</AdminGuard>
	);
}
