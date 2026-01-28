import type { Metadata } from "next";
import { Space_Grotesk, Manrope } from "next/font/google";
import "./globals.css";
import { sr } from "@/lib/i18n/sr";
import { MobileNav } from "@/components/mobile-nav";
import { AppTracker } from "@/components/analytics/app-tracker";
import { MaintenanceGuard } from "@/components/maintenance/maintenance-guard";

const spaceGrotesk = Space_Grotesk({
	subsets: ["latin"],
	variable: "--font-heading",
	display: "swap",
});

const manrope = Manrope({
	subsets: ["latin"],
	variable: "--font-body",
	display: "swap",
});

export const metadata: Metadata = {
	title: sr.meta.title,
	description: sr.meta.description,
	icons: {
		icon: "/favicon.png",
		apple: "/favicon.png",
	},
	manifest: "/manifest.json",
	appleWebApp: {
		capable: true,
		statusBarStyle: "black-translucent",
		title: "Gweilo",
	},
	openGraph: {
		title: sr.meta.title,
		description: sr.meta.description,
		images: [
			{
				url: "/og.png",
				width: 1200,
				height: 630,
				alt: sr.meta.title,
			},
		],
	},
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html
			lang="sr"
			className={`dark ${spaceGrotesk.variable} ${manrope.variable}`}
		>
		<body>
			<AppTracker />
			<MaintenanceGuard>
				{children}
				<MobileNav />
			</MaintenanceGuard>
		</body>
		</html>
	);
}
