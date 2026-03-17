type AuthMetadata = Record<string, unknown> | null | undefined;

export type ManagedUserRole = "guest" | "user" | "mod" | "admin";
export type UserRole = Exclude<ManagedUserRole, "guest">;

type AuthUserLike = {
	app_metadata?: AuthMetadata;
};

export function getManagedRoleFromAppMetadata(
	appMetadata?: AuthMetadata,
): ManagedUserRole | null {
	const role = appMetadata?.role;
	if (
		role === "admin" ||
		role === "mod" ||
		role === "user" ||
		role === "guest"
	) {
		return role;
	}

	const roles = appMetadata?.roles;
	if (Array.isArray(roles)) {
		if (roles.includes("admin")) return "admin";
		if (roles.includes("mod")) return "mod";
		if (roles.includes("guest")) return "guest";
		if (roles.includes("user")) return "user";
	}

	return null;
}

export function getManagedRoleFromAuthUser(
	user: AuthUserLike | null | undefined,
): ManagedUserRole {
	return getManagedRoleFromAppMetadata(user?.app_metadata) ?? "user";
}

export function getUserRoleFromAuthUser(
	user: AuthUserLike | null | undefined,
): UserRole {
	const role = getManagedRoleFromAuthUser(user);

	if (role === "admin") return "admin";
	if (role === "mod") return "mod";
	return "user";
}
