"use client";

import { usePathname, useRouter } from "next/navigation";
import { AdminGuard } from "@/components/auth/admin-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Box } from "@/components/ui/box";
import { UserManagementTable } from "@/components/admin/user-management-table";

function AdminPageContent() {
	const pathname = usePathname();
	const router = useRouter();

	// Determine active tab based on current route
	const activeTab = pathname === "/admin/activity" ? "activity" : "users";

	const handleTabChange = (value: string) => {
		if (value === "activity") {
			router.push("/admin/activity");
		} else {
			router.push("/admin");
		}
	};

	return (
		<SidebarProvider>
			<AppSidebar variant="inset" />
			<SidebarInset>
				<SiteHeader title="Admin panel" />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
							{/* Admin Navigation Tabs */}
							<Box className="mb-4">
								<Tabs value={activeTab} onValueChange={handleTabChange}>
									<TabsList>
										<TabsTrigger value="users">Users</TabsTrigger>
										<TabsTrigger value="activity">Activity Log</TabsTrigger>
									</TabsList>
								</Tabs>
							</Box>

							<div className="space-y-4">
								<UserManagementTable />
							</div>
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

export default function AdminPage() {
	return (
		<AdminGuard>
			<AdminPageContent />
		</AdminGuard>
	);
}
