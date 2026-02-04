import { NextRequest } from "next/server";

export function getAuthToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  const supabaseHeader = request.headers.get("x-supabase-token");

  if (authHeader) {
    const trimmed = authHeader.trim();
    if (trimmed.toLowerCase().startsWith("bearer ")) {
      return trimmed.slice(7);
    }
    return trimmed;
  }

  if (supabaseHeader) {
    const trimmed = supabaseHeader.trim();
    if (trimmed.toLowerCase().startsWith("bearer ")) {
      return trimmed.slice(7);
    }
    return trimmed;
  }

  return null;
}
