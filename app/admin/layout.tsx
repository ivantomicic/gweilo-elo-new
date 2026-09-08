"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AdminGuard } from "@/components/auth/admin-guard";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/ui/page-container";
import { AdminTabs } from "@/components/admin/admin-tabs";
import {
	adminNavigationItems,
	getActiveAdminNavigationValue,
} from "@/components/admin/admin-navigation";

/** One persistent shell and access gate, not a new overlay for each admin page. */
export default function AdminLayout({ children }: { children: ReactNode }) {
	const active = getActiveAdminNavigationValue(usePathname());
	const title = adminNavigationItems.find((item) => item.value === active)?.title;

	return (
		<AdminGuard>
			<AppShell title={title ?? "Admin"} showHeader={false} contentPadding={false}>
				<PageContainer className="space-y-6 pb-10 pt-[env(safe-area-inset-top,0px)] md:pt-0">
					<div className="md:hidden">
						<AdminTabs />
					</div>
					<h1 className="hidden text-2xl font-semibold tracking-tight md:block">
						{title}
					</h1>
					{children}
				</PageContainer>
			</AppShell>
		</AdminGuard>
	);
}
