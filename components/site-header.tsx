"use client";

import Link from "next/link";
import { Separator } from "@/components/vendor/shadcn/separator";
import { SidebarTrigger } from "@/components/vendor/shadcn/sidebar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { t } from "@/lib/i18n";

/**
 * SiteHeader component
 *
 * Option A: Accepts title prop from each page for explicit control.
 * This approach is preferred because:
 * - Explicit and clear: each page controls its own title
 * - No route-based magic: easier to understand and maintain
 * - Type-safe: title is required, preventing missing titles
 *
 * Optionally accepts actionLabel, actionHref, actionOnClick, and actionIcon props
 * to display a standardized action button on the far right.
 * A default "Start Session" button is shown if no action props are provided.
 */
export function SiteHeader({
	title,
	actionLabel,
	actionHref,
	actionOnClick,
	actionIcon,
}: {
	title: string;
	actionLabel?: string;
	actionHref?: string;
	actionOnClick?: () => void;
	actionIcon?: string;
}) {
	// Determine which action to show
	const hasCustomAction = actionLabel && (actionHref || actionOnClick);
	const showDefaultAction = !hasCustomAction;

	return (
		<header className="group-has-data-[collapsible=icon]/sidebar-wrapper:h-16 flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
			<div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
				<SidebarTrigger className="-ml-1 hidden md:block" />
				<Separator
					orientation="vertical"
					className="mx-2 hidden md:block data-[orientation=vertical]:h-4"
				/>
				<h1 className="text-xl font-heading font-semibold md:text-base md:font-medium">
					{title}
				</h1>
				<div className="ml-auto flex items-center gap-2">
					{showDefaultAction ? (
						<Button asChild size="sm">
							<Link href="/start-session">
								<Icon
									icon="solar:add-circle-bold"
									className="size-4 mr-1.5"
								/>
								{t.startSession.title}
							</Link>
						</Button>
					) : (
						<Button
							size="sm"
							asChild={!!actionHref}
							onClick={actionOnClick}
						>
							{actionHref ? (
								<Link href={actionHref}>
									{actionIcon && (
										<Icon
											icon={actionIcon}
											className="size-4 mr-1.5"
										/>
									)}
									{actionLabel}
								</Link>
							) : (
								<>
									{actionIcon && (
										<Icon
											icon={actionIcon}
											className="size-4 mr-1.5"
										/>
									)}
									{actionLabel}
								</>
							)}
						</Button>
					)}
				</div>
			</div>
		</header>
	);
}
