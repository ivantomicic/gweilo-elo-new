import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '@/lib/supabase/admin';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error('Missing Supabase environment variables');
}

/**
 * PUT /api/polls/[pollId]
 * 
 * Update a poll (admin-only)
 * 
 * Security:
 * - Verifies admin role via JWT token
 * - RLS policies on polls table also enforce admin-only UPDATE
 * 
 * Request body:
 * {
 *   question: string,
 *   description?: string,
 *   options: Array<{ id: string | null, text: string }>, // null id = new option
 *   endDate?: string (ISO timestamp, optional)
 * }
 */
export async function PUT(
	request: NextRequest,
	{ params }: { params: { pollId: string } }
) {
	try {
		const { pollId } = params;

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
		const validOptions = options
			.map((opt: any, index: number) => {
				if (!opt.text || typeof opt.text !== 'string' || opt.text.trim().length === 0) {
					return null;
				}
				return {
					id: opt.id || null,
					text: opt.text.trim(),
					order: index,
				};
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

		// Check if poll exists
		const { data: existingPoll, error: pollError } = await supabase
			.from('polls')
			.select('id')
			.eq('id', pollId)
			.single();

		if (pollError || !existingPoll) {
			return NextResponse.json(
				{ error: 'Poll not found' },
				{ status: 404 }
			);
		}

		// Update poll
		const { data: updatedPoll, error: updateError } = await supabase
			.from('polls')
			.update({
				question: question.trim(),
				description: description?.trim() || null,
				end_date: endDate || null,
			})
			.eq('id', pollId)
			.select()
			.single();

		if (updateError) {
			console.error('Error updating poll:', updateError);
			if (updateError.code === '42501' || updateError.message.includes('permission')) {
				return NextResponse.json(
					{ error: 'Unauthorized. Admin access required.' },
					{ status: 403 }
				);
			}
			return NextResponse.json(
				{ error: 'Failed to update poll' },
				{ status: 500 }
			);
		}

		// Get existing options
		const { data: existingOptions, error: optionsError } = await supabase
			.from('poll_options')
			.select('id, display_order')
			.eq('poll_id', pollId)
			.order('display_order');

		if (optionsError) {
			console.error('Error fetching existing options:', optionsError);
			return NextResponse.json(
				{ error: 'Failed to fetch existing options' },
				{ status: 500 }
			);
		}

		// Separate options into: update, create, delete
		const existingOptionIds = new Set((existingOptions || []).map((opt: any) => opt.id));
		const providedOptionIds = new Set(
			validOptions
				.map((opt: any) => opt.id)
				.filter((id: any) => id !== null)
		);

		// Options to delete (exist in DB but not in request)
		const optionsToDelete = (existingOptions || []).filter(
			(opt: any) => !providedOptionIds.has(opt.id)
		);

		// Options to update (exist in both)
		const optionsToUpdate = validOptions.filter((opt: any): opt is { id: string; text: string; order: number } => opt.id !== null);

		// Options to create (new, no ID)
		const optionsToCreate = validOptions.filter((opt: any): opt is { id: null; text: string; order: number } => opt.id === null);

		// Delete removed options
		if (optionsToDelete.length > 0) {
			const deleteIds = optionsToDelete.map((opt: any) => opt.id);
			const { error: deleteError } = await supabase
				.from('poll_options')
				.delete()
				.in('id', deleteIds);

			if (deleteError) {
				console.error('Error deleting options:', deleteError);
				return NextResponse.json(
					{ error: 'Failed to delete removed options' },
					{ status: 500 }
				);
			}
		}

		// Update existing options
		for (const option of optionsToUpdate) {
			if (!option || !option.id) continue;
			
			const { error: updateOptError } = await supabase
				.from('poll_options')
				.update({
					option_text: option.text,
					display_order: option.order,
				})
				.eq('id', option.id);

			if (updateOptError) {
				console.error('Error updating option:', updateOptError);
				return NextResponse.json(
					{ error: 'Failed to update option' },
					{ status: 500 }
				);
			}
		}

		// Create new options
		if (optionsToCreate.length > 0) {
			const newOptionsData = optionsToCreate.map((opt: any) => ({
				poll_id: pollId,
				option_text: opt.text,
				display_order: opt.order,
			}));

			const { error: createError } = await supabase
				.from('poll_options')
				.insert(newOptionsData);

			if (createError) {
				console.error('Error creating options:', createError);
				return NextResponse.json(
					{ error: 'Failed to create new options' },
					{ status: 500 }
				);
			}
		}

		// Fetch updated poll with options
		const { data: finalPoll, error: fetchError } = await supabase
			.from('polls')
			.select('id, question, description, end_date, created_at, created_by')
			.eq('id', pollId)
			.single();

		if (fetchError) {
			console.error('Error fetching updated poll:', fetchError);
			return NextResponse.json(
				{ error: 'Failed to fetch updated poll' },
				{ status: 500 }
			);
		}

		const { data: finalOptions, error: finalOptionsError } = await supabase
			.from('poll_options')
			.select('id, option_text, display_order')
			.eq('poll_id', pollId)
			.order('display_order');

		if (finalOptionsError) {
			console.error('Error fetching final options:', finalOptionsError);
			return NextResponse.json(
				{ error: 'Failed to fetch updated options' },
				{ status: 500 }
			);
		}

		// Format response
		const formattedPoll = {
			id: finalPoll.id,
			question: finalPoll.question,
			description: finalPoll.description,
			endDate: finalPoll.end_date,
			createdAt: finalPoll.created_at,
			createdBy: finalPoll.created_by,
			isActive: true,
			options: (finalOptions || []).map((opt: any) => ({
				id: opt.id,
				text: opt.option_text,
				displayOrder: opt.display_order,
				answerCount: 0,
			})),
			hasUserAnswered: false,
			totalAnswers: 0,
		};

		return NextResponse.json({ poll: formattedPoll });
	} catch (error) {
		console.error('Unexpected error in PUT /api/polls/[pollId]:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}

/**
 * DELETE /api/polls/[pollId]
 * 
 * Delete a poll (admin-only)
 * 
 * Security:
 * - Verifies admin role via JWT token
 * - RLS policies on polls table also enforce admin-only DELETE
 * - Cascade deletes will remove options and answers
 */
export async function DELETE(
	request: NextRequest,
	{ params }: { params: { pollId: string } }
) {
	try {
		const { pollId } = params;

		// Verify admin access
		const authHeader = request.headers.get('authorization');
		const adminUserId = await verifyAdmin(authHeader);

		if (!adminUserId) {
			return NextResponse.json(
				{ error: 'Unauthorized. Admin access required.' },
				{ status: 401 }
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

		// Check if poll exists
		const { data: existingPoll, error: pollError } = await supabase
			.from('polls')
			.select('id')
			.eq('id', pollId)
			.single();

		if (pollError || !existingPoll) {
			return NextResponse.json(
				{ error: 'Poll not found' },
				{ status: 404 }
			);
		}

		// Delete poll (cascade will delete options and answers)
		const { error: deleteError, data: deleteData } = await supabase
			.from('polls')
			.delete()
			.eq('id', pollId)
			.select();

		if (deleteError) {
			console.error('Error deleting poll:', deleteError);
			console.error('Delete error details:', {
				code: deleteError.code,
				message: deleteError.message,
				details: deleteError.details,
				hint: deleteError.hint,
			});
			
			if (deleteError.code === '42501' || deleteError.message.includes('permission')) {
				return NextResponse.json(
					{ error: 'Unauthorized. Admin access required.' },
					{ status: 403 }
				);
			}
			
			// Return more detailed error message
			return NextResponse.json(
				{ 
					error: deleteError.message || 'Failed to delete poll',
					code: deleteError.code,
				},
				{ status: 500 }
			);
		}

		// Check if poll was actually deleted (RLS might silently fail)
		if (!deleteData || deleteData.length === 0) {
			console.warn('Poll deletion returned no data - possible RLS issue');
			return NextResponse.json(
				{ error: 'Poll could not be deleted. It may not exist or you may not have permission.' },
				{ status: 403 }
			);
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Unexpected error in DELETE /api/polls/[pollId]:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
