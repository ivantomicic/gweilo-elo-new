"use client";

import type { ComponentProps, ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
	useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type SiteHeaderProps = ComponentProps<typeof SiteHeader>;

type AppShellProps = SiteHeaderProps & {
	children?: ReactNode;
	bodyClassName?: string;
	containerClassName?: string;
	contentClassName?: string;
	contentPadding?: boolean;
	showHeader?: boolean;
	insetClassName?: string;
};

/** Keep the desktop sidebar reachable without recreating a page title bar. */
function HeaderlessSidebarToggle() {
	const { open } = useSidebar();
	if (open) return null;
	return (
		<SidebarTrigger
			aria-label="Otvori navigaciju"
			className="fixed bottom-4 left-4 z-50 hidden size-10 rounded-full border border-border bg-background md:inline-flex"
		/>
	);
}

export function AppShell({
	children,
	bodyClassName,
	containerClassName,
	contentClassName,
	contentPadding = true,
	showHeader = true,
	insetClassName,
	...headerProps
}: AppShellProps) {
	return (
		<SidebarProvider>
			<AppSidebar variant="inset" showToggle={!showHeader} />
			{!showHeader && <HeaderlessSidebarToggle />}
			<SidebarInset className={insetClassName}>
				{showHeader && <SiteHeader {...headerProps} />}
				<div className={cn("flex flex-1 flex-col", bodyClassName)}>
					<div
						className={cn(
							"@container/main flex flex-1 flex-col gap-2 pb-mobile-nav",
							containerClassName,
						)}
					>
						<div
							className={cn(
								"flex flex-col gap-4 py-4 md:gap-6 md:py-6",
								contentPadding && "px-4 lg:px-6",
								contentClassName,
							)}
						>
							{children}
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
