"use client";

import { useEffect, useState, useCallback } from "react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Box } from "@/components/ui/box";
import { Loading } from "@/components/ui/loading";
import { supabase } from "@/lib/supabase/client";
import { VideoCard, type VideoItem } from "./_components/video-card";

function VideosPageContent() {
	const [videos, setVideos] = useState<VideoItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Date formatting helpers (Serbian locale) - must be before early returns
	const formatDateWeekday = useCallback((dateString: string) => {
		return new Date(dateString).toLocaleDateString("sr-Latn-RS", {
			weekday: "long",
		});
	}, []);

	const formatDateShort = useCallback((dateString: string) => {
		return new Date(dateString).toLocaleDateString("sr-Latn-RS", {
			month: "short",
			day: "numeric",
		});
	}, []);

	useEffect(() => {
		const fetchVideos = async () => {
			try {
				setLoading(true);
				setError(null);

				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					setError("Not authenticated");
					setLoading(false);
					return;
				}

				const response = await fetch("/api/videos", {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				});

				if (!response.ok) {
					const errorData = await response.json().catch(() => ({}));
					throw new Error(errorData.error || "Failed to load videos");
				}

				const data = await response.json();
				setVideos(data.videos || []);
			} catch (err) {
				console.error("Error fetching videos:", err);
				setError(
					err instanceof Error ? err.message : "Failed to load videos"
				);
			} finally {
				setLoading(false);
			}
		};

		fetchVideos();
	}, []);

	return (
		<AppShell title="Video">
			{loading ? (
				<Loading />
			) : error ? (
				<Box>
					<p className="text-destructive">{error}</p>
				</Box>
			) : videos.length === 0 ? (
				<Box>
					<p className="text-muted-foreground">No videos available yet.</p>
				</Box>
			) : (
				<div
					className="grid gap-4 md:gap-6"
					style={{
						gridTemplateColumns:
							"repeat(auto-fill, minmax(350px, 1fr))",
					}}
				>
					{videos.map((video) => (
						<VideoCard
							key={video.matchId}
							video={video}
							formatDateWeekday={formatDateWeekday}
							formatDateShort={formatDateShort}
						/>
					))}
				</div>
			)}
		</AppShell>
	);
}

export default function VideosPage() {
	return (
		<AuthGuard>
			<VideosPageContent />
		</AuthGuard>
	);
}
