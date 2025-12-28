"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { t } from "@/lib/i18n";
import { Box } from "@/components/ui/box";

type NoShowUser = {
	id: string;
	name: string;
	avatar: string | null;
	noShowCount: number;
	lastNoShowDate: string;
};

type IspaleViewProps = {
	onRefetchReady?: (refetch: () => void) => void;
};

export function IspaleView({ onRefetchReady }: IspaleViewProps) {
	const [users, setUsers] = useState<NoShowUser[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Stable fetch function - only refetches when explicitly called
	const fetchNoShows = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);

			// Get current session token
			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				setError(t.ispale.error.notAuthenticated);
				return;
			}

			// Fetch no-shows from API
			const response = await fetch("/api/ispale", {
				headers: {
					Authorization: `Bearer ${session.access_token}`,
				},
			});

			if (!response.ok) {
				if (response.status === 401) {
					setError(t.ispale.error.unauthorized);
				} else {
					setError(t.ispale.error.fetchFailed);
				}
				return;
			}

			const data = await response.json();
			setUsers(data.users || []);
		} catch (err) {
			console.error("Error fetching no-shows:", err);
			setError(t.ispale.error.fetchFailed);
		} finally {
			setLoading(false);
		}
	}, []);

	// Fetch data only on mount
	useEffect(() => {
		fetchNoShows();
	}, [fetchNoShows]);

	// Expose refetch function to parent (stable reference)
	const onRefetchReadyRef = useRef(onRefetchReady);
	useEffect(() => {
		onRefetchReadyRef.current = onRefetchReady;
	}, [onRefetchReady]);

	useEffect(() => {
		if (onRefetchReadyRef.current) {
			onRefetchReadyRef.current(fetchNoShows);
		}
	}, [fetchNoShows]);

	// Format date for display
	const formatDate = (dateString: string) => {
		const date = new Date(dateString);
		return date.toLocaleDateString("sr-RS", {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	};

	if (loading) {
		return (
			<Box className="flex items-center justify-center py-12">
				<p className="text-muted-foreground">{t.ispale.loading}</p>
			</Box>
		);
	}

	if (error) {
		return (
			<Box className="flex items-center justify-center py-12">
				<p className="text-destructive">{error}</p>
			</Box>
		);
	}

	return (
		<>
			{/* Container - Centered with max width */}
			<Box className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
				{/* Table */}
				<Box className="rounded-lg border bg-card">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t.ispale.table.player}</TableHead>
								<TableHead className="text-right">
									{t.ispale.table.totalNoShows}
								</TableHead>
								<TableHead className="text-right">
									{t.ispale.table.lastNoShow}
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{users.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={3}
										className="text-center py-12 text-muted-foreground"
									>
										{t.ispale.noNoShows}
									</TableCell>
								</TableRow>
							) : (
								users.map((user) => (
									<TableRow key={user.id} className="hover:bg-muted/50">
										{/* Player */}
										<TableCell>
											<Box className="flex items-center gap-3">
												<Avatar className="h-10 w-10">
													<AvatarImage
														src={user.avatar || undefined}
														alt={user.name}
													/>
													<AvatarFallback>
														{user.name.charAt(0).toUpperCase()}
													</AvatarFallback>
												</Avatar>
												<span className="font-medium">{user.name}</span>
											</Box>
										</TableCell>

										{/* Total No-Shows */}
										<TableCell className="text-right">
											<span className="font-semibold">{user.noShowCount}</span>
										</TableCell>

										{/* Last No-Show Date */}
										<TableCell className="text-right text-muted-foreground">
											{formatDate(user.lastNoShowDate)}
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</Box>
			</Box>
		</>
	);
}

