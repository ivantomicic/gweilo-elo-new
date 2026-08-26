"use client";

import { AdminTabs } from "@/components/admin/admin-tabs";
import { DesignSystemCatalog } from "@/components/admin/design-system-catalog";
import { AppShell } from "@/components/app-shell";
import { AdminGuard } from "@/components/auth/admin-guard";
import { Box } from "@/components/ui/box";

function AdminDesignSystemPageContent() {
	return (
		<AppShell title="Design System">
			<Box className="mb-4 md:hidden">
				<AdminTabs />
			</Box>
			<DesignSystemCatalog />
		</AppShell>
	);
}

export default function AdminDesignSystemPage() {
	return (
		<AdminGuard>
			<AdminDesignSystemPageContent />
		</AdminGuard>
	);
}
