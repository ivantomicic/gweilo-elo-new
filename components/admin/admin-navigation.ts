import {
	ClipboardListIcon,
	LanguagesIcon,
	ListIcon,
	PaletteIcon,
	UsersIcon,
	type LucideIcon,
} from "lucide-react";

export type AdminNavigationItem = {
	value:
		| "users"
		| "activity"
		| "missions"
		| "nameCases"
		| "designSystem";
	title: string;
	url: string;
	icon: LucideIcon;
	mobileFullWidth?: boolean;
};

export const adminNavigationItems: AdminNavigationItem[] = [
	{
		value: "users",
		title: "Users",
		url: "/admin/users",
		icon: UsersIcon,
	},
	{
		value: "activity",
		title: "Activity Log",
		url: "/admin/activity-log",
		icon: ListIcon,
	},
	{
		value: "missions",
		title: "Missions",
		url: "/admin/missions",
		icon: ClipboardListIcon,
	},
	{
		value: "nameCases",
		title: "Padeži imena",
		url: "/admin/name-cases",
		icon: LanguagesIcon,
	},
	{
		value: "designSystem",
		title: "Design System",
		url: "/admin/design-system",
		icon: PaletteIcon,
		mobileFullWidth: true,
	},
];

export function getActiveAdminNavigationValue(
	pathname: string,
): AdminNavigationItem["value"] {
	// Retain selection for old bookmarks while their server redirect resolves.
	if (pathname === "/admin/activity") return "activity";
	return (
		adminNavigationItems.find((item) =>
			pathname === item.url || pathname.startsWith(`${item.url}/`),
		)?.value ??
		"users"
	);
}
