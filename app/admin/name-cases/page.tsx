"use client";

import { AdminGuard } from "@/components/auth/admin-guard";
import { AppShell } from "@/components/app-shell";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { NameCasesTable } from "@/components/admin/name-cases-table";
import { Box } from "@/components/ui/box";

function AdminNameCasesPageContent() {
	return (
		<AppShell title="Padeži imena">
			<Box className="mb-4 md:hidden">
				<AdminTabs />
			</Box>
			<NameCasesTable />
		</AppShell>
	);
}

export default function AdminNameCasesPage() {
	return (
		<AdminGuard>
			<AdminNameCasesPageContent />
		</AdminGuard>
	);
}
