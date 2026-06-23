"use client";

import { AdminGuard } from "@/components/auth/admin-guard";
import { AppShell } from "@/components/app-shell";
import { Box } from "@/components/ui/box";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { MissionsPanel } from "@/components/admin/missions-panel";

function AdminMissionsPageContent() {
	return (
		<AppShell title="Admin Missions">
			<Box className="mb-4 md:hidden">
				<AdminTabs />
			</Box>
			<MissionsPanel />
		</AppShell>
	);
}

export default function AdminMissionsPage() {
	return (
		<AdminGuard>
			<AdminMissionsPageContent />
		</AdminGuard>
	);
}
