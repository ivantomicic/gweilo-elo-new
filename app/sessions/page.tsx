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
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { supabase } from "@/lib/supabase/client";
import { createClient } from "@supabase/supabase-js";
import { getUserRole } from "@/lib/auth/getUserRole";
import { cn } from "@/lib/utils";

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
	const [isAdmin, setIsAdmin] = useState(false);
	const [deletableSessions, setDeletableSessions] = useState<Set<string>>(
		new Set()
	);
	const [showDeleteModal, setShowDeleteModal] = useState(false);
	const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
	const [deleteConfirmationChecked, setDeleteConfirmationChecked] =
		useState(false);
	const [deleting, setDeleting] = useState(false);

	// Check if user is admin
	useEffect(() => {
		const checkAdmin = async () => {
			const role = await getUserRole();
			setIsAdmin(role === "admin");
		};
		checkAdmin();
	}, []);

	// Check which sessions are deletable (for admins)
	useEffect(() => {
		const checkDeletableSessions = async () => {
			if (!isAdmin || sessions.length === 0) {
				setDeletableSessions(new Set());
				return;
			}

			try {
				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) return;

				const deletable = new Set<string>();

				// Only check completed sessions
				const completedSessions = sessions.filter(
					(s) => s.status === "completed"
				);

				for (const sessionItem of completedSessions) {
					try {
						const response = await fetch(
							`/api/sessions/${sessionItem.id}/deletable`,
							{
								headers: {
									Authorization: `Bearer ${session.access_token}`,
								},
							}
						);

						if (response.ok) {
							const data = await response.json();
							if (data.deletable) {
								deletable.add(sessionItem.id);
							}
						}
					} catch (error) {
						console.error(
							`Error checking if session ${sessionItem.id} is deletable:`,
							error
						);
					}
				}

				setDeletableSessions(deletable);
			} catch (error) {
				console.error("Error checking deletable sessions:", error);
			}
		};

		checkDeletableSessions();
	}, [isAdmin, sessions]);

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
							sessionsError.message ||
							JSON.stringify(sessionsError)
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

	// Format date helpers
	const formatDateWeekday = (dateString: string) => {
		const date = new Date(dateString);
		return date.toLocaleDateString("en-US", { weekday: "short" });
	};

	const formatDateDay = (dateString: string) => {
		const date = new Date(dateString);
		return date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		});
	};

	const formatDateYear = (dateString: string) => {
		const date = new Date(dateString);
		return date.toLocaleDateString("en-US", { year: "numeric" });
	};

	// Handle delete session
	const handleDeleteSession = async () => {
		if (!sessionToDelete || deleting || !deleteConfirmationChecked) return;

		setDeleting(true);
		try {
			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				setError("Not authenticated");
				return;
			}

			const response = await fetch(`/api/sessions/${sessionToDelete}`, {
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${session.access_token}`,
				},
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || "Failed to delete session");
			}

			// Remove session from list and refresh
			setSessions((prev) => prev.filter((s) => s.id !== sessionToDelete));
			setShowDeleteModal(false);
			setSessionToDelete(null);
			setDeleteConfirmationChecked(false);
			setDeletableSessions((prev) => {
				const next = new Set(prev);
				next.delete(sessionToDelete);
				return next;
			});
		} catch (err) {
			console.error("Error deleting session:", err);
			setError(
				err instanceof Error ? err.message : "Failed to delete session"
			);
		} finally {
			setDeleting(false);
		}
	};

	// Handle delete button click (stop event propagation)
	const handleDeleteClick = (e: React.MouseEvent, sessionId: string) => {
		e.stopPropagation(); // Prevent navigation to session detail
		setSessionToDelete(sessionId);
		setShowDeleteModal(true);
		setDeleteConfirmationChecked(false);
		setError(null);
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
									<p className="text-muted-foreground">
										Loading sessions...
									</p>
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
		<>
			<SidebarProvider>
				<AppSidebar variant="inset" />
				<SidebarInset>
					<SiteHeader title="Sessions" />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
								{/* Sessions List */}
								{sessions.length === 0 ? (
									<Box>
										<p className="text-muted-foreground">
											No sessions found.
										</p>
									</Box>
								) : (
									<Stack direction="column" spacing={4}>
										{sessions.map((session, index) => {
											const isLastSession = index === 0;
											const showDelete =
												isAdmin &&
												session.status ===
													"completed" &&
												deletableSessions.has(
													session.id
												) &&
												isLastSession;

											return (
												<Box
													key={session.id}
													onClick={() =>
														router.push(
															`/session/${session.id}`
														)
													}
													className={cn(
														"group relative bg-card rounded-[24px] border border-border/50 p-4 transition-all active:scale-[0.98] active:bg-accent/50 cursor-pointer shadow-sm hover:border-primary/30",
														showDelete &&
															"flex flex-col gap-3"
													)}
												>
													<Stack
														direction="row"
														alignItems="center"
														spacing={4}
													>
														{/* Left: Date */}
														<Box className="flex flex-col items-center justify-center min-w-[72px] border-r border-border/30 pr-4">
															<span className="text-[10px] font-bold text-primary uppercase tracking-wider mb-0.5">
																{formatDateWeekday(
																	session.created_at
																)}
															</span>
															<span className="text-xl font-bold font-heading">
																{formatDateDay(
																	session.created_at
																)}
															</span>
															<Stack
																direction="row"
																alignItems="center"
																spacing={1}
																className="mt-1 text-[10px] text-muted-foreground font-medium"
															>
																<Icon
																	icon="solar:clock-circle-linear"
																	className="size-3"
																/>
																<span>
																	{formatDateYear(
																		session.created_at
																	)}
																</span>
															</Stack>
														</Box>

														{/* Center: Stats */}
														<Box className="flex-1 min-w-0 py-1">
															<Stack
																direction="row"
																alignItems="center"
																spacing={1.5}
															>
																<Icon
																	icon="solar:users-group-two-rounded-bold-duotone"
																	className="size-4 text-muted-foreground"
																/>
																<span className="text-xs font-semibold">
																	{
																		session.player_count
																	}{" "}
																	<span className="text-muted-foreground font-normal">
																		Players
																	</span>
																</span>
															</Stack>
														</Box>

														{/* Right: Status & Actions */}
														<Stack
															direction="column"
															alignItems="end"
															spacing={2}
														>
															<Box
																className={cn(
																	"text-[10px] font-bold px-2 py-1 rounded-full border",
																	session.status ===
																		"completed"
																		? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
																		: "bg-chart-2/10 text-chart-2 border-chart-2/20"
																)}
															>
																{session.status ===
																"active"
																	? "ACTIVE"
																	: "COMPLETED"}
															</Box>
															<Icon
																icon="solar:alt-arrow-right-linear"
																className="size-4 text-muted-foreground/50"
															/>
														</Stack>
													</Stack>

													{/* Delete Section (only for last session) */}
													{showDelete && (
														<Box className="pt-2 mt-2 border-t border-border/30 flex items-center justify-between">
															<span className="text-[10px] text-muted-foreground italic">
																Admin Action
																Required?
															</span>
															<Button
																variant="destructive"
																size="sm"
																onClick={(e) =>
																	handleDeleteClick(
																		e,
																		session.id
																	)
																}
																className="flex items-center gap-1.5 bg-destructive/10 text-destructive text-[11px] font-bold px-3 py-1.5 rounded-full border border-destructive/20 hover:bg-destructive hover:text-white transition-colors"
															>
																<Icon
																	icon="solar:trash-bin-trash-bold"
																	className="size-3.5"
																/>
																Delete Session
															</Button>
														</Box>
													)}
												</Box>
											);
										})}
									</Stack>
								)}
							</div>
						</div>
					</div>
				</SidebarInset>
			</SidebarProvider>
			{/* Delete Session Confirmation Modal */}
			{showDeleteModal && (
				<Box className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
					<Box className="bg-card rounded-[24px] p-6 border border-border/50 max-w-sm w-full mx-4">
						<Stack direction="column" spacing={4}>
							<Box>
								<h2 className="text-2xl font-bold font-heading text-destructive">
									Delete Session
								</h2>
								<p className="text-muted-foreground mt-2 text-sm">
									This will permanently delete this session
									and rebuild all Elo ratings from scratch.
									This action cannot be undone.
								</p>
							</Box>
							<Box>
								<label className="flex items-start gap-3 cursor-pointer">
									<input
										type="checkbox"
										checked={deleteConfirmationChecked}
										onChange={(e) =>
											setDeleteConfirmationChecked(
												e.target.checked
											)
										}
										disabled={deleting}
										className="mt-1 size-4 rounded border-border"
									/>
									<span className="text-sm text-foreground">
										I understand this cannot be undone
									</span>
								</label>
							</Box>
							{error && (
								<Box>
									<p className="text-sm text-destructive">
										{error}
									</p>
								</Box>
							)}
							<Stack direction="row" spacing={3}>
								<Button
									variant="outline"
									onClick={() => {
										setShowDeleteModal(false);
										setSessionToDelete(null);
										setDeleteConfirmationChecked(false);
										setError(null);
									}}
									disabled={deleting}
									className="flex-1"
								>
									Cancel
								</Button>
								<Button
									variant="destructive"
									onClick={handleDeleteSession}
									disabled={
										deleting || !deleteConfirmationChecked
									}
									className="flex-1"
								>
									{deleting
										? "Deleting..."
										: "Delete Session"}
								</Button>
							</Stack>
						</Stack>
					</Box>
				</Box>
			)}
		</>
	);
}

export default function SessionsPage() {
	return (
		<AuthGuard>
			<SessionsPageContent />
		</AuthGuard>
	);
}
