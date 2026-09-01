"use client";

import * as React from "react";
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
import { useAuth } from "@/lib/auth/useAuth";
import { isNavigationItemVisible } from "@/lib/navigation/visibility";
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
	SidebarTrigger,
} from "@/components/ui/sidebar";

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

const visibleMainItems = data.navMain.filter(isNavigationItemVisible);

export function AppSidebar({ showToggle = false, ...props }: React.ComponentProps<typeof Sidebar> & { showToggle?: boolean }) {
	const pathname = usePathname();
	const { user, role } = useAuth();

	return (
		<Sidebar collapsible="offcanvas" {...props}>
			<SidebarHeader className={showToggle ? "flex-row items-center" : undefined}>
				<SidebarMenu className={showToggle ? "min-w-0 flex-1" : undefined}>
					<SidebarMenuItem>
						<SidebarMenuButton
							asChild
							className="data-[slot=sidebar-menu-button]:!p-1.5"
						>
							<Link href="/">
								<Image
									src="/logo-small.png"
									alt=""
									width={24}
									height={24}
									className="h-6 w-6 shrink-0"
								/>
								<span className="text-base font-semibold">
									Gweilo
								</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
				{showToggle && <SidebarTrigger aria-label="Zatvori navigaciju" className="hidden shrink-0 md:inline-flex" />}
			</SidebarHeader>
			<SidebarContent>
				<NavMain items={visibleMainItems} currentPathname={pathname} />
				{/* <NavDocuments items={data.documents} /> */}
				{role === "admin" && (
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
