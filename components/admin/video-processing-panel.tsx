"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Box } from "@/components/ui/box";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loading } from "@/components/ui/loading";
import { Stack } from "@/components/ui/stack";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { supabase } from "@/lib/supabase/client";
import {
	buildUploadedVideoStoragePath,
	VIDEO_PROCESSING_BUCKET,
	type VideoProcessingDiagnostics,
	type VideoProcessingJobListItem,
	type VideoProcessingStatus,
} from "@/lib/video-processing/shared";

const POLL_INTERVAL_MS = 5000;

type JobsResponse = {
	jobs?: VideoProcessingJobListItem[];
	diagnostics?: VideoProcessingDiagnostics;
	error?: string;
};

export function VideoProcessingPanel() {
	const [jobs, setJobs] = useState<VideoProcessingJobListItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [diagnostics, setDiagnostics] =
		useState<VideoProcessingDiagnostics | null>(null);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [notes, setNotes] = useState("");
	const [fileInputKey, setFileInputKey] = useState(0);

	const fetchJobs = useCallback(async (background = false) => {
		try {
			if (background) {
				setRefreshing(true);
			} else {
				setLoading(true);
			}
			setError(null);

			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session?.access_token) {
				throw new Error("Not authenticated");
			}

			const response = await fetch("/api/admin/video-processing", {
				headers: {
					Authorization: `Bearer ${session.access_token}`,
				},
			});

			const data = (await response.json()) as JobsResponse;
			if (!response.ok) {
				throw new Error(data.error || "Failed to load video jobs");
			}

			setJobs(data.jobs || []);
			setDiagnostics(data.diagnostics || null);
		} catch (fetchError) {
			console.error("Failed to fetch video processing jobs:", fetchError);
			setError(
				fetchError instanceof Error
					? fetchError.message
					: "Failed to load video jobs",
			);
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, []);

	useEffect(() => {
		void fetchJobs();
	}, [fetchJobs]);

	const hasActiveJobs = jobs.some(
		(job) => job.status === "queued" || job.status === "analyzing" || job.status === "cutting",
	);

	useEffect(() => {
		if (!hasActiveJobs) {
			return;
		}

		const interval = window.setInterval(() => {
			void fetchJobs(true);
		}, POLL_INTERVAL_MS);

		return () => window.clearInterval(interval);
	}, [fetchJobs, hasActiveJobs]);

	const stats = useMemo(() => {
		return {
			total: jobs.length,
			ready: jobs.filter((job) => job.status === "ready").length,
			processing: jobs.filter(
				(job) =>
					job.status === "queued" ||
					job.status === "analyzing" ||
					job.status === "cutting",
			).length,
		};
	}, [jobs]);

	const handleUpload = async () => {
		if (!selectedFile) {
			toast.error("Choose a video file first.");
			return;
		}

		try {
			setUploading(true);
			setError(null);

			if (
				diagnostics &&
				selectedFile.size > diagnostics.configuredUploadLimitBytes
			) {
				throw new Error(
					`This file is ${formatBytes(
						selectedFile.size,
					)}, but the current upload cap is ${formatBytes(
						diagnostics.configuredUploadLimitBytes,
					)}. Supabase is rejecting larger uploads before processing starts.`,
				);
			}

			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session?.access_token) {
				throw new Error("Not authenticated");
			}

			const sourcePath = buildUploadedVideoStoragePath(
				session.user.id,
				selectedFile.name,
			);
			const { error: uploadError } = await supabase.storage
				.from(VIDEO_PROCESSING_BUCKET)
				.upload(sourcePath, selectedFile, {
					cacheControl: "3600",
					upsert: false,
				});

			if (uploadError) {
				throw new Error(uploadError.message);
			}

			const response = await fetch("/api/admin/video-processing", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${session.access_token}`,
				},
				body: JSON.stringify({
					originalFilename: selectedFile.name,
					sourcePath,
					sourceContentType:
						selectedFile.type || "application/octet-stream",
					sourceSizeBytes: selectedFile.size,
					notes,
				}),
			});

			const data = (await response.json()) as {
				error?: string;
			};

			if (!response.ok) {
				throw new Error(data.error || "Failed to queue video");
			}

			toast.success("Video uploaded. Processing started.");
			setSelectedFile(null);
			setNotes("");
			setFileInputKey((current) => current + 1);
			await fetchJobs();
		} catch (uploadError) {
			console.error("Failed to upload video:", uploadError);
			const rawMessage =
				uploadError instanceof Error
					? uploadError.message
					: "Failed to upload video";
			const message =
				rawMessage.includes("maximum allowed size")
					? buildOversizeMessage(selectedFile, diagnostics)
					: rawMessage;
			setError(message);
			toast.error(message);
		} finally {
			setUploading(false);
		}
	};

	const handleRetry = async (jobId: string) => {
		try {
			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session?.access_token) {
				throw new Error("Not authenticated");
			}

			const response = await fetch(
				`/api/admin/video-processing/${jobId}/retry`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				},
			);

			const data = (await response.json()) as {
				error?: string;
			};

			if (!response.ok) {
				throw new Error(data.error || "Failed to retry job");
			}

			toast.success("Processing restarted.");
			await fetchJobs();
		} catch (retryError) {
			console.error("Failed to retry video job:", retryError);
			toast.error(
				retryError instanceof Error
					? retryError.message
					: "Failed to retry video job",
			);
		}
	};

	if (loading) {
		return <Loading label="Loading video processing jobs..." inline={false} />;
	}

	return (
		<div className="space-y-6">
			<div className="grid gap-4 md:grid-cols-3">
				<StatCard label="Total jobs" value={stats.total} />
				<StatCard label="Ready outputs" value={stats.ready} />
				<StatCard label="Processing now" value={stats.processing} />
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Upload Match Video</CardTitle>
					<CardDescription>
						Upload a raw match file. The backend will send it to Gemini
						for rally detection and use ffmpeg to cut away dead time.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
						<div className="space-y-2">
							<Label htmlFor="video-upload">Video file</Label>
							<Input
								key={fileInputKey}
								id="video-upload"
								type="file"
								accept="video/mp4,video/mpeg,video/mov,video/webm,video/avi,video/x-matroska"
								onChange={(event) => {
									setSelectedFile(event.target.files?.[0] || null);
								}}
								disabled={uploading}
							/>
							<p className="text-xs text-muted-foreground">
								Best results come from fixed-camera match recordings with
								clear view of the table or court.
							</p>
							{diagnostics ? (
								<p className="text-xs text-muted-foreground">
									Current app upload cap:{" "}
									<span className="text-foreground">
										{formatBytes(diagnostics.configuredUploadLimitBytes)}
									</span>
									{" • "}Bucket limit:{" "}
									<span className="text-foreground">
										{diagnostics.bucketFileSizeLimitBytes
											? formatBytes(
													diagnostics.bucketFileSizeLimitBytes,
											  )
											: "Unknown"}
									</span>
								</p>
							) : null}
						</div>

						<div className="space-y-2">
							<Label htmlFor="video-notes">Operator notes</Label>
							<textarea
								id="video-notes"
								value={notes}
								onChange={(event) => setNotes(event.target.value)}
								placeholder="Optional: sport, camera angle, anything useful for rally detection."
								disabled={uploading}
								className="min-h-[104px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
							/>
						</div>
					</div>

					<Stack
						direction="row"
						alignItems="center"
						justifyContent="between"
						className="flex-wrap gap-3"
					>
						<p className="text-sm text-muted-foreground">
							Processor: <span className="text-foreground">Gemini 2.5 Flash + ffmpeg</span>
						</p>
						<Button onClick={handleUpload} disabled={uploading || !selectedFile}>
							{uploading ? "Uploading..." : "Upload and Process"}
						</Button>
					</Stack>

					{error ? (
						<Box className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
							{error}
						</Box>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<Stack
						direction="row"
						alignItems="center"
						justifyContent="between"
						className="flex-wrap gap-3"
					>
						<div>
							<CardTitle>Processing Queue</CardTitle>
							<CardDescription>
								Recent uploads, current status, errors, and ready-to-open outputs.
							</CardDescription>
						</div>
						<Button
							variant="outline"
							onClick={() => void fetchJobs(true)}
							disabled={refreshing}
						>
							{refreshing ? "Refreshing..." : "Refresh"}
						</Button>
					</Stack>
				</CardHeader>
				<CardContent>
					{jobs.length === 0 ? (
						<Box className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
							No uploaded videos yet.
						</Box>
					) : (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>File</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Segments</TableHead>
										<TableHead>Uploaded</TableHead>
										<TableHead>Output</TableHead>
										<TableHead>Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{jobs.map((job) => (
										<TableRow key={job.id}>
											<TableCell className="min-w-[260px] align-top">
												<div className="space-y-1">
													<p className="font-medium text-foreground">
														{job.original_filename}
													</p>
													<p className="text-xs text-muted-foreground">
														{formatBytes(job.source_size_bytes)}
														{job.uploaderName
															? ` • ${job.uploaderName}`
															: ""}
													</p>
													{job.notes ? (
														<p className="text-xs text-muted-foreground">
															{job.notes}
														</p>
													) : null}
													{job.error_message ? (
														<p className="text-xs text-destructive">
															{job.error_message}
														</p>
													) : null}
												</div>
											</TableCell>
											<TableCell className="align-top">
												<StatusPill status={job.status} />
											</TableCell>
											<TableCell className="align-top">
												<div className="space-y-1 text-sm">
													<p>{job.segments_count}</p>
													<p className="text-xs text-muted-foreground">
														{formatDuration(job.segments_duration_seconds)}
													</p>
												</div>
											</TableCell>
											<TableCell className="align-top text-sm text-muted-foreground">
												{formatDateTime(job.created_at)}
											</TableCell>
											<TableCell className="align-top">
												<div className="space-y-2 text-sm">
													{job.outputSignedUrl ? (
														<a
															href={job.outputSignedUrl}
															target="_blank"
															rel="noreferrer"
															className="font-medium text-primary underline-offset-4 hover:underline"
														>
															Open result
														</a>
													) : (
														<span className="text-muted-foreground">
															Not ready
														</span>
													)}
													{job.sourceSignedUrl ? (
														<div>
															<a
																href={job.sourceSignedUrl}
																target="_blank"
																rel="noreferrer"
																className="text-xs text-muted-foreground underline-offset-4 hover:underline"
															>
																Open source
															</a>
														</div>
													) : null}
												</div>
											</TableCell>
											<TableCell className="align-top">
												<div className="flex flex-col gap-2">
													<Button
														variant="outline"
														size="sm"
														onClick={() => void handleRetry(job.id)}
														disabled={
															job.status === "analyzing" ||
															job.status === "cutting"
														}
													>
														Retry
													</Button>
												</div>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Operational Notes</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2 text-sm text-muted-foreground">
					<p>
						The server must have <code>GEMINI_API_KEY</code>, ffmpeg, and
						ffprobe available, otherwise jobs will move to <code>failed</code>{" "}
						with a configuration error.
					</p>
					<p>
						Uploads are currently capped in the app before they ever reach the
						queue. If you upgrade the Supabase Storage project limit later, set{" "}
						<code>NEXT_PUBLIC_VIDEO_PROCESSING_MAX_UPLOAD_MB</code> to match.
					</p>
					<p>
						This MVP runs processing from the application server. For larger
						production loads, move the same processor code into a dedicated
						background worker.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}

function StatCard({ label, value }: { label: string; value: number }) {
	return (
		<Card>
			<CardContent className="py-6">
				<p className="text-sm text-muted-foreground">{label}</p>
				<p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
			</CardContent>
		</Card>
	);
}

function StatusPill({ status }: { status: VideoProcessingStatus }) {
	const styles: Record<VideoProcessingStatus, string> = {
		queued: "border-blue-500/30 bg-blue-500/10 text-blue-400",
		analyzing: "border-amber-500/30 bg-amber-500/10 text-amber-400",
		cutting: "border-violet-500/30 bg-violet-500/10 text-violet-400",
		ready: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
		failed: "border-destructive/30 bg-destructive/10 text-destructive",
	};

	return (
		<span
			className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${styles[status]}`}
		>
			{status}
		</span>
	);
}

function formatBytes(value: number | null) {
	if (!value || value <= 0) {
		return "Unknown size";
	}

	const units = ["B", "KB", "MB", "GB"];
	let currentValue = value;
	let unitIndex = 0;

	while (currentValue >= 1024 && unitIndex < units.length - 1) {
		currentValue /= 1024;
		unitIndex += 1;
	}

	return `${currentValue.toFixed(currentValue >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function buildOversizeMessage(
	file: File | null,
	diagnostics: VideoProcessingDiagnostics | null,
) {
	return [
		file ? `Supabase rejected ${file.name} (${formatBytes(file.size)}).` : null,
		diagnostics
			? `The current upload cap is ${formatBytes(
					diagnostics.configuredUploadLimitBytes,
			  )}.`
			: null,
		diagnostics?.bucketFileSizeLimitBytes
			? `Bucket limit is ${formatBytes(
					diagnostics.bucketFileSizeLimitBytes,
			  )}, so the lower project/app limit is the blocker.`
			: "The effective project upload limit is lower than the bucket limit.",
	]
		.filter((part): part is string => Boolean(part))
		.join(" ");
}

function formatDuration(value: number | null) {
	if (!value || value <= 0) {
		return "0s";
	}

	if (value < 60) {
		return `${value.toFixed(1)}s`;
	}

	const minutes = Math.floor(value / 60);
	const seconds = Math.round(value % 60);
	return `${minutes}m ${seconds}s`;
}

function formatDateTime(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "Unknown";
	}

	return date.toLocaleString("sr-Latn-RS", {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}
