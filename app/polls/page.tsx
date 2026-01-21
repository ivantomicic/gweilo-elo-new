"use client";

import { useState, useEffect, useCallback } from "react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { Loading } from "@/components/ui/loading";
import { PollsView } from "./_components/polls-view";
import { CreatePollDrawer } from "./_components/create-poll-drawer";
import { t } from "@/lib/i18n";
import { getUserRole } from "@/lib/auth/getUserRole";

function PollsPageContent() {
	const [isAdmin, setIsAdmin] = useState(false);
	const [loadingAdmin, setLoadingAdmin] = useState(true);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [refetchPolls, setRefetchPolls] = useState<(() => void) | null>(
		null
	);

	// Check if user is admin
	useEffect(() => {
		const checkAdmin = async () => {
			const role = await getUserRole();
			setIsAdmin(role === "admin");
			setLoadingAdmin(false);
		};
		checkAdmin();
	}, []);

	// Stable callback for onRefetchReady
	const handleRefetchReady = useCallback((refetch: () => void) => {
		setRefetchPolls(() => refetch);
	}, []);

	if (loadingAdmin) {
		return (
			<SidebarProvider>
				<AppSidebar variant="inset" />
				<SidebarInset>
					<SiteHeader title={t.pages.polls} />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
								<Loading />
							</div>
						</div>
					</div>
				</SidebarInset>
			</SidebarProvider>
		);
	}

	return (
		<SidebarProvider>
			<AppSidebar variant="inset" />
			<SidebarInset>
				<SiteHeader
					title={t.pages.polls}
					actionLabel={isAdmin ? t.polls.newPoll : undefined}
					actionOnClick={
						isAdmin ? () => setDrawerOpen(true) : undefined
					}
					actionIcon="solar:add-circle-bold"
				/>
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
							<PollsView onRefetchReady={handleRefetchReady} />
						</div>
					</div>
				</div>
			</SidebarInset>
			{/* Create Poll Drawer */}
			{isAdmin && (
				<CreatePollDrawer
					open={drawerOpen}
					onClose={() => setDrawerOpen(false)}
					onInsertSuccess={() => {
						if (refetchPolls) {
							refetchPolls();
						}
					}}
				/>
			)}
		</SidebarProvider>
	);
}

export default function PollsPage() {
	return (
		<AuthGuard>
			<PollsPageContent />
		</AuthGuard>
	);
}

