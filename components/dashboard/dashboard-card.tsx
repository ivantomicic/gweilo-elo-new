"use client";

import * as React from "react";
import {
	SurfaceCard,
	type SurfaceCardProps,
} from "@/components/ui/surface-card";
import { cn } from "@/lib/utils";

export const DASHBOARD_CARD_HEIGHT_CLASS = "min-h-[clamp(17rem,32vw,20rem)]";

export interface DashboardCardProps
	extends Omit<SurfaceCardProps, "variant" | "clipped"> {
	fixedHeight?: boolean;
	fill?: boolean;
}

const DashboardCard = React.forwardRef<HTMLDivElement, DashboardCardProps>(
	(
		{
			className,
			fixedHeight = true,
			fill = true,
			...props
		},
		ref,
	) => (
		<SurfaceCard
			ref={ref}
			variant="elevated"
			clipped
			className={cn(
				"flex flex-col",
				fill && "h-full",
				fixedHeight && DASHBOARD_CARD_HEIGHT_CLASS,
				className,
			)}
			{...props}
		/>
	),
);
DashboardCard.displayName = "DashboardCard";

export { DashboardCard };
