"use client";

import { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { Box } from "@/components/ui/box";
import { Loading } from "@/components/ui/loading";
import { t } from "@/lib/i18n";

type SessionsLayoutProps = {
	children: ReactNode;
};

export function SessionsLayout({ children }: SessionsLayoutProps) {
	return (
		<AppShell title={t.sessions.title}>{children}</AppShell>
	);
}

type SessionsStateProps = {
	message: string;
	variant?: "loading" | "error" | "empty";
};

export function SessionsState({ message, variant = "empty" }: SessionsStateProps) {
	// Don't wrap in SessionsLayout - parent component already wraps
	if (variant === "loading") {
		return <Loading label={message} />;
	}

	return (
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
	);
}
