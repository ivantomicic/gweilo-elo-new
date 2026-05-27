"use client";

import { useState } from "react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/app-shell";
import { NoShowsView } from "./_components/no-shows-view";
import { AddNoShowDrawer } from "./_components/add-no-show-drawer";
import { t } from "@/lib/i18n";
import { useAuth } from "@/lib/auth/useAuth";

function NoShowsPageContent() {
	const { role } = useAuth();
	const isAdmin = role === "admin";
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [refetchNoShows, setRefetchNoShows] = useState<(() => void) | null>(
		null
	);

	return (
		<AppShell
			title={t.ispale.title}
			actionLabel={isAdmin ? t.ispale.addNoShow : undefined}
			actionOnClick={isAdmin ? () => setDrawerOpen(true) : undefined}
			actionIcon="solar:add-circle-bold"
			contentClassName="px-0 lg:px-0"
		>
			<NoShowsView
				onRefetchReady={(refetch) => {
					setRefetchNoShows(() => refetch);
				}}
			/>
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
		</AppShell>
	);
}

export default function NoShowsPage() {
	return (
		<AuthGuard>
			<NoShowsPageContent />
		</AuthGuard>
	);
}
