"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetFooter,
} from "@/components/ui/sheet";
import { t } from "@/lib/i18n";
import type { UserRole } from "@/lib/supabase/admin";

type User = {
	id: string;
	email: string;
	name: string;
	avatar: string | null;
	role: UserRole;
};

type UserEditDrawerProps = {
	user: User | null;
	open: boolean;
	onClose: () => void;
	onSave: (updatedUser: User) => void;
};

export function UserEditDrawer({
	user,
	open,
	onClose,
	onSave,
}: UserEditDrawerProps) {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<UserRole>("user");
	const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [uploadingAvatar, setUploadingAvatar] = useState(false);

	// Initialize form when user changes
	useEffect(() => {
		if (user) {
			setName(user.name);
			setEmail(user.email);
			setRole(user.role);
			setAvatarPreview(user.avatar);
			setError(null);
		}
	}, [user]);

	const handleAvatarChange = async (
		e: React.ChangeEvent<HTMLInputElement>,
	) => {
		const file = e.target.files?.[0];
		if (!file || !user) return;

		// Validate file type
		if (!file.type.startsWith("image/")) {
			setError(t.settings.error.avatarInvalidType);
			return;
		}

		// Validate file size (5MB max)
		if (file.size > 5 * 1024 * 1024) {
			setError(t.settings.error.avatarTooLarge);
			return;
		}

		try {
			setUploadingAvatar(true);
			setError(null);

			// Show preview immediately
			const reader = new FileReader();
			reader.onloadend = () => {
				setAvatarPreview(reader.result as string);
			};
			reader.readAsDataURL(file);

			// Upload avatar using target user's ID in filename
			const fileExt = file.name.split(".").pop();
			const fileName = `${user.id}-${Date.now()}.${fileExt}`;
			const filePath = fileName;

			// Upload to storage (admin has permissions)
			const { error: uploadError } = await supabase.storage
				.from("avatars")
				.upload(filePath, file, {
					cacheControl: "3600",
					upsert: true,
				});

			if (uploadError) {
				console.error("Avatar upload error:", uploadError);
				if (uploadError.message.includes("Bucket not found")) {
					setError(t.settings.error.bucketNotFound);
				} else if (
					uploadError.message.includes(
						"new row violates row-level security",
					)
				) {
					setError(t.settings.error.permissionDenied);
				} else {
					setError(t.settings.error.avatarUploadFailed);
				}
				// Reset preview on error
				setAvatarPreview(user.avatar);
				return;
			}

			// Get public URL
			const {
				data: { publicUrl },
			} = supabase.storage.from("avatars").getPublicUrl(filePath);

			setAvatarPreview(publicUrl);
		} catch (err: any) {
			console.error("Avatar upload error:", err);
			setError(t.settings.error.avatarUploadFailed);
			// Reset preview on error
			setAvatarPreview(user.avatar);
		} finally {
			setUploadingAvatar(false);
		}
	};

	const handleSave = async () => {
		if (!user) return;

		try {
			setSaving(true);
			setError(null);

			// Get current session token
			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				setError(t.admin.users.error.notAuthenticated);
				return;
			}

			// Update user via API
			const response = await fetch(`/api/admin/users/${user.id}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${session.access_token}`,
				},
				body: JSON.stringify({
					name: name.trim(),
					email: email.trim(),
					avatar: avatarPreview,
					role,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				setError(data.error || t.admin.users.error.updateFailed);
				return;
			}

			const data = await response.json();

			// Call onSave callback with updated user (ensure role is included)
			onSave({
				...data.user,
				role: data.user.role || user.role, // Preserve role from original user if not in response
			});

			// Close drawer
			onClose();
		} catch (err) {
			console.error("Error updating user:", err);
			setError(t.admin.users.error.updateFailed);
		} finally {
			setSaving(false);
		}
	};

	const hasChanges =
		user &&
		(name.trim() !== user.name ||
			email.trim() !== user.email ||
			role !== user.role ||
			avatarPreview !== user.avatar);

	if (!user) return null;

	return (
		<Sheet open={open} onOpenChange={(open) => !open && onClose()}>
			<SheetContent side="right" className="w-full sm:max-w-md">
				<SheetHeader>
					<SheetTitle>{t.admin.users.drawer.title}</SheetTitle>
				</SheetHeader>

				<div className="mt-6 space-y-6">
					{/* Error message */}
					{error && (
						<div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2 text-sm text-red-600 dark:text-red-400">
							{error}
						</div>
					)}

					{/* Avatar */}
					<div className="space-y-2">
						<label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">
							{t.settings.avatar}
						</label>
						<div className="flex items-center gap-4">
							<Avatar className="h-16 w-16">
								<AvatarImage
									src={avatarPreview || undefined}
									alt={name}
								/>
								<AvatarFallback>
									{name.charAt(0).toUpperCase()}
								</AvatarFallback>
							</Avatar>
							<div className="flex-1">
								<Input
									type="file"
									accept="image/*"
									onChange={handleAvatarChange}
									disabled={uploadingAvatar || saving}
									className="cursor-pointer"
								/>
								{uploadingAvatar && (
									<p className="text-xs text-muted-foreground mt-1">
										{t.settings.saving}
									</p>
								)}
							</div>
						</div>
					</div>

					{/* Display Name */}
					<Input
						label={t.settings.displayName}
						value={name}
						onChange={(e) => setName(e.target.value)}
						disabled={saving}
					/>

					{/* Email */}
					<div className="space-y-2">
						<Input
							label={t.settings.email}
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							disabled={saving}
						/>
						<p className="text-xs text-muted-foreground ml-1">
							{t.settings.emailConfirmationNotice}
						</p>
					</div>

					{/* Role */}
					<div className="space-y-2">
						<label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">
							{t.admin.users.drawer.role}
						</label>
						<Select
							value={role}
							onValueChange={(value: UserRole) => setRole(value)}
							disabled={saving}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="user">
									{t.admin.users.roles.user}
								</SelectItem>
								<SelectItem value="mod">
									{t.admin.users.roles.mod}
								</SelectItem>
								<SelectItem value="admin">
									{t.admin.users.roles.admin}
								</SelectItem>
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground ml-1">
							{t.admin.users.drawer.roleDescription}
						</p>
					</div>
				</div>

				<SheetFooter className="mt-8">
					<Button
						variant="outline"
						onClick={onClose}
						disabled={saving}
					>
						{t.common.cancel || "Otkaži"}
					</Button>
					<Button
						onClick={handleSave}
						disabled={saving || !hasChanges}
					>
						{saving ? t.settings.saving : t.settings.save}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
