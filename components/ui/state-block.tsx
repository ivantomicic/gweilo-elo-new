"use client";

import * as React from "react";
import { Loading, type LoadingSize } from "@/components/ui/loading";
import { cn } from "@/lib/utils";

type StateBlockVariant = "loading" | "empty" | "error";
type StateBlockSize = "sm" | "md" | "lg";

const sizeClasses: Record<StateBlockSize, string> = {
	sm: "min-h-24 px-4 py-5",
	md: "min-h-[180px] px-5 py-8",
	lg: "min-h-[320px] px-6 py-12",
};

const loadingSizes: Record<StateBlockSize, LoadingSize> = {
	sm: "sm",
	md: "md",
	lg: "lg",
};

const titleSizeClasses: Record<StateBlockSize, string> = {
	sm: "text-sm",
	md: "text-sm",
	lg: "text-base",
};

const titleToneClasses: Record<StateBlockVariant, string> = {
	loading: "text-muted-foreground",
	empty: "text-muted-foreground",
	error: "text-destructive",
};

export interface StateBlockProps
	extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
	variant?: StateBlockVariant;
	size?: StateBlockSize;
	title?: React.ReactNode;
	description?: React.ReactNode;
	action?: React.ReactNode;
	contentClassName?: string;
}

export function StateBlock({
	variant = "empty",
	size = "md",
	title,
	description,
	action,
	className,
	contentClassName,
	role,
	"aria-live": ariaLive,
	...props
}: StateBlockProps) {
	if (variant === "loading") {
		return (
			<Loading
				label={typeof title === "string" ? title : "Učitavam…"}
				size={loadingSizes[size]}
				description={description}
				role={role ?? "status"}
				aria-live={ariaLive ?? "polite"}
				className={cn(sizeClasses[size], className, contentClassName)}
				{...props}
			/>
		);
	}

	return (
		<div
			role={role ?? (variant === "error" ? "alert" : undefined)}
			aria-live={
				ariaLive ?? (variant === "error" ? "assertive" : undefined)
			}
			className={cn(
				"flex w-full flex-col items-center justify-center text-center",
				sizeClasses[size],
				className,
			)}
			{...props}
		>
			<div
				className={cn(
					"mx-auto flex max-w-sm flex-col items-center",
					contentClassName,
				)}
			>
				{title !== undefined && title !== null ? (
					<p
						className={cn(
							"font-medium leading-relaxed",
							titleSizeClasses[size],
							titleToneClasses[variant],
						)}
					>
						{title}
					</p>
				) : null}
				{description !== undefined && description !== null ? (
					<p className="mt-2 text-sm leading-relaxed text-muted-foreground/80">
						{description}
					</p>
				) : null}
				{action !== undefined && action !== null ? (
					<div className="mt-4">{action}</div>
				) : null}
			</div>
		</div>
	);
}
