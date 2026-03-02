import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '@/lib/supabase/admin';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error('Missing Supabase environment variables');
}

type NoShowAggregation = {
	count: number;
	adjusted: number;
	lastDate: string;
};

const roundTo4 = (value: number) => Math.round(value * 10000) / 10000;

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

const resolveCommitmentDays = async (
	supabase: any,
	userId: string,
	date: string,
): Promise<number> => {
	const { data, error } = await supabase
		.from('no_show_commitments')
		.select('days_per_week')
		.eq('user_id', userId)
		.lte('valid_from', date)
		.or(`valid_to.is.null,valid_to.gte.${date}`)
		.order('valid_from', { ascending: false })
		.limit(1)
		.maybeSingle();

	const commitmentData = data as { days_per_week?: number } | null;

	if (error) {
		// Migration might not be applied yet in some environments.
		if (error.code === '42P01') {
			console.warn('no_show_commitments table is missing; defaulting days_per_week to 1');
			return 1;
		}
		throw error;
	}

	return commitmentData?.days_per_week ?? 1;
};

/**
 * GET /api/no-shows
 *
 * Fetch all no-shows with user information, aggregated by user.
 * The response includes both raw counts and adjusted weighted counts.
 */
export async function GET(request: NextRequest) {
	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return NextResponse.json(
				{ error: 'Unauthorized. Authentication required.' },
				{ status: 401 },
			);
		}

		const token = authHeader.replace('Bearer ', '');

		const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
			global: {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		});

		const { data: noShows, error: noShowsError } = await supabase
			.from('no_shows')
			.select('user_id, date, weight_applied')
			.order('date', { ascending: false });

		if (noShowsError) {
			console.error('Error fetching no-shows:', noShowsError);
			return NextResponse.json(
				{ error: 'Failed to fetch no-shows' },
				{ status: 500 },
			);
		}

		const userNoShowsMap = new Map<string, NoShowAggregation>();

		for (const noShow of noShows || []) {
			const existing = userNoShowsMap.get(noShow.user_id) || {
				count: 0,
				adjusted: 0,
				lastDate: '',
			};

			const weight = Number(noShow.weight_applied ?? 1);
			userNoShowsMap.set(noShow.user_id, {
				count: existing.count + 1,
				adjusted: existing.adjusted + (Number.isFinite(weight) ? weight : 1),
				lastDate: existing.lastDate || noShow.date,
			});
		}

		const userIds = Array.from(userNoShowsMap.keys());
		if (userIds.length === 0) {
			return NextResponse.json({ users: [] });
		}

		const { data: profiles, error: profilesError } = await supabase
			.from('profiles')
			.select('id, display_name, avatar_url')
			.in('id', userIds);

		if (profilesError) {
			console.error('Error fetching profiles:', profilesError);
			return NextResponse.json(
				{ error: 'Failed to fetch user information' },
				{ status: 500 },
			);
		}

		const formattedUsers = (profiles || [])
			.filter((profile) => userNoShowsMap.has(profile.id))
			.map((profile) => {
				const stats = userNoShowsMap.get(profile.id)!;
				return {
					id: profile.id,
					name: profile.display_name || 'User',
					avatar: profile.avatar_url || null,
					noShowCount: stats.count,
					adjustedNoShowCount: roundTo4(stats.adjusted),
					lastNoShowDate: stats.lastDate,
				};
			})
			.sort((a, b) => {
				if (b.adjustedNoShowCount !== a.adjustedNoShowCount) {
					return b.adjustedNoShowCount - a.adjustedNoShowCount;
				}
				return b.noShowCount - a.noShowCount;
			});

		return NextResponse.json({ users: formattedUsers });
	} catch (error) {
		console.error('Unexpected error in GET /api/no-shows:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 },
		);
	}
}

/**
 * POST /api/no-shows
 *
 * Create a new no-show entry (admin-only).
 *
 * Request body:
 * {
 *   userId: string (UUID),
 *   date: string (ISO date),
 *   reason?: string
 * }
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

		const body = await request.json();
		const { userId: targetUserId, date, reason } = body;

		if (!targetUserId || !date) {
			return NextResponse.json(
				{ error: 'Missing required fields: userId and date are required' },
				{ status: 400 },
			);
		}

		const normalizedDate = normalizeDate(String(date));
		if (!normalizedDate) {
			return NextResponse.json(
				{ error: 'Invalid date format' },
				{ status: 400 },
			);
		}

		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return NextResponse.json(
				{ error: 'Unauthorized. Authentication required.' },
				{ status: 401 },
			);
		}

		const token = authHeader.replace('Bearer ', '');

		const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
			global: {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		});

		let daysPerWeekAtTime = 1;
		try {
			daysPerWeekAtTime = await resolveCommitmentDays(
				supabase,
				targetUserId,
				normalizedDate,
			);
		} catch (commitmentError) {
			console.error('Error resolving commitment for no-show:', commitmentError);
			return NextResponse.json(
				{ error: 'Failed to resolve player commitment for this date' },
				{ status: 500 },
			);
		}

		const safeDays = Number.isFinite(daysPerWeekAtTime) && daysPerWeekAtTime > 0
			? daysPerWeekAtTime
			: 1;
		const weightApplied = roundTo4(1 / safeDays);

		const payload = {
			user_id: targetUserId,
			date: normalizedDate,
			reason: reason || null,
			days_per_week_at_time: safeDays,
			weight_applied: weightApplied,
		};

		let { data: noShow, error: insertError } = await supabase
			.from('no_shows')
			.insert(payload)
			.select()
			.single();

		if (insertError?.code === '42703') {
			// Fallback for environments where migration isn't applied yet.
			const legacyInsert = await supabase
				.from('no_shows')
				.insert({
					user_id: targetUserId,
					date: normalizedDate,
					reason: reason || null,
				})
				.select()
				.single();

			noShow = legacyInsert.data;
			insertError = legacyInsert.error;
		}

		if (insertError) {
			console.error('Error inserting no-show:', insertError);
			if (insertError.code === '42501' || insertError.message.includes('permission')) {
				return NextResponse.json(
					{ error: 'Unauthorized. Admin access required.' },
					{ status: 403 },
				);
			}
			return NextResponse.json(
				{ error: 'Failed to create no-show entry' },
				{ status: 500 },
			);
		}

		return NextResponse.json(
			{
				noShow,
				daysPerWeekAtTime: safeDays,
				weightApplied,
				message: 'No-show entry created successfully',
			},
			{ status: 201 },
		);
	} catch (error) {
		console.error('Unexpected error in POST /api/no-shows:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 },
		);
	}
}
