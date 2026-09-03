import type { Metadata, Viewport } from "next";
import dynamic from "next/dynamic";
import { Space_Grotesk, Manrope } from "next/font/google";
import "./globals.css";
import { sr } from "@/lib/i18n/sr";
import { AuthProvider } from "@/lib/auth/useAuth";
import { ActiveSessionProvider } from "@/lib/client/use-active-session";

const AppTracker = dynamic(
	() =>
		import("@/components/analytics/app-tracker").then(
			(mod) => mod.AppTracker
		),
	{ ssr: false }
);

const MobileNav = dynamic(
	() => import("@/components/mobile-nav").then((mod) => mod.MobileNav),
	{ ssr: false }
);

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

const deploymentHost =
	process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
const siteUrl =
	process.env.NEXT_PUBLIC_SITE_URL ??
	(deploymentHost ? `https://${deploymentHost}` : "http://localhost:3000");

export const viewport: Viewport = {
	themeColor: "#030304",
	viewportFit: "cover",
};

// Favicon caches can outlive a deployment. Change this when the brand artwork changes.
const iconVersion = "gweilo-purple-v2";

export const metadata: Metadata = {
	metadataBase: new URL(siteUrl),
	applicationName: "Gweilo",
	title: sr.meta.title,
	description: sr.meta.description,
	icons: {
		icon: [
			{
				url: `/favicon.ico?v=${iconVersion}`,
				type: "image/x-icon",
				sizes: "16x16 32x32 48x48",
			},
			{
				url: `/favicon-32x32.png?v=${iconVersion}`,
				type: "image/png",
				sizes: "32x32",
			},
			{
				url: `/favicon-16x16.png?v=${iconVersion}`,
				type: "image/png",
				sizes: "16x16",
			},
		],
		shortcut: `/favicon.ico?v=${iconVersion}`,
		apple: {
			url: `/apple-touch-icon.png?v=${iconVersion}`,
			type: "image/png",
			sizes: "180x180",
		},
	},
	manifest: "/manifest.json",
	appleWebApp: {
		capable: true,
		statusBarStyle: "black-translucent",
		title: "Gweilo",
	},
	openGraph: {
		type: "website",
		siteName: "Gweilo",
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
	twitter: {
		card: "summary_large_image",
		title: sr.meta.title,
		description: sr.meta.description,
		images: ["/og.png"],
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
				<AuthProvider>
					<AppTracker />
					<ActiveSessionProvider>
						{children}
						<MobileNav />
					</ActiveSessionProvider>
				</AuthProvider>
			</body>
		</html>
	);
}
