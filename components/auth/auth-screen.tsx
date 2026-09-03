"use client";

import {
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
	type ChangeEvent,
	type FormEvent,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase/client";
import { isOnscreenKeyboardVisible } from "@/lib/ui/onscreen-keyboard";

type AuthState = "idle" | "success" | "error";
type AuthMode = "login" | "register" | "forgot";
type FocusedField = "email" | "password" | "fullName" | null;
type LoadingMethod = "password" | "google" | "register" | null;

type AuthScreenProps = {
	redirectPath?: string;
};

const LOGIN_VIDEO_ASPECT_RATIO = 1078 / 978;
const LOGIN_VIDEO_RATE = 3.01026;

type AuthCapsuleFieldProps = {
	id: string;
	type: "email" | "password" | "text";
	name: string;
	placeholder: string;
	value: string;
	disabled: boolean;
	autoComplete: string;
	invalid?: boolean;
	describedBy?: string;
	onChange: (event: ChangeEvent<HTMLInputElement>) => void;
	onFocus: () => void;
	onBlur: () => void;
};

function AuthCapsuleField({
	id,
	type,
	name,
	placeholder,
	value,
	disabled,
	autoComplete,
	invalid = false,
	describedBy,
	onChange,
	onFocus,
	onBlur,
}: AuthCapsuleFieldProps) {
	return (
		<label className="block">
			<span className="sr-only">{placeholder}</span>
			<input
				id={id}
				name={name}
				type={type}
				value={value}
				placeholder={placeholder}
				autoComplete={autoComplete}
				disabled={disabled}
				required
				aria-invalid={invalid || undefined}
				aria-describedby={describedBy}
				onChange={onChange}
				onFocus={onFocus}
				onBlur={onBlur}
				className="auth-lock-field h-[52px] w-full rounded-full border-[1.2px] border-white/[0.13] bg-[rgb(var(--ds-native-surface))] px-5 text-center text-base font-normal text-[rgb(var(--ds-native-bone))] caret-[rgb(var(--ds-native-purple-bright))] outline-none transition-[border-color,box-shadow,opacity] duration-press ease-ds-out placeholder:text-[rgb(var(--ds-native-muted))]/55 focus:border-[rgb(var(--ds-native-purple))] focus:shadow-[0_0_0_1px_rgb(120_48_255_/_0.12)] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
			/>
		</label>
	);
}

function NativeLoginHero({ isEditing }: { isEditing: boolean }) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const fadeRef = useRef<HTMLDivElement>(null);
	const progressFrameRef = useRef<number | null>(null);
	const shouldReduceMotion = useReducedMotion();

	const stopProgressLoop = useCallback(() => {
		if (progressFrameRef.current !== null) {
			window.cancelAnimationFrame(progressFrameRef.current);
			progressFrameRef.current = null;
		}
	}, []);

	const updateProgressFade = useCallback(() => {
		const video = videoRef.current;
		const fade = fadeRef.current;
		if (!video || !fade) return;

		const duration = video.duration;
		const progress =
			Number.isFinite(duration) && duration > 0
				? Math.min(Math.max(video.currentTime / duration, 0), 1)
				: 0;
		const opacity = shouldReduceMotion
			? 1
			: progress <= 0.3
				? 0
				: Math.min((progress - 0.3) / 0.4, 1);

		fade.style.opacity = String(opacity);

		if (!video.paused && !video.ended) {
			progressFrameRef.current = window.requestAnimationFrame(
				updateProgressFade,
			);
		}
	}, [shouldReduceMotion]);

	const startProgressLoop = useCallback(() => {
		stopProgressLoop();
		updateProgressFade();
	}, [stopProgressLoop, updateProgressFade]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;

		const syncPlaybackWithPage = () => {
			if (shouldReduceMotion || document.visibilityState !== "visible") {
				video.pause();
				updateProgressFade();
				return;
			}

			if (!video.ended) {
				video.playbackRate = LOGIN_VIDEO_RATE;
				void video.play().catch(() => {
					// The poster is a complete visual fallback when autoplay is denied.
				});
			}
		};

		document.addEventListener("visibilitychange", syncPlaybackWithPage);
		syncPlaybackWithPage();

		return () => {
			document.removeEventListener("visibilitychange", syncPlaybackWithPage);
			stopProgressLoop();
		};
	}, [shouldReduceMotion, stopProgressLoop, updateProgressFade]);

	return (
		<div
			aria-hidden="true"
			className="relative aspect-[1078/978] w-full overflow-hidden"
		>
			<video
				ref={videoRef}
				muted
				playsInline
				autoPlay={!shouldReduceMotion}
				preload="auto"
				poster="/auth/gweilo-login-hero-poster.jpg"
				onLoadedMetadata={(event) => {
					event.currentTarget.defaultPlaybackRate = LOGIN_VIDEO_RATE;
					event.currentTarget.playbackRate = LOGIN_VIDEO_RATE;
					updateProgressFade();
				}}
				onPlay={startProgressLoop}
				onPause={() => {
					stopProgressLoop();
					updateProgressFade();
				}}
				onEnded={() => {
					stopProgressLoop();
					updateProgressFade();
				}}
				className="absolute inset-0 size-full object-contain transition-[filter,opacity] [transition-duration:250ms] ease-in-out motion-reduce:transition-none"
				style={{
					filter: isEditing ? "blur(7px)" : "blur(0px)",
					opacity: isEditing ? 0.66 : 1,
				}}
			>
				<source
					src="/auth/gweilo-login-hero.mov"
					type='video/quicktime; codecs="hvc1"'
				/>
				<source src="/auth/gweilo-login-hero.mp4" type="video/mp4" />
			</video>

			<div
				ref={fadeRef}
				className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgb(3_3_4)_0%,rgb(3_3_4_/_0.72)_8%,transparent_20%,transparent_100%)] opacity-0"
			/>
			<div
				className="pointer-events-none absolute inset-0 bg-[rgb(var(--ds-native-background))] transition-opacity [transition-duration:250ms] ease-in-out motion-reduce:transition-none"
				style={{ opacity: isEditing ? 0.18 : 0 }}
			/>
		</div>
	);
}

