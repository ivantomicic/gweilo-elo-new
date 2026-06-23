"use client";

import type { ComponentProps, ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { cn } from "@/lib/utils";

type SiteHeaderProps = ComponentProps<typeof SiteHeader>;

type AppShellProps = SiteHeaderProps & {
	children?: ReactNode;
	bodyClassName?: string;
	containerClassName?: string;
	contentClassName?: string;
	contentPadding?: boolean;
	insetClassName?: string;
};

export function AppShell({
	children,
	bodyClassName,
	containerClassName,
	contentClassName,
	contentPadding = true,
	insetClassName,
	...headerProps
}: AppShellProps) {
	return (
		<SidebarProvider>
			<AppSidebar variant="inset" />
			<SidebarInset className={insetClassName}>
				<SiteHeader {...headerProps} />
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
