"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { Box } from "@/components/ui/box";
import { supabase } from "@/lib/supabase/client";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function SessionPageContent() {
	const params = useParams();
	const sessionId = params.id as string;

	const [sessionData, setSessionData] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchSession = async () => {
			try {
				setLoading(true);
				setError(null);

				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					setError("Not authenticated");
					return;
				}

				const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
					global: {
						headers: {
							Authorization: `Bearer ${session.access_token}`,
						},
					},
				});

				// Fetch session
				const { data: sessionRecord, error: sessionError } = await supabaseClient
					.from("sessions")
					.select("*")
					.eq("id", sessionId)
					.single();

				if (sessionError) {
					setError("Failed to load session");
					return;
				}

				// Fetch session players
				const { data: players, error: playersError } = await supabaseClient
					.from("session_players")
					.select("*")
					.eq("session_id", sessionId);

				if (playersError) {
					setError("Failed to load players");
					return;
				}

				// Fetch matches directly (no rounds table)
				const { data: matches, error: matchesError } = await supabaseClient
					.from("session_matches")
					.select("*")
					.eq("session_id", sessionId)
					.order("round_number", { ascending: true })
					.order("match_order", { ascending: true });

				if (matchesError) {
					setError("Failed to load matches");
					return;
				}

				// Group matches by round_number
				const matchesByRound = (matches || []).reduce((acc, match) => {
					const roundNumber = match.round_number;
					if (!acc[roundNumber]) {
						acc[roundNumber] = [];
					}
					acc[roundNumber].push(match);
					return acc;
				}, {} as Record<number, any[]>);

				setSessionData({
					session: sessionRecord,
					players: players || [],
					matchesByRound: matchesByRound,
					matches: matches || [],
				});
			} catch (err) {
				console.error("Error fetching session:", err);
				setError("Failed to load session");
			} finally {
				setLoading(false);
			}
		};

		if (sessionId) {
			fetchSession();
		}
	}, [sessionId]);

	return (
		<SidebarProvider>
			<AppSidebar variant="inset" />
			<SidebarInset>
				<SiteHeader title="Session" />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
							{loading && (
								<Box>
									<p className="text-muted-foreground">Loading session...</p>
								</Box>
							)}

							{error && (
								<Box>
									<p className="text-destructive">{error}</p>
								</Box>
							)}

							{sessionData && (
								<Box>
									<pre className="text-xs overflow-auto bg-card p-4 rounded-lg border">
										{JSON.stringify(sessionData, null, 2)}
									</pre>
								</Box>
							)}
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

export default function SessionPage() {
	return (
		<AuthGuard>
			<SessionPageContent />
		</AuthGuard>
	);
}
