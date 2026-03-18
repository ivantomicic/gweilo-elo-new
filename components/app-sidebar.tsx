"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
	ArrowUpCircleIcon,
	BarChartIcon,
	CalendarIcon,
	CameraIcon,
	ClipboardListIcon,
	DatabaseIcon,
	FileCodeIcon,
	FileIcon,
	FileTextIcon,
	FolderIcon,
	HelpCircleIcon,
	LayoutDashboardIcon,
	ListIcon,
	PlayIcon,
	CalculatorIcon,
	SearchIcon,
	SettingsIcon,
	ShieldIcon,
	UsersIcon,
	XCircleIcon,
} from "lucide-react";

import { NavDocuments } from "@/components/nav-documents";
import { adminNavigationItems } from "@/components/admin/admin-navigation";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/vendor/shadcn/sidebar";

const data = {
	navMain: [
		{
			title: "Pregled",
			url: "/",
			icon: LayoutDashboardIcon,
		},
		{
			title: "Statistika",
			url: "/statistics",
			icon: BarChartIcon,
		},
		{
			title: "Termini",
			url: "/sessions",
			icon: CalendarIcon,
		},
		{
			title: "Video",
			url: "/videos",
			icon: PlayIcon,
		},
		{
			title: "Kalkulator",
			url: "/calculator",
			icon: CalculatorIcon,
		},
		{
			title: "Pravila igre",
			url: "/rules",
			icon: HelpCircleIcon,
		},
		{
			title: "Anketarijum",
			url: "/polls",
			icon: FileTextIcon,
		},
		{
			title: "Ispale",
			url: "/no-shows",
			icon: XCircleIcon,
		},
	],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const pathname = usePathname();
	const [user, setUser] = useState<{
		name: string;
		email: string;
		avatar: string | null;
		role: "admin" | "user";
	} | null>(null);

	useEffect(() => {
		const fetchUser = async () => {
			const currentUser = await getCurrentUser();
			if (currentUser) {
				setUser({
					name: currentUser.name,
					email: currentUser.email,
					avatar: currentUser.avatar,
					role: currentUser.role as "admin" | "user",
				});
			} else {
				// Fallback if no user found
				setUser({
					name: "User",
					email: "",
					avatar: null,
					role: "user",
				});
			}
		};
		fetchUser();
	}, []);

	return (
		<Sidebar collapsible="offcanvas" {...props}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							asChild
							className="data-[slot=sidebar-menu-button]:!p-1.5"
						>
							<Link href="/">
								<Image
									src="/favicon.png"
									alt=""
									width={20}
									height={20}
									className="h-5 w-5"
								/>
								<span className="text-base font-semibold">
									Gweilo NS
								</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<NavMain items={data.navMain} currentPathname={pathname} />
				{/* <NavDocuments items={data.documents} /> */}
				{user?.role === "admin" && (
					<SidebarGroup className="mt-auto">
						<SidebarGroupLabel>Admin panel</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{adminNavigationItems.map((item) => {
									const isActive = pathname === item.url;
									return (
										<SidebarMenuItem key={item.value}>
											<SidebarMenuButton
												asChild
												isActive={isActive}
												tooltip={item.title}
											>
												<Link href={item.url}>
													<item.icon />
													<span>{item.title}</span>
												</Link>
											</SidebarMenuButton>
										</SidebarMenuItem>
									);
								})}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				)}
			</SidebarContent>
			<SidebarFooter>{user && <NavUser user={user} />}</SidebarFooter>
		</Sidebar>
	);
}