function FormError({ id, message }: { id: string; message: string }) {
	return (
		<p
			id={id}
			role="alert"
			className="text-center text-[13px] leading-snug text-[rgb(var(--ds-native-coral))]"
		>
			{message}
		</p>
	);
}

function NativeDivider() {
	return (
		<div className="flex items-center gap-3" aria-hidden="true">
			<span className="h-px flex-1 bg-white/[0.13]" />
			<span className="text-[12px] font-bold text-[rgb(var(--ds-native-muted))]">
				ILI
			</span>
			<span className="h-px flex-1 bg-white/[0.13]" />
		</div>
	);
}

function NativePrimaryButton({
	children,
	isLoading,
	disabled,
	type = "submit",
}: {
	children: string;
	isLoading: boolean;
	disabled: boolean;
	type?: "button" | "submit";
}) {
	return (
		<Button
			type={type}
			variant="prominent"
			size="auth"
			disabled={disabled}
			isLoading={isLoading}
			loadingLabel={children}
			className="h-[50px] rounded-full border-[rgb(var(--ds-native-lime))] bg-[rgb(var(--ds-native-lime))] px-5 text-[17px] font-bold text-[rgb(var(--ds-native-background))] hover:border-[rgb(var(--ds-native-lime))]/90 hover:bg-[rgb(var(--ds-native-lime))]/90 disabled:border-[rgb(var(--ds-native-lime))] disabled:bg-[rgb(var(--ds-native-lime))] disabled:text-[rgb(var(--ds-native-background))] disabled:opacity-[0.72]"
		>
			{children}
		</Button>
	);
}

function NativeGoogleButton({
	isLoading,
	disabled,
	onClick,
}: {
	isLoading: boolean;
	disabled: boolean;
	onClick: () => void;
}) {
	return (
		<Button
			type="button"
			variant="secondary"
			size="authSecondary"
			disabled={disabled}
			isLoading={isLoading}
			loadingLabel="Povezivanje…"
			onClick={onClick}
			className="h-[50px] rounded-full border-[1.2px] border-white/[0.13] bg-[rgb(var(--ds-native-raised))] px-5 text-[17px] font-semibold text-white hover:border-white/20 hover:bg-[rgb(var(--ds-native-raised))] disabled:border-white/[0.08] disabled:bg-[rgb(var(--ds-native-raised))] disabled:text-[rgb(var(--ds-native-muted))]"
		>
			<span className="text-[18px] font-black" aria-hidden="true">
				G
			</span>
			<span>Koristi Google</span>
		</Button>
	);
}

