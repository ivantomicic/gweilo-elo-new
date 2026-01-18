"use client";

import { NoShowAlertWidget } from "@/components/dashboard/no-show-alert-widget";
import { NoShowDistributionWidget } from "@/components/dashboard/no-show-distribution-widget";
import { TableTennisGifWidget } from "@/components/dashboard/table-tennis-gif-widget";

export function SummaryCards() {
	return (
		<div className="grid gap-4 md:grid-cols-3">
			{/* Card 1: Worst Offender - Using NoShowAlertWidget */}
			<NoShowAlertWidget />

		{/* Card 2: Distribution Pie Chart - Using NoShowDistributionWidget */}
		<NoShowDistributionWidget />

		{/* Card 3: Table Tennis GIF Widget */}
		<TableTennisGifWidget />
		</div>
	);
}
