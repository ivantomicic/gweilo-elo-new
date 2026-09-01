"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

type HeaderAction = {
	label: string;
	onClick: () => void;
	icon?: string;
	iconClassName?: string;
	disabled?: boolean;
};

type SessionCreationShellProps = {
	title: string;
	leadingAction: HeaderAction;
	trailingAction?: HeaderAction;
	children: ReactNode;
	footerLabel: ReactNode;
	onFooterAction: () => void;
	footerDisabled?: boolean;
	footerLoading?: boolean;
	footerLoadingLabel?: ReactNode;
	contentClassName?: string;
};

/**
 * Full-screen counterpart to the native StartSessionView sheet.
 *
 * The shell owns the navigation title, scrolling region, and persistent primary
 * action so each route in the web flow keeps the same geometry as the SwiftUI
 * setup/review steps.
 */
export function SessionCreationShell({
	title,
	leadingAction,
	trailingAction,
	children,
	footerLabel,
	onFooterAction,
	footerDisabled = false,
	footerLoading = false,
	footerLoadingLabel,
	contentClassName,
}: SessionCreationShellProps) {
	return (
		<div className="fixed inset-0 z-[70] flex min-h-dvh flex-col overflow-hidden bg-[rgb(var(--ds-native-background))] text-[rgb(var(--ds-native-bone))]">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgb(var(--ds-native-purple)/0.16),rgb(var(--ds-native-purple)/0.035)_34%,transparent_62%)]"
			/>

			<header className="relative z-10 shrink-0 pt-[env(safe-area-inset-top)]">
				<div className="relative mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-3 sm:px-5">
					<button
						type="button"
						onClick={leadingAction.onClick}
						disabled={leadingAction.disabled}
						className="inline-flex min-h-11 min-w-11 items-center gap-1 rounded-full px-2 text-ios-subheadline font-semibold text-ds-button-accent-bright transition-[transform,opacity,color] duration-press ease-ds-out active:scale-[0.965] active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-button-accent-bright disabled:pointer-events-none disabled:opacity-45 motion-reduce:transition-[opacity,color] motion-reduce:active:scale-100"
					>
						{leadingAction.icon && (
							<Icon icon={leadingAction.icon} className="size-4" />
						)}
						<span>{leadingAction.label}</span>
					</button>

					<h1 className="pointer-events-none absolute left-1/2 max-w-[52%] -translate-x-1/2 truncate font-body text-ios-body font-semibold text-[rgb(var(--ds-native-bone))]">
						{title}
					</h1>

					{trailingAction ? (
						<button
							type="button"
							onClick={trailingAction.onClick}
							disabled={trailingAction.disabled}
							aria-label={trailingAction.label}
							className="inline-flex size-11 items-center justify-center rounded-full text-ds-button-accent-bright transition-[transform,opacity,color] duration-press ease-ds-out active:scale-[0.965] active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-button-accent-bright disabled:pointer-events-none disabled:opacity-45 motion-reduce:transition-[opacity,color] motion-reduce:active:scale-100"
						>
							{trailingAction.icon ? (
								<Icon
									icon={trailingAction.icon}
									className={cn("size-5", trailingAction.iconClassName)}
								/>
							) : (
								<span className="text-ios-subheadline font-semibold">
									{trailingAction.label}
								</span>
							)}
						</button>
					) : (
						<div aria-hidden="true" className="size-11" />
					)}
				</div>
			</header>

			<main
				className={cn(
					"relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
					contentClassName,
				)}
			>
				<div className="mx-auto w-full max-w-2xl px-5 pb-8 pt-3 sm:px-6">
					{children}
				</div>
			</main>

			<footer className="relative z-20 shrink-0 bg-[linear-gradient(to_top,rgb(var(--ds-native-background))_76%,rgb(var(--ds-native-background)/0.94)_88%,transparent)] px-5 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2 sm:px-6">
				<div className="mx-auto w-full max-w-2xl">
					<Button
						variant="prominent"
						size="cta"
						disabled={footerDisabled}
						isLoading={footerLoading}
						loadingLabel={footerLoadingLabel}
						onClick={onFooterAction}
						className="h-[50px] rounded-full text-ios-body font-black disabled:border-ds-button-primary disabled:bg-ds-button-primary disabled:text-ds-button-primary-foreground disabled:opacity-[0.72]"
					>
						{footerLabel}
					</Button>
				</div>
			</footer>
		</div>
	);
}

export function SessionCreationSectionHeading({
	children,
	detail,
	className,
}: {
	children: ReactNode;
	detail?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex items-baseline justify-between gap-4",
				className,
			)}
		>
			<h2 className="font-body text-ios-caption font-black uppercase tracking-[0.14em] text-ds-button-accent-bright">
				{children}
			</h2>
			{detail && (
				<p className="text-right text-ios-caption font-semibold tabular-nums text-[rgb(var(--ds-native-muted))]">
					{detail}
				</p>
			)}
		</div>
	);
}
