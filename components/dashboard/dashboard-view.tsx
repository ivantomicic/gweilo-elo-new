"use client";

import { t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase/client";
import { Stack } from "@/components/ui/stack";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

/**
 * DashboardView component
 * 
 * Renders dashboard content with logout functionality.
 * Does NOT handle routing - parent component manages auth state and rendering.
 * When logout succeeds, parent will automatically re-render via onAuthStateChange.
 */
export function DashboardView() {
	const handleLogout = async () => {
		await supabase.auth.signOut();
		// On logout, parent component will detect auth change and render auth screen
	};

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

