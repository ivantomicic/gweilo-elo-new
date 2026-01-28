"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Stack } from "@/components/ui/stack";
import { Box } from "@/components/ui/box";
import { t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";

/**
 * MaintenanceSettings component
 * 
 * Simple toggle for enabling/disabling maintenance mode.
 */
export function MaintenanceSettings() {
	const [enabled, setEnabled] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		const fetchStatus = async () => {
			try {
				const response = await fetch("/api/maintenance");
				const data = await response.json();
				setEnabled(data.enabled);
			} catch (error) {
				console.error("Error fetching maintenance status:", error);
			} finally {
				setIsLoading(false);
			}
		};

		fetchStatus();
	}, []);

	const handleToggle = async (newEnabled: boolean) => {
		setIsSaving(true);
		try {
			const { data: { session } } = await supabase.auth.getSession();
			
			if (!session?.access_token) {
				toast.error(t.admin.users.error.notAuthenticated);
				return;
			}

			const response = await fetch("/api/maintenance", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${session.access_token}`,
				},
				body: JSON.stringify({ enabled: newEnabled }),
			});

			if (!response.ok) {
				throw new Error("Failed to update");
			}

			setEnabled(newEnabled);
			toast.success(
				newEnabled 
					? t.maintenance.admin.success.enabled 
					: t.maintenance.admin.success.disabled
			);
		} catch (error) {
			console.error("Error updating maintenance mode:", error);
			toast.error(t.maintenance.admin.error.updateFailed);
		} finally {
			setIsSaving(false);
		}
	};

	if (isLoading) {
		return (
			<Card>
				<CardContent className="py-6">
					<Box className="text-center text-muted-foreground">Loading...</Box>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardContent className="py-6">
				<Stack direction="row" alignItems="center" justifyContent="between">
					<Stack direction="row" alignItems="center" spacing={3}>
						<span className="text-xl">🔧</span>
						<Label htmlFor="maintenance-toggle" className="text-base font-medium cursor-pointer">
							{t.maintenance.admin.title}
						</Label>
					</Stack>
					<Stack direction="row" alignItems="center" spacing={3}>
						<span className={`text-sm ${enabled ? "text-amber-500" : "text-muted-foreground"}`}>
							{enabled ? t.maintenance.admin.enabled : t.maintenance.admin.disabled}
						</span>
						<Switch
							id="maintenance-toggle"
							checked={enabled}
							onCheckedChange={handleToggle}
							disabled={isSaving}
						/>
					</Stack>
				</Stack>
			</CardContent>
		</Card>
	);
}
