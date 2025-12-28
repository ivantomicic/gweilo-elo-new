import { t } from "@/lib/i18n";

export default function DashboardPage() {
	return (
		<div className="flex min-h-screen items-center justify-center bg-background">
			<h1 className="text-4xl font-bold font-heading">
				{t.common.dashboard}
			</h1>
		</div>
	);
}
