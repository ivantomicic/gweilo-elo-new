"use client";

import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type SheetSide = "top" | "right" | "bottom" | "left";

export interface SheetFormProps {
	open: boolean;
	onClose: () => void;
	title: React.ReactNode;
	children: React.ReactNode;
	onSubmit: () => void | Promise<void>;
	submitLabel: React.ReactNode;
	cancelLabel: React.ReactNode;
	error?: React.ReactNode;
	submitting?: boolean;
	submittingLabel?: React.ReactNode;
	submitDisabled?: boolean;
	cancelDisabled?: boolean;
	side?: SheetSide;
	contentClassName?: string;
	formClassName?: string;
	bodyClassName?: string;
	footerClassName?: string;
	submitButtonProps?: Omit<ButtonProps, "children" | "type" | "disabled">;
	cancelButtonProps?: Omit<
		ButtonProps,
		"children" | "type" | "disabled" | "onClick"
	>;
}

function SheetFormError({ children }: { children: React.ReactNode }) {
	if (!children) {
		return null;
	}

	return (
		<div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400">
			{children}
		</div>
	);
}

const SheetForm = React.forwardRef<HTMLFormElement, SheetFormProps>(
	(
		{
			open,
			onClose,
			title,
			children,
			onSubmit,
			submitLabel,
			cancelLabel,
			error,
			submitting = false,
			submittingLabel,
			submitDisabled = false,
			cancelDisabled = false,
			side = "right",
			contentClassName,
			formClassName,
			bodyClassName,
			footerClassName,
			submitButtonProps,
			cancelButtonProps,
		},
		ref,
	) => {
		const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
			event.preventDefault();

			if (submitting || submitDisabled) {
				return;
			}

			void onSubmit();
		};

		return (
			<Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
				<SheetContent
					side={side}
					className={cn("w-full sm:max-w-md", contentClassName)}
				>
					<form
						ref={ref}
						onSubmit={handleSubmit}
						className={cn("flex h-full flex-col", formClassName)}
					>
						<SheetHeader>
							<SheetTitle>{title}</SheetTitle>
						</SheetHeader>

						<div className={cn("mt-6 flex-1 space-y-6", bodyClassName)}>
							<SheetFormError>{error}</SheetFormError>
							{children}
						</div>

						<SheetFooter className={cn("mt-8", footerClassName)}>
							<Button
								type="button"
								variant="outline"
								onClick={onClose}
								disabled={cancelDisabled || submitting}
								{...cancelButtonProps}
							>
								{cancelLabel}
							</Button>
							<Button
								type="submit"
								disabled={submitting || submitDisabled}
								{...submitButtonProps}
							>
								{submitting && submittingLabel ? submittingLabel : submitLabel}
							</Button>
						</SheetFooter>
					</form>
				</SheetContent>
			</Sheet>
		);
	},
);
SheetForm.displayName = "SheetForm";

export { SheetForm, SheetFormError };
