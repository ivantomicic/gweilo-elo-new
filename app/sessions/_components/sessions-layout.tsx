"use client";

import { ReactNode } from "react";
import { SidebarProvider } from "@/components/vendor/shadcn/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset } from "@/components/vendor/shadcn/sidebar";
import { SiteHeader } from "@/components/site-header";
import { Box } from "@/components/ui/box";
import { Loading } from "@/components/ui/loading";
import { t } from "@/lib/i18n";

type SessionsLayoutProps = {
	children: ReactNode;
};

export function SessionsLayout({ children }: SessionsLayoutProps) {
	return (
		<SidebarProvider>
			<AppSidebar variant="inset" />
			<SidebarInset>
				<SiteHeader title={t.sessions.title} />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
							{children}
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

type SessionsStateProps = {
	message: string;
	variant?: "loading" | "error" | "empty";
};

export function SessionsState({ message, variant = "empty" }: SessionsStateProps) {
	if (variant === "loading") {
		return (
			<SessionsLayout>
				<Loading label={message} />
			</SessionsLayout>
		);
	}

	return (
		<SessionsLayout>
			<Box>
				<p
					className={
						variant === "error"
							? "text-destructive"
							: "text-muted-foreground"
					}
				>
					{message}
				</p>
			</Box>
		</SessionsLayout>
	);
}

