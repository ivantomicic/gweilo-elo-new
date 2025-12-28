import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, verifyAdmin } from '@/lib/supabase/admin';

/**
 * GET /api/admin/users
 * 
 * Fetch all users (admin-only)
 * 
 * Security:
 * - Verifies admin role via JWT token
 * - Uses service role key server-side (never exposed to client)
 * - Returns user list with: id, email, user_metadata (name, avatar_url, role)
 * 
 * Supabase Approach:
 * - Uses Admin API (service role) to list all users
 * - Client-side Supabase cannot list users directly (security restriction)
 * - This API route acts as a secure proxy
 */
export async function GET(request: NextRequest) {
	try {
		// Verify admin access
		const authHeader = request.headers.get('authorization');
		const userId = await verifyAdmin(authHeader);

		if (!userId) {
			return NextResponse.json(
				{ error: 'Unauthorized. Admin access required.' },
				{ status: 401 }
			);
		}

		// Create admin client to fetch all users
		const adminClient = createAdminClient();

		// List all users using Admin API
		const { data: { users }, error } = await adminClient.auth.admin.listUsers();

		if (error) {
			console.error('Error fetching users:', error);
			return NextResponse.json(
				{ error: 'Failed to fetch users' },
				{ status: 500 }
			);
		}

		// Format user data for frontend
		const formattedUsers = users.map((user) => ({
			id: user.id,
			email: user.email || '',
			name:
				user.user_metadata?.name ||
				user.user_metadata?.full_name ||
				user.email?.split('@')[0] ||
				'User',
			avatar: user.user_metadata?.avatar_url || null,
			role: user.user_metadata?.role || 'user',
			createdAt: user.created_at,
		}));

		return NextResponse.json({ users: formattedUsers });
	} catch (error) {
		console.error('Unexpected error in GET /api/admin/users:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}

