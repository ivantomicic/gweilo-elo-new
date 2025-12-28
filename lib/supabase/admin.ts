import { createClient } from '@supabase/supabase-js';

/**
 * Create Supabase admin client with service role key
 * 
 * WARNING: This uses the service role key which has full admin access.
 * NEVER expose this to the client. Only use in server-side code (API routes, server components).
 * 
 * The service role key bypasses Row Level Security (RLS) and has full access to all data.
 */
export function createAdminClient() {
	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !supabaseServiceRoleKey) {
		throw new Error('Missing Supabase admin environment variables');
	}

	return createClient(supabaseUrl, supabaseServiceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});
}

/**
 * Verify that the requesting user is an admin
 * 
 * This function reads the user's role from their JWT token.
 * It should be called in API routes to verify admin access.
 * 
 * @param authHeader - The Authorization header from the request (Bearer token)
 * @returns The user ID if admin, null otherwise
 */
export async function verifyAdmin(authHeader: string | null): Promise<string | null> {
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return null;
	}

	const token = authHeader.replace('Bearer ', '');
	const adminClient = createAdminClient();

	// Verify the token and get user
	const { data: { user }, error } = await adminClient.auth.getUser(token);

	if (error || !user) {
		return null;
	}

	// Check if user is admin
	const role = user.user_metadata?.role || 'user';
	if (role !== 'admin') {
		return null;
	}

	return user.id;
}

