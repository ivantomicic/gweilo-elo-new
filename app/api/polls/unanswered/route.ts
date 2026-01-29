import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error('Missing Supabase environment variables');
}

/**
 * GET /api/polls/unanswered
 * 
 * Get active polls that the user hasn't answered yet
 * 
 * Security:
 * - Accessible to all authenticated users
 * - RLS policies enforce read access
 * 
 * Returns:
 * - polls: array of unanswered active polls (same format as GET /api/polls)
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
			.select('id, question, description, end_date, created_at, created_by')
			.or(`end_date.is.null,end_date.gt.${now.toISOString()}`)
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

		const usersMap = new Map<string, { name: string; avatar: string | null }>();

		if (allUserIds.size > 0) {
			const { data: profiles, error: profilesError } = await supabase
				.from('profiles')
				.select('id, display_name, avatar_url')
				.in('id', Array.from(allUserIds));

			if (!profilesError && profiles) {
				profiles.forEach((profile) => {
					usersMap.set(profile.id, {
						name: profile.display_name || 'User',
						avatar: profile.avatar_url || null,
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

		// Format polls with options and answer counts, filter out answered ones
		const formattedPolls = polls
			.filter(poll => !userAnswersMap.get(poll.id)) // Only unanswered polls
			.map(poll => {
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

				const endDate = poll.end_date ? new Date(poll.end_date) : null;
				const isActive = !endDate || endDate > now;
				const hasUserAnswered = false; // We already filtered these out
				const userSelectedOptionId = null; // User hasn't answered
				const totalAnswers = options.reduce((sum, opt) => sum + opt.answerCount, 0);

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
			});

		return NextResponse.json({ polls: formattedPolls });
	} catch (error) {
		console.error('Unexpected error in GET /api/polls/unanswered:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
