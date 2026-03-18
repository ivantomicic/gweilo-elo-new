import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '@/lib/supabase/admin';
import {
	DEFAULT_SESSIONS_PER_WEEK,
	calculateNoShowPoints,
	parseNoShowPoints,
	parseSessionsPerWeek,
} from '@/lib/no-shows/sessions-per-week';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error('Missing Supabase environment variables');
}

/**
 * GET /api/no-shows
 * 
 * Fetch all no-shows with user information, aggregated by user (worst offenders)
 * 
 * Security:
 * - Accessible to all authenticated users
 * - RLS policies on no_shows table enforce read access
 * - Uses admin client to fetch user info (since regular users can't query auth.users)
 * 
 * Returns:
 * - Array of user objects with weighted no-show points, raw no-show counts,
 *   last no-show date, and all missed dates with reasons
 */
export async function GET(request: NextRequest) {
	try {
		// Get JWT token from Authorization header
		const authHeader = request.headers.get('authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return NextResponse.json(
				{ error: 'Unauthorized. Authentication required.' },
				{ status: 401 }
			);
		}

		const token = authHeader.replace('Bearer ', '');

		// Create Supabase client with user's JWT token (so RLS works correctly)
		const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
			global: {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		});


		// Fetch all no-shows from the database (RLS will enforce read permissions)
		const { data: noShows, error: noShowsError } = await supabase
			.from('no_shows')
			.select('id, user_id, date, reason, points, sessions_per_week_snapshot')
			.order('date', { ascending: false });

		if (noShowsError) {
			console.error('Error fetching no-shows:', noShowsError);
			return NextResponse.json(
				{ error: 'Failed to fetch no-shows' },
				{ status: 500 }
			);
		}

		// Aggregate no-shows by user_id
		const userNoShowsMap = new Map<
			string,
			{
				count: number;
				totalPoints: number;
				lastDate: string;
				entries: Array<{
					id: string;
					date: string;
					reason: string | null;
					points: number;
				}>;
			}
		>();
		
		for (const noShow of noShows || []) {
			const resolvedPoints =
				parseNoShowPoints(noShow.points) ??
				calculateNoShowPoints(
					parseSessionsPerWeek(noShow.sessions_per_week_snapshot) ??
						DEFAULT_SESSIONS_PER_WEEK
				);
			const existing = userNoShowsMap.get(noShow.user_id);

			if (existing) {
				existing.count += 1;
				existing.totalPoints += resolvedPoints;
				existing.entries.push({
					id: noShow.id,
					date: noShow.date,
					reason: noShow.reason,
					points: resolvedPoints,
				});
				continue;
			}

			userNoShowsMap.set(noShow.user_id, {
				count: 1,
				totalPoints: resolvedPoints,
				lastDate: noShow.date, // First date is the most recent (ordered DESC)
				entries: [
					{
						id: noShow.id,
						date: noShow.date,
						reason: noShow.reason,
						points: resolvedPoints,
					},
				],
			});
		}

		// Fetch user info for all users with no-shows
		const userIds = Array.from(userNoShowsMap.keys());
		if (userIds.length === 0) {
			return NextResponse.json({ users: [] });
		}

		// Get user details from profiles table (fast database query)
		const { data: profiles, error: profilesError } = await supabase
			.from('profiles')
			.select('id, display_name, avatar_url')
			.in('id', userIds);

		if (profilesError) {
			console.error('Error fetching profiles:', profilesError);
			return NextResponse.json(
				{ error: 'Failed to fetch user information' },
				{ status: 500 }
			);
		}

		// Format response: combine user info with no-show stats
		const formattedUsers = (profiles || [])
			.filter((profile) => userNoShowsMap.has(profile.id))
			.map((profile) => {
				const stats = userNoShowsMap.get(profile.id)!;
				return {
					id: profile.id,
					name: profile.display_name || 'User',
					avatar: profile.avatar_url || null,
					noShowCount: stats.count,
					totalPoints: Number(stats.totalPoints.toFixed(4)),
					lastNoShowDate: stats.lastDate,
					entries: stats.entries,
				};
			})
			.sort((a, b) => {
				if (b.totalPoints !== a.totalPoints) {
					return b.totalPoints - a.totalPoints;
				}

				if (b.noShowCount !== a.noShowCount) {
					return b.noShowCount - a.noShowCount;
				}

				return b.lastNoShowDate.localeCompare(a.lastNoShowDate);
			});

		return NextResponse.json({ users: formattedUsers });
	} catch (error) {
		console.error('Unexpected error in GET /api/no-shows:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}

/**
 * POST /api/no-shows
 * 
 * Create a new no-show entry (admin-only)
 * 
 * Security:
 * - Verifies admin role via JWT token
 * - RLS policies on no_shows table also enforce admin-only INSERT
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
		// Verify admin access
		const authHeader = request.headers.get('authorization');
		const adminUserId = await verifyAdmin(authHeader);

		if (!adminUserId) {
			return NextResponse.json(
				{ error: 'Unauthorized. Admin access required.' },
				{ status: 401 }
			);
		}

		// Parse request body
		const body = await request.json();
		const { userId: targetUserId, date, reason } = body;

		// Validate required fields
		if (!targetUserId || !date) {
			return NextResponse.json(
				{ error: 'Missing required fields: userId and date are required' },
				{ status: 400 }
			);
		}

		// Validate date format
		if (isNaN(Date.parse(date))) {
			return NextResponse.json(
				{ error: 'Invalid date format' },
				{ status: 400 }
			);
		}

		// Get JWT token from Authorization header (already have authHeader from above)
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return NextResponse.json(
				{ error: 'Unauthorized. Authentication required.' },
				{ status: 401 }
			);
		}

		const token = authHeader.replace('Bearer ', '');

		// Create Supabase client with user's JWT token (so RLS can verify admin role)
		const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
			global: {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		});

		const { data: scheduleSettings, error: scheduleSettingsError } =
			await supabase
				.from('player_schedule_settings')
				.select('sessions_per_week')
				.eq('user_id', targetUserId)
				.maybeSingle();

		if (scheduleSettingsError) {
			console.error(
				'Error fetching player schedule settings:',
				scheduleSettingsError
			);
			return NextResponse.json(
				{ error: 'Failed to fetch player schedule settings' },
				{ status: 500 }
			);
		}

		const sessionsPerWeek =
			parseSessionsPerWeek(scheduleSettings?.sessions_per_week) ??
			DEFAULT_SESSIONS_PER_WEEK;
		const points = calculateNoShowPoints(sessionsPerWeek);

		// Insert no-show (RLS policy will verify admin role from JWT)
		const { data: noShow, error: insertError } = await supabase
			.from('no_shows')
			.insert({
				user_id: targetUserId,
				date: date,
				reason: reason || null,
				sessions_per_week_snapshot: sessionsPerWeek,
				points,
			})
			.select()
			.single();

		if (insertError) {
			console.error('Error inserting no-show:', insertError);
			// Check if it's a permission error
			if (insertError.code === '42501' || insertError.message.includes('permission')) {
				return NextResponse.json(
					{ error: 'Unauthorized. Admin access required.' },
					{ status: 403 }
				);
			}
			return NextResponse.json(
				{ error: 'Failed to create no-show entry' },
				{ status: 500 }
			);
		}

		return NextResponse.json(
			{ 
				noShow,
				message: 'No-show entry created successfully' 
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error('Unexpected error in POST /api/no-shows:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
