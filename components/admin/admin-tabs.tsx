"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckIcon, ChevronUpIcon } from "lucide-react";
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
	const ActiveIcon = activeItem.icon;

	return (
		<Drawer shouldScaleBackground={false}>
			<DrawerTrigger asChild>
				<button
					type="button"
					className="group flex min-h-16 w-full touch-manipulation items-center gap-3 rounded-2xl border border-border/50 bg-card/70 px-3.5 py-3 text-left shadow-sm backdrop-blur-xl transition-[transform,border-color,background-color] duration-150 ease-out active:scale-[0.985] active:border-primary/30 active:bg-card"
					aria-label={`Admin navigation, current section: ${activeItem.title}`}
				>
					<span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
						<ActiveIcon className="size-5" aria-hidden="true" />
					</span>

					<span className="min-w-0 flex-1">
						<span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
							Admin section
						</span>
						<span className="mt-0.5 block truncate text-sm font-semibold text-foreground">
							{activeItem.title}
						</span>
					</span>

					<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary/70 text-muted-foreground transition-colors duration-150 group-active:text-foreground">
						<ChevronUpIcon className="size-4" aria-hidden="true" />
					</span>
				</button>
			</DrawerTrigger>

			<DrawerContent className="z-[70] max-h-[85dvh] rounded-t-[28px] border-border/60 bg-background/95 shadow-[0_-20px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
				<DrawerHeader className="px-5 pb-3 pt-5 text-left">
					<DrawerTitle>Admin panel</DrawerTitle>
					<DrawerDescription>
						Choose the section you want to manage.
					</DrawerDescription>
				</DrawerHeader>

				<nav
					aria-label="Admin sections"
					className="grid grid-cols-2 gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
				>
					{adminNavigationItems.map((item, index) => {
						const isActive = item.value === activeValue;
						const isFinalItem = index === adminNavigationItems.length - 1;
						const ItemIcon = item.icon;

						return (
							<DrawerClose asChild key={item.value}>
								<Link
									href={item.url}
									aria-current={isActive ? "page" : undefined}
									className={cn(
										"relative flex min-h-[68px] touch-manipulation items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-[transform,border-color,background-color,color] duration-150 ease-out active:scale-[0.975]",
										isActive
											? "border-primary/35 bg-primary/10 text-foreground"
											: "border-border/45 bg-card/60 text-muted-foreground hover:border-border hover:bg-card hover:text-foreground",
										isFinalItem && "col-span-2 mt-1",
									)}
								>
									<span
										className={cn(
											"flex size-9 shrink-0 items-center justify-center rounded-xl",
											isActive
												? "bg-primary/15 text-primary"
												: "bg-secondary/70 text-muted-foreground",
										)}
									>
										<ItemIcon className="size-[18px]" aria-hidden="true" />
									</span>

									<span className="min-w-0 text-sm font-semibold leading-tight">
										{item.title}
									</span>

									{isActive && (
										<CheckIcon
											className="absolute right-2.5 top-2.5 size-3.5 text-primary"
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
	);
}
