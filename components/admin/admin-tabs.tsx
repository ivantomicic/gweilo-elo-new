"use client";

import { usePathname, useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	adminNavigationItems,
	getActiveAdminNavigationValue,
} from "@/components/admin/admin-navigation";

export function AdminTabs() {
	const pathname = usePathname();
	const router = useRouter();

	const handleTabChange = (value: string) => {
		const nextItem = adminNavigationItems.find((item) => item.value === value);
		if (nextItem) {
			router.push(nextItem.url);
		}
	};

	return (
		<Tabs
			value={getActiveAdminNavigationValue(pathname)}
			onValueChange={handleTabChange}
		>
			<TabsList>
				{adminNavigationItems.map((item) => (
					<TabsTrigger key={item.value} value={item.value}>
						{item.title}
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	);
}
