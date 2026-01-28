import { NextResponse } from "next/server";
import { createAdminClient, verifyAdmin } from "@/lib/supabase/admin";
import { supabase } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/maintenance
 *
 * Returns the current maintenance mode status.
 * This endpoint is public - anyone can check if maintenance mode is enabled.
 */
export async function GET() {
	try {
		const { data, error } = await supabase
			.from("app_config")
			.select("value")
			.eq("key", "maintenance_mode")
			.single();

		if (error) {
			// If no config found, maintenance mode is disabled
			if (error.code === "PGRST116") {
				return NextResponse.json({
					enabled: false,
					message: null,
				});
			}
			throw error;
		}

		return NextResponse.json({
			enabled: data.value?.enabled ?? false,
			message: data.value?.message ?? null,
		});
	} catch (error) {
		console.error("Error fetching maintenance mode:", error);
		// Default to maintenance mode disabled on error
		return NextResponse.json({
			enabled: false,
			message: null,
		});
	}
}

/**
 * POST /api/maintenance
 *
 * Updates the maintenance mode status.
 * Only admins can update this setting.
 *
 * Body: { enabled: boolean, message?: string }
 */
export async function POST(request: Request) {
	try {
		// Verify admin access
		const authHeader = request.headers.get("authorization");
		const adminUserId = await verifyAdmin(authHeader);

		if (!adminUserId) {
			return NextResponse.json(
				{ error: "Unauthorized - admin access required" },
				{ status: 401 },
			);
		}

		const body = await request.json();
		const { enabled, message } = body;

		if (typeof enabled !== "boolean") {
			return NextResponse.json(
				{ error: "Invalid request - enabled must be a boolean" },
				{ status: 400 },
			);
		}

		const adminClient = createAdminClient();

		const { error } = await adminClient.from("app_config").upsert({
			key: "maintenance_mode",
			value: {
				enabled,
				message: message || null,
			},
			updated_by: adminUserId,
		});

		if (error) {
			throw error;
		}

		return NextResponse.json({
			success: true,
			enabled,
			message: message || null,
		});
	} catch (error) {
		console.error("Error updating maintenance mode:", error);
		return NextResponse.json(
			{ error: "Failed to update maintenance mode" },
			{ status: 500 },
		);
	}
}
