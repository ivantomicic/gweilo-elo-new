"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { useAuth } from "@/lib/auth/useAuth";
import { useActiveSession } from "@/lib/client/use-active-session";
import { t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase/client";
import { clearAllCaches } from "@/lib/utils/clear-cache";
import { isNavigationItemVisible } from "@/lib/navigation/visibility";
import { getSessionAccessory } from "@/lib/navigation/session-accessory";

type NavItem = {
	titleKey: keyof typeof t.nav;
	url: string;
	icon: string;
};

const navItems: NavItem[] = [
	{ titleKey: "dashboard", url: "/", icon: "solar:home-2-bold" },
	{ titleKey: "statistics", url: "/statistics", icon: "solar:chart-2-bold" },
	{ titleKey: "sessions", url: "/sessions", icon: "solar:calendar-bold" },
	{ titleKey: "noShows", url: "/no-shows", icon: "solar:close-circle-bold" },
	{ titleKey: "videos", url: "/videos", icon: "solar:play-bold" },
];

const moreNavItems: NavItem[] = [
	{ titleKey: "noShows", url: "/no-shows", icon: "solar:close-circle-bold" },
	{ titleKey: "videos", url: "/videos", icon: "solar:play-bold" },
	{ titleKey: "polls", url: "/polls", icon: "solar:document-bold" },
	{ titleKey: "calculator", url: "/calculator", icon: "solar:calculator-bold" },
	{ titleKey: "rules", url: "/rules", icon: "solar:info-circle-bold" },
];

const settingsItem: NavItem = {
	titleKey: "settings",
	url: "/settings",
	icon: "solar:settings-bold",
};

const adminItem: NavItem = {
	titleKey: "admin",
	url: "/admin/users",
	icon: "solar:shield-bold",
};

// Match the native four-destination TabView: three primary routes plus More.
const mainNavItems = navItems.filter(isNavigationItemVisible).slice(0, 3);
const visibleMoreNavItems = moreNavItems.filter(isNavigationItemVisible);

/**
 * Mobile navigation bar component
 *
 * Floating bottom navigation bar for mobile devices only.
 * Three primary destinations plus More, with a translucent selected lens.
 * The optional session accessory shares the dock's viewport anchor.
 */
export function MobileNav() {
	const pathname = usePathname();
	const router = useRouter();
	const { isAuthenticated, user, role } = useAuth();
	const { activeSession, loading: loadingActiveSession } = useActiveSession();
	const [isMoreOpen, setIsMoreOpen] = useState(false);
	const [isLoggingOut, setIsLoggingOut] = useState(false);
	const moreButtonRef = useRef<HTMLButtonElement>(null);
	const shouldReduceMotion = useReducedMotion();
	const isAdmin = role === "admin";
	const userAvatar = user?.avatar ?? null;
	const userName = user?.name ?? "User";

	const triggerNavHaptic = () => {
		try {
			if (typeof navigator !== "undefined" && navigator.vibrate) {
				navigator.vibrate(10);
			}
		} catch {
			// Ignore haptic failures. Navigation should never depend on them.
		}
	};

	const handleMoreToggle = () => {
		triggerNavHaptic();
		setIsMoreOpen((prev) => !prev);
	};

	const handleMoreItemClick = () => {
		triggerNavHaptic();
		setIsMoreOpen(false);
	};

	const handleLogout = async () => {
		if (isLoggingOut) return;

		triggerNavHaptic();
		setIsMoreOpen(false);
		setIsLoggingOut(true);

		try {
			clearAllCaches();
			await supabase.auth.signOut({ scope: "local" });
			router.push("/");
		} catch (error) {
			console.error("Failed to log out:", error);
			setIsLoggingOut(false);
		}
	};

	// Close popup when clicking outside
	useEffect(() => {
		if (!isMoreOpen) return;

		const handleClickOutside = (event: MouseEvent) => {
			if (
				moreButtonRef.current &&
				!moreButtonRef.current.contains(event.target as Node) &&
				!(event.target as HTMLElement).closest("[data-more-popup]")
			) {
				setIsMoreOpen(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () =>
			document.removeEventListener("mousedown", handleClickOutside);
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

	if (pathname.startsWith("/oauth/")) {
		return null;
	}

	const sessionAccessory = getSessionAccessory({
		isAuthenticated,
		role,
		loading: loadingActiveSession,
		pathname,
		activeSession,
	});

	const hasActiveInMore =
		visibleMoreNavItems.some((item) => pathname === item.url) ||
		pathname === settingsItem.url ||
		pathname.startsWith("/admin") ||
		pathname.startsWith("/calculator");
	const isPlayerProfileRoute = pathname.startsWith("/player/");

	return (
		<>
			{sessionAccessory && (
				<div className="mobile-nav-accessory md:hidden">
					<Link
						href={sessionAccessory.href}
						onClick={triggerNavHaptic}
						className="mobile-nav-accessory__button"
						aria-label={sessionAccessory.ariaLabel}
					>
						{sessionAccessory.label}
					</Link>
				</div>
			)}
			<motion.nav
				// Measure the selected lens in viewport coordinates, not page-scroll coordinates.
				layoutRoot
				data-mobile-nav
				aria-label={t.nav.ariaLabel}
				className="mobile-nav fixed left-0 z-50 flex w-full justify-center px-4 md:hidden"
			>
				<div className="relative w-full max-w-[450px]">
					{/* More popup */}
					<AnimatePresence>
						{isMoreOpen && (
							<motion.div
								data-more-popup
								initial={
									shouldReduceMotion
										? false
										: { opacity: 0, y: 10, scale: 0.95 }
								}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								exit={
									shouldReduceMotion
										? undefined
										: { opacity: 0, y: 10, scale: 0.95 }
								}
								transition={{ duration: 0.2 }}
								className="mobile-nav__popover absolute bottom-full right-0 mb-3 min-w-[164px] p-2"
							>
								{/* Regular items */}
								{visibleMoreNavItems.map((item) => {
									const isActive = pathname === item.url;
									return (
										<Link
											key={item.url}
											href={item.url}
											data-active={isActive}
											aria-current={isActive ? "page" : undefined}
											className="mobile-nav__menu-item"
											onClick={handleMoreItemClick}
										>
											<Icon
												icon={item.icon}
												className="size-5"
											/>
											<span className="text-sm font-semibold">
												{t.nav[item.titleKey]}
											</span>
										</Link>
									);
								})}

								{/* Separator */}
								<div className="mobile-nav__menu-separator" />

								{/* Settings (first from bottom, separated) */}
								{(() => {
									const isActive =
										pathname === settingsItem.url;
									return (
										<Link
											href={settingsItem.url}
											data-active={isActive}
											aria-current={isActive ? "page" : undefined}
											className="mobile-nav__menu-item"
											onClick={handleMoreItemClick}
										>
											<Icon
												icon={settingsItem.icon}
												className="size-5"
											/>
											<span className="text-sm font-semibold">
												{t.nav[settingsItem.titleKey]}
											</span>
										</Link>
									);
								})()}

								{/* Admin (admins only) */}
								{isAdmin && (
									(() => {
										const isActive = pathname.startsWith(
											adminItem.url,
										);
										return (
											<Link
												href={adminItem.url}
												data-active={isActive}
												aria-current={isActive ? "page" : undefined}
												className="mobile-nav__menu-item"
												onClick={handleMoreItemClick}
											>
												<Icon
													icon={adminItem.icon}
													className="size-5"
												/>
												<span className="text-sm font-semibold">
													{t.nav[adminItem.titleKey]}
												</span>
											</Link>
										);
									})()
								)}

								{/* Account actions */}
								<div className="mobile-nav__menu-separator" />
								<button
									type="button"
									className="mobile-nav__menu-item w-full text-left disabled:pointer-events-none disabled:opacity-60"
									onClick={handleLogout}
									disabled={isLoggingOut}
								>
									<Icon
										icon="solar:logout-2-bold"
										className="size-5"
									/>
									<span className="text-sm font-semibold">
										{t.user.logout}
									</span>
								</button>
							</motion.div>
						)}
					</AnimatePresence>

					{/* Main nav bar */}
					<div className="mobile-nav__bar">
						{mainNavItems.map((item) => {
							const isActive =
								pathname === item.url ||
								(item.url === "/statistics" && isPlayerProfileRoute);
							return (
								<Link
									key={item.url}
									href={item.url}
									onClick={triggerNavHaptic}
									data-active={isActive}
									aria-current={isActive ? "page" : undefined}
									className="mobile-nav__item"
								>
									{isActive && (
										<motion.div
											layoutId={
												shouldReduceMotion
													? undefined
													: "activeNavIndicator"
											}
											className="mobile-nav__selection"
											transition={{
												type: "spring",
												stiffness: 380,
												damping: 30,
											}}
										/>
									)}
									<Icon
										icon={item.icon}
										className="mobile-nav__icon size-6"
									/>
									<span className="mobile-nav__label">
										{t.nav[item.titleKey]}
									</span>
								</Link>
							);
						})}

						{/* More button */}
						<button
							ref={moreButtonRef}
							type="button"
							onClick={handleMoreToggle}
							aria-label={t.nav.moreMenuLabel}
							aria-expanded={isMoreOpen}
							data-active={hasActiveInMore || isMoreOpen}
							className="mobile-nav__item"
						>
							{(hasActiveInMore || isMoreOpen) && (
								<motion.div
									layoutId={
										shouldReduceMotion
											? undefined
											: "activeNavIndicator"
									}
									className="mobile-nav__selection"
									transition={{
										type: "spring",
										stiffness: 380,
										damping: 30,
									}}
								/>
							)}
							<Avatar
								className="mobile-nav__avatar size-6 border border-white/20"
							>
								<AvatarImage
									src={userAvatar || undefined}
									alt={userName}
								/>
								<AvatarFallback className="bg-muted text-[10px] font-semibold">
									{userName.charAt(0).toUpperCase()}
								</AvatarFallback>
							</Avatar>
							<span className="mobile-nav__label">
								{t.nav.more}
							</span>
						</button>
					</div>
				</div>
			</motion.nav>
		</>
	);
}
