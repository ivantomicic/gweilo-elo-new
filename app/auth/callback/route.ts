import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error('Missing Supabase environment variables')
}

export async function GET(request: Request) {
	const requestUrl = new URL(request.url)
	const code = requestUrl.searchParams.get('code')

	if (code) {
		const supabase = createClient(supabaseUrl, supabaseAnonKey)
		await supabase.auth.exchangeCodeForSession(code)
	}

	// Redirect to dashboard after successful OAuth
	return NextResponse.redirect(new URL('/dashboard', requestUrl.origin))
}

