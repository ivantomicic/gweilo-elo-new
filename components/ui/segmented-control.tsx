"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SegmentedValue = string | number;

export type SegmentedControlOption<T extends SegmentedValue> = {
	value: T;
	label: ReactNode;
	ariaLabel?: string;
};

type SegmentedControlProps<T extends SegmentedValue> = {
	value: T | null;
	options: readonly SegmentedControlOption<T>[];
	onValueChange: (value: T) => void;
	ariaLabel: string;
	selection?: "highlight" | "subtle";
	size?: "default" | "number";
	elevated?: boolean;
	className?: string;
};

export function SegmentedControl<T extends SegmentedValue>({
	value,
	options,
	onValueChange,
	ariaLabel,
	selection = "subtle",
	size = "default",
	elevated = false,
	className,
}: SegmentedControlProps<T>) {
	return (
		<div
			role="radiogroup"
			aria-label={ariaLabel}
			className={cn(
				"grid gap-1 rounded-control border border-white/[0.13] bg-ds-surface-raised p-1",
				elevated && "shadow-ds-control",
				className,
			)}
			style={{
				gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
			}}
		>
			{options.map((option) => {
				const isSelected = value === option.value;

				return (
					<button
						key={option.value}
						type="button"
						role="radio"
						aria-checked={isSelected}
						aria-label={option.ariaLabel}
						onClick={() => onValueChange(option.value)}
						className={cn(
							"touch-safe rounded-control font-bold outline-none transition-[transform,background-color,color,box-shadow] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
							size === "number"
								? "h-12 font-heading text-lg tabular-nums"
								: "min-h-12 px-3 text-sm",
							selection === "highlight"
								? "focus-visible:ring-ds-control-selected active:scale-[0.96]"
								: "focus-visible:ring-ds-section-accent active:scale-[0.97]",
							isSelected && selection === "highlight"
								? "bg-ds-control-selected text-ds-content-on-selected shadow-ds-selection"
								: isSelected
									? "bg-ds-surface-selected text-foreground shadow-sm"
									: selection === "highlight"
										? "text-foreground hover:bg-white/[0.06]"
										: "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
						)}
					>
						{option.label}
					</button>
				);
			})}
		</div>
	);
}
