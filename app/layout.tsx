import type { Metadata } from "next";
import { Space_Grotesk, Manrope } from "next/font/google";
import "./globals.css";
import { sr } from "@/lib/i18n/sr";
import { MobileNav } from "@/components/mobile-nav";

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
				{children}
				<MobileNav />
			</body>
		</html>
	);
}
