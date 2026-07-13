"use client";

import { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { StateBlock } from "@/components/ui/state-block";
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
	return <StateBlock variant={variant} size="lg" title={message} />;
}
