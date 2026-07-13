"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth/useAuth";
import { StateBlock } from "@/components/ui/state-block";
import { NoShowDistributionWidget } from "@/components/dashboard/no-show-distribution-widget";
import { t } from "@/lib/i18n";

type NoShowEntry = {
	id: string;
	date: string;
	reason: string | null;
	points: number;
};

type NoShowUser = {
	id: string;
	name: string;
	avatar: string | null;
	noShowCount: number;
	totalPoints: number;
	lastNoShowDate: string;
	entries: NoShowEntry[];
};

type NoShowsViewProps = {
	onRefetchReady?: (refetch: () => void) => void;
};

export function NoShowsView({ onRefetchReady }: NoShowsViewProps) {
	const { session } = useAuth();
	const accessToken = session?.access_token;
	const [users, setUsers] = useState<NoShowUser[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Stable fetch function for the ranking and date drill-down.
	const fetchNoShowStats = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);

			if (!accessToken) {
				setError(t.ispale.error.notAuthenticated);
				return;
			}

			const response = await fetch("/api/no-shows", {
				headers: {
					Authorization: `Bearer ${accessToken}`,
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
	}, [accessToken]);

	// Fetch stats on mount
	useEffect(() => {
		fetchNoShowStats();
	}, [fetchNoShowStats]);

	// Combined refetch function
	const handleRefetch = useCallback(() => {
		fetchNoShowStats();
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
		return <StateBlock variant="loading" title={t.ispale.loading} />;
	}

	if (error) {
		return <StateBlock variant="error" title={error} />;
	}

	return (
		<div className="px-4 lg:px-6">
			<div className="mx-auto w-full max-w-5xl">
				<NoShowDistributionWidget users={users} />
			</div>
		</div>
	);
}
