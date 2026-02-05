import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthToken } from "../../_utils/auth";

/**
 * GET /api/debug/me
 *
 * Debug endpoint to inspect the authenticated user's metadata and role.
 * Returns only the caller's own data.
 */
export async function GET(request: NextRequest) {
  const token = getAuthToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient.auth.getUser(token);

  if (error || !data?.user) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  const user = data.user;
  const userMetadata = user.user_metadata ?? {};
  const appMetadata = user.app_metadata ?? {};

  const roleFromValue = (value: unknown): "admin" | "mod" | "user" => {
    if (value === "admin") return "admin";
    if (value === "mod") return "mod";
    return "user";
  };

  const roleFromArray = (metadata?: Record<string, unknown>) => {
    const roles = metadata?.roles;
    if (Array.isArray(roles)) {
      if (roles.includes("admin")) return "admin";
      if (roles.includes("mod")) return "mod";
    }
    return null;
  };

  const detectedRole =
    roleFromValue(userMetadata.role) ||
    roleFromValue(appMetadata.role) ||
    roleFromArray(userMetadata) ||
    roleFromArray(appMetadata) ||
    "user";

  return NextResponse.json({
    id: user.id,
    email: user.email,
    detectedRole,
    user_metadata: userMetadata,
    app_metadata: appMetadata,
  });
}
