"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetFooter,
} from "@/components/ui/sheet";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { t } from "@/lib/i18n";

type User = {
	id: string;
	email: string;
	name: string;
	avatar: string | null;
};

type AddNoShowDrawerProps = {
	open: boolean;
	onClose: () => void;
	onInsertSuccess?: () => void;
};

export function AddNoShowDrawer({
	open,
	onClose,
	onInsertSuccess,
}: AddNoShowDrawerProps) {
	const [users, setUsers] = useState<User[]>([]);
	const [selectedUserId, setSelectedUserId] = useState<string>("");
	const [date, setDate] = useState<string>("");
	const [reason, setReason] = useState<string>("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [loadingUsers, setLoadingUsers] = useState(false);

	// Fetch users for dropdown
	useEffect(() => {
		if (open) {
			fetchUsers();
		}
	}, [open]);

	// Reset form when drawer opens/closes
	useEffect(() => {
		if (!open) {
			setSelectedUserId("");
			setDate("");
			setReason("");
			setError(null);
		} else {
			// Set default date to today
			const today = new Date().toISOString().split("T")[0];
			setDate(today);
		}
	}, [open]);

	const fetchUsers = async () => {
		try {
			setLoadingUsers(true);
			setError(null);

			// Get current session token
			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				setError(t.ispale.error.notAuthenticated);
				return;
			}

			// Fetch users from admin API (admin-only endpoint, but we're in admin context)
			const response = await fetch("/api/admin/users", {
				headers: {
					Authorization: `Bearer ${session.access_token}`,
				},
			});

			if (!response.ok) {
				setError(t.ispale.error.unauthorized);
				return;
			}

			const data = await response.json();
			setUsers(data.users || []);
		} catch (err) {
			console.error("Error fetching users:", err);
			setError(t.ispale.error.fetchFailed);
		} finally {
			setLoadingUsers(false);
		}
	};

	const handleSave = async () => {
		if (!selectedUserId || !date) {
			setError("Molimo popunite sva obavezna polja");
			return;
		}

		try {
			setSaving(true);
			setError(null);

			// Get current session token
			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				setError(t.ispale.error.notAuthenticated);
				return;
			}

			// Create no-show via API
			const response = await fetch("/api/ispale", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${session.access_token}`,
				},
				body: JSON.stringify({
					userId: selectedUserId,
					date: date,
					reason: reason.trim() || null,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				setError(data.error || t.ispale.error.createFailed);
				return;
			}

			// Success - close drawer and trigger refetch
			onClose();
			if (onInsertSuccess) {
				onInsertSuccess();
			}
		} catch (err) {
			console.error("Error creating no-show:", err);
			setError(t.ispale.error.createFailed);
		} finally {
			setSaving(false);
		}
	};

	const hasChanges = selectedUserId !== "" && date !== "";

	return (
		<Sheet open={open} onOpenChange={(open) => !open && onClose()}>
			<SheetContent side="right" className="w-full sm:max-w-md">
				<SheetHeader>
					<SheetTitle>{t.ispale.drawer.title}</SheetTitle>
				</SheetHeader>

				<div className="mt-6 space-y-6">
					{/* Error message */}
					{error && (
						<div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2 text-sm text-red-600 dark:text-red-400">
							{error}
						</div>
					)}

					{/* Player Select */}
					<div className="space-y-2">
						<label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">
							{t.ispale.drawer.player}
						</label>
						<Select
							value={selectedUserId}
							onValueChange={setSelectedUserId}
							disabled={saving || loadingUsers}
						>
							<SelectTrigger>
								<SelectValue placeholder={t.ispale.drawer.playerPlaceholder} />
							</SelectTrigger>
							<SelectContent>
								{loadingUsers ? (
									<SelectItem value="loading" disabled>
										{t.ispale.loading}
									</SelectItem>
								) : (
									users.map((user) => (
										<SelectItem key={user.id} value={user.id}>
											{user.name}
										</SelectItem>
									))
								)}
							</SelectContent>
						</Select>
					</div>

					{/* Date */}
					<Input
						label={t.ispale.drawer.date}
						type="date"
						value={date}
						onChange={(e) => setDate(e.target.value)}
						disabled={saving}
					/>

					{/* Reason */}
					<div className="space-y-2">
						<Input
							label={t.ispale.drawer.reason}
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							placeholder={t.ispale.drawer.reasonPlaceholder}
							disabled={saving}
						/>
					</div>
				</div>

				<SheetFooter className="mt-8">
					<Button variant="outline" onClick={onClose} disabled={saving}>
						{t.common.cancel}
					</Button>
					<Button onClick={handleSave} disabled={saving || !hasChanges}>
						{saving ? t.settings.saving : t.settings.save}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

