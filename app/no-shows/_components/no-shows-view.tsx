"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { Loading } from "@/components/ui/loading";
import { SummaryCards } from "./summary-cards";
import { EntriesTable } from "./entries-table";
import { t } from "@/lib/i18n";

type NoShowUser = {
	id: string;
	name: string;
	avatar: string | null;
	noShowCount: number;
	lastNoShowDate: string;
};

type NoShowsViewProps = {
	onRefetchReady?: (refetch: () => void) => void;
};

export function NoShowsView({ onRefetchReady }: NoShowsViewProps) {
	const [users, setUsers] = useState<NoShowUser[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const tableRefetchRef = useRef<(() => void) | null>(null);

	// Stable fetch function for aggregated stats (for cards)
	const fetchNoShowStats = useCallback(async () => {
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

			const response = await fetch("/api/no-shows", {
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
			console.error("Error fetching no-show stats:", err);
			setError(t.ispale.error.fetchFailed);
		} finally {
			setLoading(false);
		}
	}, []);

	// Fetch stats on mount
	useEffect(() => {
		fetchNoShowStats();
	}, [fetchNoShowStats]);

	// Combined refetch function
	const handleRefetch = useCallback(() => {
		fetchNoShowStats();
		if (tableRefetchRef.current) {
			tableRefetchRef.current();
		}
	}, [fetchNoShowStats]);

	// Expose refetch function to parent
	const onRefetchReadyRef = useRef(onRefetchReady);
	useEffect(() => {
		onRefetchReadyRef.current = onRefetchReady;
	}, [onRefetchReady]);

	useEffect(() => {
		if (onRefetchReadyRef.current) {
			onRefetchReadyRef.current(handleRefetch);
		}
		// Only run once on mount to avoid infinite loops
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	if (loading) {
		return (
			<div className="py-12">
				<Loading inline label={t.ispale.loading} />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center py-12">
				<p className="text-destructive">{error}</p>
			</div>
		);
	}

	return (
		<div className="space-y-6 px-4 lg:px-6">
			{/* Summary Cards */}
			<SummaryCards />

			{/* Entries Table */}
			<EntriesTable
				onRefetchReady={(refetch) => {
					tableRefetchRef.current = refetch;
				}}
			/>
		</div>
	);
}
