"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loading";
import { Stack } from "@/components/ui/stack";
import { supabase } from "@/lib/supabase/client";

type DebugEvent = {
	id: string;
	user_id: string | null;
	event_name: string;
	page: string | null;
	created_at: string;
};

type DebugState = {
	user: {
		id: string;
		email: string | null;
		role: string;
	};
	analytics: {
		count: number;
		recentEvents: DebugEvent[];
	};
};

type InsertState = {
	ok: boolean;
	insertedAt?: string;
	error?: string;
	details?: unknown;
	insertedEvents?: DebugEvent[];
};

function formatDateTime(value: string) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function AnalyticsDebugPageContent() {
	const [data, setData] = useState<DebugState | null>(null);
	const [insertState, setInsertState] = useState<InsertState | null>(null);
	const [loading, setLoading] = useState(true);
	const [inserting, setInserting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const authedFetch = async (input: RequestInfo, init?: RequestInit) => {
		const {
			data: { session },
		} = await supabase.auth.getSession();

		if (!session) {
			throw new Error("Not authenticated");
		}

		return fetch(input, {
			...init,
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${session.access_token}`,
				...(init?.headers || {}),
			},
		});
	};

	const load = async () => {
		try {
			setLoading(true);
			setError(null);
			const response = await authedFetch("/api/debug/analytics", {
				method: "GET",
			});
			const payload = await response.json();

			if (!response.ok) {
				throw new Error(payload.error || "Failed to load analytics debug");
			}

			setData(payload);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load");
			setData(null);
		} finally {
			setLoading(false);
		}
	};

	const insertTestEvent = async () => {
		try {
			setInserting(true);
			setInsertState(null);
			const response = await authedFetch("/api/debug/analytics", {
				method: "POST",
				body: JSON.stringify({
					eventName: "debug_analytics_ping",
					page: "/debug/analytics",
				}),
			});
			const payload = await response.json();
			setInsertState(payload);

			if (response.ok) {
				await load();
			}
		} catch (err) {
			setInsertState({
				ok: false,
				error: err instanceof Error ? err.message : "Insert failed",
			});
		} finally {
			setInserting(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	if (loading) {
		return (
			<div className="min-h-screen bg-background p-6">
				<Loading label="Loading analytics debug..." />
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-background p-6 text-foreground">
			<div className="mx-auto max-w-4xl space-y-6">
				<div className="space-y-2">
					<h1 className="text-2xl font-semibold">Analytics Debug</h1>
					<p className="text-sm text-muted-foreground">
						Use this as the affected user. It shows whether the current token can
						write analytics and what rows already exist for that account.
					</p>
				</div>

				<Stack direction="row" spacing={3}>
					<Button type="button" onClick={load}>
						Refresh
					</Button>
					<Button type="button" onClick={insertTestEvent} disabled={inserting}>
						{inserting ? "Inserting..." : "Insert Test Event"}
					</Button>
				</Stack>

				{error ? (
					<div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
						{error}
					</div>
				) : null}

				{data ? (
					<div className="grid gap-6 md:grid-cols-2">
						<section className="rounded-lg border p-4">
							<h2 className="mb-3 text-sm font-medium">Current User</h2>
							<dl className="space-y-2 text-sm">
								<div>
									<dt className="text-muted-foreground">Email</dt>
									<dd>{data.user.email || "—"}</dd>
								</div>
								<div>
									<dt className="text-muted-foreground">User ID</dt>
									<dd className="break-all font-mono text-xs">{data.user.id}</dd>
								</div>
								<div>
									<dt className="text-muted-foreground">Role</dt>
									<dd>{data.user.role}</dd>
								</div>
								<div>
									<dt className="text-muted-foreground">Analytics Rows</dt>
									<dd>{data.analytics.count}</dd>
								</div>
							</dl>
						</section>

						<section className="rounded-lg border p-4">
							<h2 className="mb-3 text-sm font-medium">Last Insert Attempt</h2>
							{insertState ? (
								<pre className="overflow-auto rounded bg-muted p-3 text-xs">
									{JSON.stringify(insertState, null, 2)}
								</pre>
							) : (
								<p className="text-sm text-muted-foreground">
									No insert attempted yet.
								</p>
							)}
						</section>
					</div>
				) : null}

				<section className="rounded-lg border p-4">
					<h2 className="mb-3 text-sm font-medium">Recent Analytics Rows</h2>
					{data?.analytics.recentEvents.length ? (
						<div className="overflow-auto">
							<table className="min-w-full text-left text-sm">
								<thead className="text-muted-foreground">
									<tr>
										<th className="pb-2 pr-4 font-medium">Event</th>
										<th className="pb-2 pr-4 font-medium">Page</th>
										<th className="pb-2 pr-4 font-medium">Created</th>
									</tr>
								</thead>
								<tbody>
									{data.analytics.recentEvents.map((event) => (
										<tr key={event.id} className="border-t">
											<td className="py-2 pr-4 font-mono text-xs">
												{event.event_name}
											</td>
											<td className="py-2 pr-4">
												{event.page || "—"}
											</td>
											<td className="py-2 pr-4 text-xs text-muted-foreground">
												{formatDateTime(event.created_at)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : (
						<p className="text-sm text-muted-foreground">
							No analytics rows found for this user.
						</p>
					)}
				</section>
			</div>
		</div>
	);
}

export default function AnalyticsDebugPage() {
	return (
		<AuthGuard>
			<AnalyticsDebugPageContent />
		</AuthGuard>
	);
}
