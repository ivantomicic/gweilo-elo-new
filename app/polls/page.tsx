"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Loading } from "@/components/ui/loading";
import { PollsView } from "./_components/polls-view";
import { CreatePollDrawer } from "./_components/create-poll-drawer";
import { t } from "@/lib/i18n";
import { useAuth } from "@/lib/auth/useAuth";

function PollsPageContent() {
	const searchParams = useSearchParams();
	const { role } = useAuth();
	const isAdmin = role === "admin";
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [refetchPolls, setRefetchPolls] = useState<(() => void) | null>(
		null
	);
	
	// Get URL parameters for deep linking from email
	const pollIdFromUrl = searchParams.get('pollId');
	const optionIdFromUrl = searchParams.get('optionId');
	
	// Debug logging
	useEffect(() => {
		if (pollIdFromUrl || optionIdFromUrl) {
			console.log('[PollsPage] URL parameters detected:', {
				pollId: pollIdFromUrl,
				optionId: optionIdFromUrl,
			});
		}
	}, [pollIdFromUrl, optionIdFromUrl]);

	// Stable callback for onRefetchReady
	const handleRefetchReady = useCallback((refetch: () => void) => {
		setRefetchPolls(() => refetch);
	}, []);

	return (
		<AppShell
			title={t.pages.polls}
			actionLabel={isAdmin ? t.polls.newPoll : undefined}
			actionOnClick={isAdmin ? () => setDrawerOpen(true) : undefined}
			actionIcon="solar:add-circle-bold"
			contentClassName="px-0 lg:px-0"
		>
			<PollsView
				onRefetchReady={handleRefetchReady}
				initialPollId={pollIdFromUrl || undefined}
				initialOptionId={optionIdFromUrl || undefined}
			/>
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
		</AppShell>
	);
}

export default function PollsPage() {
	return (
		<AuthGuard>
			<Suspense fallback={
				<AppShell title={t.pages.polls}>
					<Loading />
				</AppShell>
			}>
				<PollsPageContent />
			</Suspense>
		</AuthGuard>
	);
}
