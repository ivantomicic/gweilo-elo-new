import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error('Missing Supabase environment variables');
}

/**
 * POST /api/polls/[pollId]/answer
 * 
 * Submit an answer to a poll (all authenticated users)
 * 
 * Security:
 * - All authenticated users can submit answers
 * - RLS policies enforce one answer per user per poll
 * - RLS policies check that poll is not closed
 * 
 * Request body:
 * {
 *   optionId: string (UUID)
 * }
 */
export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ pollId: string }> | { pollId: string } }
) {
	try {
		// Handle both sync and async params (Next.js 14 vs 15)
		const resolvedParams = await Promise.resolve(params);
		const { pollId } = resolvedParams;

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
			console.error('Auth error:', { userError, hasUser: !!user, tokenLength: token.length });
			return NextResponse.json(
				{ error: 'Unauthorized. Authentication required.' },
				{ status: 401 }
			);
		}

		console.log('User authenticated:', { userId: user.id, email: user.email });

		// Parse request body
		let body;
		try {
			body = await request.json();
		} catch (parseError) {
			console.error('Error parsing request body:', parseError);
			return NextResponse.json(
				{ error: 'Invalid request body. Expected JSON.' },
				{ status: 400 }
			);
		}

		const { optionId } = body;

		// Validate required fields
		if (!optionId) {
			console.error('Missing optionId in request body:', body);
			return NextResponse.json(
				{ error: 'Missing required field: optionId is required' },
				{ status: 400 }
			);
		}

		// Verify poll exists and is active
		const { data: poll, error: pollError } = await supabase
			.from('polls')
			.select('id, end_date')
			.eq('id', pollId)
			.single();

		if (pollError || !poll) {
			return NextResponse.json(
				{ error: 'Poll not found' },
				{ status: 404 }
			);
		}

		// Check if poll is closed
		if (poll.end_date) {
			const endDate = new Date(poll.end_date);
			const now = new Date();
			if (endDate < now) {
				return NextResponse.json(
					{ error: 'This poll has ended' },
					{ status: 400 }
				);
			}
		}

		// Verify option belongs to this poll
		const { data: option, error: optionError } = await supabase
			.from('poll_options')
			.select('id, poll_id')
			.eq('id', optionId)
			.single();

		if (optionError || !option) {
			return NextResponse.json(
				{ error: 'Option not found' },
				{ status: 404 }
			);
		}

		if (option.poll_id !== pollId) {
			return NextResponse.json(
				{ error: 'Option does not belong to this poll' },
				{ status: 400 }
			);
		}

		// Check if user already answered this poll
		const { data: existingAnswer, error: checkError } = await supabase
			.from('poll_answers')
			.select('id')
			.eq('poll_id', pollId)
			.eq('user_id', user.id)
			.single();

		if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
			console.error('Error checking existing answer:', checkError);
			return NextResponse.json(
				{ error: 'Failed to check existing answer' },
				{ status: 500 }
			);
		}

		if (existingAnswer) {
			return NextResponse.json(
				{ error: 'You have already answered this poll' },
				{ status: 400 }
			);
		}

		// Insert answer (RLS will enforce one answer per user per poll)
		console.log('Attempting to insert answer:', { pollId, optionId, userId: user.id });
		const { data: answer, error: insertError } = await supabase
			.from('poll_answers')
			.insert({
				poll_id: pollId,
				option_id: optionId,
				user_id: user.id,
			})
			.select()
			.single();

		if (insertError) {
			console.error('Error inserting poll answer:', insertError);
			console.error('Insert error details:', {
				code: insertError.code,
				message: insertError.message,
				details: insertError.details,
				hint: insertError.hint,
			});
			// Check if it's a unique constraint violation (user already answered)
			if (insertError.code === '23505') {
				return NextResponse.json(
					{ error: 'You have already answered this poll' },
					{ status: 400 }
				);
			}
			// Check if it's an RLS policy violation
			if (insertError.code === '42501' || insertError.message?.includes('permission denied')) {
				return NextResponse.json(
					{ error: 'Permission denied. You may not be able to answer this poll.' },
					{ status: 403 }
				);
			}
			return NextResponse.json(
				{ error: `Failed to submit answer: ${insertError.message || 'Unknown error'}` },
				{ status: 500 }
			);
		}

		return NextResponse.json(
			{
				answer: {
					id: answer.id,
					pollId: answer.poll_id,
					optionId: answer.option_id,
					userId: answer.user_id,
					answeredAt: answer.answered_at,
				},
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error('Unexpected error in POST /api/polls/[pollId]/answer:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		const errorStack = error instanceof Error ? error.stack : undefined;
		console.error('Error stack:', errorStack);
		return NextResponse.json(
			{ 
				error: 'Internal server error',
				details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
			},
			{ status: 500 }
		);
	}
}
