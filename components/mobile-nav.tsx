"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Icon } from "@/components/ui/icon";

type NavItem = {
	title: string;
	url: string;
	icon: string;
};

const navItems: NavItem[] = [
	{
		title: "Pregled",
		url: "/",
		icon: "solar:home-2-bold",
	},
	{
		title: "Statistika",
		url: "/statistics",
		icon: "solar:chart-2-bold",
	},
	{
		title: "Termini",
		url: "/sessions",
		icon: "solar:calendar-bold",
	},
	{
		title: "Video",
		url: "/videos",
		icon: "solar:play-bold",
	},
	{
		title: "Ispale",
		url: "/no-shows",
		icon: "solar:close-circle-bold",
	},
];

/**
 * Mobile navigation bar component
 *
 * Floating bottom navigation bar for mobile devices only.
 * Shows the 5 main navigation items with icons and labels.
 * Active route is highlighted with primary color and background.
 * Uses framer-motion layout animations for smooth glow transitions.
 */
export function MobileNav() {
	const pathname = usePathname();
	const [isIOSSafari26, setIsIOSSafari26] = useState(false);

	useEffect(() => {
		if (typeof window !== "undefined") {
			const userAgent = window.navigator.userAgent;
			// Check for iOS Safari - looking for Safari version 17/18 (iOS 17/18) or version 26
			// User agent contains "Version/17" or "Version/18" for Safari 17/18, or "Version/26" for Safari 26
			const isIOS = /iPhone|iPad|iPod/.test(userAgent);
			const isSafari =
				/Safari/.test(userAgent) &&
				!/Chrome|CriOS|FxiOS/.test(userAgent);
			const safariVersionMatch = userAgent.match(/Version\/(\d+)/);
			const safariVersion = safariVersionMatch
				? parseInt(safariVersionMatch[1], 10)
				: null;

			// Check if it's iOS Safari version 17, 18, or 26
			if (
				isIOS &&
				isSafari &&
				safariVersion &&
				(safariVersion === 17 ||
					safariVersion === 18 ||
					safariVersion === 26)
			) {
				setIsIOSSafari26(true);
			}
		}
	}, []);

	return (
		<nav
			className="fixed left-0 right-0 z-50 flex justify-center px-4 md:hidden"
			style={{ bottom: isIOSSafari26 ? "24px" : "24px" }}
		>
			<div className="bg-card/85 backdrop-blur-xl border border-border/50 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.5)] px-2 py-2 flex items-center gap-1 w-full max-w-[360px] justify-between relative">
				{navItems.map((item) => {
					const isActive = pathname === item.url;
					return (
						<Link
							key={item.url}
							href={item.url}
							className="flex flex-col items-center justify-center w-14 h-14 relative group cursor-pointer"
						>
							{isActive && (
								<motion.div
									layoutId="activeNavIndicator"
									className="absolute inset-2 aspect-square bg-primary/10 rounded-2xl -z-10 blur-sm"
									transition={{
										type: "spring",
										stiffness: 380,
										damping: 30,
									}}
								/>
							)}
							<Icon
								icon={item.icon}
								className={`size-6 mb-0.5 transition-colors duration-200 ${
									isActive
										? "text-primary"
										: "text-muted-foreground group-hover:text-foreground"
								}`}
							/>
							<span
								className={`text-[9px] transition-colors duration-200 ${
									isActive
										? "font-bold text-primary"
										: "font-medium text-muted-foreground group-hover:text-foreground"
								}`}
							>
								{item.title}
							</span>
						</Link>
					);
				})}
			</div>
		</nav>
	);
}
