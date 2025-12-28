"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import Image from "next/image";
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
	SearchIcon,
	SettingsIcon,
	UsersIcon,
	XCircleIcon,
} from "lucide-react";

import { NavDocuments } from "@/components/nav-documents";
import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/vendor/shadcn/sidebar";

const data = {
	navMain: [
		{
			title: "Pregled",
			url: "#",
			icon: LayoutDashboardIcon,
		},
		{
			title: "Statistika",
			url: "#",
			icon: BarChartIcon,
		},
		{
			title: "Termini",
			url: "#",
			icon: CalendarIcon,
		},
		{
			title: "Video",
			url: "#",
			icon: PlayIcon,
		},
		{
			title: "Ispale",
			url: "#",
			icon: XCircleIcon,
		},
	],
	navSecondary: [
		{
			title: "Podešavanja",
			url: "/settings",
			icon: SettingsIcon,
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
	],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const [user, setUser] = useState<{
		name: string;
		email: string;
		avatar: string | null;
	} | null>(null);

	useEffect(() => {
		const fetchUser = async () => {
			const currentUser = await getCurrentUser();
			if (currentUser) {
				setUser(currentUser);
			} else {
				// Fallback if no user found
				setUser({
					name: "User",
					email: "",
					avatar: null,
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
							<a href="#">
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
							</a>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<NavMain items={data.navMain} />
				{/* <NavDocuments items={data.documents} /> */}
				<NavSecondary items={data.navSecondary} className="mt-auto" />
			</SidebarContent>
			<SidebarFooter>{user && <NavUser user={user} />}</SidebarFooter>
		</Sidebar>
	);
}
