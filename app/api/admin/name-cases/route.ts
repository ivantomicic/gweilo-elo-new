import { NextRequest, NextResponse } from "next/server";
import { isPlatformAccessDisabled } from "@/lib/auth/roles";
import {
	createAdminClient,
	listAllAuthUsers,
	verifyAdmin,
} from "@/lib/supabase/admin";
import {
	SERBIAN_NAME_CASE_KEYS,
	type SerbianNameCases,
} from "@/lib/serbian-name-cases";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
	"Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
	Vary: "Authorization",
};

const PROFILE_COLUMNS = [
	"id",
	"display_name",
	...SERBIAN_NAME_CASE_KEYS.map((key) => `name_${key}`),
].join(", ");

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ProfileNameCasesRow = {
	id: string;
	display_name: string | null;
	name_genitive: string | null;
	name_dative: string | null;
	name_accusative: string | null;
	name_vocative: string | null;
	name_instrumental: string | null;
	name_locative: string | null;
};

function getAuthHeader(request: NextRequest) {
	return request.headers.get("authorization");
}

export async function GET(request: NextRequest) {
	try {
		if (!(await verifyAdmin(getAuthHeader(request)))) {
			return NextResponse.json(
				{ error: "Unauthorized. Admin access required." },
				{ status: 401, headers: NO_STORE_HEADERS },
			);
		}

		const adminClient = createAdminClient();
		const [authUsers, profilesResult] = await Promise.all([
			listAllAuthUsers(adminClient),
			adminClient.from("profiles").select(PROFILE_COLUMNS),
		]);

		if (profilesResult.error) {
			console.error("Error fetching profile name cases:", profilesResult.error);
			return NextResponse.json(
				{ error: "Failed to fetch name cases" },
				{ status: 500, headers: NO_STORE_HEADERS },
			);
		}

		const activeUsersById = new Map(
			authUsers
				.filter((user) => !isPlatformAccessDisabled(user))
				.map((user) => [user.id, user]),
		);

		const users = ((profilesResult.data || []) as unknown as ProfileNameCasesRow[])
			.filter((profile) => activeUsersById.has(profile.id))
			.map((profile) => {
				const authUser = activeUsersById.get(profile.id);
				const displayName =
					profile.display_name ||
					(typeof authUser?.user_metadata?.display_name === "string"
						? authUser.user_metadata.display_name
						: typeof authUser?.user_metadata?.name === "string"
							? authUser.user_metadata.name
							: authUser?.email?.split("@")[0]) ||
					"User";

				return {
					id: profile.id,
					displayName,
					cases: Object.fromEntries(
						SERBIAN_NAME_CASE_KEYS.map((key) => [
							key,
							profile[`name_${key}` as keyof ProfileNameCasesRow] || null,
						]),
					) as SerbianNameCases,
				};
			})
			.sort((left, right) =>
				left.displayName.localeCompare(right.displayName, "sr-Latn-RS"),
			);

		return NextResponse.json({ users }, { headers: NO_STORE_HEADERS });
	} catch (error) {
		console.error("Unexpected error in GET /api/admin/name-cases:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500, headers: NO_STORE_HEADERS },
		);
	}
}

export async function PATCH(request: NextRequest) {
	try {
		if (!(await verifyAdmin(getAuthHeader(request)))) {
			return NextResponse.json(
				{ error: "Unauthorized. Admin access required." },
				{ status: 401 },
			);
		}

		const body = await request.json();
		if (!Array.isArray(body?.updates) || body.updates.length > 500) {
			return NextResponse.json(
				{ error: "updates must be an array with at most 500 rows" },
				{ status: 400 },
			);
		}

		const seenIds = new Set<string>();
		const updates: Array<{ id: string } & SerbianNameCases> = [];

		for (const candidate of body.updates) {
			if (
				!candidate ||
				typeof candidate !== "object" ||
				typeof candidate.id !== "string" ||
				!UUID_PATTERN.test(candidate.id) ||
				seenIds.has(candidate.id)
			) {
				return NextResponse.json(
					{ error: "Each update must have a unique valid user ID" },
					{ status: 400 },
				);
			}

			seenIds.add(candidate.id);
			const normalizedCases = {} as SerbianNameCases;

			for (const key of SERBIAN_NAME_CASE_KEYS) {
				const value = candidate[key];
				if (value !== null && value !== undefined && typeof value !== "string") {
					return NextResponse.json(
						{ error: `${key} must be text or null` },
						{ status: 400 },
					);
				}

				const trimmedValue = typeof value === "string" ? value.trim() : "";
				if (trimmedValue.length > 100) {
					return NextResponse.json(
						{ error: `${key} must be 100 characters or fewer` },
						{ status: 400 },
					);
				}
				normalizedCases[key] = trimmedValue || null;
			}

			updates.push({ id: candidate.id, ...normalizedCases });
		}

		if (updates.length === 0) {
			return NextResponse.json({ updated: 0 });
		}

		const adminClient = createAdminClient();
		const { data, error } = await adminClient.rpc("update_profile_name_cases", {
			p_updates: updates,
		});

		if (error) {
			console.error("Error updating profile name cases:", error);
			return NextResponse.json(
				{ error: "Failed to save name cases" },
				{ status: 500 },
			);
		}

		return NextResponse.json({ updated: Number(data) || updates.length });
	} catch (error) {
		console.error("Unexpected error in PATCH /api/admin/name-cases:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
