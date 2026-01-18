"use client";

import { NoShowAlertWidget } from "@/components/dashboard/no-show-alert-widget";
import { NoShowDistributionWidget } from "@/components/dashboard/no-show-distribution-widget";
import { Card, CardContent } from "@/components/ui/card";

export function SummaryCards() {
	return (
		<div className="grid gap-4 md:grid-cols-3">
			{/* Card 1: Worst Offender - Using NoShowAlertWidget */}
			<NoShowAlertWidget />

			{/* Card 2: Distribution Pie Chart - Using NoShowDistributionWidget */}
			<NoShowDistributionWidget />

			{/* Card 3: Placeholder - Blank for now */}
			<Card>
				<CardContent className="pt-6">
					{/* Empty placeholder */}
				</CardContent>
			</Card>
		</div>
	);
}
