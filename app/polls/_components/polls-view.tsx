"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { Loading } from "@/components/ui/loading";
import { Box } from "@/components/ui/box";
import { PollCard, type Poll, type PollOption } from "@/components/polls/poll-card";
import { t } from "@/lib/i18n";
import { getUserRole } from "@/lib/auth/getUserRole";
import { EditPollDrawer } from "./edit-poll-drawer";

type PollsViewProps = {
	onRefetchReady?: (refetch: () => void) => void;
};

export function PollsView({ onRefetchReady }: PollsViewProps) {
	const [isAdmin, setIsAdmin] = useState(false);
	const [editDrawerOpen, setEditDrawerOpen] = useState(false);
	const [selectedPoll, setSelectedPoll] = useState<Poll | null>(null);
	const [polls, setPolls] = useState<Poll[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Fetch all polls
	const fetchPolls = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);

			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				setError(t.polls.error.notAuthenticated);
				return;
			}

			// Fetch both active and completed polls
			const [activeResponse, completedResponse] = await Promise.all([
				fetch(`/api/polls?status=active`, {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				}),
				fetch(`/api/polls?status=completed`, {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				}),
			]);

			if (!activeResponse.ok || !completedResponse.ok) {
				if (activeResponse.status === 401 || completedResponse.status === 401) {
					setError(t.polls.error.unauthorized);
				} else {
					setError(t.polls.error.fetchFailed);
				}
				return;
			}

			const activeData = await activeResponse.json();
			const completedData = await completedResponse.json();
			
			// Combine and sort: active polls first, then completed (by created_at desc)
			const allPolls = [
				...(activeData.polls || []),
				...(completedData.polls || []),
			].sort((a, b) => {
				// Active polls first
				if (a.isActive !== b.isActive) {
					return a.isActive ? -1 : 1;
				}
				// Then sort by created_at desc
				return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
			});
			
			setPolls(allPolls);
		} catch (err) {
			console.error("Error fetching polls:", err);
			setError(t.polls.error.fetchFailed);
		} finally {
			setLoading(false);
		}
	}, []);

	// Check if user is admin
	useEffect(() => {
		const checkAdmin = async () => {
			const role = await getUserRole();
			setIsAdmin(role === "admin");
		};
		checkAdmin();
	}, []);

	// Fetch polls on mount
	useEffect(() => {
		fetchPolls();
	}, [fetchPolls]);

	// Stable refetch function
	const stableRefetch = useCallback(() => {
		fetchPolls();
	}, [fetchPolls]);

	// Expose refetch function to parent (using ref pattern to avoid infinite loops)
	const onRefetchReadyRef = useRef(onRefetchReady);
	useEffect(() => {
		onRefetchReadyRef.current = onRefetchReady;
	}, [onRefetchReady]);

	useEffect(() => {
		if (onRefetchReadyRef.current) {
			onRefetchReadyRef.current(stableRefetch);
		}
		// Only run once on mount to avoid infinite loops
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Handle answer submission
	const handleAnswer = useCallback(
		async (pollId: string, optionId: string) => {
			try {
				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					setError(t.polls.error.notAuthenticated);
					return;
				}

				const response = await fetch(`/api/polls/${pollId}/answer`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${session.access_token}`,
					},
					body: JSON.stringify({ optionId }),
				});

				if (!response.ok) {
					const data = await response.json();
					setError(data.error || t.polls.error.answerFailed);
					return;
				}

				// Refetch polls after answering
				await fetchPolls();
			} catch (err) {
				console.error("Error submitting answer:", err);
				setError(t.polls.error.answerFailed);
			}
		},
		[fetchPolls]
	);

	// Handle edit
	const handleEdit = useCallback((poll: Poll) => {
		setSelectedPoll(poll);
		setEditDrawerOpen(true);
	}, []);

	// Handle delete
	const handleDelete = useCallback(
		async (pollId: string) => {
			try {
				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					setError(t.polls.error.notAuthenticated);
					return;
				}

				const response = await fetch(`/api/polls/${pollId}`, {
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				});

				if (!response.ok) {
					const data = await response.json();
					setError(data.error || t.polls.error.deleteFailed);
					return;
				}

				// Refetch polls after deletion
				await fetchPolls();
			} catch (err) {
				console.error("Error deleting poll:", err);
				setError(t.polls.error.deleteFailed);
			}
		},
		[fetchPolls]
	);

	if (loading && polls.length === 0) {
		return (
			<div className="py-12">
				<Loading inline label={t.polls.loading} />
			</div>
		);
	}

	if (error && polls.length === 0) {
		return (
			<div className="flex items-center justify-center py-12">
				<p className="text-destructive">{error}</p>
			</div>
		);
	}

	return (
		<div className="space-y-6 px-4 lg:px-6">
			{/* Error message */}
			{error && (
				<div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2 text-sm text-red-600 dark:text-red-400">
					{error}
				</div>
			)}

			{/* Polls List */}
			{loading ? (
				<div className="py-12">
					<Loading inline label={t.polls.loading} />
				</div>
			) : polls.length === 0 ? (
				<Box className="py-12 text-center text-muted-foreground">
					{t.polls.noPolls}
				</Box>
			) : (
				<div
					className="grid gap-4 md:gap-6"
					style={{
						gridTemplateColumns:
							"repeat(auto-fill, minmax(min(100%, 400px), 1fr))",
					}}
				>
					{polls.map((poll) => (
						<PollCard
							key={poll.id}
							poll={poll}
							onAnswer={handleAnswer}
							isAdmin={isAdmin}
							onEdit={handleEdit}
							onDelete={handleDelete}
						/>
					))}
				</div>
			)}

			{/* Edit Poll Drawer */}
			{isAdmin && (
				<EditPollDrawer
					open={editDrawerOpen}
					onClose={() => {
						setEditDrawerOpen(false);
						setSelectedPoll(null);
					}}
					poll={selectedPoll}
					onUpdateSuccess={() => {
						fetchPolls();
					}}
				/>
			)}
		</div>
	);
}
