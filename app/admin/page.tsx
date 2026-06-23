"use client";

import { AdminGuard } from "@/components/auth/admin-guard";
import { AppShell } from "@/components/app-shell";
import { Box } from "@/components/ui/box";
import { UserManagementTable } from "@/components/admin/user-management-table";
import { AdminTabs } from "@/components/admin/admin-tabs";

function AdminPageContent() {
	return (
		<AppShell title="Admin panel">
			{/* Admin Navigation Tabs */}
			<Box className="mb-4 md:hidden">
				<AdminTabs />
			</Box>

			<div className="space-y-4">
				<UserManagementTable />
			</div>
		</AppShell>
	);
}

export default function AdminPage() {
	return (
		<AdminGuard>
			<AdminPageContent />
		</AdminGuard>
	);
}
