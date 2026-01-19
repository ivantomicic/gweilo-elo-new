"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminGuard } from "@/components/auth/admin-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Box } from "@/components/ui/box";
import { Stack } from "@/components/ui/stack";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loading";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/ui/icon";
import { supabase } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";

type AnalyticsEvent = {
	id: string;
	user_id: string | null;
	event_name: string;
	page: string | null;
	created_at: string;
	user?: {
		email: string;
		name: string;
	} | null;
	player?: {
		id: string;
		name: string;
	} | null;
};

type UserOption = {
	id: string;
	email: string;
	name: string;
};

function AdminActivityPageContent() {
	const pathname = usePathname();
	const router = useRouter();
	const [events, setEvents] = useState<AnalyticsEvent[]>([]);
	const [loading, setLoading] = useState(true);
	const [page, setPage] = useState(1);
	const [totalCount, setTotalCount] = useState(0);
	const [users, setUsers] = useState<UserOption[]>([]);
	const [loadingUsers, setLoadingUsers] = useState(true);
	const [filters, setFilters] = useState({
		userId: "__all__",
		eventName: "",
		dateFrom: "",
		dateTo: "",
	});

	const pageSize = 50;

	// Determine active tab based on current route
	const activeTab = pathname === "/admin/activity" ? "activity" : "users";

	const handleTabChange = (value: string) => {
		if (value === "activity") {
			router.push("/admin/activity");
		} else {
			router.push("/admin");
		}
	};

	// Fetch available users (for filter dropdown)
	useEffect(() => {
		const fetchUsers = async () => {
			try {
				setLoadingUsers(true);

				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					return;
				}

				// Get unique user IDs from analytics_events
				const { data: uniqueUserIds, error: uniqueError } = await supabase
					.from("analytics_events")
					.select("user_id")
					.not("user_id", "is", null);

				if (uniqueError) {
					console.error("Error fetching unique user IDs:", uniqueError);
					return;
				}

				const userIds = [
					...new Set(
						(uniqueUserIds || []).map((e) => e.user_id).filter(Boolean)
					),
				] as string[];

				if (userIds.length === 0) {
					setUsers([]);
					return;
				}

				// Fetch user details from admin API
				const usersResponse = await fetch("/api/admin/users", {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				});

				if (usersResponse.ok) {
					const { users: allUsers } = await usersResponse.json();
					// Filter to only users that have events
					const usersWithEvents = allUsers
						.filter((u: UserOption) => userIds.includes(u.id))
						.map((u: UserOption) => ({
							id: u.id,
							email: u.email,
							name: u.name,
						}))
						.sort((a: UserOption, b: UserOption) =>
							a.name.localeCompare(b.name)
						);

					setUsers(usersWithEvents);
				}
			} catch (error) {
				console.error("Error fetching users:", error);
			} finally {
				setLoadingUsers(false);
			}
		};

		fetchUsers();
	}, []);

	// Fetch events
	useEffect(() => {
		const fetchEvents = async () => {
			try {
				setLoading(true);

				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					return;
				}

				// Build query
				let query = supabase
					.from("analytics_events")
					.select("*", { count: "exact" })
					.order("created_at", { ascending: false })
					.range((page - 1) * pageSize, page * pageSize - 1);

				// Apply filters
				if (filters.userId && filters.userId !== "__all__") {
					query = query.eq("user_id", filters.userId);
				}
				if (filters.eventName) {
					query = query.eq("event_name", filters.eventName);
				}
				if (filters.dateFrom) {
					query = query.gte("created_at", filters.dateFrom);
				}
				if (filters.dateTo) {
					query = query.lte("created_at", filters.dateTo + "T23:59:59");
				}

				const { data, error, count } = await query;

				if (error) {
					console.error("Error fetching events:", error);
					console.error("Error details:", JSON.stringify(error, null, 2));
					setEvents([]);
					setTotalCount(0);
					return;
				}

				console.log("Fetched events:", data?.length || 0, "Total count:", count);

				setEvents(data || []);
				setTotalCount(count || 0);

				// Fetch user data and player data for events
				if (data && data.length > 0) {
					const userIds = [...new Set(data.map((e) => e.user_id).filter(Boolean))] as string[];
					
					// Extract player IDs from player_viewed events
					const playerIds = [
						...new Set(
							data
								.filter((e) => e.event_name === "player_viewed" && e.page)
								.map((e) => {
									const match = e.page?.match(/^\/player\/([a-f0-9-]+)$/i);
									return match ? match[1] : null;
								})
								.filter(Boolean)
						),
					] as string[];

					// Fetch users (for event user_id)
					if (userIds.length > 0) {
						const usersResponse = await fetch("/api/admin/users", {
							headers: {
								Authorization: `Bearer ${session.access_token}`,
							},
						});

						if (usersResponse.ok) {
							const { users } = await usersResponse.json();
							const userMap = new Map<string, UserOption>(
								users.map((u: UserOption) => [u.id, u])
							);

							setEvents((prev) =>
								prev.map((event) => {
									const mappedUser = event.user_id ? userMap.get(event.user_id) : null;
									return {
										...event,
										user: mappedUser
											? {
													email: mappedUser.email || "",
													name: mappedUser.name || "Unknown",
											  }
											: null,
									};
								})
							);
						}
					}

					// Fetch player names (for player_viewed events)
					if (playerIds.length > 0) {
						// Fetch player data in parallel
						const playerPromises = playerIds.map(async (playerId) => {
							try {
								const playerResponse = await fetch(`/api/player/${playerId}`, {
									headers: {
										Authorization: `Bearer ${session.access_token}`,
									},
								});
								if (playerResponse.ok) {
									const playerData = await playerResponse.json();
									return {
										id: playerId,
										name: playerData.display_name || "Unknown",
									};
								}
								return { id: playerId, name: "Unknown" };
							} catch (err) {
								console.error(`Error fetching player ${playerId}:`, err);
								return { id: playerId, name: "Unknown" };
							}
						});

						const playerData = await Promise.all(playerPromises);
						const playerMap = new Map(
							playerData.map((p) => [p.id, p])
						);

						// Update events with player names
						setEvents((prev) =>
							prev.map((event) => {
								if (event.event_name === "player_viewed" && event.page) {
									const match = event.page.match(/^\/player\/([a-f0-9-]+)$/i);
									const playerId = match ? match[1] : null;
									const player = playerId ? playerMap.get(playerId) : null;
									return {
										...event,
										player: player || null,
									};
								}
								return event;
							})
						);
					}
				}
			} catch (error) {
				console.error("Error fetching events:", error);
				console.error("Error stack:", error instanceof Error ? error.stack : String(error));
				setEvents([]);
				setTotalCount(0);
			} finally {
				setLoading(false);
			}
		};

		fetchEvents();
	}, [page, filters.userId, filters.eventName, filters.dateFrom, filters.dateTo]);

	const handleFilterChange = (key: string, value: string) => {
		setFilters((prev) => ({ ...prev, [key]: value }));
		setPage(1); // Reset to first page on filter change
	};

	const handleResetFilters = () => {
		setFilters({
			userId: "__all__",
			eventName: "",
			dateFrom: "",
			dateTo: "",
		});
		setPage(1);
	};

	const totalPages = Math.ceil(totalCount / pageSize);

	// Format date: DD.MM.YYYY
	const formatDate = (dateString: string): string => {
		const date = new Date(dateString);
		const day = String(date.getDate()).padStart(2, "0");
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const year = date.getFullYear();
		return `${day}.${month}.${year}`;
	};

	// Format time: HH:MM:SS
	const formatTime = (dateString: string): string => {
		const date = new Date(dateString);
		const hours = String(date.getHours()).padStart(2, "0");
		const minutes = String(date.getMinutes()).padStart(2, "0");
		const seconds = String(date.getSeconds()).padStart(2, "0");
		return `${hours}:${minutes}:${seconds}`;
	};

	return (
		<SidebarProvider>
			<AppSidebar variant="inset" />
			<SidebarInset>
				<SiteHeader title="Activity Log" />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
							{/* Admin Navigation Tabs */}
							<Box className="mb-4">
								<Tabs value={activeTab} onValueChange={handleTabChange}>
									<TabsList>
										<TabsTrigger value="users">Users</TabsTrigger>
										<TabsTrigger value="activity">Activity Log</TabsTrigger>
									</TabsList>
								</Tabs>
							</Box>

							{/* Filters */}
							<Box className="space-y-4 p-4">
								<Stack direction="column" spacing={4}>
									<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
										<div>
											<Label htmlFor="filter-user">User</Label>
											<Select
												value={filters.userId || "__all__"}
												onValueChange={(value) =>
													handleFilterChange("userId", value)
												}
											>
												<SelectTrigger id="filter-user">
													<SelectValue placeholder="All users" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="__all__">All users</SelectItem>
													{loadingUsers ? (
														<SelectItem value="__loading__" disabled>
															Loading users...
														</SelectItem>
													) : (
														users.map((user) => (
															<SelectItem key={user.id} value={user.id}>
																{user.name} ({user.email})
															</SelectItem>
														))
													)}
												</SelectContent>
											</Select>
										</div>
										<div>
											<Label htmlFor="filter-event">Event Type</Label>
											<Input
												id="filter-event"
												type="text"
												placeholder="user_logged_in, app_loaded, page_viewed"
												value={filters.eventName}
												onChange={(e) =>
													handleFilterChange("eventName", e.target.value)
												}
											/>
										</div>
										<div>
											<Label htmlFor="filter-date-from">From Date</Label>
											<Input
												id="filter-date-from"
												type="date"
												value={filters.dateFrom}
												onChange={(e) =>
													handleFilterChange("dateFrom", e.target.value)
												}
											/>
										</div>
										<div>
											<Label htmlFor="filter-date-to">To Date</Label>
											<Input
												id="filter-date-to"
												type="date"
												value={filters.dateTo}
												onChange={(e) =>
													handleFilterChange("dateTo", e.target.value)
												}
											/>
										</div>
									</div>
									<div>
										<Button
											variant="outline"
											onClick={handleResetFilters}
										>
											Reset Filters
										</Button>
									</div>
								</Stack>
							</Box>

							{/* Events Table */}
							<Box>
								{loading ? (
									<Loading label="Loading activity..." />
								) : (
									<>
										<div className="mb-4 text-sm text-muted-foreground">
											Total: {totalCount} events
										</div>
										<div className="overflow-x-auto">
											<Table>
												<TableHeader>
													<TableRow>
														<TableHead>User</TableHead>
														<TableHead>Event</TableHead>
														<TableHead>Page</TableHead>
														<TableHead>
															<Stack
																direction="row"
																alignItems="center"
																spacing={1.5}
															>
																<Icon
																	icon="solar:calendar-bold"
																	className="size-4 text-muted-foreground"
																/>
																<Icon
																	icon="solar:clock-circle-bold"
																	className="size-4 text-muted-foreground"
																/>
																<span>Timestamp</span>
															</Stack>
														</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{events.length === 0 ? (
														<TableRow>
															<TableCell colSpan={4} className="text-center">
																No events found
															</TableCell>
														</TableRow>
													) : (
														events.map((event) => (
															<TableRow key={event.id}>
																<TableCell>
																	{event.user ? (
																		<span className="font-medium">
																			{event.user.name}
																		</span>
																	) : event.user_id ? (
																		<span className="text-muted-foreground">
																			{event.user_id.slice(0, 8)}...
																		</span>
																	) : (
																		<span className="text-muted-foreground">
																			Anonymous
																		</span>
																	)}
																</TableCell>
																<TableCell>
																	<code className="text-sm">{event.event_name}</code>
																</TableCell>
																<TableCell>
																	{event.event_name === "player_viewed" && event.player ? (
																		<Stack
																			direction="row"
																			alignItems="center"
																			spacing={2}
																		>
																			<Icon
																				icon="solar:user-bold"
																				className="size-4 text-muted-foreground"
																			/>
																			<span className="font-medium">{event.player.name}</span>
																			<span className="text-xs text-muted-foreground">
																				({event.player.id.slice(0, 8)}...)
																			</span>
																		</Stack>
																	) : event.page ? (
																		<code className="text-sm">{event.page}</code>
																	) : (
																		<span className="text-muted-foreground">—</span>
																	)}
																</TableCell>
																<TableCell>
																	<Stack
																		direction="column"
																		spacing={1.5}
																	>
																		<Stack
																			direction="row"
																			alignItems="center"
																			spacing={2}
																		>
																			<Icon
																				icon="solar:calendar-bold"
																				className="size-4 text-muted-foreground"
																			/>
																			<span>{formatDate(event.created_at)}</span>
																		</Stack>
																		<Stack
																			direction="row"
																			alignItems="center"
																			spacing={2}
																		>
																			<Icon
																				icon="solar:clock-circle-bold"
																				className="size-4 text-muted-foreground"
																			/>
																			<span>{formatTime(event.created_at)}</span>
																		</Stack>
																	</Stack>
																</TableCell>
															</TableRow>
														))
													)}
												</TableBody>
											</Table>
										</div>

										{/* Pagination */}
										{totalPages > 1 && (
											<div className="mt-4 flex items-center justify-between">
												<Button
													variant="outline"
													onClick={() => setPage((p) => Math.max(1, p - 1))}
													disabled={page === 1}
												>
													Previous
												</Button>
												<span className="text-sm text-muted-foreground">
													Page {page} of {totalPages}
												</span>
												<Button
													variant="outline"
													onClick={() =>
														setPage((p) => Math.min(totalPages, p + 1))
													}
													disabled={page === totalPages}
												>
													Next
												</Button>
											</div>
										)}
									</>
								)}
							</Box>
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

export default function AdminActivityPage() {
	return (
		<AdminGuard>
			<AdminActivityPageContent />
		</AdminGuard>
	);
}
