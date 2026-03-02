"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Box } from "@/components/ui/box";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loading } from "@/components/ui/loading";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { t } from "@/lib/i18n";

type AdminUser = {
	id: string;
	name: string;
	email: string;
	avatar: string | null;
};

type Commitment = {
	id: string;
	user: {
		id: string;
		name: string;
		avatar: string | null;
	};
	daysPerWeek: number;
	weightPerMiss: number;
	validFrom: string;
	validTo: string | null;
	isActive: boolean;
};

type CommitmentsAdminPanelProps = {
	onCommitmentSaved?: () => void;
};

const formatDate = (dateString: string | null): string => {
	if (!dateString) {
		return "—";
	}

	const date = new Date(dateString);
	if (Number.isNaN(date.getTime())) {
		return dateString;
	}
	return date.toLocaleDateString("sr-Latn-RS", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
};

const todayIso = () => new Date().toISOString().slice(0, 10);

export function CommitmentsAdminPanel({ onCommitmentSaved }: CommitmentsAdminPanelProps) {
	const [users, setUsers] = useState<AdminUser[]>([]);
	const [commitments, setCommitments] = useState<Commitment[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedUserId, setSelectedUserId] = useState<string>("");
	const [daysPerWeek, setDaysPerWeek] = useState<string>("1");
	const [validFrom, setValidFrom] = useState<string>(todayIso());

	const fetchData = async () => {
		try {
			setLoading(true);
			setError(null);

			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				setError(t.ispale.error.notAuthenticated);
				return;
			}

			const [usersResponse, commitmentsResponse] = await Promise.all([
				fetch("/api/admin/users?excludeGuests=true", {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				}),
				fetch("/api/no-shows/commitments", {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				}),
			]);

			if (!usersResponse.ok || !commitmentsResponse.ok) {
				setError(t.ispale.commitments.error.fetchFailed);
				return;
			}

			const usersPayload = await usersResponse.json();
			const commitmentsPayload = await commitmentsResponse.json();

			const fetchedUsers = (usersPayload.users || []) as AdminUser[];
			setUsers(
				fetchedUsers
					.filter((user) => user.id)
					.sort((a, b) => a.name.localeCompare(b.name)),
			);

			const fetchedCommitments = (commitmentsPayload.commitments || []) as Commitment[];
			setCommitments(fetchedCommitments);

			if (!selectedUserId && fetchedUsers.length > 0) {
				setSelectedUserId(fetchedUsers[0].id);
			}
		} catch (err) {
			console.error("Error fetching commitments admin data:", err);
			setError(t.ispale.commitments.error.fetchFailed);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchData();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const activeByUser = useMemo(() => {
		const map = new Map<string, Commitment>();
		for (const commitment of commitments) {
			if (commitment.isActive) {
				map.set(commitment.user.id, commitment);
			}
		}
		return map;
	}, [commitments]);

	const sortedCommitments = useMemo(() => {
		return [...commitments].sort((a, b) => {
			const nameOrder = a.user.name.localeCompare(b.user.name);
			if (nameOrder !== 0) {
				return nameOrder;
			}
			return b.validFrom.localeCompare(a.validFrom);
		});
	}, [commitments]);

	const today = todayIso();

	const handleSave = async () => {
		if (!selectedUserId || !validFrom || !daysPerWeek) {
			setError(t.ispale.commitments.error.missingRequired);
			return;
		}

		try {
			setSaving(true);
			setError(null);

			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				setError(t.ispale.error.notAuthenticated);
				return;
			}

			const response = await fetch("/api/no-shows/commitments", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${session.access_token}`,
				},
				body: JSON.stringify({
					userId: selectedUserId,
					daysPerWeek: Number(daysPerWeek),
					validFrom,
				}),
			});

			if (!response.ok) {
				const payload = await response.json().catch(() => ({ error: null }));
				setError(payload.error || t.ispale.commitments.error.saveFailed);
				return;
			}

			await fetchData();
			if (onCommitmentSaved) {
				onCommitmentSaved();
			}
		} catch (err) {
			console.error("Error saving no-show commitment:", err);
			setError(t.ispale.commitments.error.saveFailed);
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return (
			<div className="rounded-lg border border-border/50 bg-card p-6">
				<Loading inline label={t.ispale.commitments.loading} />
			</div>
		);
	}

	return (
		<div className="space-y-4 rounded-lg border border-border/50 bg-card p-4 md:p-6">
			<div>
				<h3 className="text-lg font-semibold">{t.ispale.commitments.title}</h3>
				<p className="text-sm text-muted-foreground">{t.ispale.commitments.description}</p>
			</div>

			<Box className="rounded-lg border border-border/40 p-4 space-y-4">
				<div className="grid gap-3 md:grid-cols-4">
					<div className="space-y-2 md:col-span-2">
						<label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">
							{t.ispale.commitments.form.player}
						</label>
						<Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={saving}>
							<SelectTrigger>
								<SelectValue placeholder={t.ispale.commitments.form.playerPlaceholder} />
							</SelectTrigger>
							<SelectContent>
								{users.map((user) => (
									<SelectItem key={user.id} value={user.id}>
										{user.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">
							{t.ispale.commitments.form.daysPerWeek}
						</label>
						<Select value={daysPerWeek} onValueChange={setDaysPerWeek} disabled={saving}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{Array.from({ length: 7 }, (_, idx) => {
									const value = String(idx + 1);
									return (
										<SelectItem key={value} value={value}>
											{value}
										</SelectItem>
									);
								})}
							</SelectContent>
						</Select>
					</div>

					<Input
						label={t.ispale.commitments.form.effectiveFrom}
						type="date"
						value={validFrom}
						onChange={(event) => setValidFrom(event.target.value)}
						disabled={saving}
					/>
				</div>

				<Button onClick={handleSave} disabled={saving || !selectedUserId || !validFrom}>
					{saving ? t.settings.saving : t.ispale.commitments.form.save}
				</Button>
			</Box>

			{error && <p className="text-sm text-destructive">{error}</p>}

			<div className="rounded-lg border border-border/40 overflow-hidden">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t.ispale.commitments.table.player}</TableHead>
							<TableHead>{t.ispale.commitments.table.daysPerWeek}</TableHead>
							<TableHead>{t.ispale.commitments.table.weight}</TableHead>
							<TableHead>{t.ispale.commitments.table.validFrom}</TableHead>
							<TableHead>{t.ispale.commitments.table.validTo}</TableHead>
							<TableHead>{t.ispale.commitments.table.status}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{sortedCommitments.length === 0 ? (
							<TableRow>
								<TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
									{t.ispale.commitments.noCommitments}
								</TableCell>
							</TableRow>
						) : (
							sortedCommitments.map((commitment) => {
								const status = commitment.isActive
									? t.ispale.commitments.status.active
									: commitment.validFrom > today
										? t.ispale.commitments.status.upcoming
										: t.ispale.commitments.status.past;

								return (
									<TableRow key={commitment.id}>
										<TableCell className="font-medium">{commitment.user.name}</TableCell>
										<TableCell>{commitment.daysPerWeek}</TableCell>
										<TableCell>{commitment.weightPerMiss.toFixed(4)}</TableCell>
										<TableCell>{formatDate(commitment.validFrom)}</TableCell>
										<TableCell>{formatDate(commitment.validTo)}</TableCell>
										<TableCell>{status}</TableCell>
									</TableRow>
								);
							})
						)}
					</TableBody>
				</Table>
			</div>

			<div className="text-xs text-muted-foreground">
				{t.ispale.commitments.formula}
			</div>

			{activeByUser.size > 0 && (
				<div className="text-xs text-muted-foreground">
					{t.ispale.commitments.activeCount(activeByUser.size)}
				</div>
			)}
		</div>
	);
}
