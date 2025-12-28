import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient, verifyAdmin } from '@/lib/supabase/admin';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error('Missing Supabase environment variables');
}

/**
 * GET /api/ispale
 * 
 * Fetch all no-shows with user information, aggregated by user (worst offenders)
 * 
 * Security:
 * - Accessible to all authenticated users
 * - RLS policies on no_shows table enforce read access
 * - Uses admin client to fetch user info (since regular users can't query auth.users)
 * 
 * Returns:
 * - Array of user objects with no-show counts and last no-show date
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
		const supabase = createClient(supabaseUrl, supabaseAnonKey, {
			global: {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		});

		// Create admin client to fetch user info (needed because regular users can't query auth.users)
		const adminClient = createAdminClient();

		// Fetch all no-shows from the database (RLS will enforce read permissions)
		const { data: noShows, error: noShowsError } = await supabase
			.from('no_shows')
			.select('user_id, date')
			.order('date', { ascending: false });

		if (noShowsError) {
			console.error('Error fetching no-shows:', noShowsError);
			return NextResponse.json(
				{ error: 'Failed to fetch no-shows' },
				{ status: 500 }
			);
		}

		// Aggregate no-shows by user_id
		const userNoShowsMap = new Map<string, { count: number; lastDate: string }>();
		
		for (const noShow of noShows || []) {
			const existing = userNoShowsMap.get(noShow.user_id) || { count: 0, lastDate: '' };
			userNoShowsMap.set(noShow.user_id, {
				count: existing.count + 1,
				lastDate: existing.lastDate || noShow.date, // First date is the most recent (ordered DESC)
			});
		}

		// Fetch user info for all users with no-shows
		const userIds = Array.from(userNoShowsMap.keys());
		if (userIds.length === 0) {
			return NextResponse.json({ users: [] });
		}

		// Get user details using admin client
		const { data: { users }, error: usersError } = await adminClient.auth.admin.listUsers();

		if (usersError) {
			console.error('Error fetching users:', usersError);
			return NextResponse.json(
				{ error: 'Failed to fetch user information' },
				{ status: 500 }
			);
		}

		// Format response: combine user info with no-show stats
		const formattedUsers = users
			.filter((user) => userIds.includes(user.id))
			.map((user) => {
				const stats = userNoShowsMap.get(user.id)!;
				return {
					id: user.id,
					name:
						user.user_metadata?.name ||
						user.user_metadata?.full_name ||
						user.email?.split('@')[0] ||
						'User',
					avatar: user.user_metadata?.avatar_url || null,
					noShowCount: stats.count,
					lastNoShowDate: stats.lastDate,
				};
			})
			.sort((a, b) => b.noShowCount - a.noShowCount); // Sort by count descending

		return NextResponse.json({ users: formattedUsers });
	} catch (error) {
		console.error('Unexpected error in GET /api/ispale:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}

/**
 * POST /api/ispale
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
		const supabase = createClient(supabaseUrl, supabaseAnonKey, {
			global: {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		});

		// Insert no-show (RLS policy will verify admin role from JWT)
		const { data: noShow, error: insertError } = await supabase
			.from('no_shows')
			.insert({
				user_id: targetUserId,
				date: date,
				reason: reason || null,
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
		console.error('Unexpected error in POST /api/ispale:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}

