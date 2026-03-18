"use client";

import { AdminGuard } from "@/components/auth/admin-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { Box } from "@/components/ui/box";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { MissionsPanel } from "@/components/admin/missions-panel";

function AdminMissionsPageContent() {
	return (
		<SidebarProvider>
			<AppSidebar variant="inset" />
			<SidebarInset>
				<SiteHeader title="Admin Missions" />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
							<Box className="mb-4 md:hidden">
								<AdminTabs />
							</Box>
							<MissionsPanel />
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

export default function AdminMissionsPage() {
	return (
		<AdminGuard>
			<AdminMissionsPageContent />
		</AdminGuard>
	);
}
