import { Separator } from "@/components/vendor/shadcn/separator"
import { SidebarTrigger } from "@/components/vendor/shadcn/sidebar"

/**
 * SiteHeader component
 * 
 * Option A: Accepts title prop from each page for explicit control.
 * This approach is preferred because:
 * - Explicit and clear: each page controls its own title
 * - No route-based magic: easier to understand and maintain
 * - Type-safe: title is required, preventing missing titles
 * 
 * Optionally accepts actions prop to display buttons/actions on the far right
 */
export function SiteHeader({
	title,
	actions,
}: {
	title: string;
	actions?: React.ReactNode;
}) {
	return (
		<header className="group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
			<div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
				<SidebarTrigger className="-ml-1" />
				<Separator
					orientation="vertical"
					className="mx-2 data-[orientation=vertical]:h-4"
				/>
				<h1 className="text-base font-medium">{title}</h1>
				{actions && <div className="ml-auto">{actions}</div>}
			</div>
		</header>
	);
}
