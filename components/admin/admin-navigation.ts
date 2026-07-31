import {
	ClipboardListIcon,
	BellRingIcon,
	ListIcon,
	SettingsIcon,
	UsersIcon,
	type LucideIcon,
} from "lucide-react";

export type AdminNavigationItem = {
	value:
		| "users"
		| "activity"
		| "missions"
		| "notifications"
		| "settings";
	title: string;
	url: string;
	icon: LucideIcon;
};

export const adminNavigationItems: AdminNavigationItem[] = [
	{
		value: "users",
		title: "Users",
		url: "/admin",
		icon: UsersIcon,
	},
	{
		value: "activity",
		title: "Activity Log",
		url: "/admin/activity",
		icon: ListIcon,
	},
	{
		value: "missions",
		title: "Missions",
		url: "/admin/missions",
		icon: ClipboardListIcon,
	},
	{
		value: "notifications",
		title: "Notifications",
		url: "/admin/notifications",
		icon: BellRingIcon,
	},
	{
		value: "settings",
		title: "Settings",
		url: "/admin/settings",
		icon: SettingsIcon,
	},
];

export function getActiveAdminNavigationValue(
	pathname: string,
): AdminNavigationItem["value"] {
	return (
		adminNavigationItems.find((item) => item.url === pathname)?.value ??
		"users"
	);
}
