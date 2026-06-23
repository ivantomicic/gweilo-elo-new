"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { SheetForm } from "@/components/ui/sheet-form";
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
			const response = await fetch("/api/no-shows", {
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
		<SheetForm
			open={open}
			onClose={onClose}
			title={t.ispale.drawer.title}
			error={error}
			onSubmit={handleSave}
			cancelLabel={t.common.cancel}
			submitLabel={t.settings.save}
			submittingLabel={t.settings.saving}
			submitting={saving}
			submitDisabled={!hasChanges}
		>
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
						<SelectValue
							placeholder={t.ispale.drawer.playerPlaceholder}
						/>
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
		</SheetForm>
	);
}
