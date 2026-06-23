"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type SurfaceCardVariant = "default" | "elevated" | "interactive" | "modal";
type SurfaceCardPadding = "none" | "sm" | "md" | "lg";

const variantClasses: Record<SurfaceCardVariant, string> = {
	default: "bg-card rounded-[24px] border border-border/50",
	elevated: "bg-card rounded-[24px] border border-border/50 shadow-sm",
	interactive:
		"group relative bg-card rounded-[24px] border border-border/50 shadow-sm touch-safe hover-only active:scale-[0.98] transition-all cursor-pointer",
	modal:
		"bg-card rounded-[24px] border border-border/50 max-w-sm w-full mx-4 shadow-2xl",
};

const paddingClasses: Record<SurfaceCardPadding, string> = {
	none: "",
	sm: "p-4",
	md: "p-5",
	lg: "p-6",
};

export interface SurfaceCardProps
	extends React.HTMLAttributes<HTMLDivElement> {
	component?: keyof JSX.IntrinsicElements;
	variant?: SurfaceCardVariant;
	padding?: SurfaceCardPadding;
	clipped?: boolean;
}

const SurfaceCard = React.forwardRef<HTMLDivElement, SurfaceCardProps>(
	(
		{
			className,
			component = "div",
			variant = "default",
			padding = "lg",
			clipped = false,
			...props
		},
		ref,
	) => {
		const Component = component as any;

		return (
			<Component
				ref={ref}
				className={cn(
					variantClasses[variant],
					paddingClasses[padding],
					clipped && "relative overflow-hidden",
					className,
				)}
				{...props}
			/>
		);
	},
);
SurfaceCard.displayName = "SurfaceCard";

export { SurfaceCard };
