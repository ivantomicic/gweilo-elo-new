"use client";

import { AdminGuard } from "@/components/auth/admin-guard";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { VideoProcessingPanel } from "@/components/admin/video-processing-panel";
import { AppShell } from "@/components/app-shell";
import { Box } from "@/components/ui/box";

function AdminVideoProcessingPageContent() {
	return (
		<AppShell
			title="Video Processing"
			contentClassName="md:px-6 lg:px-6"
		>
			<Box className="mb-4 md:hidden">
				<AdminTabs />
			</Box>

			<VideoProcessingPanel />
		</AppShell>
	);
}

export default function AdminVideoProcessingPage() {
	return (
		<AdminGuard>
			<AdminVideoProcessingPageContent />
		</AdminGuard>
	);
}
