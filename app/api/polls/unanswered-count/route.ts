import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error('Missing Supabase environment variables');
}

/**
 * GET /api/polls/unanswered-count
 * 
 * Get count of active polls that the user hasn't answered yet
 * 
 * Security:
 * - Accessible to all authenticated users
 * - RLS policies enforce read access
 * 
 * Returns:
 * - count: number of unanswered active polls
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

		const now = new Date();

		// Fetch all active polls (no end_date or end_date > now)
		const { data: polls, error: pollsError } = await supabase
			.from('polls')
			.select('id')
			.or(`end_date.is.null,end_date.gt.${now.toISOString()}`);

		if (pollsError) {
			console.error('Error fetching polls:', pollsError);
			return NextResponse.json(
				{ error: 'Failed to fetch polls' },
				{ status: 500 }
			);
		}

		if (!polls || polls.length === 0) {
			return NextResponse.json({ count: 0 });
		}

		const pollIds = polls.map(p => p.id);

		// Fetch user's answers to these polls
		const { data: userAnswers, error: answersError } = await supabase
			.from('poll_answers')
			.select('poll_id')
			.eq('user_id', user.id)
			.in('poll_id', pollIds);

		if (answersError) {
			console.error('Error fetching user answers:', answersError);
			return NextResponse.json(
				{ error: 'Failed to fetch user answers' },
				{ status: 500 }
			);
		}

		// Get answered poll IDs
		const answeredPollIds = new Set((userAnswers || []).map(a => a.poll_id));

		// Count unanswered polls
		const unansweredCount = pollIds.filter(id => !answeredPollIds.has(id)).length;

		return NextResponse.json({ count: unansweredCount });
	} catch (error) {
		console.error('Unexpected error in GET /api/polls/unanswered-count:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
