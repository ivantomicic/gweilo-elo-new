import type { UserRole } from "./roles";

/** Presentation gate only; admin API handlers still verify every request. */
export function getAdminAccessState(
	isAuthenticated: boolean | null,
	role: UserRole | null,
) {
	if (isAuthenticated === null) return "loading";
	if (!isAuthenticated) return "signed-out";
	return role === "admin" ? "allowed" : "denied";
}
