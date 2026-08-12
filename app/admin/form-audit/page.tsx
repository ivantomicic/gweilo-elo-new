"use client";

import { AdminTabs } from "@/components/admin/admin-tabs";
import { FormAuditPanel } from "@/components/admin/form-audit-panel";
import { AppShell } from "@/components/app-shell";
import { AdminGuard } from "@/components/auth/admin-guard";
import { Box } from "@/components/ui/box";

function AdminFormAuditPageContent() {
	return (
		<AppShell title="Form Audit">
			<Box className="mb-4 md:hidden">
				<AdminTabs />
			</Box>
			<FormAuditPanel />
		</AppShell>
	);
}

export default function AdminFormAuditPage() {
	return (
		<AdminGuard>
			<AdminFormAuditPageContent />
		</AdminGuard>
	);
}
