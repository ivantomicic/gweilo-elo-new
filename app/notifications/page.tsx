"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/vendor/shadcn/sidebar";
import { t } from "@/lib/i18n";

export default function NotificationsPage() {
	return (
		<AuthGuard>
			<SidebarProvider>
				<AppSidebar variant="inset" />
				<SidebarInset>
					<SiteHeader title={t.pages.notifications} />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
								<div className="px-4 lg:px-6">
									<h1 className="text-4xl font-bold font-heading">
										{t.pages.notifications}
									</h1>
								</div>
							</div>
						</div>
					</div>
				</SidebarInset>
			</SidebarProvider>
		</AuthGuard>
	);
}

