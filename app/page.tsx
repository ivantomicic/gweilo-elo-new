"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Stack } from "@/components/ui/stack";
import { Box } from "@/components/ui/box";

export default function AuthPage() {
	const [isLogin, setIsLogin] = useState(true);
	const [showPassword, setShowPassword] = useState(false);
	const [showForgotPassword, setShowForgotPassword] = useState(false);

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
								alt="GWEILO NS Logo"
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
										Reset Password
									</h1>
									<p className="text-muted-foreground">
										Enter your email to receive a password
										reset link
									</p>
								</Box>

								<Stack direction="column" spacing={4}>
									<Input
										type="email"
										label="Email Address"
										icon="solar:letter-bold"
										placeholder="alex.chen@example.com"
									/>

									<button className="w-full h-14 bg-primary text-primary-foreground rounded-full font-bold text-lg shadow-lg shadow-primary/20 active:scale-[0.98] transition-all mt-4">
										<Stack
											direction="row"
											alignItems="center"
											justifyContent="center"
											spacing={2}
										>
											<span>Send Reset Link</span>
											<Icon
												icon="solar:letter-opened-bold"
												className="size-5"
											/>
										</Stack>
									</button>

									<Box className="text-center mt-4">
										<button
											type="button"
											onClick={() =>
												setShowForgotPassword(false)
											}
											className="text-sm text-muted-foreground hover:text-foreground transition-colors"
										>
											← Back to Sign In
										</button>
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
							<Stack direction="column" spacing={4}>
								<Box className="text-center mb-8">
									<h1 className="text-3xl font-bold font-heading tracking-tight mb-2">
										Welcome Back
									</h1>
									<p className="text-muted-foreground">
										Sign in to track your matches and stats
									</p>
								</Box>

								<Stack direction="column" spacing={4}>
									<Input
										type="email"
										label="Email Address"
										icon="solar:letter-bold"
										placeholder="alex.chen@example.com"
									/>

									<Input
										type={
											showPassword ? "text" : "password"
										}
										label="Password"
										icon="solar:lock-password-bold"
										placeholder="••••••••••••"
										labelAction={
											<button
												type="button"
												onClick={() =>
													setShowForgotPassword(true)
												}
												className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
											>
												Forgot?
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

									<button className="w-full h-14 bg-primary text-primary-foreground rounded-full font-bold text-lg shadow-lg shadow-primary/20 active:scale-[0.98] transition-all mt-4">
										<Stack
											direction="row"
											alignItems="center"
											justifyContent="center"
											spacing={2}
										>
											<span>Sign In</span>
											<Icon
												icon="solar:login-2-bold"
												className="size-5"
											/>
										</Stack>
									</button>
								</Stack>
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
							<Stack direction="column" spacing={4}>
								<Box className="text-center mb-8">
									<h1 className="text-3xl font-bold font-heading tracking-tight mb-2">
										Create Account
									</h1>
									<p className="text-muted-foreground">
										Join to start tracking your matches
									</p>
								</Box>

								<Stack direction="column" spacing={4}>
									<Input
										type="text"
										label="Full Name"
										icon="solar:user-bold"
										placeholder="Alex Chen"
									/>

									<Input
										type="email"
										label="Email Address"
										icon="solar:letter-bold"
										placeholder="alex.chen@example.com"
									/>

									<Input
										type={
											showPassword ? "text" : "password"
										}
										label="Password"
										icon="solar:lock-password-bold"
										placeholder="••••••••••••"
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

									<button className="w-full h-14 bg-primary text-primary-foreground rounded-full font-bold text-lg shadow-lg shadow-primary/20 active:scale-[0.98] transition-all mt-4">
										<Stack
											direction="row"
											alignItems="center"
											justifyContent="center"
											spacing={2}
										>
											<span>Create Account</span>
											<Icon
												icon="solar:user-plus-bold"
												className="size-5"
											/>
										</Stack>
									</button>
								</Stack>
							</Stack>
						</motion.div>
					)}
				</AnimatePresence>

				<Box className="w-full max-w-sm mt-6">
					<Stack
						direction="row"
						alignItems="center"
						spacing={4}
						className="py-4"
					>
						<Box className="flex-1 h-px bg-border/50" />
						<span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
							Or continue with
						</span>
						<Box className="flex-1 h-px bg-border/50" />
					</Stack>
					<div className="grid grid-cols-2 gap-3">
						<button className="h-12 bg-secondary border border-border/50 rounded-xl active:scale-[0.98] transition-all">
							<Stack
								direction="row"
								alignItems="center"
								justifyContent="center"
							>
								<Icon
									icon="logos:apple"
									className="size-5 invert"
								/>
							</Stack>
						</button>
						<button className="h-12 bg-secondary border border-border/50 rounded-xl active:scale-[0.98] transition-all">
							<Stack
								direction="row"
								alignItems="center"
								justifyContent="center"
							>
								<Icon
									icon="logos:google-icon"
									className="size-5"
								/>
							</Stack>
						</button>
					</div>
				</Box>

				<Box className="mt-auto pt-8">
					<p className="text-sm text-muted-foreground">
						{isLogin
							? "Don't have an account?"
							: "Already have an account?"}
						<button
							onClick={() => setIsLogin(!isLogin)}
							className="ml-1 font-bold text-primary hover:underline transition-all"
						>
							{isLogin ? "Create Account" : "Sign In"}
						</button>
					</p>
				</Box>
			</Stack>

			<Box className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
				<Box className="absolute -top-24 -right-24 size-64 bg-primary/10 blur-[100px] rounded-full" />
				<Box className="absolute top-1/2 -left-32 size-96 bg-primary/5 blur-[120px] rounded-full" />
			</Box>
		</Stack>
	);
}
