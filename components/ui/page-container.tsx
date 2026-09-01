import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/utils";

/** Shared page width and gutters; no clipping or containing block for sticky/fixed children. */
export function PageContainer({ className, ...props }: ComponentPropsWithoutRef<"div">) {
	return (
		<div
			{...props}
			data-page-container
			className={cn("mx-auto w-full min-w-0 max-w-[768px] px-5", className)}
		/>
	);
}
