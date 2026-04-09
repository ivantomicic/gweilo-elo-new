import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, verifyAdmin } from "@/lib/supabase/admin";
import { processVideoJob } from "@/lib/video-processing/processor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = {
	"Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
	Pragma: "no-cache",
};

export async function POST(
	request: NextRequest,
	{ params }: { params: { jobId: string } },
) {
	try {
		const authHeader = request.headers.get("authorization");
		const adminUserId = await verifyAdmin(authHeader);

		if (!adminUserId) {
			return NextResponse.json(
				{ error: "Unauthorized. Admin access required." },
				{ status: 401, headers: NO_STORE_HEADERS },
			);
		}

		const adminClient = createAdminClient();
		const { data: job, error: fetchError } = await adminClient
			.from("video_processing_jobs")
			.select("id, status")
			.eq("id", params.jobId)
			.single();

		if (fetchError || !job) {
			return NextResponse.json(
				{ error: "Video processing job not found." },
				{ status: 404, headers: NO_STORE_HEADERS },
			);
		}

		if (job.status === "analyzing" || job.status === "cutting") {
			return NextResponse.json(
				{ error: "This job is already processing." },
				{ status: 409, headers: NO_STORE_HEADERS },
			);
		}

		const { error: updateError } = await adminClient
			.from("video_processing_jobs")
			.update({
				status: "queued",
				error_message: null,
				segments: [],
				segments_count: 0,
				segments_duration_seconds: null,
				output_bucket: null,
				output_path: null,
				thumbnail_bucket: null,
				thumbnail_path: null,
				processing_started_at: null,
				processing_completed_at: null,
				updated_at: new Date().toISOString(),
			})
			.eq("id", params.jobId);

		if (updateError) {
			console.error("Failed to reset video processing job:", updateError);
			return NextResponse.json(
				{ error: "Failed to restart video processing job." },
				{ status: 500, headers: NO_STORE_HEADERS },
			);
		}

		void processVideoJob(params.jobId).catch((jobError) => {
			console.error(
				`Background retry failed for video job ${params.jobId}:`,
				jobError,
			);
		});

		return NextResponse.json(
			{ success: true },
			{ headers: NO_STORE_HEADERS },
		);
	} catch (error) {
		console.error(
			"Unexpected error in POST /api/admin/video-processing/[jobId]/retry:",
			error,
		);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500, headers: NO_STORE_HEADERS },
		);
	}
}
