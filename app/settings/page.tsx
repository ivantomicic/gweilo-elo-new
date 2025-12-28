"use client";

import { useState, useEffect } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Stack } from "@/components/ui/stack";
import { Box } from "@/components/ui/box";
import { Icon } from "@/components/ui/icon";
import { t } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import {
	updateDisplayName,
	updateEmail,
	updatePassword,
	uploadAvatar,
} from "@/lib/supabase/user";

export default function SettingsPage() {
	const [user, setUser] = useState<{
		name: string;
		email: string;
		avatar: string | null;
	} | null>(null);

	// Profile state
	const [displayName, setDisplayName] = useState("");
	const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
	const [savingProfile, setSavingProfile] = useState(false);
	const [profileError, setProfileError] = useState<string | null>(null);
	const [profileSuccess, setProfileSuccess] = useState(false);
	const [profileHasChanges, setProfileHasChanges] = useState(false);

	// Email state
	const [email, setEmail] = useState("");
	const [savingEmail, setSavingEmail] = useState(false);
	const [emailError, setEmailError] = useState<string | null>(null);
	const [emailSuccess, setEmailSuccess] = useState(false);
	const [emailHasChanges, setEmailHasChanges] = useState(false);

	// Password state
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [savingPassword, setSavingPassword] = useState(false);
	const [passwordError, setPasswordError] = useState<string | null>(null);
	const [passwordSuccess, setPasswordSuccess] = useState(false);
	const [passwordHasChanges, setPasswordHasChanges] = useState(false);

	// Combined account changes (display name, email, or password)
	const accountHasChanges =
		profileHasChanges || emailHasChanges || passwordHasChanges;
	const savingAccount = savingProfile || savingEmail || savingPassword;

	useEffect(() => {
		const fetchUser = async () => {
			const currentUser = await getCurrentUser();
			if (currentUser) {
				setUser(currentUser);
				setDisplayName(currentUser.name);
				setEmail(currentUser.email);
				setAvatarPreview(currentUser.avatar);
			}
		};
		fetchUser();
	}, []);

	// Track changes
	useEffect(() => {
		if (user) {
			setProfileHasChanges(displayName.trim() !== user.name);
		}
	}, [displayName, user]);

	useEffect(() => {
		if (user) {
			setEmailHasChanges(email.trim() !== user.email);
		}
	}, [email, user]);

	useEffect(() => {
		setPasswordHasChanges(
			newPassword.length > 0 || confirmPassword.length > 0
		);
	}, [newPassword, confirmPassword]);

	const handleAvatarChange = async (
		e: React.ChangeEvent<HTMLInputElement>
	) => {
		const file = e.target.files?.[0];
		if (!file) return;

		try {
			setProfileError(null);
			setSavingProfile(true);

			// Show preview
			const reader = new FileReader();
			reader.onloadend = () => {
				setAvatarPreview(reader.result as string);
			};
			reader.readAsDataURL(file);

			// Upload to Supabase
			const avatarUrl = await uploadAvatar(file);
			setAvatarPreview(avatarUrl);

			// Refresh user data
			const updatedUser = await getCurrentUser();
			if (updatedUser) {
				setUser(updatedUser);
			}

			setProfileSuccess(true);
			setTimeout(() => setProfileSuccess(false), 3000);
		} catch (error: any) {
			console.error("Avatar upload error:", error);
			if (error.message === "INVALID_TYPE") {
				setProfileError(t.settings.error.avatarInvalidType);
			} else if (error.message === "TOO_LARGE") {
				setProfileError(t.settings.error.avatarTooLarge);
			} else if (error.message.includes("BUCKET_NOT_FOUND")) {
				setProfileError(t.settings.error.bucketNotFound);
			} else if (error.message.includes("PERMISSION_DENIED")) {
				setProfileError(t.settings.error.permissionDenied);
			} else {
				const errorMsg = error.message?.includes("UPLOAD_FAILED")
					? error.message.replace("UPLOAD_FAILED: ", "")
					: t.settings.error.avatarUploadFailed;
				setProfileError(errorMsg);
			}
		} finally {
			setSavingProfile(false);
		}
	};

	const handleSaveProfile = async () => {
		if (!displayName.trim() || !profileHasChanges) return;

		try {
			setProfileError(null);
			setSavingProfile(true);

			await updateDisplayName(displayName.trim());

			// Refresh user data
			const updatedUser = await getCurrentUser();
			if (updatedUser) {
				setUser(updatedUser);
				setProfileHasChanges(false);
			}

			setProfileSuccess(true);
			setTimeout(() => setProfileSuccess(false), 3000);
		} catch (error: any) {
			setProfileError(t.settings.error.generic);
		} finally {
			setSavingProfile(false);
		}
	};

	const handleSaveEmail = async () => {
		if (!email.trim() || !emailHasChanges) return;

		try {
			setEmailError(null);
			setSavingEmail(true);

			await updateEmail(email.trim());

			setEmailSuccess(true);
			setEmailHasChanges(false);
			setTimeout(() => setEmailSuccess(false), 5000);
		} catch (error: any) {
			if (error.message === "REAUTH_REQUIRED") {
				setEmailError(t.settings.error.reauthRequired);
			} else if (error.message.includes("email")) {
				setEmailError(t.settings.error.invalidEmail);
			} else {
				setEmailError(t.settings.error.generic);
			}
		} finally {
			setSavingEmail(false);
		}
	};

	const handleSavePassword = async () => {
		if (!newPassword || !confirmPassword) return;

		if (newPassword !== confirmPassword) {
			setPasswordError(t.settings.error.passwordMismatch);
			return;
		}

		if (newPassword.length < 6) {
			setPasswordError(t.settings.error.weakPassword);
			return;
		}

		try {
			setPasswordError(null);
			setSavingPassword(true);

			await updatePassword(newPassword);

			setPasswordSuccess(true);
			setNewPassword("");
			setConfirmPassword("");
			setPasswordHasChanges(false);
			setTimeout(() => setPasswordSuccess(false), 3000);
		} catch (error: any) {
			if (error.message === "REAUTH_REQUIRED") {
				setPasswordError(t.settings.error.reauthRequired);
			} else {
				setPasswordError(t.settings.error.generic);
			}
		} finally {
			setSavingPassword(false);
		}
	};

	const handleSaveAccount = async () => {
		// Save display name if changed
		if (profileHasChanges) {
			await handleSaveProfile();
		}
		// Save email if changed
		if (emailHasChanges) {
			await handleSaveEmail();
		}
		// Save password if changed
		if (passwordHasChanges && newPassword && confirmPassword) {
			await handleSavePassword();
		}
	};

	if (!user) {
		return (
			<SidebarProvider>
				<AppSidebar variant="inset" />
				<SidebarInset>
					<SiteHeader title={t.pages.settings} />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
								<div className="px-4 lg:px-6">
									<p className="text-muted-foreground">
										Učitavanje...
									</p>
								</div>
							</div>
						</div>
					</div>
				</SidebarInset>
			</SidebarProvider>
		);
	}

	return (
		<SidebarProvider>
			<AppSidebar variant="inset" />
			<SidebarInset>
				<SiteHeader title={t.pages.settings} />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2">
						<div className="flex flex-col py-8 md:py-12">
							<div className="px-4 lg:px-6">
								<div className="max-w-2xl mx-auto">
									<Stack direction="column" spacing={12}>
										{/* Profile Section - Centered */}
										<Stack
											direction="column"
											alignItems="center"
											spacing={6}
										>
											{/* Avatar with camera button */}
											<Box className="relative">
												<label>
													<input
														type="file"
														accept="image/*"
														onChange={
															handleAvatarChange
														}
														className="hidden"
														disabled={savingProfile}
														id="avatar-upload"
													/>
													<Box className="relative group cursor-pointer">
														<Box className="size-32 rounded-full overflow-hidden border-2 border-primary/20 bg-card p-1">
															{avatarPreview ||
															user.avatar ? (
																<img
																	src={
																		avatarPreview ||
																		user.avatar ||
																		undefined
																	}
																	alt={
																		user.name
																	}
																	className="size-full rounded-full object-cover"
																/>
															) : (
																<Box className="size-full rounded-full bg-card border border-border flex items-center justify-center">
																	<span className="text-4xl font-bold text-muted-foreground">
																		{user.name
																			.charAt(
																				0
																			)
																			.toUpperCase()}
																	</span>
																</Box>
															)}
														</Box>
														<Button
															type="button"
															className="absolute bottom-0 right-0 bg-primary text-primary-foreground size-10 rounded-full flex items-center justify-center border-4 border-background shadow-lg active:scale-95 transition-transform p-0"
															onClick={() =>
																document
																	.getElementById(
																		"avatar-upload"
																	)
																	?.click()
															}
															disabled={
																savingProfile
															}
														>
															<Icon
																icon="solar:camera-bold"
																className="size-5"
															/>
														</Button>
													</Box>
												</label>
											</Box>
										</Stack>

										{/* Divider - Gradient style */}
										<Box className="h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

										{/* Account Section */}
										<Stack direction="column" spacing={8}>
											<Stack
												direction="column"
												spacing={6}
											>
												{/* Display Name */}
												<Input
													type="text"
													label={
														t.settings.displayName
													}
													value={displayName}
													onChange={(e) =>
														setDisplayName(
															e.target.value
														)
													}
													disabled={savingProfile}
													icon="solar:user-bold"
													placeholder={user.name}
												/>

												{/* Display name feedback */}
												{profileError && (
													<Box className="text-sm text-destructive">
														{profileError}
													</Box>
												)}
												{profileSuccess && (
													<Box className="text-sm text-green-500">
														{t.settings.saved}
													</Box>
												)}

												{/* Email */}
												<Input
													type="email"
													label={t.auth.emailAddress}
													value={email}
													onChange={(e) =>
														setEmail(e.target.value)
													}
													disabled={savingEmail}
													icon="solar:letter-bold"
												/>

												{emailSuccess && (
													<Box className="text-sm text-green-500 space-y-1">
														<Box>
															{t.settings.saved}
														</Box>
														<Box className="text-muted-foreground text-xs">
															{
																t.settings
																	.emailConfirmationNotice
															}
														</Box>
													</Box>
												)}
												{emailError && (
													<Box className="text-sm text-destructive">
														{emailError}
													</Box>
												)}

												<Stack
													direction="column"
													spacing={3}
												>
													<Input
														type="password"
														label={
															t.settings
																.newPassword
														}
														value={newPassword}
														onChange={(e) =>
															setNewPassword(
																e.target.value
															)
														}
														disabled={
															savingPassword
														}
														icon="solar:lock-password-bold"
														placeholder={
															t.settings
																.newPassword
														}
													/>
													{newPassword.length > 0 && (
														<Input
															type="password"
															label={
																t.settings
																	.confirmPassword
															}
															value={
																confirmPassword
															}
															onChange={(e) =>
																setConfirmPassword(
																	e.target
																		.value
																)
															}
															disabled={
																savingPassword
															}
															icon="solar:lock-password-bold"
															placeholder={
																t.settings
																	.confirmPassword
															}
														/>
													)}
												</Stack>

												{passwordSuccess && (
													<Box className="text-sm text-green-500">
														{t.settings.saved}
													</Box>
												)}
												{passwordError && (
													<Box className="text-sm text-destructive">
														{passwordError}
													</Box>
												)}

												{/* Combined Account Save Button */}
												<Box className="pt-4">
													<Button
														onClick={
															handleSaveAccount
														}
														disabled={
															savingAccount ||
															!accountHasChanges
														}
														className="w-full py-4 rounded-2xl font-bold text-lg shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
													>
														<Stack
															direction="row"
															alignItems="center"
															spacing={2}
														>
															{savingAccount && (
																<Icon
																	icon="solar:refresh-bold"
																	className="size-6 animate-spin"
																/>
															)}
															{!savingAccount && (
																<Icon
																	icon="solar:check-read-bold"
																	className="size-6"
																/>
															)}
															<span>
																{savingAccount
																	? t.settings
																			.saving
																	: t.settings
																			.saveChanges}
															</span>
														</Stack>
													</Button>
												</Box>
											</Stack>
										</Stack>
									</Stack>
								</div>
							</div>
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
