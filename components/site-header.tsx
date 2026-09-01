"use client";

import Link from "next/link";
import { useWebHaptics } from "web-haptics/react";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

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
 * Session actions are intentionally owned by the global mobile navigation
 * accessory, never inferred or injected by the page header.
 */
export function SiteHeader({
	title,
	actionLabel,
	actionHref,
	actionOnClick,
	actionIcon,
	actionVariant,
	actionIconOnly = false,
	actionAriaLabel,
	actionDisabled = false,
	centerTitleOnMobile = false,
}: {
	title: string;
	actionLabel?: string;
	actionHref?: string;
	actionOnClick?: () => void;
	actionIcon?: string;
	actionVariant?:
		| "default"
		| "destructive"
		| "outline"
		| "secondary"
		| "ghost"
		| "link";
	actionIconOnly?: boolean;
	actionAriaLabel?: string;
	actionDisabled?: boolean;
	centerTitleOnMobile?: boolean;
}) {
	const { trigger } = useWebHaptics();

	const handleActionClick = () => {
		void trigger();
		actionOnClick?.();
	};

	const hasCustomAction = Boolean(
		actionLabel && (actionHref || actionOnClick),
	);

	return (
		<header
			data-site-header
			className="site-header-safe flex shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear"
		>
			<div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
				<SidebarTrigger className="-ml-1 hidden md:block" />
				<Separator
					orientation="vertical"
					className="mx-2 hidden md:block data-[orientation=vertical]:h-4"
				/>
				<h1
					className={cn(
						"text-xl font-heading font-semibold md:text-base md:font-medium",
						centerTitleOnMobile &&
							"max-md:absolute max-md:left-1/2 max-md:-translate-x-1/2 max-md:font-body max-md:text-ios-body max-md:font-semibold",
					)}
				>
					{title}
				</h1>
				{hasCustomAction && (
					<div className="ml-auto flex items-center gap-2">
						<Button
							size="sm"
							variant={actionVariant || "default"}
							asChild={!!actionHref}
							aria-label={actionAriaLabel ?? actionLabel}
							disabled={actionDisabled}
							className={cn(
								actionIconOnly && "size-9 rounded-full p-0",
							)}
							onClick={actionHref ? undefined : handleActionClick}
						>
							{actionHref ? (
								<Link href={actionHref} onClick={handleActionClick}>
									{actionIcon && (
										<Icon
											icon={actionIcon}
											className={cn(
												"size-4",
												!actionIconOnly && "mr-1.5",
											)}
										/>
									)}
									{!actionIconOnly && actionLabel}
								</Link>
							) : (
								<>
									{actionIcon && (
										<Icon
											icon={actionIcon}
											className={cn(
												"size-4",
												!actionIconOnly && "mr-1.5",
											)}
										/>
									)}
									{!actionIconOnly && actionLabel}
								</>
							)}
						</Button>
					</div>
				)}
			</div>
		</header>
	);
}
