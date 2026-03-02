import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '@/lib/supabase/admin';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error('Missing Supabase environment variables');
}

type CommitmentRow = {
	id: string;
	user_id: string;
	days_per_week: number;
	valid_from: string;
	valid_to: string | null;
	created_at: string;
	updated_at: string;
};

const normalizeDate = (value: string): string | null => {
	const trimmed = value.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
		return trimmed;
	}

	const parsed = new Date(trimmed);
	if (Number.isNaN(parsed.getTime())) {
		return null;
	}
	return parsed.toISOString().slice(0, 10);
};

const toDateMinusOne = (dateString: string): string => {
	const [year, month, day] = dateString.split('-').map((part) => Number(part));
	const utcDate = new Date(Date.UTC(year, month - 1, day));
	utcDate.setUTCDate(utcDate.getUTCDate() - 1);
	return utcDate.toISOString().slice(0, 10);
};

const createUserScopedSupabase = (token: string) =>
	createClient(supabaseUrl!, supabaseAnonKey!, {
		global: {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		},
	});

async function normalizeUserTimeline(
	supabase: any,
	userId: string,
): Promise<CommitmentRow[]> {
	const { data: timelineRows, error: timelineError } = await supabase
		.from('no_show_commitments')
		.select('id, user_id, days_per_week, valid_from, valid_to, created_at, updated_at')
		.eq('user_id', userId)
		.order('valid_from', { ascending: true });

	if (timelineError) {
		throw timelineError;
	}

	const rows = (timelineRows || []) as CommitmentRow[];
	for (let i = 0; i < rows.length; i += 1) {
		const current = rows[i];
		const next = rows[i + 1];
		const targetValidTo = next ? toDateMinusOne(next.valid_from) : null;

		if (current.valid_to !== targetValidTo) {
			const { error: updateError } = await supabase
				.from('no_show_commitments')
				.update({ valid_to: targetValidTo })
				.eq('id', current.id);

			if (updateError) {
				throw updateError;
			}
		}
	}

	const { data: normalizedRows, error: normalizedError } = await supabase
		.from('no_show_commitments')
		.select('id, user_id, days_per_week, valid_from, valid_to, created_at, updated_at')
		.eq('user_id', userId)
		.order('valid_from', { ascending: false });

	if (normalizedError) {
		throw normalizedError;
	}

	return (normalizedRows || []) as CommitmentRow[];
}

/**
 * GET /api/no-shows/commitments
 *
 * Admin-only endpoint to fetch commitment history.
 */
export async function GET(request: NextRequest) {
	try {
		const authHeader = request.headers.get('authorization');
		const adminUserId = await verifyAdmin(authHeader);

		if (!adminUserId) {
			return NextResponse.json(
				{ error: 'Unauthorized. Admin access required.' },
				{ status: 401 },
			);
		}

		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return NextResponse.json(
				{ error: 'Unauthorized. Authentication required.' },
				{ status: 401 },
			);
		}

		const token = authHeader.replace('Bearer ', '');
		const supabase = createUserScopedSupabase(token);

		const { searchParams } = new URL(request.url);
		const requestedUserId = searchParams.get('userId');
		const today = new Date().toISOString().slice(0, 10);

		let query = supabase
			.from('no_show_commitments')
			.select('id, user_id, days_per_week, valid_from, valid_to, created_at, updated_at')
			.order('user_id', { ascending: true })
			.order('valid_from', { ascending: false });

		if (requestedUserId) {
			query = query.eq('user_id', requestedUserId);
		}

		const { data: commitments, error: commitmentsError } = await query;

		if (commitmentsError) {
			console.error('Error fetching no-show commitments:', commitmentsError);
			return NextResponse.json(
				{ error: 'Failed to fetch commitments' },
				{ status: 500 },
			);
		}

		const userIds = [...new Set((commitments || []).map((c) => c.user_id))];
		let profileMap = new Map<string, { name: string; avatar: string | null }>();

		if (userIds.length > 0) {
			const { data: profiles, error: profilesError } = await supabase
				.from('profiles')
				.select('id, display_name, avatar_url')
				.in('id', userIds);

			if (profilesError) {
				console.error('Error fetching profiles for commitments:', profilesError);
				return NextResponse.json(
					{ error: 'Failed to fetch commitment user information' },
					{ status: 500 },
				);
			}

			profileMap = new Map(
				(profiles || []).map((profile) => [
					profile.id,
					{
						name: profile.display_name || 'User',
						avatar: profile.avatar_url || null,
					},
				]),
			);
		}

		const formatted = (commitments || []).map((commitment) => {
			const profile = profileMap.get(commitment.user_id);
			const isActive =
				commitment.valid_from <= today &&
				(commitment.valid_to === null || commitment.valid_to >= today);

			return {
				id: commitment.id,
				user: {
					id: commitment.user_id,
					name: profile?.name || 'User',
					avatar: profile?.avatar || null,
				},
				daysPerWeek: commitment.days_per_week,
				weightPerMiss: Number((1 / commitment.days_per_week).toFixed(4)),
				validFrom: commitment.valid_from,
				validTo: commitment.valid_to,
				isActive,
				createdAt: commitment.created_at,
				updatedAt: commitment.updated_at,
			};
		});

		return NextResponse.json({ commitments: formatted });
	} catch (error) {
		console.error('Unexpected error in GET /api/no-shows/commitments:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 },
		);
	}
}

