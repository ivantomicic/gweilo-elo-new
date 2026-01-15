import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error('Missing Supabase environment variables');
}

/**
 * GET /api/no-shows/entries
 * 
 * Fetch paginated individual no-show entries (for the detailed table)
 * 
 * Security:
 * - Accessible to all authenticated users
 * - RLS policies on no_shows table enforce read access
 * 
 * Query parameters:
 * - page: page number (default: 1)
 * - pageSize: items per page (default: 10)
 * 
 * Returns:
 * - entries: Array of no-show entries with user info
 * - total: Total count of entries
 * - page: Current page number
 * - pageSize: Items per page
 * - totalPages: Total number of pages
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

		// Get pagination params
		const { searchParams } = new URL(request.url);
		const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
		const pageSize = Math.max(1, Math.min(100, parseInt(searchParams.get('pageSize') || '10', 10)));
		const offset = (page - 1) * pageSize;

		// Create admin client to fetch user info
		const adminClient = createAdminClient();

		// Get total count
		const { count, error: countError } = await supabase
			.from('no_shows')
			.select('*', { count: 'exact', head: true });

		if (countError) {
			console.error('Error counting no-shows:', countError);
			return NextResponse.json(
				{ error: 'Failed to fetch no-shows' },
				{ status: 500 }
			);
		}

		const total = count || 0;

		// Fetch paginated no-show entries
		const { data: noShows, error: noShowsError } = await supabase
			.from('no_shows')
			.select('id, user_id, date, reason, created_at')
			.order('date', { ascending: false })
			.range(offset, offset + pageSize - 1);

		if (noShowsError) {
			console.error('Error fetching no-shows:', noShowsError);
			return NextResponse.json(
				{ error: 'Failed to fetch no-shows' },
				{ status: 500 }
			);
		}

		if (!noShows || noShows.length === 0) {
			return NextResponse.json({
				entries: [],
				total: 0,
				page: 1,
				pageSize,
				totalPages: 0,
			});
		}

		// Get unique user IDs
		const userIds = [...new Set(noShows.map((ns) => ns.user_id))];

		// Fetch user details using admin client
		const { data: { users }, error: usersError } = await adminClient.auth.admin.listUsers();

		if (usersError) {
			console.error('Error fetching users:', usersError);
			return NextResponse.json(
				{ error: 'Failed to fetch user information' },
				{ status: 500 }
			);
		}

		// Create user map for quick lookup
		const userMap = new Map(
			users
				.filter((user) => userIds.includes(user.id))
				.map((user) => [
					user.id,
					{
						id: user.id,
						name:
							user.user_metadata?.name ||
							user.user_metadata?.full_name ||
							user.email?.split('@')[0] ||
							'User',
						avatar: user.user_metadata?.avatar_url || null,
					},
				])
		);

		// Format entries with user info
		const entries = noShows.map((noShow) => {
			const user = userMap.get(noShow.user_id) || {
				id: noShow.user_id,
				name: 'Unknown User',
				avatar: null,
			};

			return {
				id: noShow.id,
				user: {
					id: user.id,
					name: user.name,
					avatar: user.avatar,
				},
				date: noShow.date,
				reason: noShow.reason,
				createdAt: noShow.created_at,
			};
		});

		const totalPages = Math.ceil(total / pageSize);

		return NextResponse.json({
			entries,
			total,
			page,
			pageSize,
			totalPages,
		});
	} catch (error) {
		console.error('Unexpected error in GET /api/no-shows/entries:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}

