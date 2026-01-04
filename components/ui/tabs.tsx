"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
	Tabs as TabsPrimitive,
	TabsList as TabsListPrimitive,
	TabsTrigger as TabsTriggerPrimitive,
	TabsContent as TabsContentPrimitive,
} from "@/components/vendor/shadcn/tabs";

// Re-export Tabs and TabsContent as-is
export const Tabs = TabsPrimitive;
export const TabsContent = TabsContentPrimitive;

// Styled TabsList with app-specific styling
export const TabsList = React.forwardRef<
	React.ElementRef<typeof TabsListPrimitive>,
	React.ComponentPropsWithoutRef<typeof TabsListPrimitive>
>(({ className, ...props }, ref) => (
	<TabsListPrimitive
		ref={ref}
		className={cn(
			"h-auto p-0 bg-transparent gap-6 border-none",
			className
		)}
		{...props}
	/>
));
TabsList.displayName = TabsListPrimitive.displayName;

// Styled TabsTrigger with app-specific styling
export const TabsTrigger = React.forwardRef<
	React.ElementRef<typeof TabsTriggerPrimitive>,
	React.ComponentPropsWithoutRef<typeof TabsTriggerPrimitive>
>(({ className, ...props }, ref) => (
	<TabsTriggerPrimitive
		ref={ref}
		className={cn(
			"px-0 py-2 text-base font-medium text-muted-foreground data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary hover:text-foreground transition-colors",
			className
		)}
		{...props}
	/>
));
TabsTrigger.displayName = TabsTriggerPrimitive.displayName;

