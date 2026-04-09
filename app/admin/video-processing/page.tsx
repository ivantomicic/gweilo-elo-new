"use client";

import { AdminGuard } from "@/components/auth/admin-guard";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { VideoProcessingPanel } from "@/components/admin/video-processing-panel";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { Box } from "@/components/ui/box";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";

function AdminVideoProcessingPageContent() {
	return (
		<SidebarProvider>
			<AppSidebar variant="inset" />
			<SidebarInset>
				<SiteHeader title="Video Processing" />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
						<div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
							<Box className="mb-4 md:hidden">
								<AdminTabs />
							</Box>

							<VideoProcessingPanel />
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

export default function AdminVideoProcessingPage() {
	return (
		<AdminGuard>
			<AdminVideoProcessingPageContent />
		</AdminGuard>
	);
}
