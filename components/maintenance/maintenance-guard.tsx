"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { getUserRole } from "@/lib/auth/getUserRole";
import { Box } from "@/components/ui/box";
import { Stack } from "@/components/ui/stack";
import { t } from "@/lib/i18n";
import Image from "next/image";

interface MaintenanceStatus {
	enabled: boolean;
	message: string | null;
}

/**
 * MaintenanceGuard component
 *
 * Wraps the application and shows a maintenance page if:
 * - Maintenance mode is enabled
 * - User is NOT an admin
 *
 * Admins can always access the app during maintenance.
 * The /maintenance page is always accessible (for direct links).
 */
export function MaintenanceGuard({ children }: { children: React.ReactNode }) {
	const [maintenanceStatus, setMaintenanceStatus] =
		useState<MaintenanceStatus | null>(null);
	const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const pathname = usePathname();

	useEffect(() => {
		const checkMaintenanceAndRole = async () => {
			try {
				// Check maintenance status and user role in parallel
				const [maintenanceResponse, role] = await Promise.all([
					fetch("/api/maintenance").then((res) => res.json()),
					getUserRole(),
				]);

				setMaintenanceStatus(maintenanceResponse);
				setIsAdmin(role === "admin");
			} catch (error) {
				console.error("Error checking maintenance status:", error);
				// On error, assume maintenance is off to not block users
				setMaintenanceStatus({ enabled: false, message: null });
				setIsAdmin(false);
			} finally {
				setIsLoading(false);
			}
		};

		checkMaintenanceAndRole();
	}, []);

	// Show nothing while loading to prevent flash
	if (isLoading) {
		return (
			<Box className="min-h-screen bg-background flex items-center justify-center">
				<Box className="animate-pulse text-muted-foreground">
					Loading...
				</Box>
			</Box>
		);
	}

	// Allow access if:
	// - Maintenance mode is off
	// - User is admin
	// - User is on the maintenance page itself
	const allowAccess =
		!maintenanceStatus?.enabled ||
		isAdmin === true ||
		pathname === "/maintenance";

	if (allowAccess) {
		return <>{children}</>;
	}

	// Show maintenance page
	return <MaintenanceScreen message={maintenanceStatus?.message} />;
}

/**
 * Maintenance Screen Component
 *
 * The actual maintenance page UI shown to non-admin users.
 */
function MaintenanceScreen({ message }: { message?: string | null }) {
	return (
		<Box className="min-h-screen bg-background flex items-center justify-center p-4">
			<Stack
				direction="column"
				alignItems="center"
				spacing={6}
				className="text-center max-w-md"
			>
				{/* Logo */}
				<Image
					src="/logo.png"
					alt={t.logo.alt}
					width={120}
					height={120}
					className="opacity-50"
				/>

				{/* Icon */}
				<Box className="text-6xl">🔧</Box>

				{/* Title */}
				<h1 className="font-heading text-3xl font-bold text-foreground">
					{t.maintenance.title}
				</h1>

				{/* Custom message or default */}
				<p className="text-muted-foreground text-lg">
					{message || t.maintenance.message}
				</p>

				{/* Subtext */}
				<p className="text-muted-foreground/60 text-sm">
					{t.maintenance.subtext}
				</p>
			</Stack>
		</Box>
	);
}
