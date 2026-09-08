"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckIcon, ChevronRightIcon, MenuIcon } from "lucide-react";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer";
import {
	adminNavigationItems,
	getActiveAdminNavigationValue,
} from "@/components/admin/admin-navigation";
import { cn } from "@/lib/utils";

export function AdminTabs() {
	const pathname = usePathname();
	const activeValue = getActiveAdminNavigationValue(pathname);
	const activeItem =
		adminNavigationItems.find((item) => item.value === activeValue) ??
		adminNavigationItems[0];

	return (
		<div className="flex min-h-[72px] items-end justify-between gap-4">
			<div className="min-w-0">
				<p className="mb-1 text-ios-caption font-semibold uppercase tracking-[0.16em] text-ds-button-muted">
					Admin panel
				</p>
				<h1 className="truncate text-ios-display-34 font-semibold leading-none tracking-[-0.035em] text-ds-button-foreground">
					{activeItem.title}
				</h1>
			</div>

			<Drawer shouldScaleBackground={false}>
				<DrawerTrigger asChild>
					<button
						type="button"
						className="flex min-h-11 shrink-0 touch-manipulation items-center gap-2 rounded-full border border-white/10 bg-ds-surface-raised/80 px-4 text-ios-subheadline font-semibold text-ds-button-accent-bright shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_8px_24px_rgb(0_0_0/0.2)] backdrop-blur-xl transition-[transform,background-color] duration-press ease-ds-out active:scale-[0.97] active:bg-ds-surface-selected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-button-accent-bright"
						aria-label={`Open admin menu. Current section: ${activeItem.title}`}
					>
						<MenuIcon className="size-[18px]" strokeWidth={2.25} aria-hidden="true" />
						<span>Menu</span>
					</button>
				</DrawerTrigger>

				<DrawerContent className="z-[70] max-h-[88dvh] rounded-t-[32px] border-white/10 bg-background/95 shadow-[0_-24px_64px_rgb(0_0_0/0.5)] backdrop-blur-2xl [&>div:first-child]:mt-2.5 [&>div:first-child]:h-1 [&>div:first-child]:w-9 [&>div:first-child]:bg-white/20">
					<DrawerHeader className="flex flex-row items-start justify-between gap-4 px-5 pb-4 pt-5 text-left">
						<div className="min-w-0">
							<DrawerTitle className="text-ios-display-25 font-semibold tracking-[-0.025em]">
								Admin panel
							</DrawerTitle>
							<DrawerDescription className="mt-1 text-ios-subheadline">
								Choose a section to manage.
							</DrawerDescription>
						</div>
						<DrawerClose asChild>
							<button
								type="button"
								className="min-h-11 touch-manipulation rounded-full px-2 text-ios-body font-semibold text-ds-button-accent-bright transition-[transform,opacity] duration-press ease-ds-out active:scale-[0.96] active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-button-accent-bright"
							>
								Done
							</button>
						</DrawerClose>
					</DrawerHeader>

					<nav
						aria-label="Admin sections"
						className="mx-4 mb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] overflow-hidden rounded-[22px] border border-white/[0.08] bg-ds-surface-raised/90 shadow-[inset_0_1px_0_rgb(255_255_255/0.045),0_14px_34px_rgb(0_0_0/0.2)]"
					>
						{adminNavigationItems.map((item, index) => {
							const isActive = item.value === activeValue;
							const isLast = index === adminNavigationItems.length - 1;
							const ItemIcon = item.icon;

							return (
								<DrawerClose asChild key={item.value}>
									<Link
										href={item.url}
										aria-current={isActive ? "page" : undefined}
										className={cn(
											"relative flex min-h-16 touch-manipulation items-center gap-3 px-3.5 py-2.5 text-left transition-[transform,background-color] duration-press ease-ds-out active:scale-[0.985] active:bg-white/[0.07] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-button-accent-bright",
											isActive && "bg-ds-button-accent/10",
											!isLast &&
												"after:absolute after:bottom-0 after:left-[62px] after:right-0 after:h-px after:bg-white/[0.08]",
										)}
									>
										<span
											className={cn(
												"flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-ds-button-accent text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_3px_8px_rgb(0_0_0/0.2)]",
												isActive && "bg-ds-button-accent-bright text-ds-content-on-selected",
											)}
										>
											<ItemIcon className="size-[19px]" strokeWidth={2.1} aria-hidden="true" />
										</span>

										<span className="min-w-0 flex-1">
											<span className="block truncate text-ios-body font-semibold leading-tight text-ds-button-foreground">
												{item.title}
											</span>
											<span className="mt-0.5 block truncate text-ios-caption text-ds-button-muted">
												{item.description}
											</span>
										</span>

										{isActive ? (
											<CheckIcon
												className="mr-1 size-5 shrink-0 text-ds-button-accent-bright"
												strokeWidth={2.5}
												aria-hidden="true"
											/>
										) : (
											<ChevronRightIcon
												className="mr-0.5 size-[18px] shrink-0 text-ds-button-muted/65"
												aria-hidden="true"
											/>
										)}
									</Link>
								</DrawerClose>
							);
						})}
					</nav>
				</DrawerContent>
			</Drawer>
		</div>
	);
}