/**
 * POST /api/no-shows/commitments
 *
 * Admin-only endpoint to create/update a commitment effective from a date.
 * The timeline is automatically normalized to prevent overlap.
 */
export async function POST(request: NextRequest) {
	try {
		const authHeader = request.headers.get('authorization');
		const adminUserId = await verifyAdmin(authHeader);

		if (!adminUserId) {
			return NextResponse.json(
				{ error: 'Unauthorized. Admin access required.' },
				{ status: 401 },
			);
		}

		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return NextResponse.json(
				{ error: 'Unauthorized. Authentication required.' },
				{ status: 401 },
			);
		}

		const body = await request.json();
		const { userId, daysPerWeek, validFrom } = body;

		if (!userId || !daysPerWeek || !validFrom) {
			return NextResponse.json(
				{ error: 'Missing required fields: userId, daysPerWeek, validFrom' },
				{ status: 400 },
			);
		}

		const numericDays = Number(daysPerWeek);
		if (!Number.isInteger(numericDays) || numericDays < 1 || numericDays > 7) {
			return NextResponse.json(
				{ error: 'daysPerWeek must be an integer between 1 and 7' },
				{ status: 400 },
			);
		}

		const normalizedValidFrom = normalizeDate(String(validFrom));
		if (!normalizedValidFrom) {
			return NextResponse.json(
				{ error: 'Invalid validFrom date format' },
				{ status: 400 },
			);
		}

		const token = authHeader.replace('Bearer ', '');
		const supabase = createUserScopedSupabase(token);

		const { error: upsertError } = await supabase
			.from('no_show_commitments')
			.upsert(
				{
					user_id: userId,
					days_per_week: numericDays,
					valid_from: normalizedValidFrom,
					created_by: adminUserId,
				},
				{ onConflict: 'user_id,valid_from' },
			);

		if (upsertError) {
			console.error('Error upserting no-show commitment:', upsertError);
			if (upsertError.code === '42501' || upsertError.message.includes('permission')) {
				return NextResponse.json(
					{ error: 'Unauthorized. Admin access required.' },
					{ status: 403 },
				);
			}
			return NextResponse.json(
				{ error: 'Failed to save commitment' },
				{ status: 500 },
			);
		}

		const normalizedTimeline = await normalizeUserTimeline(supabase, userId);
		const formattedTimeline = normalizedTimeline.map((row) => ({
			id: row.id,
			daysPerWeek: row.days_per_week,
			weightPerMiss: Number((1 / row.days_per_week).toFixed(4)),
			validFrom: row.valid_from,
			validTo: row.valid_to,
		}));

		return NextResponse.json(
			{
				message: 'Commitment saved successfully',
				commitments: formattedTimeline,
			},
			{ status: 201 },
		);
	} catch (error) {
		console.error('Unexpected error in POST /api/no-shows/commitments:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 },
		);
	}
}
