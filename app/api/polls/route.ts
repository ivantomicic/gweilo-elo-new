import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient, verifyAdmin } from '@/lib/supabase/admin';

/**
 * Send email notifications to all admin users when a poll is created
 * This is fire-and-forget - errors are logged but don't affect poll creation
 */
async function sendPollCreatedEmails(poll: {
	id: string;
	question: string;
	description: string | null;
	options: Array<{ id: string; text: string }>;
}) {
	console.log('[sendPollCreatedEmails] ============================================');
	console.log('[sendPollCreatedEmails] Function called with poll:', {
		id: poll.id,
		question: poll.question,
		optionsCount: poll.options.length,
	});
	console.log('[sendPollCreatedEmails] ============================================');
	
	try {
		const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
		const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

		if (!supabaseUrl || !supabaseAnonKey) {
			console.error('[sendPollCreatedEmails] Missing Supabase environment variables');
			return;
		}

		// Get admin client to fetch all admin users
		const adminClient = createAdminClient();

		// List all users
		const { data, error: usersError } = await adminClient.auth.admin.listUsers();

		if (usersError || !data) {
			console.error('[sendPollCreatedEmails] Failed to fetch users:', usersError);
			return;
		}

		// The listUsers() API returns { users: User[] } structure
		const users = data.users || [];
		console.log(`[sendPollCreatedEmails] Fetched ${users.length} users from Supabase`);

		// Filter to only admin users with email addresses
		const adminUsers = users.filter(
			(user) => user.user_metadata?.role === 'admin' && user.email
		);

		console.log(`[sendPollCreatedEmails] Found ${users.length} total users, ${adminUsers.length} admin users with emails`);

		if (adminUsers.length === 0) {
			console.log('[sendPollCreatedEmails] No admin users found to notify');
			console.log('[sendPollCreatedEmails] All users:', users.map(u => ({
				email: u.email,
				role: u.user_metadata?.role,
			})));
			return;
		}

		console.log(`[sendPollCreatedEmails] Sending emails to ${adminUsers.length} admin(s):`, adminUsers.map(u => u.email));

		// Send emails to all admins (in parallel, fire-and-forget)
		// Each email gets personalized with the recipient's user ID
		// Each email gets personalized with the recipient's user ID
		const emailPromises = adminUsers.map(async (adminUser) => {
			try {
				const functionUrl = `${supabaseUrl}/functions/v1/send-email`;
				const response = await fetch(functionUrl, {
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${supabaseAnonKey}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						to: adminUser.email!,
						type: 'poll_created',
						payload: {
							question: poll.question,
							description: poll.description || undefined,
							options: poll.options.map((opt) => ({
								id: opt.id,
								text: opt.text,
							})),
							pollId: poll.id,
							userId: adminUser.id, // Include user ID for auto-submit
						},
					}),
				});

				if (!response.ok) {
					const errorText = await response.text();
					console.error(
						`[sendPollCreatedEmails] Failed to send email to ${adminUser.email}:`,
						`Status: ${response.status}`,
						errorText
					);
				} else {
					const result = await response.json();
					console.log(`[sendPollCreatedEmails] Email sent to ${adminUser.email}`, result);
				}
			} catch (error) {
				console.error(
					`[sendPollCreatedEmails] Error sending email to ${adminUser.email}:`,
					error
				);
			}
		});

		// Wait for all emails to be sent (but don't throw on individual failures)
		const results = await Promise.allSettled(emailPromises);
		const successCount = results.filter(r => r.status === 'fulfilled').length;
		const failureCount = results.filter(r => r.status === 'rejected').length;
		console.log(`[sendPollCreatedEmails] Email sending completed: ${successCount} succeeded, ${failureCount} failed`);
	} catch (error) {
		// Log error but don't throw - this should never block poll creation
		console.error('[sendPollCreatedEmails] Unexpected error:', error);
	}
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error('Missing Supabase environment variables');
}

