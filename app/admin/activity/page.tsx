"use client";

import { useState, useEffect, useMemo } from "react";
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/vendor/shadcn/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/vendor/shadcn/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { supabase } from "@/lib/supabase/client";

type AnalyticsEvent = {
	id: string;
	user_id: string | null;
	event_name: string;
	page: string | null;
	created_at: string;
	user?: {
		email: string;
		name: string;
		avatar: string | null;
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
	avatar: string | null;
};

type ActivityFilters = {
	selectedUserIds: string[];
	eventName: string;
	dateFrom: string;
	dateTo: string;
};

type ActivitySession = {
	id: string;
	userGroupKey: string;
	userName: string;
	userAvatar: string | null;
	userId: string | null;
	startedAt: string;
	endedAt: string;
	eventCount: number;
	durationMs: number;
	flow: string[];
};

type TimelineUserGroup = {
	id: string;
	userGroupKey: string;
	userName: string;
	userAvatar: string | null;
	userId: string | null;
	sessions: ActivitySession[];
};

const SESSION_GAP_MS = 30 * 60 * 1000;

const STATIC_PAGE_LABELS: Record<string, string> = {
	"/": "Home",
	"/dashboard": "Dashboard",
	"/statistics": "Statistics",
	"/sessions": "Sessions",
	"/start-session": "Start Session",
	"/calculator": "Calculator",
	"/videos": "Videos",
	"/polls": "Polls",
	"/notifications": "Notifications",
	"/settings": "Settings",
	"/no-shows": "No Shows",
	"/rules": "Rules",
	"/admin": "Admin",
	"/admin/activity": "Admin Activity",
	"/admin/settings": "Admin Settings",
};

const extractSessionIdFromPath = (pagePath: string | null): string | null => {
	if (!pagePath) {
		return null;
	}

	const normalized = pagePath.split("?")[0].split("#")[0];
	const match = normalized.match(/^\/session\/([a-f0-9-]+)(?:\/.*)?$/i);
	return match ? match[1] : null;
};

const formatSessionShortDate = (dateString: string): string => {
	const date = new Date(dateString);
	if (Number.isNaN(date.getTime())) {
		return "Session";
	}

	const day = String(date.getDate()).padStart(2, "0");
	const month = String(date.getMonth() + 1).padStart(2, "0");
	return `Session ${day}.${month}.`;
};

const getReadablePathLabel = (
	pagePath: string,
	sessionLabelMap: Record<string, string>,
): string => {
	const normalized = pagePath.split("?")[0].split("#")[0];
	const staticLabel = STATIC_PAGE_LABELS[normalized];
	if (staticLabel) {
		return staticLabel;
	}

	const sessionId = extractSessionIdFromPath(normalized);
	if (sessionId) {
		return sessionLabelMap[sessionId] || "Session";
	}

	if (/^\/player\/[a-f0-9-]+$/i.test(normalized)) {
		return "Player";
	}

	return normalized;
};

const buildFlowStep = (
	event: AnalyticsEvent,
	sessionLabelMap: Record<string, string>,
): string => {
	if (event.event_name === "app_loaded") {
		return "App Loaded";
	}
	if (event.event_name === "user_logged_in") {
		return "Logged In";
	}
	if (event.event_name === "page_viewed" && event.page) {
		return getReadablePathLabel(event.page, sessionLabelMap);
	}
	if (event.event_name === "player_viewed") {
		return event.player ? `Player: ${event.player.name}` : "Player";
	}
	return event.event_name;
};

const getInitials = (name: string): string =>
	name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("") || "?";

function AdminActivityPageContent() {
	const pathname = usePathname();
	const router = useRouter();
	const [events, setEvents] = useState<AnalyticsEvent[]>([]);
	const [loading, setLoading] = useState(true);
	const [page, setPage] = useState(1);
	const [totalCount, setTotalCount] = useState(0);
	const [users, setUsers] = useState<UserOption[]>([]);
	const [loadingUsers, setLoadingUsers] = useState(true);
	const [currentUserId, setCurrentUserId] = useState<string | null>(null);
	const [userFilterReady, setUserFilterReady] = useState(false);
	const [sessionLabelMap, setSessionLabelMap] = useState<
		Record<string, string>
	>({});
	const [activityView, setActivityView] = useState<"timeline" | "table">(
		"timeline",
	);
	const [filters, setFilters] = useState<ActivityFilters>({
		selectedUserIds: [],
		eventName: "",
		dateFrom: "",
		dateTo: "",
	});

	const pageSize = 50;

	// Determine active tab based on current route
	const activeTab =
		pathname === "/admin/activity"
			? "activity"
			: pathname === "/admin/settings"
				? "settings"
				: "users";

	const handleTabChange = (value: string) => {
		if (value === "activity") {
			router.push("/admin/activity");
		} else if (value === "settings") {
			router.push("/admin/settings");
		} else {
			router.push("/admin");
		}
	};

	// Fetch available users (for filter dropdown)
	useEffect(() => {
		const fetchUsers = async () => {
			try {
				setLoadingUsers(true);
				setUserFilterReady(false);

				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					setCurrentUserId(null);
					setUsers([]);
					setFilters((prev) => ({ ...prev, selectedUserIds: [] }));
					return;
				}

				setCurrentUserId(session.user.id);

				// Get unique user IDs from analytics_events
				const { data: uniqueUserIds, error: uniqueError } =
					await supabase
						.from("analytics_events")
						.select("user_id")
						.not("user_id", "is", null);

					if (uniqueError) {
						console.error(
							"Error fetching unique user IDs:",
							uniqueError,
						);
						setUsers([]);
						setFilters((prev) => ({ ...prev, selectedUserIds: [] }));
						return;
					}

				const userIds = [
					...new Set(
						(uniqueUserIds || [])
							.map((e) => e.user_id)
							.filter(Boolean),
					),
				] as string[];

				if (userIds.length === 0) {
					setUsers([]);
					setFilters((prev) => ({ ...prev, selectedUserIds: [] }));
					return;
				}

				// Fetch user details from admin API
				const usersResponse = await fetch("/api/admin/users", {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				});

				if (!usersResponse.ok) {
					setUsers([]);
					setFilters((prev) => ({ ...prev, selectedUserIds: [] }));
					return;
				}

				const { users: allUsers } = await usersResponse.json();
				// Filter to only users that have events
					const usersWithEvents = allUsers
						.filter((u: UserOption) => userIds.includes(u.id))
						.map((u: UserOption) => ({
							id: u.id,
							email: u.email,
							name: u.name,
							avatar: u.avatar ?? null,
						}))
						.sort((a: UserOption, b: UserOption) =>
							a.name.localeCompare(b.name),
						);

					setUsers(usersWithEvents);
					setFilters((prev) => ({
						...prev,
						selectedUserIds: usersWithEvents
							.filter((u: UserOption) => u.id !== session.user.id)
							.map((u: UserOption) => u.id),
					}));
			} catch (error) {
				console.error("Error fetching users:", error);
				setUsers([]);
				setFilters((prev) => ({ ...prev, selectedUserIds: [] }));
			} finally {
				setLoadingUsers(false);
				setUserFilterReady(true);
			}
		};

		fetchUsers();
	}, []);

	// Fetch events
	useEffect(() => {
		if (!userFilterReady) {
			return;
		}

		const fetchEvents = async () => {
			try {
				setLoading(true);

				const {
					data: { session },
				} = await supabase.auth.getSession();

					if (!session) {
						setEvents([]);
						setTotalCount(0);
						setSessionLabelMap({});
						return;
					}

				// Build query
				let query = supabase
					.from("analytics_events")
					.select("*", { count: "exact" })
					.order("created_at", { ascending: false })
					.range((page - 1) * pageSize, page * pageSize - 1);

				// Apply filters
					if (users.length > 0) {
						if (filters.selectedUserIds.length === 0) {
							setEvents([]);
							setTotalCount(0);
							setSessionLabelMap({});
							return;
						}

					if (filters.selectedUserIds.length < users.length) {
						query = query.in("user_id", filters.selectedUserIds);
					}
				}
				if (filters.eventName) {
					query = query.eq("event_name", filters.eventName);
				}
				if (filters.dateFrom) {
					query = query.gte("created_at", filters.dateFrom);
				}
				if (filters.dateTo) {
					query = query.lte(
						"created_at",
						filters.dateTo + "T23:59:59",
					);
				}

				const { data, error, count } = await query;

					if (error) {
						console.error("Error fetching events:", error);
					console.error(
						"Error details:",
						JSON.stringify(error, null, 2),
					);
						setEvents([]);
						setTotalCount(0);
						setSessionLabelMap({});
						return;
					}

				console.log(
					"Fetched events:",
					data?.length || 0,
					"Total count:",
					count,
				);

					setEvents(data || []);
					setTotalCount(count || 0);

					const sessionIds = [
						...new Set(
							(data || [])
								.map((event) =>
									extractSessionIdFromPath(event.page),
								)
								.filter(Boolean),
						),
					] as string[];

					if (sessionIds.length > 0) {
						const { data: sessionsData, error: sessionsError } =
							await supabase
								.from("sessions")
								.select("id, created_at")
								.in("id", sessionIds);

						if (sessionsError) {
							console.error(
								"Error fetching session labels:",
								sessionsError,
							);
							setSessionLabelMap({});
						} else {
							const typedSessions = (sessionsData || []) as {
								id: string;
								created_at: string | null;
							}[];
							const labels = typedSessions.reduce<
								Record<string, string>
							>((acc, sessionRow) => {
								if (sessionRow.created_at) {
									acc[sessionRow.id] =
										formatSessionShortDate(
											sessionRow.created_at,
										);
								}
								return acc;
							}, {});
							setSessionLabelMap(labels);
						}
					} else {
						setSessionLabelMap({});
					}

					// Fetch user data and player data for events
					if (data && data.length > 0) {
					const userIds = [
						...new Set(data.map((e) => e.user_id).filter(Boolean)),
					] as string[];

					// Extract player IDs from player_viewed events
					const playerIds = [
						...new Set(
							data
								.filter(
									(e) =>
										e.event_name === "player_viewed" &&
										e.page,
								)
								.map((e) => {
									const match = e.page?.match(
										/^\/player\/([a-f0-9-]+)$/i,
									);
									return match ? match[1] : null;
								})
								.filter(Boolean),
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
								users.map((u: UserOption) => [u.id, u]),
							);

							setEvents((prev) =>
								prev.map((event) => {
									const mappedUser = event.user_id
										? userMap.get(event.user_id)
										: null;
										return {
											...event,
											user: mappedUser
												? {
														email:
															mappedUser.email || "",
														name:
															mappedUser.name ||
															"Unknown",
														avatar:
															mappedUser.avatar ??
															null,
													}
												: null,
										};
									}),
							);
						}
					}

					// Fetch player names (for player_viewed events)
					if (playerIds.length > 0) {
						// Fetch player data in parallel
						const playerPromises = playerIds.map(
							async (playerId) => {
								try {
									const playerResponse = await fetch(
										`/api/player/${playerId}`,
										{
											headers: {
												Authorization: `Bearer ${session.access_token}`,
											},
										},
									);
									if (playerResponse.ok) {
										const playerData =
											await playerResponse.json();
										return {
											id: playerId,
											name:
												playerData.display_name ||
												"Unknown",
										};
									}
									return { id: playerId, name: "Unknown" };
								} catch (err) {
									console.error(
										`Error fetching player ${playerId}:`,
										err,
									);
									return { id: playerId, name: "Unknown" };
								}
							},
						);

						const playerData = await Promise.all(playerPromises);
						const playerMap = new Map(
							playerData.map((p) => [p.id, p]),
						);

						// Update events with player names
						setEvents((prev) =>
							prev.map((event) => {
								if (
									event.event_name === "player_viewed" &&
									event.page
								) {
									const match = event.page.match(
										/^\/player\/([a-f0-9-]+)$/i,
									);
									const playerId = match ? match[1] : null;
									const player = playerId
										? playerMap.get(playerId)
										: null;
									return {
										...event,
										player: player || null,
									};
								}
								return event;
							}),
						);
					}
				}
				} catch (error) {
					console.error("Error fetching events:", error);
				console.error(
					"Error stack:",
					error instanceof Error ? error.stack : String(error),
				);
					setEvents([]);
					setTotalCount(0);
					setSessionLabelMap({});
				} finally {
					setLoading(false);
				}
		};

		fetchEvents();
	}, [
		page,
		userFilterReady,
		users.length,
		filters.selectedUserIds,
		filters.eventName,
		filters.dateFrom,
		filters.dateTo,
	]);

	const handleFilterChange = (
		key: "eventName" | "dateFrom" | "dateTo",
		value: string,
	) => {
		setFilters((prev) => ({ ...prev, [key]: value }));
		setPage(1); // Reset to first page on filter change
	};

	const handleUserSelectionChange = (userId: string, checked: boolean) => {
		setFilters((prev) => {
			const isSelected = prev.selectedUserIds.includes(userId);
			if (checked && !isSelected) {
				return {
					...prev,
					selectedUserIds: [...prev.selectedUserIds, userId],
				};
			}
			if (!checked && isSelected) {
				return {
					...prev,
					selectedUserIds: prev.selectedUserIds.filter(
						(id) => id !== userId,
					),
				};
			}
			return prev;
		});
		setPage(1);
	};

	const handleSelectAllUsers = () => {
		setFilters((prev) => ({
			...prev,
			selectedUserIds: users.map((user) => user.id),
		}));
		setPage(1);
	};

	const handleClearUsers = () => {
		setFilters((prev) => ({ ...prev, selectedUserIds: [] }));
		setPage(1);
	};

	const handleResetFilters = () => {
		setFilters({
			selectedUserIds: users.map((user) => user.id),
			eventName: "",
			dateFrom: "",
			dateTo: "",
		});
		setPage(1);
	};

	const totalPages = Math.ceil(totalCount / pageSize);
	const allUsersSelected =
		users.length > 0 && filters.selectedUserIds.length === users.length;
	const userFilterLabel = loadingUsers
		? "Loading users..."
		: users.length === 0
			? "No users"
			: allUsersSelected
				? "All users"
				: filters.selectedUserIds.length === 0
					? "No users selected"
					: `${filters.selectedUserIds.length} users selected`;

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

	const formatDuration = (durationMs: number): string => {
		if (durationMs < 60 * 1000) {
			return "<1m";
		}

		const totalMinutes = Math.floor(durationMs / (60 * 1000));
		if (totalMinutes < 60) {
			return `${totalMinutes}m`;
		}

		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;
		return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
	};

	const formatDateTime = (dateString: string): string =>
		`${formatDate(dateString)} ${formatTime(dateString)}`;

	const timelineSessions = useMemo<ActivitySession[]>(() => {
		if (events.length === 0) {
			return [];
		}

		const sortedEvents = [...events].sort(
			(a, b) =>
				new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
		);
		const eventsByUser = new Map<string, AnalyticsEvent[]>();

		for (const event of sortedEvents) {
			const userKey = event.user_id ?? "__anonymous__";
			const existing = eventsByUser.get(userKey) || [];
			existing.push(event);
			eventsByUser.set(userKey, existing);
		}

		const sessions: ActivitySession[] = [];

		const pushSession = (sessionEvents: AnalyticsEvent[]) => {
			if (sessionEvents.length === 0) {
				return;
			}

			const firstEvent = sessionEvents[0];
			const lastEvent = sessionEvents[sessionEvents.length - 1];
			const startMs = new Date(firstEvent.created_at).getTime();
			const endMs = new Date(lastEvent.created_at).getTime();
				const compactFlow = sessionEvents
					.map((event) => buildFlowStep(event, sessionLabelMap))
					.filter(
						(step, index, arr) => index === 0 || step !== arr[index - 1],
					);

					sessions.push({
						id: `${firstEvent.id}-${lastEvent.id}`,
						userGroupKey:
							firstEvent.user_id ||
							`anon:${firstEvent.user?.name || "anonymous"}`,
						userName:
							firstEvent.user?.name ||
							(firstEvent.user_id
							? `User ${firstEvent.user_id.slice(0, 8)}...`
							: "Anonymous"),
					userAvatar: firstEvent.user?.avatar || null,
					userId: firstEvent.user_id,
					startedAt: firstEvent.created_at,
					endedAt: lastEvent.created_at,
					eventCount: sessionEvents.length,
				durationMs:
					Number.isFinite(startMs) && Number.isFinite(endMs)
							? Math.max(0, endMs - startMs)
							: 0,
					flow: compactFlow,
				});
			};

		for (const userEvents of eventsByUser.values()) {
			let currentSession: AnalyticsEvent[] = [];

			for (const event of userEvents) {
				const previousEvent = currentSession[currentSession.length - 1];
				const previousMs = previousEvent
					? new Date(previousEvent.created_at).getTime()
					: null;
				const currentMs = new Date(event.created_at).getTime();
				const splitByAppReload =
					currentSession.length > 0 &&
					event.event_name === "app_loaded" &&
					currentSession.some((existingEvent) =>
						["app_loaded", "page_viewed", "player_viewed"].includes(
							existingEvent.event_name,
						),
					);
				const splitByInactivity =
					currentSession.length > 0 &&
					previousMs !== null &&
					Number.isFinite(previousMs) &&
					Number.isFinite(currentMs) &&
					currentMs - previousMs > SESSION_GAP_MS;

				if (splitByAppReload || splitByInactivity) {
					pushSession(currentSession);
					currentSession = [event];
					continue;
				}

				currentSession.push(event);
			}

			pushSession(currentSession);
		}

		return sessions.sort(
			(a, b) =>
				new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
		);
	}, [events, sessionLabelMap]);

	const timelineGroups = useMemo<TimelineUserGroup[]>(() => {
		if (timelineSessions.length === 0) {
			return [];
		}

		const groups: TimelineUserGroup[] = [];

		for (const session of timelineSessions) {
			const lastGroup = groups[groups.length - 1];
			if (
				lastGroup &&
				lastGroup.userGroupKey === session.userGroupKey
			) {
				lastGroup.sessions.push(session);
				continue;
			}

			groups.push({
				id: session.id,
				userGroupKey: session.userGroupKey,
				userName: session.userName,
				userAvatar: session.userAvatar,
				userId: session.userId,
				sessions: [session],
			});
		}

		return groups;
	}, [timelineSessions]);

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
								<Tabs
									value={activeTab}
									onValueChange={handleTabChange}
								>
									<TabsList>
										<TabsTrigger value="users">
											Users
										</TabsTrigger>
									<TabsTrigger value="activity">
										Activity Log
									</TabsTrigger>
									<TabsTrigger value="settings">
										Settings
									</TabsTrigger>
									</TabsList>
								</Tabs>
							</Box>

								{/* Filters */}
									<Box className="space-y-4 p-4">
										<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
											<div className="space-y-2">
												<div className="flex min-h-5 items-center">
													<Label htmlFor="filter-user-trigger">
														Users
													</Label>
												</div>
												<div>
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button
																id="filter-user-trigger"
																type="button"
																variant="outline"
																className="w-full justify-between text-left"
															>
																<span className="truncate">
																	{
																		userFilterLabel
																	}
																</span>
																<Stack
																	direction="row"
																	alignItems="center"
																	spacing={2}
																>
																	<Icon
																		icon="solar:alt-arrow-down-linear"
																		className="size-4 text-muted-foreground"
																	/>
																</Stack>
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent
															align="start"
															className="w-[340px]"
														>
															<DropdownMenuLabel>
																Choose users to show
															</DropdownMenuLabel>
															<DropdownMenuSeparator />
															{loadingUsers ? (
																<div className="px-2 py-3 text-sm text-muted-foreground">
																	Loading users...
																</div>
															) : users.length ===
															  0 ? (
																<div className="px-2 py-3 text-sm text-muted-foreground">
																	No users with activity yet.
																</div>
															) : (
																<div className="max-h-72 overflow-y-auto py-1">
																	{users.map(
																		(user) => (
																			<DropdownMenuCheckboxItem
																				key={
																					user.id
																				}
																				checked={filters.selectedUserIds.includes(
																					user.id,
																				)}
																				onCheckedChange={(
																					checked,
																				) =>
																					handleUserSelectionChange(
																						user.id,
																						checked ===
																							true,
																					)
																				}
																				onSelect={(
																					event,
																				) =>
																					event.preventDefault()
																				}
																				>
																					<div className="flex min-w-0 flex-col">
																						<span className="truncate">
																							{
																								user.name
																							}
																							{user.id ===
																							currentUserId
																								? " (you)"
																								: ""}
																						</span>
																					</div>
																				</DropdownMenuCheckboxItem>
																		),
																	)}
																</div>
															)}
														</DropdownMenuContent>
													</DropdownMenu>
												</div>
												<div className="flex items-center gap-2">
													<Button
														type="button"
														variant="outline"
														size="sm"
														onClick={handleSelectAllUsers}
														disabled={
															loadingUsers ||
															users.length === 0
														}
													>
														All
													</Button>
													<Button
														type="button"
														variant="outline"
														size="sm"
														onClick={handleClearUsers}
														disabled={
															loadingUsers ||
															users.length === 0
														}
													>
														None
													</Button>
												</div>
												<p className="text-xs text-muted-foreground">
													{filters.selectedUserIds.length}/
													{users.length} selected. Your own activity is unchecked by default.
												</p>
											</div>

											<div className="space-y-2">
												<div className="flex min-h-5 items-center">
													<Label htmlFor="filter-event">
														Event Type
													</Label>
												</div>
												<Input
													id="filter-event"
													type="text"
													placeholder="user_logged_in, app_loaded, page_viewed"
													value={filters.eventName}
													onChange={(e) =>
														handleFilterChange(
															"eventName",
															e.target.value,
														)
													}
												/>
											</div>

											<div className="space-y-2">
												<div className="flex min-h-5 items-center">
													<Label htmlFor="filter-date-from">
														From Date
													</Label>
												</div>
												<Input
													id="filter-date-from"
													type="date"
													value={filters.dateFrom}
													onChange={(e) =>
														handleFilterChange(
															"dateFrom",
															e.target.value,
														)
													}
												/>
											</div>

											<div className="space-y-2">
												<div className="flex min-h-5 items-center">
													<Label htmlFor="filter-date-to">
														To Date
													</Label>
												</div>
												<Input
													id="filter-date-to"
													type="date"
													value={filters.dateTo}
													onChange={(e) =>
														handleFilterChange(
															"dateTo",
															e.target.value,
														)
													}
												/>
											</div>
										</div>

									<div>
										<Button
											type="button"
											variant="outline"
											onClick={handleResetFilters}
										>
											Reset filters
										</Button>
									</div>
								</Box>

								{/* Activity Results */}
								<Box>
									{loading ? (
										<Loading label="Loading activity..." />
									) : (
										<>
											<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
												<div className="text-sm text-muted-foreground">
													Total: {totalCount} events
												</div>
												<div className="inline-flex w-fit items-center rounded-md border p-1">
													<Button
														type="button"
														size="sm"
														variant={
															activityView ===
															"timeline"
																? "secondary"
																: "ghost"
														}
														onClick={() =>
															setActivityView(
																"timeline",
															)
														}
													>
														Timeline
													</Button>
													<Button
														type="button"
														size="sm"
														variant={
															activityView ===
															"table"
																? "secondary"
																: "ghost"
														}
														onClick={() =>
															setActivityView(
																"table",
															)
														}
													>
														Table
													</Button>
												</div>
											</div>

													{activityView === "timeline" ? (
														<>
															<div className="mb-3 text-xs text-muted-foreground">
																Sessions split on{" "}
																<code>app_loaded</code> or
																30m inactivity.
															</div>
															{timelineGroups.length ===
															0 ? (
																<div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
																	No events found
																</div>
															) : (
																<TooltipProvider delayDuration={120}>
																	<div className="space-y-2">
																		{timelineGroups.map(
																			(group) => (
																				<div
																					key={
																						group.id
																					}
																					className="rounded-md border p-3"
																				>
																					<div className="flex min-w-0 items-center gap-2.5">
																						<Avatar className="h-8 w-8 border">
																							<AvatarImage
																								src={
																									group.userAvatar ||
																									undefined
																								}
																								alt={
																									group.userName
																								}
																							/>
																							<AvatarFallback className="text-[11px] font-semibold">
																								{getInitials(
																									group.userName,
																								)}
																							</AvatarFallback>
																						</Avatar>
																						<p className="truncate text-sm font-medium">
																							{
																								group.userName
																							}
																							{group.userId ===
																							currentUserId
																								? " (you)"
																								: ""}
																						</p>
																					</div>

																					<div className="mt-2 space-y-2">
																						{group.sessions.map(
																							(
																								session,
																								index,
																							) => (
																								<div
																									key={
																										session.id
																									}
																									className={`${
																										index >
																										0
																											? "border-t pt-2"
																											: ""
																									}`}
																								>
																									<div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
																										<Tooltip>
																											<TooltipTrigger
																												asChild
																											>
																												<span className="inline-flex cursor-default items-center gap-1">
																													<Icon
																														icon="solar:calendar-bold"
																														className="size-3.5"
																													/>
																													{formatDate(
																														session.startedAt,
																													)}
																												</span>
																											</TooltipTrigger>
																											<TooltipContent>
																												Started:{" "}
																												{formatDateTime(
																													session.startedAt,
																												)}
																											</TooltipContent>
																										</Tooltip>
																										<Tooltip>
																											<TooltipTrigger
																												asChild
																											>
																												<span className="inline-flex cursor-default items-center gap-1">
																													<Icon
																														icon="solar:clock-circle-bold"
																														className="size-3.5"
																													/>
																													{formatDuration(
																														session.durationMs,
																													)}
																												</span>
																											</TooltipTrigger>
																											<TooltipContent>
																												From{" "}
																												{formatDateTime(
																													session.startedAt,
																												)}{" "}
																												to{" "}
																												{formatDateTime(
																													session.endedAt,
																												)}
																											</TooltipContent>
																										</Tooltip>
																										<span>
																											{
																												session.eventCount
																											}{" "}
																											events
																										</span>
																									</div>

																									<div className="mt-1 overflow-x-auto">
																										<div className="inline-flex items-center gap-1 whitespace-nowrap text-xs">
																											{session.flow
																												.slice(
																													0,
																													10,
																												)
																												.map(
																													(
																														step,
																														stepIndex,
																													) => (
																														<span
																															key={`${session.id}-flow-${stepIndex}`}
																															className="inline-flex items-center gap-1"
																														>
																															<span className="text-[11px] text-foreground/90">
																																{
																																	step
																																}
																															</span>
																															{stepIndex <
																																Math.min(
																																	session.flow
																																		.length,
																																	10,
																																) -
																																	1 && (
																																<Icon
																																	icon="solar:alt-arrow-right-linear"
																																	className="size-3 text-muted-foreground"
																																/>
																															)}
																														</span>
																													),
																												)}
																											{session.flow
																												.length >
																												10 && (
																												<span className="text-muted-foreground">
																													+
																													{session.flow.length -
																														10}{" "}
																													more
																												</span>
																											)}
																										</div>
																									</div>
																								</div>
																							),
																						)}
																					</div>
																				</div>
																			),
																		)}
																	</div>
																</TooltipProvider>
															)}
														</>
													) : (
												<div className="overflow-x-auto">
													<Table>
														<TableHeader>
															<TableRow>
																<TableHead>
																	User
																</TableHead>
																<TableHead>
																	Event
																</TableHead>
																<TableHead>
																	Page
																</TableHead>
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
																		<span>
																			Timestamp
																		</span>
																	</Stack>
																</TableHead>
															</TableRow>
														</TableHeader>
														<TableBody>
															{events.length ===
															0 ? (
																<TableRow>
																	<TableCell
																		colSpan={4}
																		className="text-center"
																	>
																		No events
																		found
																	</TableCell>
																</TableRow>
															) : (
																events.map(
																	(event) => (
																		<TableRow
																			key={
																				event.id
																			}
																		>
																			<TableCell>
																				{event.user ? (
																					<span className="font-medium">
																						{
																							event
																								.user
																								.name
																						}
																					</span>
																				) : event.user_id ? (
																					<span className="text-muted-foreground">
																						{event.user_id.slice(
																							0,
																							8,
																						)}
																						...
																					</span>
																				) : (
																					<span className="text-muted-foreground">
																						Anonymous
																					</span>
																				)}
																			</TableCell>
																			<TableCell>
																				<code className="text-sm">
																					{
																						event.event_name
																					}
																				</code>
																			</TableCell>
																			<TableCell>
																				{event.event_name ===
																					"player_viewed" &&
																				event.player ? (
																					<span className="text-sm font-medium">
																						Player:{" "}
																						{
																							event
																								.player
																								.name
																						}
																					</span>
																				) : event.page ? (
																					<span className="text-sm">
																						{getReadablePathLabel(
																							event.page,
																							sessionLabelMap,
																						)}
																					</span>
																				) : (
																					<span className="text-muted-foreground">
																						—
																					</span>
																				)}
																			</TableCell>
																			<TableCell>
																				<Stack
																					direction="column"
																					spacing={
																						1.5
																					}
																				>
																					<Stack
																						direction="row"
																						alignItems="center"
																						spacing={
																							2
																						}
																					>
																						<Icon
																							icon="solar:calendar-bold"
																							className="size-4 text-muted-foreground"
																						/>
																						<span>
																							{formatDate(
																								event.created_at,
																							)}
																						</span>
																					</Stack>
																					<Stack
																						direction="row"
																						alignItems="center"
																						spacing={
																							2
																						}
																					>
																						<Icon
																							icon="solar:clock-circle-bold"
																							className="size-4 text-muted-foreground"
																						/>
																						<span>
																							{formatTime(
																								event.created_at,
																							)}
																						</span>
																					</Stack>
																				</Stack>
																			</TableCell>
																		</TableRow>
																	),
																)
															)}
														</TableBody>
													</Table>
												</div>
											)}

											{/* Pagination */}
											{totalPages > 1 && (
												<div className="mt-4 flex items-center justify-between">
													<Button
														variant="outline"
														onClick={() =>
															setPage((p) =>
																Math.max(1, p - 1),
															)
														}
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
															setPage((p) =>
																Math.min(
																	totalPages,
																	p + 1,
																),
															)
														}
														disabled={
															page === totalPages
														}
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
