import { redirect } from "next/navigation";

export default function LegacyActivityPage() {
	redirect("/admin/activity-log");
}
