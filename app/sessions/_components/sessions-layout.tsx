"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { ScrollFadeHero } from "@/components/ui/scroll-fade-hero";
import { PageContainer } from "@/components/ui/page-container";
import { StateBlock } from "@/components/ui/state-block";
import { t } from "@/lib/i18n";

type SessionsLayoutProps = {
	children: ReactNode;
};

export function SessionsLayout({ children }: SessionsLayoutProps) {
	return (
		<AppShell
			title={t.sessions.title}
			showHeader={false}
			insetClassName="sessions-native-shell"
			bodyClassName="bg-[rgb(3_3_4)]"
			containerClassName="bg-[rgb(3_3_4)]"
			contentClassName="!gap-0 !py-0"
			contentPadding={false}
		>
			<PageContainer className="sessions-native-content pb-10">
				<ScrollFadeHero title="Termini" eyebrow="Istorija mečeva" videoSrc="/sessions-header.mp4" />
				<div className="relative z-10 pt-[26px]">{children}</div>
			</PageContainer>
		</AppShell>
	);
}

type SessionsStateProps = {
	message: string;
	variant?: "loading" | "error" | "empty";
};

export function SessionsState({ message, variant = "empty" }: SessionsStateProps) {
	return <StateBlock variant={variant} size="lg" title={message} />;
}
