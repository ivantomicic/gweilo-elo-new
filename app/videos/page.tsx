"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { Box } from "@/components/ui/box";
import { Stack } from "@/components/ui/stack";
import { supabase } from "@/lib/supabase/client";
import { extractVideoId, getVideoThumbnailUrl } from "@/lib/video";
import { cn } from "@/lib/utils";
import Image from "next/image";

type VideoItem = {
	matchId: string;
	sessionId: string;
	roundNumber: number;
	matchType: "singles" | "doubles";
	team1Name: string;
	team2Name: string;
	team1Score: number | null;
	team2Score: number | null;
	videoUrl: string;
	sessionDate: string;
};

function VideosPageContent() {
	const [videos, setVideos] = useState<VideoItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

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
					throw new Error(
						errorData.error || "Failed to load videos"
					);
				}

				const data = await response.json();
				setVideos(data.videos || []);
			} catch (err) {
				console.error("Error fetching videos:", err);
				setError(
					err instanceof Error
						? err.message
						: "Failed to load videos"
				);
			} finally {
				setLoading(false);
			}
		};

		fetchVideos();
	}, []);

	if (loading) {
		return (
			<SidebarProvider>
				<AppSidebar variant="inset" />
				<SidebarInset>
					<SiteHeader title="Video" />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
								<Box>
									<p className="text-muted-foreground">
										Loading videos...
									</p>
								</Box>
							</div>
						</div>
					</div>
				</SidebarInset>
			</SidebarProvider>
		);
	}

	if (error) {
		return (
			<SidebarProvider>
				<AppSidebar variant="inset" />
				<SidebarInset>
					<SiteHeader title="Video" />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
								<Box>
									<p className="text-destructive">{error}</p>
								</Box>
							</div>
						</div>
					</div>
				</SidebarInset>
			</SidebarProvider>
		);
	}

	return (
		<SidebarProvider>
			<AppSidebar variant="inset" />
			<SidebarInset>
				<SiteHeader title="Video" />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
							{/* Header */}
							<Box>
								<h1 className="text-3xl font-bold font-heading tracking-tight">
									Video
								</h1>
								<p className="text-sm text-muted-foreground mt-1">
									Match highlights and replays
								</p>
							</Box>

							{/* Videos Grid */}
							{videos.length === 0 ? (
								<Box>
									<p className="text-muted-foreground">
										No videos available yet.
									</p>
								</Box>
							) : (
								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
									{videos.map((video) => {
										const thumbnailUrl =
											getVideoThumbnailUrl(video.videoUrl);

										const sessionDate = new Date(
											video.sessionDate
										);
										const formattedDate =
											sessionDate.toLocaleDateString(
												"en-US",
												{
													year: "numeric",
													month: "short",
													day: "numeric",
												}
											);

										return (
											<Box
												key={video.matchId}
												className="bg-card rounded-[20px] border border-border/50 shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer group"
												onClick={() => {
													window.open(
														video.videoUrl,
														"_blank",
														"noopener,noreferrer"
													);
												}}
											>
												{/* Thumbnail */}
												<Box className="relative aspect-video bg-muted overflow-hidden">
													{thumbnailUrl ? (
														<Image
															src={thumbnailUrl}
															alt={`Match: ${video.team1Name} vs ${video.team2Name}`}
															fill
															className="object-cover group-hover:scale-105 transition-transform duration-300"
														/>
													) : (
														<Box className="absolute inset-0 flex items-center justify-center bg-muted">
															<p className="text-muted-foreground text-sm">
																No thumbnail
															</p>
														</Box>
													)}

													{/* Play Icon Overlay */}
													<Box className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
														<Box className="size-16 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
															<svg
																className="size-8 text-foreground ml-1"
																fill="currentColor"
																viewBox="0 0 24 24"
															>
																<path d="M8 5v14l11-7z" />
															</svg>
														</Box>
													</Box>

													{/* Score Overlay */}
													{video.team1Score !== null &&
													video.team2Score !== null ? (
														<Box className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-sm px-4 py-2 rounded-lg">
															<Stack
																direction="row"
																alignItems="center"
																spacing={3}
															>
																<span className="text-2xl font-black text-white">
																	{
																		video.team1Score
																	}
																</span>
																<span className="text-lg text-white/70 font-bold">
																	:
																</span>
																<span className="text-2xl font-black text-white">
																	{
																		video.team2Score
																	}
																</span>
															</Stack>
														</Box>
													) : null}

													{/* Match Type Badge */}
													<Box className="absolute top-3 right-3">
														<Box
															className={cn(
																"px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider",
																video.matchType ===
																	"singles"
																	? "bg-chart-1/90 text-white"
																	: "bg-chart-2/90 text-white"
															)}
														>
															{video.matchType ===
															"singles"
																? "Singles"
																: "Doubles"}
														</Box>
													</Box>
												</Box>

												{/* Match Info */}
												<Box className="p-4">
													<Stack
														direction="column"
														spacing={2}
													>
														{/* Players */}
														<Box>
															<p className="text-base font-bold leading-tight">
																{video.team1Name}
															</p>
															<p className="text-xs text-muted-foreground font-medium mt-0.5">
																vs
															</p>
															<p className="text-base font-bold leading-tight mt-0.5">
																{video.team2Name}
															</p>
														</Box>

														{/* Session Date & Round */}
														<Stack
															direction="row"
															alignItems="center"
															spacing={2}
															className="text-xs text-muted-foreground"
														>
															<span>{formattedDate}</span>
															<span>•</span>
															<span>
																Round{" "}
																{
																	video.roundNumber
																}
															</span>
														</Stack>
													</Stack>
												</Box>
											</Box>
										);
									})}
								</div>
							)}
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

export default function VideosPage() {
	return (
		<AuthGuard>
			<VideosPageContent />
		</AuthGuard>
	);
}

