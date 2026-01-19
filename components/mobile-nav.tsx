"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@/components/ui/icon";
import { useAuth } from "@/lib/auth/useAuth";

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
		title: "Ispale",
		url: "/no-shows",
		icon: "solar:close-circle-bold",
	},
	{
		title: "Video",
		url: "/videos",
		icon: "solar:play-bold",
	},
];

// Additional items to show in "more" popup
// Note: Order is reversed when rendering (Podešavanja appears first from bottom)
const moreNavItems: NavItem[] = [
	{
		title: "Video",
		url: "/videos",
		icon: "solar:play-bold",
	},
	{
		title: "Pravila igre",
		url: "/rules",
		icon: "solar:info-circle-bold",
	},
	{
		title: "Anketarijum",
		url: "/polls",
		icon: "solar:document-bold",
	},
];

// Settings item (separated, appears first from bottom)
const settingsItem: NavItem = {
	title: "Podešavanja",
	url: "/settings",
	icon: "solar:settings-bold",
};

// Show first 4 items in main nav
const mainNavItems = navItems.slice(0, 4);

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
	const { isAuthenticated } = useAuth();
	const [isIOSSafari26, setIsIOSSafari26] = useState(false);
	const [isMoreOpen, setIsMoreOpen] = useState(false);
	const moreButtonRef = useRef<HTMLButtonElement>(null);

	// All hooks must be called before any conditional returns
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

	// Close popup when clicking outside
	useEffect(() => {
		if (!isMoreOpen) return;

		const handleClickOutside = (event: MouseEvent) => {
			if (
				moreButtonRef.current &&
				!moreButtonRef.current.contains(event.target as Node) &&
				!(event.target as HTMLElement).closest('[data-more-popup]')
			) {
				setIsMoreOpen(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isMoreOpen]);

	// Close popup when route changes
	useEffect(() => {
		setIsMoreOpen(false);
	}, [pathname]);

	// Don't render navigation if not authenticated
	if (isAuthenticated === null) {
		// Loading state - don't render nav yet
		return null;
	}

	if (!isAuthenticated) {
		// Not authenticated - don't show navigation
		return null;
	}

	const hasActiveInMore = moreNavItems.some((item) => pathname === item.url) || pathname === settingsItem.url;

	return (
		<>
			{/* Dark overlay gradient between content and navigation */}
			<div
				className="fixed left-0 right-0 bottom-0 z-40 md:hidden pointer-events-none"
				style={{
					height: isIOSSafari26 ? "160px" : "176px",
				}}
			>
				<div className="h-full w-full bg-gradient-to-t from-background/75 via-background/60 to-transparent" />
			</div>

			<nav
				className="fixed left-0 right-0 z-50 flex justify-center px-4 md:hidden"
				style={{ bottom: isIOSSafari26 ? "8px" : "24px" }}
			>
				<div className="relative w-full max-w-[450px]">
				{/* More popup */}
				<AnimatePresence>
					{isMoreOpen && (
						<motion.div
							data-more-popup
							initial={{ opacity: 0, y: 10, scale: 0.95 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, y: 10, scale: 0.95 }}
							transition={{ duration: 0.2 }}
							className="absolute bottom-full right-0 mb-3 bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-2 min-w-[140px]"
						>
							{/* Regular items */}
							{moreNavItems.map((item) => {
								const isActive = pathname === item.url;
								return (
									<Link
										key={item.url}
										href={item.url}
										className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-card transition-colors duration-200 group"
										onClick={() => setIsMoreOpen(false)}
									>
										<Icon
											icon={item.icon}
											className={`size-5 transition-colors duration-200 ${
												isActive
													? "text-primary"
													: "text-muted-foreground group-hover:text-foreground"
											}`}
										/>
										<span
											className={`text-sm transition-colors duration-200 ${
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
							
							{/* Separator */}
							<div className="h-px bg-border/50 mx-2 my-1" />
							
							{/* Settings (first from bottom, separated) */}
							{(() => {
								const isActive = pathname === settingsItem.url;
								return (
									<Link
										href={settingsItem.url}
										className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-card transition-colors duration-200 group"
										onClick={() => setIsMoreOpen(false)}
									>
										<Icon
											icon={settingsItem.icon}
											className={`size-5 transition-colors duration-200 ${
												isActive
													? "text-primary"
													: "text-muted-foreground group-hover:text-foreground"
											}`}
										/>
										<span
											className={`text-sm transition-colors duration-200 ${
												isActive
													? "font-bold text-primary"
													: "font-medium text-muted-foreground group-hover:text-foreground"
											}`}
										>
											{settingsItem.title}
										</span>
									</Link>
								);
							})()}
						</motion.div>
					)}
				</AnimatePresence>

				{/* Main nav bar */}
				<div className="bg-card/85 backdrop-blur-xl border border-border/50 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.5)] px-2 py-2 flex items-center gap-1 w-full max-w-[450px] justify-between relative">
					{mainNavItems.map((item) => {
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

					{/* More button */}
					<button
						ref={moreButtonRef}
						onClick={() => setIsMoreOpen(!isMoreOpen)}
						className={`flex flex-col items-center justify-center w-14 h-14 relative group cursor-pointer transition-colors duration-200 ${
							hasActiveInMore || isMoreOpen
								? "text-primary"
								: "text-muted-foreground group-hover:text-foreground"
						}`}
					>
						{(hasActiveInMore || isMoreOpen) && (
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
							icon="solar:menu-dots-bold"
							className={`size-6 mb-0.5 transition-colors duration-200 ${
								hasActiveInMore || isMoreOpen
									? "text-primary"
									: "text-muted-foreground group-hover:text-foreground"
							}`}
						/>
						<span
							className={`text-[9px] transition-colors duration-200 ${
								hasActiveInMore || isMoreOpen
									? "font-bold text-primary"
									: "font-medium text-muted-foreground group-hover:text-foreground"
							}`}
						>
							Više
						</span>
					</button>
				</div>
			</div>
		</nav>
		</>
	);
}
