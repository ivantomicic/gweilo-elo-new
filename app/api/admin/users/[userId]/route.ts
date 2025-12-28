import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, verifyAdmin } from '@/lib/supabase/admin';

/**
 * PATCH /api/admin/users/[userId]
 * 
 * Update user data (admin-only)
 * 
 * Security:
 * - Verifies admin role via JWT token
 * - Uses service role key server-side
 * - Can update: name, email, avatar_url
 * 
 * Update Behavior:
 * - Display name → updates user_metadata.name
 * - Email → uses Supabase email update (requires confirmation)
 * - Avatar → updates user_metadata.avatar_url (assumes URL is already uploaded)
 * 
 * Limitations:
 * - Email changes require confirmation (Supabase sends confirmation email)
 * - Avatar URL must be provided (upload should happen separately if needed)
 */
export async function PATCH(
	request: NextRequest,
	{ params }: { params: { userId: string } }
) {
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

		const { userId } = params;
		const body = await request.json();
		const { name, email, avatar } = body;

		// Validate input
		if (!name && !email && avatar === undefined) {
			return NextResponse.json(
				{ error: 'At least one field (name, email, avatar) must be provided' },
				{ status: 400 }
			);
		}

		const adminClient = createAdminClient();

		// Build update payload
		const updateData: {
			user_metadata?: Record<string, any>;
			email?: string;
		} = {};

		// Update user_metadata if name or avatar provided
		if (name !== undefined || avatar !== undefined) {
			// Get current user to preserve existing metadata
			const { data: { user: currentUser } } = await adminClient.auth.admin.getUserById(userId);

			if (!currentUser) {
				return NextResponse.json(
					{ error: 'User not found' },
					{ status: 404 }
				);
			}

			updateData.user_metadata = {
				...currentUser.user_metadata,
			};

			if (name !== undefined) {
				updateData.user_metadata.name = name;
			}

			if (avatar !== undefined) {
				updateData.user_metadata.avatar_url = avatar || null;
			}
		}

		// Update email if provided
		if (email !== undefined) {
			updateData.email = email;
		}

		// Update user via Admin API
		const { data, error } = await adminClient.auth.admin.updateUserById(
			userId,
			updateData
		);

		if (error) {
			console.error('Error updating user:', error);
			return NextResponse.json(
				{ error: error.message || 'Failed to update user' },
				{ status: 400 }
			);
		}

		// Format response
		const updatedUser = {
			id: data.user.id,
			email: data.user.email || '',
			name:
				data.user.user_metadata?.name ||
				data.user.user_metadata?.full_name ||
				data.user.email?.split('@')[0] ||
				'User',
			avatar: data.user.user_metadata?.avatar_url || null,
			role: data.user.user_metadata?.role || 'user',
		};

		return NextResponse.json({
			user: updatedUser,
			message: email
				? 'User updated. Email confirmation sent to new address.'
				: 'User updated successfully.',
		});
	} catch (error) {
		console.error('Unexpected error in PATCH /api/admin/users/[userId]:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}

