import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { Loading } from "@/components/ui/loading";
import { cn } from "@/lib/utils";

/**
 * App-owned button contract.
 *
 * Vendor primitives stay in components/vendor. Product code imports this
 * component so a future visual refresh can be made in one place.
 */
const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control border border-transparent text-sm font-semibold ring-offset-background transition-[transform,opacity,background-color,border-color,color,box-shadow] duration-press ease-ds-out active:scale-[0.965] active:opacity-[0.82] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-100 data-[loading=true]:opacity-[0.72] motion-reduce:transition-[background-color,border-color,color,box-shadow] motion-reduce:active:scale-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default:
					"border-ds-button-accent bg-ds-button-accent text-ds-button-foreground hover:border-ds-button-accent-bright hover:bg-ds-button-accent-bright focus-visible:ring-ds-button-accent-bright disabled:border-ds-button-surface disabled:bg-ds-button-surface disabled:text-ds-button-muted data-[loading=true]:border-ds-button-accent data-[loading=true]:bg-ds-button-accent data-[loading=true]:text-ds-button-foreground",
				destructive:
					"border-ds-button-destructive/30 bg-ds-button-destructive/10 text-ds-button-destructive hover:border-ds-button-destructive/45 hover:bg-ds-button-destructive/[0.16] focus-visible:ring-ds-button-destructive disabled:border-ds-button-hairline/[0.08] disabled:bg-ds-button-surface disabled:text-ds-button-muted data-[loading=true]:border-ds-button-destructive/30 data-[loading=true]:bg-ds-button-destructive/10 data-[loading=true]:text-ds-button-destructive",
				outline:
					"border-ds-button-hairline/[0.13] bg-transparent text-ds-button-foreground hover:border-ds-button-hairline/20 hover:bg-ds-button-surface focus-visible:ring-ds-button-accent-bright disabled:border-ds-button-hairline/[0.08] disabled:text-ds-button-muted data-[loading=true]:border-ds-button-hairline/[0.13] data-[loading=true]:bg-transparent data-[loading=true]:text-ds-button-foreground",
				secondary:
					"border-ds-button-hairline/[0.13] bg-ds-button-surface text-ds-button-foreground hover:border-ds-button-hairline/20 hover:bg-ds-button-surface-hover focus-visible:ring-ds-button-accent-bright disabled:border-ds-button-hairline/[0.08] disabled:bg-ds-button-surface disabled:text-ds-button-muted data-[loading=true]:border-ds-button-hairline/[0.13] data-[loading=true]:bg-ds-button-surface data-[loading=true]:text-ds-button-foreground",
				ghost:
					"bg-transparent text-ds-button-muted hover:bg-ds-button-surface hover:text-ds-button-foreground focus-visible:ring-ds-button-accent-bright disabled:text-ds-button-muted/60 data-[loading=true]:bg-transparent data-[loading=true]:text-ds-button-muted",
				link:
					"bg-transparent text-ds-button-accent-bright underline-offset-4 hover:text-ds-button-foreground hover:underline focus-visible:ring-ds-button-accent-bright disabled:text-ds-button-muted data-[loading=true]:bg-transparent data-[loading=true]:text-ds-button-accent-bright",
				prominent:
					"touch-safe border-ds-button-primary bg-ds-button-primary font-bold text-ds-button-primary-foreground hover:border-ds-button-primary/90 hover:bg-ds-button-primary/90 focus-visible:ring-ds-button-primary disabled:border-ds-button-surface disabled:bg-ds-button-surface disabled:text-ds-button-muted data-[loading=true]:border-ds-button-primary data-[loading=true]:bg-ds-button-primary data-[loading=true]:text-ds-button-primary-foreground",
			},
			size: {
				default: "h-10 px-4 py-2",
				sm: "h-9 px-3",
				xs: "h-7 px-2 text-xs",
				lg: "h-11 px-8",
				icon: "size-10 p-0",
				auth: "mt-4 h-14 w-full px-6 text-lg font-bold",
				authSecondary:
					"h-12 w-full px-6",
				cta: "h-14 w-full rounded-control px-6 text-base",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {
	asChild?: boolean;
	isLoading?: boolean;
	loadingLabel?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	(
		{
			className,
			variant,
			size,
			asChild = false,
			isLoading = false,
			loadingLabel,
			disabled,
			children,
			...props
		},
		ref,
	) => {
		const Comp = asChild ? Slot : "button";
		const isDisabled = disabled || isLoading;

		return (
			<Comp
				className={cn(buttonVariants({ variant, size, className }))}
				ref={ref}
				disabled={asChild ? undefined : isDisabled}
				aria-disabled={asChild && isDisabled ? true : undefined}
				aria-busy={isLoading || undefined}
				data-loading={isLoading || undefined}
			{...props}
			>
				{isLoading && !asChild ? (
					<>
						<Loading
							inline
							size="xs"
							showsQuote={false}
							role="presentation"
							aria-live="off"
							aria-hidden="true"
							label={
								typeof loadingLabel === "string"
									? loadingLabel
									: typeof children === "string"
										? children
										: "Učitavam…"
							}
							className="w-auto shrink-0"
						/>
						<span>{loadingLabel ?? children}</span>
					</>
				) : (
					children
				)}
			</Comp>
		);
	},
);
Button.displayName = "Button";

export { Button, buttonVariants };
