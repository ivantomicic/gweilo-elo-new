"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase/client";
import { Stack } from "@/components/ui/stack";
import { Box } from "@/components/ui/box";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export default function DashboardPage() {
	const router = useRouter();
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		const checkAuth = async () => {
			const {
				data: { session },
			} = await supabase.auth.getSession();
			if (!session) {
				router.push("/");
			} else {
				setIsLoading(false);
			}
		};
		checkAuth();

		// Listen for auth state changes
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, session) => {
			if (!session) {
				router.push("/");
			}
		});

		return () => subscription.unsubscribe();
	}, [router]);

	const handleLogout = async () => {
		await supabase.auth.signOut();
		router.push("/");
	};

	if (isLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<p className="text-muted-foreground">Loading...</p>
			</div>
		);
	}

	return (
		<Stack
			direction="column"
			alignItems="center"
			justifyContent="center"
			className="min-h-screen bg-background px-6"
			spacing={8}
		>
			<h1 className="text-4xl font-bold font-heading">
				{t.common.dashboard.toUpperCase()}
			</h1>
			<Button
				onClick={handleLogout}
				variant="secondary"
				className="h-12 px-6 rounded-full"
			>
				<Stack
					direction="row"
					alignItems="center"
					justifyContent="center"
					spacing={2}
				>
					<span>{t.common.logout}</span>
					<Icon icon="solar:logout-2-bold" className="size-5" />
				</Stack>
			</Button>
		</Stack>
	);
}
