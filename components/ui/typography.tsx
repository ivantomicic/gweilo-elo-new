import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const textVariants = cva("font-body", {
	variants: {
		variant: {
			body: "text-sm leading-6 text-foreground",
			secondary: "text-sm leading-6 text-muted-foreground",
			caption: "text-xs leading-5 text-muted-foreground",
		},
	},
	defaultVariants: {
		variant: "body",
	},
});

export interface TextProps
	extends React.HTMLAttributes<HTMLParagraphElement>,
		VariantProps<typeof textVariants> {}

export function Text({ variant, className, ...props }: TextProps) {
	return <p className={cn(textVariants({ variant }), className)} {...props} />;
}

export function SectionLabel({
	as: Component = "p",
	className,
	...props
}: React.HTMLAttributes<HTMLElement> & {
	as?: "p" | "span" | "h2" | "h3";
}) {
	return (
		<Component
			className={cn(
				"text-xs font-black uppercase tracking-[var(--ds-tracking-label)] text-ds-section-accent",
				className,
			)}
			{...props}
		/>
	);
}

export function DisplayHeading({
	className,
	...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
	return (
		<h2
			className={cn(
				"font-heading text-3xl font-bold tracking-tight text-foreground",
				className,
			)}
			{...props}
		/>
	);
}
