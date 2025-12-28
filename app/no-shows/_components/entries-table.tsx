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
import { Button } from "@/components/ui/button";
import { UserNameCard } from "@/components/ui/user-name-card";
import { t } from "@/lib/i18n";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
					return;
				}

				const data = await response.json();
				setEntries(data.entries || []);
				setTotalPages(data.totalPages || 0);
				setTotal(data.total || 0);
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
		return date.toLocaleDateString("sr-RS", {
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
			<div className="overflow-hidden rounded-lg border">
				<Table>
					<TableHeader className="bg-muted sticky top-0 z-10">
						<TableRow>
							<TableHead>{t.ispale.table.player}</TableHead>
							<TableHead>{t.ispale.table.date}</TableHead>
							<TableHead>{t.ispale.table.reason}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading ? (
							<TableRow>
								<TableCell
									colSpan={3}
									className="h-24 text-center text-muted-foreground"
								>
									{t.ispale.loading}
								</TableCell>
							</TableRow>
						) : entries.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={3}
									className="h-24 text-center text-muted-foreground"
								>
									{t.ispale.noNoShows}
								</TableCell>
							</TableRow>
						) : (
							entries.map((entry) => (
								<TableRow key={entry.id}>
									{/* Player */}
									<TableCell>
										<UserNameCard
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
			</div>

			{/* Pagination */}
			{totalPages > 0 && (
				<div className="flex items-center justify-between px-4">
					<div className="text-sm text-muted-foreground">
						Strana {page} od {totalPages}
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setPage((p) => Math.max(1, p - 1))}
							disabled={page === 1 || loading}
						>
							<ChevronLeft className="h-4 w-4" />
							<span className="sr-only">Prethodna strana</span>
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								setPage((p) => Math.min(totalPages, p + 1))
							}
							disabled={page === totalPages || loading}
						>
							<ChevronRight className="h-4 w-4" />
							<span className="sr-only">Sledeća strana</span>
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
