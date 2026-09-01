"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
	selectionControlItemStyles,
	selectionControlListStyles,
} from "@/components/ui/selection-control";

type SegmentedValue = string | number;

export type SegmentedControlOption<T extends SegmentedValue> = {
	value: T;
	label: ReactNode;
	ariaLabel?: string;
	disabled?: boolean;
};

type SegmentedControlProps<T extends SegmentedValue> = {
	value: T | null;
	options: readonly SegmentedControlOption<T>[];
	onValueChange: (value: T) => void;
	ariaLabel: string;
	disabled?: boolean;
	className?: string;
};

export function SegmentedControl<T extends SegmentedValue>({
	value,
	options,
	onValueChange,
	ariaLabel,
	disabled = false,
	className,
}: SegmentedControlProps<T>) {
	const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
	const enabledIndexes = options.flatMap((option, index) =>
		disabled || option.disabled ? [] : [index],
	);
	const firstEnabledIndex = enabledIndexes[0] ?? -1;
	const selectedEnabledIndex = options.findIndex(
		(option) => option.value === value && !disabled && !option.disabled,
	);
	const tabStopIndex =
		selectedEnabledIndex >= 0 ? selectedEnabledIndex : firstEnabledIndex;

	const selectAndFocus = (index: number) => {
		const option = options[index];
		if (!option || disabled || option.disabled) return;

		itemRefs.current[index]?.focus();
		onValueChange(option.value);
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
		if (enabledIndexes.length === 0) return;

		const enabledPosition = enabledIndexes.indexOf(index);
		let targetPosition: number | null = null;

		switch (event.key) {
			case "ArrowRight":
			case "ArrowDown":
				targetPosition = (enabledPosition + 1) % enabledIndexes.length;
				break;
			case "ArrowLeft":
			case "ArrowUp":
				targetPosition =
					(enabledPosition - 1 + enabledIndexes.length) % enabledIndexes.length;
				break;
			case "Home":
				targetPosition = 0;
				break;
			case "End":
				targetPosition = enabledIndexes.length - 1;
				break;
			default:
				return;
		}

		event.preventDefault();
		selectAndFocus(enabledIndexes[targetPosition]);
	};

	return (
		<div
			role="radiogroup"
			aria-label={ariaLabel}
			aria-disabled={disabled || undefined}
			className={cn(
				selectionControlListStyles(),
				className,
			)}
			style={{
				gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
			}}
		>
			{options.map((option, index) => {
				const isSelected = value === option.value;
				const isDisabled = disabled || option.disabled;

				return (
					<button
						key={option.value}
						ref={(element) => {
							itemRefs.current[index] = element;
						}}
						type="button"
						role="radio"
						aria-checked={isSelected}
						aria-label={option.ariaLabel}
						disabled={isDisabled}
						data-state={isSelected ? "on" : "off"}
						tabIndex={
							isDisabled ? -1 : index === tabStopIndex ? 0 : -1
						}
						onClick={() => onValueChange(option.value)}
						onKeyDown={(event) => handleKeyDown(event, index)}
						className={selectionControlItemStyles()}
					>
						{option.label}
					</button>
				);
			})}
		</div>
	);
}
