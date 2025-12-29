"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { Box } from "@/components/ui/box";
import { Stack } from "@/components/ui/stack";
import { supabase } from "@/lib/supabase/client";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type Session = {
	id: string;
	player_count: number;
	created_at: string;
	status: "active" | "completed";
	completed_at?: string | null;
};

function SessionsPageContent() {
	const router = useRouter();
	const [sessions, setSessions] = useState<Session[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Load sessions
	useEffect(() => {
		const fetchSessions = async () => {
			try {
				setLoading(true);
				setError(null);

				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					setError("Not authenticated");
					return;
				}

				const supabaseClient = createClient(
					supabaseUrl,
					supabaseAnonKey,
					{
						global: {
							headers: {
								Authorization: `Bearer ${session.access_token}`,
							},
						},
					}
				);

				// Fetch all sessions created by the current user, ordered by created_at DESC
				const {
					data: { user: currentUser },
				} = await supabaseClient.auth.getUser();

				if (!currentUser) {
					setError("Not authenticated");
					return;
				}

				const { data: sessionsData, error: sessionsError } =
					await supabaseClient
						.from("sessions")
						.select("*")
						.eq("created_by", currentUser.id)
						.order("created_at", { ascending: false });

				if (sessionsError) {
					console.error("Error fetching sessions:", sessionsError);
					setError(
						`Failed to load sessions: ${
							sessionsError.message || JSON.stringify(sessionsError)
						}`
					);
					return;
				}

				setSessions(sessionsData || []);
			} catch (err) {
				console.error("Error fetching sessions:", err);
				setError("Failed to load sessions");
			} finally {
				setLoading(false);
			}
		};

		fetchSessions();
	}, []);

	// Format date helper
	const formatSessionDate = (dateString: string) => {
		const date = new Date(dateString);
		return date.toLocaleDateString("en-US", {
			weekday: "short",
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};

	if (loading) {
		return (
			<SidebarProvider>
				<AppSidebar variant="inset" />
				<SidebarInset>
					<SiteHeader title="Sessions" />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
								<Box>
									<p className="text-muted-foreground">Loading sessions...</p>
								</Box>
							</div>
						</div>
					</div>
				</SidebarInset>
			</SidebarProvider>
		);
	}

	if (error) {
		return (
			<SidebarProvider>
				<AppSidebar variant="inset" />
				<SidebarInset>
					<SiteHeader title="Sessions" />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
								<Box>
									<p className="text-destructive">{error}</p>
								</Box>
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
				<SiteHeader title="Sessions" />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
							{/* Header */}
							<Box>
								<h1 className="text-3xl font-bold font-heading tracking-tight">
									Sessions
								</h1>
							</Box>

							{/* Sessions List */}
							{sessions.length === 0 ? (
								<Box>
									<p className="text-muted-foreground">
										No sessions found.
									</p>
								</Box>
							) : (
								<Stack direction="column" spacing={2}>
									{sessions.map((session) => (
										<Box
											key={session.id}
											onClick={() => router.push(`/session/${session.id}`)}
											className="bg-card rounded-[16px] p-4 border border-border/50 hover:border-border cursor-pointer transition-colors active:scale-[0.99]"
										>
											<Stack
												direction="row"
												alignItems="center"
												justifyContent="between"
												spacing={4}
											>
												<Stack
													direction="column"
													spacing={1}
													className="flex-1 min-w-0"
												>
													<p className="text-base font-semibold truncate">
														{formatSessionDate(session.created_at)}
													</p>
													<p className="text-sm text-muted-foreground">
														{session.player_count} player
														{session.player_count !== 1 ? "s" : ""}
													</p>
												</Stack>
												<Box
													className={`
														px-2 py-1 rounded-md text-xs font-semibold whitespace-nowrap
														${
															session.status === "active"
																? "bg-chart-2/10 text-chart-2 border border-chart-2/20"
																: "bg-muted text-muted-foreground border border-border"
														}
													`}
												>
													{session.status === "active"
														? "Active"
														: "Completed"}
												</Box>
											</Stack>
										</Box>
									))}
								</Stack>
							)}
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

export default function SessionsPage() {
	return (
		<AuthGuard>
			<SessionsPageContent />
		</AuthGuard>
	);
}

