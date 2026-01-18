"use client";

import { MailIcon, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/vendor/shadcn/button";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/vendor/shadcn/sidebar";

export function NavMain({
	items,
	currentPathname,
}: {
	items: {
		title: string;
		url: string;
		icon?: LucideIcon;
	}[];
	currentPathname: string;
}) {
	return (
		<SidebarGroup>
			<SidebarGroupContent className="flex flex-col gap-2">
				<SidebarMenu>
					{items.map((item) => {
						const isActive = currentPathname === item.url;
						return (
							<SidebarMenuItem key={item.title}>
								<SidebarMenuButton asChild tooltip={item.title} isActive={isActive}>
									<Link href={item.url}>
										{item.icon && <item.icon />}
										<span>{item.title}</span>
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>
						);
					})}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
