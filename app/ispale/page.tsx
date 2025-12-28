"use client";

import { useState, useEffect } from "react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { IspaleView } from "@/components/ispale/ispale-view";
import { AddNoShowDrawer } from "@/components/ispale/add-no-show-drawer";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { getUserRole } from "@/lib/auth/getUserRole";

function IspalePageContent() {
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
					actions={
						isAdmin ? (
							<Button size="xs" onClick={() => setDrawerOpen(true)}>
								{t.ispale.addNoShow}
							</Button>
						) : undefined
					}
				/>
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
							<IspaleView
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

export default function IspalePage() {
	return (
		<AuthGuard>
			<IspalePageContent />
		</AuthGuard>
	);
}

