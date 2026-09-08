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
	description: string;
	url: string;
	icon: LucideIcon;
};

export const adminNavigationItems: AdminNavigationItem[] = [
	{
		value: "users",
		title: "Users",
		description: "Manage members and access",
		url: "/admin/users",
		icon: UsersIcon,
	},
	{
		value: "activity",
		title: "Activity Log",
		description: "Review recent admin changes",
		url: "/admin/activity-log",
		icon: ListIcon,
	},
	{
		value: "missions",
		title: "Missions",
		description: "Control rivalry missions",
		url: "/admin/missions",
		icon: ClipboardListIcon,
	},
	{
		value: "nameCases",
		title: "Padeži imena",
		description: "Set grammatical name cases",
		url: "/admin/name-cases",
		icon: LanguagesIcon,
	},
	{
		value: "designSystem",
		title: "Design System",
		description: "Browse components and tokens",
		url: "/admin/design-system",
		icon: PaletteIcon,
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