export function AuthScreen({ redirectPath = "/" }: AuthScreenProps = {}) {
	const [mode, setMode] = useState<AuthMode>("login");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [fullName, setFullName] = useState("");
	const [authState, setAuthState] = useState<AuthState>("idle");
	const [error, setError] = useState<string | null>(null);
	const [loadingMethod, setLoadingMethod] =
		useState<LoadingMethod>(null);
	const [focusedField, setFocusedField] = useState<FocusedField>(null);
	const [isOnscreenKeyboardOpen, setIsOnscreenKeyboardOpen] = useState(false);
	const [heroWidth, setHeroWidth] = useState(0);
	const heroRef = useRef<HTMLDivElement>(null);
	const keyboardBaselineRef = useRef<{ height: number; width: number } | null>(
		null,
	);
	const errorMessageId = useId();
	const shouldReduceMotion = useReducedMotion();

	const isLoading = loadingMethod !== null;
	const isEditing = focusedField !== null && isOnscreenKeyboardOpen;
	const canLogin = email.includes("@") && password.length > 0 && !isLoading;
	const canRegister =
		fullName.trim().length > 0 &&
		email.includes("@") &&
		password.length >= 6 &&
		!isLoading;
	const contentStart = heroWidth / LOGIN_VIDEO_ASPECT_RATIO + 10;
	const editingOffset =
		isEditing && contentStart > 0 ? Math.min(0, 56 - contentStart) : 0;

	useEffect(() => {
		const viewport = window.visualViewport;
		const hasTouchInput = navigator.maxTouchPoints > 0;

		if (!viewport || !hasTouchInput) {
			keyboardBaselineRef.current = null;
			setIsOnscreenKeyboardOpen(false);
			return;
		}

		const updateKeyboardState = () => {
			const currentHeight = viewport.height;
			const currentWidth = viewport.width;
			const baseline = keyboardBaselineRef.current;
			const orientationChanged =
				baseline !== null && Math.abs(baseline.width - currentWidth) >= 50;

			if (!baseline || orientationChanged) {
				keyboardBaselineRef.current = {
					height: currentHeight,
					width: currentWidth,
				};
				setIsOnscreenKeyboardOpen(false);
				return;
			}

			if (focusedField === null) {
				// Browser chrome can temporarily shorten the visual viewport. Keep the
				// largest stable height as the keyboard-free baseline.
				keyboardBaselineRef.current = {
					height: Math.max(baseline.height, currentHeight),
					width: currentWidth,
				};
				setIsOnscreenKeyboardOpen(false);
				return;
			}

			setIsOnscreenKeyboardOpen(
				isOnscreenKeyboardVisible({
					hasFocusedField: true,
					hasTouchInput,
					baselineHeight: baseline.height,
					viewportHeight: currentHeight,
				}),
			);
		};

		updateKeyboardState();
		viewport.addEventListener("resize", updateKeyboardState);
		viewport.addEventListener("scroll", updateKeyboardState);
		return () => {
			viewport.removeEventListener("resize", updateKeyboardState);
			viewport.removeEventListener("scroll", updateKeyboardState);
		};
	}, [focusedField]);

	useEffect(() => {
		const hero = heroRef.current;
		if (!hero) return;

		const updateWidth = () => {
			const nextWidth = hero.getBoundingClientRect().width;
			setHeroWidth((currentWidth) =>
				Math.abs(currentWidth - nextWidth) >= 0.5
					? nextWidth
					: currentWidth,
			);
		};

		updateWidth();
		const observer = new ResizeObserver(updateWidth);
		observer.observe(hero);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (!isEditing) return;

		// Mobile Safari may scroll the field before React applies the native
		// keyboard offset. Once the field has moved above the keyboard, restore
		// the canvas origin so the content settles at the same 56pt anchor as iOS.
		const frame = window.requestAnimationFrame(() => window.scrollTo(0, 0));
		const settle = window.setTimeout(() => window.scrollTo(0, 0), 340);
		return () => {
			window.cancelAnimationFrame(frame);
			window.clearTimeout(settle);
		};
	}, [isEditing]);

	const resetFeedback = () => {
		setAuthState("idle");
		setError(null);
	};

	const switchMode = (nextMode: AuthMode) => {
		setMode(nextMode);
		resetFeedback();
		setPassword("");
		setFocusedField(null);
	};

	const handleLogin = async (event: FormEvent) => {
		event.preventDefault();
		if (!canLogin) return;

		setError(null);
		setLoadingMethod("password");
		setFocusedField(null);

		try {
			const { error: signInError } =
				await supabase.auth.signInWithPassword({ email, password });

			if (signInError) {
				setAuthState("error");
				if (
					signInError.message.includes("Invalid login credentials") ||
					signInError.message.includes("Email not confirmed")
				) {
					setError(t.auth.error.invalidCredentials);
				} else {
					setError(t.auth.error.generic);
				}
			} else {
				setAuthState("idle");
			}
		} catch {
			setAuthState("error");
			setError(t.auth.error.generic);
		} finally {
			setLoadingMethod(null);
		}
	};

	const handleRegister = async (event: FormEvent) => {
		event.preventDefault();
		if (!canRegister) return;

		setError(null);
		setLoadingMethod("register");
		setFocusedField(null);

		try {
			const { error: signUpError } = await supabase.auth.signUp({
				email,
				password,
				options: { data: { full_name: fullName } },
			});

			if (signUpError) {
				setAuthState("error");
				if (signUpError.message.includes("already registered")) {
					setError(t.auth.error.emailAlreadyExists);
				} else if (signUpError.message.includes("Password")) {
					setError(t.auth.error.weakPassword);
				} else {
					setError(t.auth.error.generic);
				}
			} else {
				setAuthState("success");
			}
		} catch {
			setAuthState("error");
			setError(t.auth.error.generic);
		} finally {
			setLoadingMethod(null);
		}
	};

	const handleGoogleAuth = async () => {
		if (isLoading) return;
		setError(null);
		setLoadingMethod("google");
		setFocusedField(null);

		try {
			const callbackUrl = new URL("/auth/callback", window.location.origin);
			if (redirectPath !== "/") {
				callbackUrl.searchParams.set("next", redirectPath);
			}

			const { error: oauthError } = await supabase.auth.signInWithOAuth({
				provider: "google",
				options: { redirectTo: callbackUrl.toString() },
			});

			if (oauthError) {
				setAuthState("error");
				setError(t.auth.error.oauthError);
				setLoadingMethod(null);
			}
		} catch {
			setAuthState("error");
			setError(t.auth.error.oauthError);
			setLoadingMethod(null);
		}
	};

	const transition = shouldReduceMotion
		? { duration: 0 }
		: { duration: 0.18, ease: [0.23, 1, 0.32, 1] as const };

	return (
		<main
			data-auth-mode={mode}
			data-has-error={Boolean(error)}
			className={`${
				mode === "login"
					? "auth-lock-screen relative h-[100svh] overflow-hidden"
					: "min-h-[100svh] overflow-x-hidden"
			} pt-[env(safe-area-inset-top)] bg-[rgb(var(--ds-native-background))] text-[rgb(var(--ds-native-bone))] selection:bg-[rgb(var(--ds-native-purple))]/30`}
		>
			<div className="relative mx-auto w-full max-w-[480px]">
				<div
					ref={heroRef}
					className={
						mode === "login"
							? "auth-lock-hero mx-auto pt-[10px]"
							: "w-full pt-[10px]"
					}
				>
					<NativeLoginHero isEditing={isEditing} />
				</div>

				<div
					className={`relative z-10 mx-auto w-[calc(100%-48px)] max-w-[440px] transition-transform [transition-duration:320ms] [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${
						mode === "login" ? "" : "pb-6"
					}`}
					style={{ transform: `translateY(${editingOffset}px)` }}
				>
					<h1
						className={`${
							mode === "login"
								? "auth-lock-title"
								: "mb-[30px] text-[clamp(37px,10.2vw,41px)]"
						} whitespace-pre-line text-center font-session-display font-black uppercase leading-[1.03] tracking-[-0.02em] text-[rgb(var(--ds-native-bone))]`}
					>
						{mode === "login"
							? "Manje priče,\nviše ping-ponga."
							: mode === "register"
								? "Registruj se"
								: "Resetuj lozinku"}
					</h1>

					<AnimatePresence mode="wait" initial={false}>
						{mode === "login" ? (
							<motion.section
								key="login"
								initial={{ opacity: 0, transform: "translateY(8px)" }}
								animate={{ opacity: 1, transform: "translateY(0px)" }}
								exit={{ opacity: 0, transform: "translateY(-6px)" }}
								transition={transition}
							>
								<form onSubmit={handleLogin} className="space-y-[10px]">
									<AuthCapsuleField
										id="auth-email"
										type="email"
										name="email"
										placeholder="Email"
										value={email}
										disabled={isLoading}
										autoComplete="email"
										invalid={!!error}
										describedBy={error ? errorMessageId : undefined}
										onChange={(event) => setEmail(event.target.value)}
										onFocus={() => setFocusedField("email")}
										onBlur={() => setFocusedField(null)}
									/>
									<AuthCapsuleField
										id="auth-password"
										type="password"
										name="password"
										placeholder="Lozinka"
										value={password}
										disabled={isLoading}
										autoComplete="current-password"
										invalid={!!error}
										describedBy={error ? errorMessageId : undefined}
										onChange={(event) => setPassword(event.target.value)}
										onFocus={() => setFocusedField("password")}
										onBlur={() => setFocusedField(null)}
									/>

									{error && (
										<FormError id={errorMessageId} message={error} />
									)}

									<NativePrimaryButton
										isLoading={loadingMethod === "password"}
										disabled={!canLogin}
									>
										Uloguj se
									</NativePrimaryButton>
									<NativeDivider />
									<NativeGoogleButton
										isLoading={loadingMethod === "google"}
										disabled={isLoading}
										onClick={handleGoogleAuth}
									/>
								</form>
							</motion.section>
						) : mode === "register" ? (
							<motion.section
								key="register"
								initial={{ opacity: 0, transform: "translateY(8px)" }}
								animate={{ opacity: 1, transform: "translateY(0px)" }}
								exit={{ opacity: 0, transform: "translateY(-6px)" }}
								transition={transition}
							>
								{authState === "success" ? (
									<div className="space-y-[10px] text-center">
										<div className="rounded-[20px] border border-white/[0.13] bg-[rgb(var(--ds-native-raised))] p-5">
											<p className="font-semibold">
												{t.auth.success.registrationSuccess}
											</p>
											<p className="mt-2 text-sm text-[rgb(var(--ds-native-muted))]">
												{t.auth.success.emailConfirmationSent}{" "}
												{t.auth.success.checkInbox}
											</p>
										</div>
										<Button
											type="button"
											variant="ghost"
											onClick={() => switchMode("login")}
											className="min-h-11 w-full rounded-full"
										>
											{t.auth.backToSignIn}
										</Button>
									</div>
								) : (
									<form onSubmit={handleRegister} className="space-y-[10px]">
										<AuthCapsuleField
											id="auth-full-name"
											type="text"
											name="fullName"
											placeholder={t.auth.fullName}
											value={fullName}
											disabled={isLoading}
											autoComplete="name"
											invalid={!!error}
											describedBy={error ? errorMessageId : undefined}
											onChange={(event) => setFullName(event.target.value)}
											onFocus={() => setFocusedField("fullName")}
											onBlur={() => setFocusedField(null)}
										/>
										<AuthCapsuleField
											id="register-email"
											type="email"
											name="email"
											placeholder="Email"
											value={email}
											disabled={isLoading}
											autoComplete="email"
											invalid={!!error}
											describedBy={error ? errorMessageId : undefined}
											onChange={(event) => setEmail(event.target.value)}
											onFocus={() => setFocusedField("email")}
											onBlur={() => setFocusedField(null)}
										/>
										<AuthCapsuleField
											id="register-password"
											type="password"
											name="password"
											placeholder="Lozinka"
											value={password}
											disabled={isLoading}
											autoComplete="new-password"
											invalid={!!error}
											describedBy={error ? errorMessageId : undefined}
											onChange={(event) => setPassword(event.target.value)}
											onFocus={() => setFocusedField("password")}
											onBlur={() => setFocusedField(null)}
										/>

										{error && (
											<FormError id={errorMessageId} message={error} />
										)}

										<NativePrimaryButton
											isLoading={loadingMethod === "register"}
											disabled={!canRegister}
										>
											Registruj se
										</NativePrimaryButton>
										<Button
											type="button"
											variant="ghost"
											onClick={() => switchMode("login")}
											className="min-h-11 w-full rounded-full"
										>
											{t.auth.backToSignIn}
										</Button>
									</form>
								)}
							</motion.section>
						) : (
							<motion.section
								key="forgot"
								initial={{ opacity: 0, transform: "translateY(8px)" }}
								animate={{ opacity: 1, transform: "translateY(0px)" }}
								exit={{ opacity: 0, transform: "translateY(-6px)" }}
								transition={transition}
								className="space-y-[10px]"
							>
								<p className="pb-2 text-center text-sm leading-relaxed text-[rgb(var(--ds-native-muted))]">
									{t.auth.resetPasswordSubtitle}
								</p>
								<AuthCapsuleField
									id="reset-email"
									type="email"
									name="email"
									placeholder="Email"
									value={email}
									disabled={isLoading}
									autoComplete="email"
									onChange={(event) => setEmail(event.target.value)}
									onFocus={() => setFocusedField("email")}
									onBlur={() => setFocusedField(null)}
								/>
								<NativePrimaryButton isLoading={false} disabled={!email.includes("@")}>
									{t.auth.sendResetLink}
								</NativePrimaryButton>
								<Button
									type="button"
									variant="ghost"
									onClick={() => switchMode("login")}
									className="min-h-11 w-full rounded-full"
								>
									{t.auth.backToSignIn}
								</Button>
							</motion.section>
						)}
					</AnimatePresence>
				</div>
			</div>
		</main>
	);
}
