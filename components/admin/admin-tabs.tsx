"use client";

import { usePathname, useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

function getActiveAdminTab(pathname: string) {
	if (pathname === "/admin/activity") return "activity";
	if (pathname === "/admin/missions") return "missions";
	if (pathname === "/admin/settings") return "settings";
	return "users";
}

export function AdminTabs() {
	const pathname = usePathname();
	const router = useRouter();

	const handleTabChange = (value: string) => {
		if (value === "activity") {
			router.push("/admin/activity");
			return;
		}

		if (value === "missions") {
			router.push("/admin/missions");
			return;
		}

		if (value === "settings") {
			router.push("/admin/settings");
			return;
		}

		router.push("/admin");
	};

	return (
		<Tabs value={getActiveAdminTab(pathname)} onValueChange={handleTabChange}>
			<TabsList>
				<TabsTrigger value="users">Users</TabsTrigger>
				<TabsTrigger value="activity">Activity Log</TabsTrigger>
				<TabsTrigger value="missions">Missions</TabsTrigger>
				<TabsTrigger value="settings">Settings</TabsTrigger>
			</TabsList>
		</Tabs>
	);
}
