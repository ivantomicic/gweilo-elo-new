import {
	ClipboardListIcon,
	BellRingIcon,
	ChartNoAxesCombinedIcon,
	LanguagesIcon,
	ListIcon,
	PaletteIcon,
	SettingsIcon,
	UsersIcon,
	type LucideIcon,
} from "lucide-react";

export type AdminNavigationItem = {
	value:
		| "users"
		| "activity"
		| "formAudit"
		| "missions"
		| "nameCases"
		| "notifications"
		| "settings"
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
		value: "formAudit",
		title: "Form Audit",
		url: "/admin/form-audit",
		icon: ChartNoAxesCombinedIcon,
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
		mobileFullWidth: true,
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
	return (
		adminNavigationItems.find((item) =>
			item.url === "/admin"
				? pathname === item.url
				: pathname === item.url || pathname.startsWith(`${item.url}/`),
		)?.value ??
		"users"
	);
}
