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

type ActiveSession = {
	id: string;
	player_count: number;
	created_at: string;
};

function TableTennisGifWidget() {
	const [gifUrl, setGifUrl] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fetchGif = async () => {
			try {
				setLoading(true);
				// Using Giphy's random endpoint with table tennis tag
				const apiKey = process.env.NEXT_PUBLIC_GIPHY_API_KEY || 'dc6zaTOxFJmzC'; // fallback to demo key
				const response = await fetch(
					`https://api.giphy.com/v1/gifs/random?api_key=${apiKey}&tag=table+tennis+ping+pong&rating=g`
				);
				
				if (response.ok) {
					const data = await response.json();
					if (data?.data?.images?.downsized?.url) {
						setGifUrl(data.data.images.downsized.url);
						setLoading(false);
						return;
					}
				}
			} catch (error) {
				console.error("Error fetching gif:", error);
			}
			
			// Fallback: use curated table tennis gif URLs
			const fallbackUrls = [
				'https://media.giphy.com/media/3o7TKTnJYXYK8A0VQA/giphy.gif',
				'https://media.giphy.com/media/l0MYB5UzpU9M2B8Na/giphy.gif',
				'https://media.giphy.com/media/3o6Zt481isNVuQI1l6/giphy.gif',
				'https://media.giphy.com/media/26BRuo6sLetdllPAQ/giphy.gif',
				'https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif',
			];
			const randomUrl = fallbackUrls[Math.floor(Math.random() * fallbackUrls.length)];
			setGifUrl(randomUrl);
			setLoading(false);
		};

		fetchGif();
	}, []);

	if (loading) {
		return (
			<Box className="bg-card rounded-[24px] border border-border/50 p-6 aspect-[7/5] flex flex-col items-center justify-center">
				<Loading inline />
			</Box>
		);
	}

	return (
		<Box className="bg-card rounded-[24px] border border-border/50 aspect-[7/5] overflow-hidden relative">
			{gifUrl && (
				<img
					src={gifUrl}
					alt="Table tennis"
					className="absolute inset-0 w-full h-full object-cover"
				/>
			)}
		</Box>
	);
}

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

							{/* Widget Grid */}
							<Stack direction="column" spacing={4}>
								{/* First Row: 3 widgets */}
								<Box className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
									<Top3PlayersWidget />
									<NoShowAlertWidget />
									<Box className="hidden md:block">
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