/**
 * GET /api/polls
 * 
 * Fetch all polls with their options and answer counts
 * 
 * Security:
 * - Accessible to all authenticated users
 * - RLS policies on polls tables enforce read access
 * 
 * Query parameters:
 * - status: "active" | "completed" | "all" (default: "all")
 *   - active: Polls that are still open (no end_date or end_date > NOW)
 *   - completed: Polls that have ended (end_date < NOW) or polls where user has answered
 * 
 * Returns:
 * - Array of poll objects with options and answer counts
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

		// Get current user
		const { data: { user }, error: userError } = await supabase.auth.getUser(token);
		if (userError || !user) {
			return NextResponse.json(
				{ error: 'Unauthorized. Authentication required.' },
				{ status: 401 }
			);
		}

		// Get query parameters
		const { searchParams } = new URL(request.url);
		const status = searchParams.get('status') || 'all';

		// Fetch all polls
		const { data: polls, error: pollsError } = await supabase
			.from('polls')
			.select('id, question, description, end_date, created_at, created_by')
			.order('created_at', { ascending: false });

		if (pollsError) {
			console.error('Error fetching polls:', pollsError);
			return NextResponse.json(
				{ error: 'Failed to fetch polls' },
				{ status: 500 }
			);
		}

		if (!polls || polls.length === 0) {
			return NextResponse.json({ polls: [] });
		}

		const pollIds = polls.map(p => p.id);

		// Fetch all poll options
		const { data: pollOptions, error: optionsError } = await supabase
			.from('poll_options')
			.select('id, poll_id, option_text, display_order')
			.in('poll_id', pollIds)
			.order('poll_id, display_order');

		if (optionsError) {
			console.error('Error fetching poll options:', optionsError);
			return NextResponse.json(
				{ error: 'Failed to fetch poll options' },
				{ status: 500 }
			);
		}

		// Fetch all poll answers (for counts and user's answers)
		const { data: pollAnswers, error: answersError } = await supabase
			.from('poll_answers')
			.select('id, poll_id, option_id, user_id')
			.in('poll_id', pollIds);

		if (answersError) {
			console.error('Error fetching poll answers:', answersError);
			return NextResponse.json(
				{ error: 'Failed to fetch poll answers' },
				{ status: 500 }
			);
		}

		// Build options map: poll_id -> options[]
		const optionsMap = new Map<string, typeof pollOptions>();
		for (const option of pollOptions || []) {
			if (!optionsMap.has(option.poll_id)) {
				optionsMap.set(option.poll_id, []);
			}
			optionsMap.get(option.poll_id)!.push(option);
		}

		// Build answer counts map: option_id -> count
		const answerCountsMap = new Map<string, number>();
		// Build user IDs map: option_id -> user_id[]
		const optionUserIdsMap = new Map<string, string[]>();
		for (const answer of pollAnswers || []) {
			const count = answerCountsMap.get(answer.option_id) || 0;
			answerCountsMap.set(answer.option_id, count + 1);
			
			if (!optionUserIdsMap.has(answer.option_id)) {
				optionUserIdsMap.set(answer.option_id, []);
			}
			optionUserIdsMap.get(answer.option_id)!.push(answer.user_id);
		}

		// Fetch user data for all users who answered
		const allUserIds = new Set<string>();
		for (const userIds of optionUserIdsMap.values()) {
			userIds.forEach(id => allUserIds.add(id));
		}

		const { createAdminClient } = await import('@/lib/supabase/admin');
		const adminClient = createAdminClient();
		const usersMap = new Map<string, { name: string; avatar: string | null }>();

		if (allUserIds.size > 0) {
			const { data: allUsersData, error: usersError } = await adminClient.auth.admin.listUsers();

			if (!usersError && allUsersData) {
				allUsersData.users
					.filter((u) => allUserIds.has(u.id))
					.forEach((user) => {
						usersMap.set(user.id, {
							name:
								user.user_metadata?.display_name ||
								user.user_metadata?.name ||
								user.user_metadata?.full_name ||
								user.email?.split('@')[0] ||
								'User',
							avatar: user.user_metadata?.avatar_url || null,
						});
					});
			}
		}

		// Build user answers map: poll_id -> { answered: boolean, optionId: string | null }
		const userAnswersMap = new Map<string, { answered: boolean; optionId: string | null }>();
		for (const answer of pollAnswers || []) {
			if (answer.user_id === user.id) {
				userAnswersMap.set(answer.poll_id, {
					answered: true,
					optionId: answer.option_id,
				});
			}
		}

		// Format polls with options and answer counts
		const formattedPolls = polls.map(poll => {
			const options = (optionsMap.get(poll.id) || []).map(option => {
				const userIds = optionUserIdsMap.get(option.id) || [];
				const users = userIds
					.map(userId => {
						const userData = usersMap.get(userId);
						return userData ? { id: userId, name: userData.name, avatar: userData.avatar } : null;
					})
					.filter((user): user is { id: string; name: string; avatar: string | null } => user !== null);

				return {
					id: option.id,
					text: option.option_text,
					displayOrder: option.display_order,
					answerCount: answerCountsMap.get(option.id) || 0,
					users, // Array of users who answered this option
				};
			});

			const now = new Date();
			const endDate = poll.end_date ? new Date(poll.end_date) : null;
			const isActive = !endDate || endDate > now;
			const userAnswer = userAnswersMap.get(poll.id) || { answered: false, optionId: null };
			const hasUserAnswered = userAnswer.answered;
			const userSelectedOptionId = userAnswer.optionId;
			const totalAnswers = options.reduce((sum, opt) => sum + opt.answerCount, 0);

			// Filter by status
			if (status === 'active') {
				// Active tab: show polls that are still active (regardless of whether user answered)
				if (!isActive) {
					return null; // Skip this poll (it's closed)
				}
			} else if (status === 'completed') {
				// Completed tab: show polls that are closed (ended)
				if (isActive) {
					return null; // Skip this poll (it's still active)
				}
			}

			return {
				id: poll.id,
				question: poll.question,
				description: poll.description,
				endDate: poll.end_date,
				createdAt: poll.created_at,
				createdBy: poll.created_by,
				isActive,
				options,
				hasUserAnswered,
				userSelectedOptionId,
				totalAnswers,
			};
		}).filter(p => p !== null);

		return NextResponse.json({ polls: formattedPolls });
	} catch (error) {
		console.error('Unexpected error in GET /api/polls:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}

/**
 * POST /api/polls
 * 
 * Create a new poll (admin-only)
 * 
 * Security:
 * - Verifies admin role via JWT token
 * - RLS policies on polls table also enforce admin-only INSERT
 * 
 * Request body:
 * {
 *   question: string,
 *   options: string[] (min 2 options),
 *   endDate?: string (ISO timestamp, optional)
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
		const { question, description, options, endDate } = body;

		// Validate required fields
		if (!question || !options || !Array.isArray(options)) {
			return NextResponse.json(
				{ error: 'Missing required fields: question and options are required' },
				{ status: 400 }
			);
		}

		// Validate question
		if (typeof question !== 'string' || question.trim().length === 0) {
			return NextResponse.json(
				{ error: 'Question cannot be empty' },
				{ status: 400 }
			);
		}

		// Validate options (min 2, all non-empty strings)
		if (options.length < 2) {
			return NextResponse.json(
				{ error: 'At least 2 options are required' },
				{ status: 400 }
			);
		}

		const validOptions = options
			.map((opt: any, index: number) => {
				if (typeof opt !== 'string' || opt.trim().length === 0) {
					return null;
				}
				return { text: opt.trim(), order: index };
			})
			.filter((opt: any) => opt !== null);

		if (validOptions.length < 2) {
			return NextResponse.json(
				{ error: 'At least 2 valid (non-empty) options are required' },
				{ status: 400 }
			);
		}

		// Validate endDate if provided
		if (endDate && isNaN(Date.parse(endDate))) {
			return NextResponse.json(
				{ error: 'Invalid endDate format' },
				{ status: 400 }
			);
		}

		// Get JWT token from Authorization header
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

		// Insert poll
		const { data: poll, error: pollError } = await supabase
			.from('polls')
			.insert({
				question: question.trim(),
				description: description?.trim() || null,
				end_date: endDate || null,
				created_by: adminUserId,
			})
			.select()
			.single();

		if (pollError) {
			console.error('Error inserting poll:', pollError);
			if (pollError.code === '42501' || pollError.message.includes('permission')) {
				return NextResponse.json(
					{ error: 'Unauthorized. Admin access required.' },
					{ status: 403 }
				);
			}
			return NextResponse.json(
				{ error: 'Failed to create poll' },
				{ status: 500 }
			);
		}

		// Insert poll options
		const optionsToInsert = validOptions.map((opt: any) => ({
			poll_id: poll.id,
			option_text: opt.text,
			display_order: opt.order,
		}));

		const { data: insertedOptions, error: optionsError } = await supabase
			.from('poll_options')
			.insert(optionsToInsert)
			.select();

		if (optionsError) {
			console.error('Error inserting poll options:', optionsError);
			// Clean up poll if options insert fails
			await supabase.from('polls').delete().eq('id', poll.id);
			return NextResponse.json(
				{ error: 'Failed to create poll options' },
				{ status: 500 }
			);
		}

		// Format response
		const formattedPoll = {
			id: poll.id,
			question: poll.question,
			description: poll.description,
			endDate: poll.end_date,
			createdAt: poll.created_at,
			createdBy: poll.created_by,
			isActive: true,
			options: insertedOptions.map((opt, index) => ({
				id: opt.id,
				text: opt.option_text,
				displayOrder: opt.display_order,
				answerCount: 0,
			})),
			hasUserAnswered: false,
			totalAnswers: 0,
		};

		// Send email notifications to admins (fire and forget - don't block response)
		console.log('[POST /api/polls] ============================================');
		console.log('[POST /api/polls] Poll created successfully!');
		console.log('[POST /api/polls] Poll ID:', formattedPoll.id);
		console.log('[POST /api/polls] Poll question:', formattedPoll.question);
		console.log('[POST /api/polls] Triggering email notifications...');
		console.log('[POST /api/polls] ============================================');
		
		// Call the email function (don't await - fire and forget)
		sendPollCreatedEmails(formattedPoll)
			.then(() => {
				console.log('[POST /api/polls] ✅ Email notification process completed');
			})
			.catch((error) => {
				// Log error but don't fail the poll creation
				console.error('[POST /api/polls] ❌ Failed to send poll created emails:', error);
				if (error instanceof Error) {
					console.error('[POST /api/polls] Error message:', error.message);
					console.error('[POST /api/polls] Error stack:', error.stack);
				}
			});

		return NextResponse.json(
			{ poll: formattedPoll },
			{ status: 201 }
		);
	} catch (error) {
		console.error('Unexpected error in POST /api/polls:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
