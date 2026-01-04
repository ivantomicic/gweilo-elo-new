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
import { Box } from "@/components/ui/box";
import { PlayerNameCard } from "@/components/ui/player-name-card";
import { Pagination } from "@/components/ui/pagination";
import { t } from "@/lib/i18n";

type NoShowEntry = {
	id: string;
	user: {
		id: string;
		name: string;
		avatar: string | null;
	};
	date: string;
	reason: string | null;
	createdAt: string;
};

type EntriesTableProps = {
	onRefetchReady?: (refetch: () => void) => void;
};

export function EntriesTable({ onRefetchReady }: EntriesTableProps) {
	const [entries, setEntries] = useState<NoShowEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [initialLoad, setInitialLoad] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [page, setPage] = useState(1);
	const [totalPages, setTotalPages] = useState(0);
	const [total, setTotal] = useState(0);
	const pageSize = 10;

	// Stable fetch function
	const fetchEntries = useCallback(
		async (pageNum: number) => {
			try {
				setLoading(true);
				setError(null);

				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					setError(t.ispale.error.notAuthenticated);
					setLoading(false);
					return;
				}

				const response = await fetch(
					`/api/no-shows/entries?page=${pageNum}&pageSize=${pageSize}`,
					{
						headers: {
							Authorization: `Bearer ${session.access_token}`,
						},
					}
				);

				if (!response.ok) {
					if (response.status === 401) {
						setError(t.ispale.error.unauthorized);
					} else {
						setError(t.ispale.error.fetchFailed);
					}
					setLoading(false);
					return;
				}

				const data = await response.json();
				setEntries(data.entries || []);
				setTotalPages(data.totalPages || 0);
				setTotal(data.total || 0);
				setInitialLoad(false);
			} catch (err) {
				console.error("Error fetching entries:", err);
				setError(t.ispale.error.fetchFailed);
			} finally {
				setLoading(false);
			}
		},
		[pageSize]
	);

	// Fetch data when page changes
	useEffect(() => {
		fetchEntries(page);
	}, [page, fetchEntries]);

	// Expose refetch function to parent (stable reference)
	const onRefetchReadyRef = useRef(onRefetchReady);
	const fetchEntriesRef = useRef(fetchEntries);
	const pageRef = useRef(page);

	useEffect(() => {
		onRefetchReadyRef.current = onRefetchReady;
		fetchEntriesRef.current = fetchEntries;
		pageRef.current = page;
	}, [onRefetchReady, fetchEntries, page]);

	// Expose stable refetch function once on mount
	useEffect(() => {
		if (onRefetchReadyRef.current) {
			onRefetchReadyRef.current(() => {
				fetchEntriesRef.current(pageRef.current);
			});
		}
		// Only run once on mount
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Format date for display
	const formatDate = (dateString: string) => {
		const date = new Date(dateString);
		return date.toLocaleDateString("sr-Latn-RS", {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	};

	if (error) {
		return (
			<div className="flex items-center justify-center py-12">
				<p className="text-destructive">{error}</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Table */}
			<Box className="relative rounded-lg border border-border/50 overflow-hidden bg-card min-h-[400px]">
				{/* Loading overlay */}
				{loading && !initialLoad && (
					<div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
						<div className="text-sm text-muted-foreground">
							{t.ispale.loading}
						</div>
					</div>
				)}
				<Table>
					<TableHeader className="bg-muted/30">
						<TableRow>
							<TableHead>{t.ispale.table.player}</TableHead>
							<TableHead>{t.ispale.table.date}</TableHead>
							<TableHead>{t.ispale.table.reason}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{initialLoad && loading ? (
							<TableRow>
								<TableCell
									colSpan={3}
									className="h-[400px] text-center text-muted-foreground"
								>
									{t.ispale.loading}
								</TableCell>
							</TableRow>
						) : entries.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={3}
									className="h-[400px] text-center text-muted-foreground"
								>
									{t.ispale.noNoShows}
								</TableCell>
							</TableRow>
						) : (
							entries.map((entry) => (
								<TableRow key={entry.id}>
									{/* Player */}
									<TableCell>
										<PlayerNameCard
											name={entry.user.name}
											avatar={entry.user.avatar}
											id={entry.user.id}
											size="md"
										/>
									</TableCell>

									{/* Date */}
									<TableCell>
										<span className="text-muted-foreground">
											{formatDate(entry.date)}
										</span>
									</TableCell>

									{/* Reason */}
									<TableCell>
										<span className="text-muted-foreground">
											{entry.reason || "—"}
										</span>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</Box>

			{/* Pagination */}
			{totalPages > 0 && (
				<div className="flex items-center justify-center px-4">
					<Pagination
						currentPage={page}
						totalPages={totalPages}
						onPageChange={setPage}
						disabled={loading}
					/>
				</div>
			)}
		</div>
	);
}
