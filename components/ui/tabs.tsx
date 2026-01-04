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
			"bg-secondary/50 p-1 rounded-xl flex items-center gap-1 border border-border/30",
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
			"flex-1 py-2 text-xs font-semibold rounded-lg text-muted-foreground hover:text-foreground transition-all data-[state=active]:font-bold data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
			className
		)}
		{...props}
	/>
));
TabsTrigger.displayName = TabsTriggerPrimitive.displayName;

