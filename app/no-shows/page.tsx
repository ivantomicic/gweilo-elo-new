"use client";

import { useState, useEffect } from "react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { NoShowsView } from "./_components/no-shows-view";
import { AddNoShowDrawer } from "./_components/add-no-show-drawer";
import { t } from "@/lib/i18n";
import { getUserRole } from "@/lib/auth/getUserRole";

function NoShowsPageContent() {
	const [isAdmin, setIsAdmin] = useState(false);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [refetchNoShows, setRefetchNoShows] = useState<(() => void) | null>(
		null
	);

	// Check if user is admin
	useEffect(() => {
		const checkAdmin = async () => {
			const role = await getUserRole();
			setIsAdmin(role === "admin");
		};
		checkAdmin();
	}, []);

	return (
		<SidebarProvider>
			<AppSidebar variant="inset" />
			<SidebarInset>
				<SiteHeader
					title={t.ispale.title}
					actionLabel={isAdmin ? t.ispale.addNoShow : undefined}
					actionOnClick={isAdmin ? () => setDrawerOpen(true) : undefined}
					actionIcon="solar:add-circle-bold"
				/>
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
							<NoShowsView
								onRefetchReady={(refetch) => {
									setRefetchNoShows(() => refetch);
								}}
							/>
						</div>
					</div>
				</div>
			</SidebarInset>
			{/* Add No-Show Drawer */}
			{isAdmin && (
				<AddNoShowDrawer
					open={drawerOpen}
					onClose={() => setDrawerOpen(false)}
					onInsertSuccess={() => {
						if (refetchNoShows) {
							refetchNoShows();
						}
					}}
				/>
			)}
		</SidebarProvider>
	);
}

export default function NoShowsPage() {
	return (
		<AuthGuard>
			<NoShowsPageContent />
		</AuthGuard>
	);
}

