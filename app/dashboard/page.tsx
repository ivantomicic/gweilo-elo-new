"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/vendor/shadcn/sidebar";
import { t } from "@/lib/i18n";

export default function Page() {
	return (
		<AuthGuard>
			<SidebarProvider>
				<AppSidebar variant="inset" />
				<SidebarInset>
					<SiteHeader title={t.pages.dashboard} />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
							</div>
						</div>
					</div>
				</SidebarInset>
			</SidebarProvider>
		</AuthGuard>
	);
}
