import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error('Missing Supabase environment variables');
}

/**
 * POST /api/polls/[pollId]/answer-by-token
 * 
 * Submit an answer to a poll using a user ID token (from email link)
 * This allows answering without requiring the user to be logged in
 * 
 * Security:
 * - Uses admin client to bypass RLS (since user might not be logged in)
 * - Validates that poll exists and is active
 * - Validates that option belongs to poll
 * - Enforces one answer per user per poll
 * 
 * Request body:
 * {
 *   optionId: string (UUID),
 *   userId: string (UUID) - User ID from email link
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

		// Parse request body
		const body = await request.json();
		const { optionId, userId } = body;

		// Validate required fields
		if (!optionId || !userId) {
			return NextResponse.json(
				{ error: 'Missing required fields: optionId and userId are required' },
				{ status: 400 }
			);
		}

		// Use admin client to bypass RLS (user might not be logged in)
		const adminClient = createAdminClient();

		// Verify poll exists and is active
		const { data: poll, error: pollError } = await adminClient
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
		const { data: option, error: optionError } = await adminClient
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
		const { data: existingAnswer, error: checkError } = await adminClient
			.from('poll_answers')
			.select('id')
			.eq('poll_id', pollId)
			.eq('user_id', userId)
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

		// Insert answer using admin client (bypasses RLS)
		const { data: answer, error: insertError } = await adminClient
			.from('poll_answers')
			.insert({
				poll_id: pollId,
				option_id: optionId,
				user_id: userId,
			})
			.select()
			.single();

		if (insertError) {
			console.error('Error inserting poll answer:', insertError);
			// Check if it's a unique constraint violation (user already answered)
			if (insertError.code === '23505') {
				return NextResponse.json(
					{ error: 'You have already answered this poll' },
					{ status: 400 }
				);
			}
			return NextResponse.json(
				{ error: 'Failed to submit answer' },
				{ status: 500 }
			);
		}

		return NextResponse.json(
			{
				success: true,
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
		console.error('Unexpected error in POST /api/polls/[pollId]/answer-by-token:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
