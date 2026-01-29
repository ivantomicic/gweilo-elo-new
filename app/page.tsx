"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";
import { AuthScreen } from "@/components/auth/auth-screen";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Stack } from "@/components/ui/stack";
import { Box } from "@/components/ui/box";
import { Loading } from "@/components/ui/loading";
import { t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { PerformanceTrend } from "@/components/player/performance-trend";
import { Top3PlayersWidget } from "@/components/dashboard/top3-players-widget";
import { NoShowAlertWidget } from "@/components/dashboard/no-show-alert-widget";
import { TableTennisGifWidget } from "@/components/dashboard/table-tennis-gif-widget";
import { PollCard, type Poll } from "@/components/polls/poll-card";
import { getUserRole } from "@/lib/auth/getUserRole";

type ActiveSession = {
	id: string;
	player_count: number;
	created_at: string;
};

function ActiveSessionBanner({ session }: { session: ActiveSession }) {
	const router = useRouter();

	return (
		<Card className="border-primary/20 bg-card">
			<CardContent className="p-4 !pt-4">
				<Stack direction="row" alignItems="center" justifyContent="between" spacing={4}>
					<Stack direction="column" spacing={1} className="flex-1 min-w-0">
						<Stack direction="row" alignItems="center" spacing={2}>
							<Box className="size-2 rounded-full bg-chart-2 animate-pulse shrink-0" />
							<p className="font-bold text-sm">{t.activeSession.title}</p>
						</Stack>
						<p className="text-xs text-muted-foreground">
							{t.activeSession.playerCount.replace("{count}", session.player_count.toString())} • {t.activeSession.started}{" "}
							{formatRelativeTime(session.created_at)}
						</p>
					</Stack>
					<Button
						onClick={() => router.push(`/session/${session.id}`)}
						className="shrink-0"
					>
						<Stack direction="row" alignItems="center" spacing={2}>
							<span>{t.activeSession.continue}</span>
							<Icon icon="solar:arrow-right-linear" className="size-4" />
						</Stack>
					</Button>
				</Stack>
			</CardContent>
		</Card>
	);
}

function UnansweredPollsBanner({ count }: { count: number }) {
	const router = useRouter();

	return (
		<Card className="border-primary/20 bg-card">
			<CardContent className="p-4 !pt-4">
				<Stack direction="row" alignItems="center" justifyContent="between" spacing={4}>
					<Stack direction="column" spacing={1} className="flex-1 min-w-0">
						<Stack direction="row" alignItems="center" spacing={2}>
							<Box className="size-2 rounded-full bg-primary animate-pulse shrink-0" />
							<p className="font-bold text-sm">{t.polls.banner.title}</p>
						</Stack>
						<p className="text-xs text-muted-foreground">
							{t.polls.banner.description(count)}
						</p>
					</Stack>
					<Button
						onClick={() => router.push("/polls")}
						className="shrink-0"
					>
						<Stack direction="row" alignItems="center" spacing={2}>
							<span>{t.polls.banner.view}</span>
							<Icon icon="solar:arrow-right-linear" className="size-4" />
						</Stack>
					</Button>
				</Stack>
			</CardContent>
		</Card>
	);
}

/**
 * Root route handler
 *
 * Uses centralized auth hook for reactive auth state.
 * Automatically updates UI on login/logout via onAuthStateChange.
 */
export default function HomePage() {
	const { isAuthenticated } = useAuth();
	const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
	const [loadingSession, setLoadingSession] = useState(true);
	const [unansweredPolls, setUnansweredPolls] = useState<Poll[]>([]);
	const [loadingPolls, setLoadingPolls] = useState(true);
	const [isAdmin, setIsAdmin] = useState(false);

	// Fetch active session
	useEffect(() => {
		const fetchActiveSession = async () => {
			if (!isAuthenticated) {
				setActiveSession(null);
				setLoadingSession(false);
				return;
			}

			try {
				setLoadingSession(true);
				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					setActiveSession(null);
					return;
				}

				const response = await fetch("/api/sessions/active", {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				});

				if (!response.ok) {
					console.error("Failed to fetch active session");
					setActiveSession(null);
					return;
				}

				const data = await response.json();
				setActiveSession(data.session || null);
			} catch (error) {
				console.error("Error fetching active session:", error);
				setActiveSession(null);
			} finally {
				setLoadingSession(false);
			}
		};

		fetchActiveSession();
	}, [isAuthenticated]);

	// Fetch unanswered polls
	useEffect(() => {
		const fetchUnansweredPolls = async () => {
			if (!isAuthenticated) {
				setUnansweredPolls([]);
				setLoadingPolls(false);
				return;
			}

			try {
				setLoadingPolls(true);
				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					setUnansweredPolls([]);
					return;
				}

				const response = await fetch("/api/polls/unanswered", {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				});

				if (!response.ok) {
					console.error("Failed to fetch unanswered polls");
					setUnansweredPolls([]);
					return;
				}

				const data = await response.json();
				setUnansweredPolls(data.polls || []);
			} catch (error) {
				console.error("Error fetching unanswered polls:", error);
				setUnansweredPolls([]);
			} finally {
				setLoadingPolls(false);
			}
		};

		fetchUnansweredPolls();
	}, [isAuthenticated]);

	// Check if user is admin
	useEffect(() => {
		const checkAdmin = async () => {
			if (!isAuthenticated) {
				setIsAdmin(false);
				return;
			}
			const role = await getUserRole();
			setIsAdmin(role === "admin");
		};
		checkAdmin();
	}, [isAuthenticated]);

	// Handle poll answer submission
	const handlePollAnswer = async (pollId: string, optionId: string) => {
		try {
			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				return;
			}

			const response = await fetch(`/api/polls/${pollId}/answer`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${session.access_token}`,
				},
				body: JSON.stringify({ optionId }),
			});

			if (!response.ok) {
				console.error("Failed to submit answer");
				return;
			}

			// Remove answered poll from list
			setUnansweredPolls((prev) => prev.filter((p) => p.id !== pollId));
		} catch (err) {
			console.error("Error submitting answer:", err);
		}
	};

	// Show loading state briefly to prevent flicker
	if (isAuthenticated === null) {
		return (
			<div className="min-h-screen bg-background">
				<Loading />
			</div>
		);
	}

	// Show login screen if not authenticated
	if (!isAuthenticated) {
		return <AuthScreen />;
	}

	// Render dashboard if authenticated
	return (
		<SidebarProvider>
			<AppSidebar variant="inset" />
			<SidebarInset>
				<SiteHeader title={t.pages.dashboard} />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
							{/* Active Session Banner */}
							{!loadingSession && activeSession && (
								<ActiveSessionBanner session={activeSession} />
							)}

							{/* Unanswered Polls */}
							{!loadingPolls && unansweredPolls.length === 1 && (
								<PollCard
									poll={unansweredPolls[0]}
									onAnswer={handlePollAnswer}
									isAdmin={isAdmin}
								/>
							)}

							{/* Unanswered Polls Banner (if more than 1) */}
							{!loadingPolls && unansweredPolls.length > 1 && (
								<UnansweredPollsBanner count={unansweredPolls.length} />
							)}

							{/* Widget Grid */}
							<Stack direction="column" spacing={4}>
								{/* First Row: 2 widgets on md, 3 on xl+ (min 325px per widget) */}
								<Box className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
									<Top3PlayersWidget />
									<NoShowAlertWidget />
									<Box className="hidden xl:block">
										<TableTennisGifWidget />
									</Box>
								</Box>

								{/* Second Row: 1 full-width widget */}
								<PerformanceTrend />
							</Stack>
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
