"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Stack } from "@/components/ui/stack";
import { Box } from "@/components/ui/box";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase/client";

/**
 * AuthScreen component
 *
 * Renders login/register UI with all auth functionality.
 * Does NOT handle routing - parent component manages auth state and rendering.
 * When auth succeeds, parent will automatically re-render via onAuthStateChange.
 */
/**
 * Auth state management:
 * - idle: form visible, ready for input
 * - loading: request in progress, buttons disabled with spinner
 * - success: registration success message shown (only for registration)
 * - error: error message shown
 */
type AuthState = "idle" | "loading" | "success" | "error";

export function AuthScreen() {
	const [isLogin, setIsLogin] = useState(true);
	const [showPassword, setShowPassword] = useState(false);
	const [showForgotPassword, setShowForgotPassword] = useState(false);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [fullName, setFullName] = useState("");
	const [authState, setAuthState] = useState<AuthState>("idle");
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const handleLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setAuthState("loading");
		setIsLoading(true);

		try {
			const { error: signInError } =
				await supabase.auth.signInWithPassword({
					email,
					password,
				});

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
				// On success, parent component will detect auth change and render dashboard
			}
		} catch (err) {
			setAuthState("error");
			setError(t.auth.error.generic);
		} finally {
			setIsLoading(false);
		}
	};

	const handleRegister = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setAuthState("loading");
		setIsLoading(true);

		try {
			const { error: signUpError } = await supabase.auth.signUp({
				email,
				password,
				options: {
					data: {
						full_name: fullName,
					},
				},
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
				// Registration successful - show success message
				setAuthState("success");
			}
		} catch (err) {
			setAuthState("error");
			setError(t.auth.error.generic);
		} finally {
			setIsLoading(false);
		}
	};

	const handleGoogleAuth = async () => {
		setError(null);
		setAuthState("loading");
		setIsLoading(true);

		try {
			const { error: oauthError } = await supabase.auth.signInWithOAuth({
				provider: "google",
				options: {
					redirectTo: `${window.location.origin}/auth/callback`,
				},
			});

			if (oauthError) {
				setAuthState("error");
				setError(t.auth.error.oauthError);
				setIsLoading(false);
			}
			// On success, user will be redirected to OAuth provider
			// then back to callback route, which redirects to root
		} catch (err) {
			setAuthState("error");
			setError(t.auth.error.oauthError);
			setIsLoading(false);
		}
	};

	return (
		<Stack
			direction="column"
			className="min-h-screen bg-background text-foreground selection:bg-primary/20"
		>
			<Stack
				direction="column"
				alignItems="center"
				justifyContent="center"
				className="flex-1 px-6 py-12"
			>
				<Stack
					direction="column"
					alignItems="center"
					className="w-full max-w-xs mb-10"
				>
					<Box className="relative group">
						<Box className="absolute -inset-4 bg-red-500/20 blur-3xl rounded-full opacity-50" />
						<Box className="relative w-[60vw] max-w-[320px] h-auto">
							<Image
								src="/logo.png"
								alt={t.logo.alt}
								width={320}
								height={320}
								className="relative w-full h-auto drop-shadow-[0_0_15px_rgba(239,68,68,0.3)] pointer-events-none"
								style={{ height: "auto" }}
							/>
						</Box>
					</Box>
				</Stack>

				<AnimatePresence mode="wait">
					{showForgotPassword ? (
						<motion.div
							key="forgot-password"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							transition={{ duration: 0.2 }}
							className="w-full max-w-sm"
						>
							<Stack direction="column" spacing={4}>
								<Box className="text-center mb-8">
									<h1 className="text-3xl font-bold font-heading tracking-tight mb-2">
										{t.auth.resetPassword}
									</h1>
									<p className="text-muted-foreground">
										{t.auth.resetPasswordSubtitle}
									</p>
								</Box>

								<Stack direction="column" spacing={4}>
									<Input
										type="email"
										label={t.auth.emailAddress}
										icon="solar:letter-bold"
										placeholder="randy.daytona@ping.pong"
									/>

									<Button className="w-full h-14 rounded-full font-bold text-lg shadow-lg shadow-primary/20 active:scale-[0.98] transition-all mt-4">
										<Stack
											direction="row"
											alignItems="center"
											justifyContent="center"
											spacing={2}
										>
											<span>{t.auth.sendResetLink}</span>
											<Icon
												icon="solar:letter-opened-bold"
												className="size-5"
											/>
										</Stack>
									</Button>

									<Box className="text-center mt-4">
										<Button
											type="button"
											variant="ghost"
											onClick={() =>
												setShowForgotPassword(false)
											}
											className="text-sm text-muted-foreground hover:text-foreground transition-colors"
										>
											{t.auth.backToSignIn}
										</Button>
									</Box>
								</Stack>
							</Stack>
						</motion.div>
					) : isLogin ? (
						<motion.div
							key="login"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							transition={{ duration: 0.2 }}
							className="w-full max-w-sm"
						>
							<form onSubmit={handleLogin}>
								<Stack direction="column" spacing={4}>
									<Box className="text-center mb-8">
										<h1 className="text-3xl font-bold font-heading tracking-tight mb-2">
											{t.auth.welcomeBack}
										</h1>
										<p className="text-muted-foreground">
											{t.auth.signInSubtitle}
										</p>
									</Box>

									{error && (
										<Box className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
											<p className="text-sm text-destructive text-center">
												{error}
											</p>
										</Box>
									)}

									<Stack direction="column" spacing={4}>
										<Input
											type="email"
											label={t.auth.emailAddress}
											icon="solar:letter-bold"
											placeholder="randy.daytona@ping.pong"
											value={email}
											onChange={(e) =>
												setEmail(e.target.value)
											}
											required
											disabled={isLoading}
										/>

										<Input
											type={
												showPassword
													? "text"
													: "password"
											}
											label={t.auth.password}
											icon="solar:lock-password-bold"
											placeholder="••••••••••••"
											value={password}
											onChange={(e) =>
												setPassword(e.target.value)
											}
											required
											disabled={isLoading}
											labelAction={
												<button
													type="button"
													onClick={() =>
														setShowForgotPassword(
															true
														)
													}
													className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
												>
													{t.auth.forgot}
												</button>
											}
											rightAction={
												<button
													type="button"
													onClick={() =>
														setShowPassword(
															!showPassword
														)
													}
												>
													<Icon
														icon={
															showPassword
																? "solar:eye-bold"
																: "solar:eye-closed-bold"
														}
														className="size-5 text-muted-foreground hover:text-foreground transition-colors"
													/>
												</button>
											}
										/>

										<Button
											type="submit"
											disabled={isLoading}
											className="w-full h-14 rounded-full font-bold text-lg shadow-lg shadow-primary/20 active:scale-[0.98] transition-all mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
										>
											<Stack
												direction="row"
												alignItems="center"
												justifyContent="center"
												spacing={2}
											>
												{isLoading && (
													<Icon
														icon="solar:refresh-bold"
														className="size-5 animate-spin"
													/>
												)}
												<span>{t.auth.signIn}</span>
												{!isLoading && (
													<Icon
														icon="solar:login-2-bold"
														className="size-5"
													/>
												)}
											</Stack>
										</Button>
									</Stack>
								</Stack>
							</form>
						</motion.div>
					) : authState === "success" ? (
						<motion.div
							key="registration-success"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							transition={{ duration: 0.2 }}
							className="w-full max-w-sm"
						>
							<Stack direction="column" spacing={4}>
								<Box className="text-center mb-8">
									<h1 className="text-3xl font-bold font-heading tracking-tight mb-4">
										{t.auth.success.registrationSuccess}
									</h1>
								</Box>

								<Box className="p-6 rounded-xl bg-card border border-border/50">
									<Stack direction="column" spacing={3}>
										<p className="text-center text-foreground">
											{
												t.auth.success
													.emailConfirmationSent
											}
										</p>
										<p className="text-center text-muted-foreground text-sm">
											{t.auth.success.checkInbox}
										</p>
									</Stack>
								</Box>

								<Box className="text-center mt-4">
									<Button
										variant="link"
										type="button"
										onClick={() => {
											setIsLogin(true);
											setAuthState("idle");
											setError(null);
											setEmail("");
											setPassword("");
											setFullName("");
										}}
										className="text-sm text-muted-foreground hover:text-foreground transition-colors h-auto p-0"
									>
										{t.auth.backToSignIn}
									</Button>
								</Box>
							</Stack>
						</motion.div>
					) : (
						<motion.div
							key="register"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							transition={{ duration: 0.2 }}
							className="w-full max-w-sm"
						>
							<form onSubmit={handleRegister}>
								<Stack direction="column" spacing={4}>
									<Box className="text-center mb-8">
										<h1 className="text-3xl font-bold font-heading tracking-tight mb-2">
											{t.auth.createAccount}
										</h1>
										<p className="text-muted-foreground">
											{t.auth.createAccountSubtitle}
										</p>
									</Box>

									{error && (
										<Box className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
											<p className="text-sm text-destructive text-center">
												{error}
											</p>
										</Box>
									)}

									<Stack direction="column" spacing={4}>
										<Input
											type="text"
											label={t.auth.fullName}
											icon="solar:user-bold"
											placeholder="Randy Daytona"
											value={fullName}
											onChange={(e) =>
												setFullName(e.target.value)
											}
											required
											disabled={isLoading}
										/>

										<Input
											type="email"
											label={t.auth.emailAddress}
											icon="solar:letter-bold"
											placeholder="randy.daytona@ping.pong"
											value={email}
											onChange={(e) =>
												setEmail(e.target.value)
											}
											required
											disabled={isLoading}
										/>

										<Input
											type={
												showPassword
													? "text"
													: "password"
											}
											label={t.auth.password}
											icon="solar:lock-password-bold"
											placeholder="••••••••••••"
											value={password}
											onChange={(e) =>
												setPassword(e.target.value)
											}
											required
											disabled={isLoading}
											rightAction={
												<button
													type="button"
													onClick={() =>
														setShowPassword(
															!showPassword
														)
													}
												>
													<Icon
														icon={
															showPassword
																? "solar:eye-bold"
																: "solar:eye-closed-bold"
														}
														className="size-5 text-muted-foreground hover:text-foreground transition-colors"
													/>
												</button>
											}
										/>

										<Button
											type="submit"
											disabled={isLoading}
											className="w-full h-14 rounded-full font-bold text-lg shadow-lg shadow-primary/20 active:scale-[0.98] transition-all mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
										>
											<Stack
												direction="row"
												alignItems="center"
												justifyContent="center"
												spacing={2}
											>
												{isLoading && (
													<Icon
														icon="solar:refresh-bold"
														className="size-5 animate-spin"
													/>
												)}
												<span>
													{t.auth.createAccount}
												</span>
												{!isLoading && (
													<Icon
														icon="solar:user-plus-bold"
														className="size-5"
													/>
												)}
											</Stack>
										</Button>
									</Stack>
								</Stack>
							</form>
						</motion.div>
					)}
				</AnimatePresence>

				{/* Hide OAuth section when showing registration success */}
				{!(authState === "success" && !isLogin) && (
					<Box className="w-full max-w-sm mt-6">
						<Stack
							direction="row"
							alignItems="center"
							spacing={4}
							className="py-4"
						>
							<Box className="flex-1 h-px bg-border/50" />
							<span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
								{t.auth.orContinueWith}
							</span>
							<Box className="flex-1 h-px bg-border/50" />
						</Stack>
						<Button
							variant="secondary"
							type="button"
							onClick={handleGoogleAuth}
							disabled={isLoading}
							className="w-full h-12 border border-border/50 rounded-xl active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
						>
							<Stack
								direction="row"
								alignItems="center"
								justifyContent="center"
								spacing={2}
							>
								{isLoading ? (
									<Icon
										icon="solar:refresh-bold"
										className="size-5 animate-spin"
									/>
								) : (
									<Icon
										icon="logos:google-icon"
										className="size-5"
									/>
								)}
								<span>Google</span>
							</Stack>
						</Button>
					</Box>
				)}

				{/* Hide toggle when showing registration success */}
				{!(authState === "success" && !isLogin) && (
					<Box className="mt-auto pt-8">
						<p className="text-sm text-muted-foreground">
							{isLogin
								? t.auth.dontHaveAccount
								: t.auth.alreadyHaveAccount}
							<Button
								variant="link"
								type="button"
								onClick={() => {
									setIsLogin(!isLogin);
									setAuthState("idle");
									setError(null);
									setEmail("");
									setPassword("");
									setFullName("");
								}}
								disabled={isLoading}
								className="ml-1 font-bold text-primary hover:underline transition-all h-auto p-0 disabled:opacity-50"
							>
								{isLogin ? t.auth.createAccount : t.auth.signIn}
							</Button>
						</p>
					</Box>
				)}
			</Stack>

			<Box className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
				<Box className="absolute -top-24 -right-24 size-64 bg-primary/10 blur-[100px] rounded-full" />
				<Box className="absolute top-1/2 -left-32 size-96 bg-primary/5 blur-[120px] rounded-full" />
			</Box>
		</Stack>
	);
}
