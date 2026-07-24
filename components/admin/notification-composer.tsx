"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRingIcon, SendIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/vendor/shadcn/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/vendor/shadcn/card";
import { Checkbox } from "@/components/vendor/shadcn/checkbox";
import { Input } from "@/components/vendor/shadcn/input";
import { Label } from "@/components/vendor/shadcn/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/vendor/shadcn/select";
import { useAuth } from "@/lib/auth/useAuth";

type AudienceType = "all" | "session" | "users";

type AdminUser = {
	id: string;
	name: string;
	email: string;
};

export function NotificationComposer() {
	const { session } = useAuth();
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [audienceType, setAudienceType] = useState<AudienceType>("all");
	const [users, setUsers] = useState<AdminUser[]>([]);
	const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
	const [isSending, setIsSending] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	useEffect(() => {
		if (!session?.access_token) return;
		const headers = { Authorization: `Bearer ${session.access_token}` };
		void Promise.all([
			fetch("/api/admin/users?excludeGuests=true", { headers }).then(
				(response) => response.json(),
			),
			fetch("/api/sessions/active", { headers }).then((response) =>
				response.json(),
			),
		])
			.then(([usersBody, sessionBody]) => {
				setUsers((usersBody.users || []) as AdminUser[]);
				setActiveSessionId(sessionBody.session?.id || null);
			})
			.catch(() => setMessage("Could not load notification audiences."));
	}, [session?.access_token]);

	const audienceDescription = useMemo(() => {
		switch (audienceType) {
			case "all":
				return "Every registered user who allows announcements.";
			case "session":
				return activeSessionId
					? "Players participating in the currently active session."
					: "There is no active session right now.";
			case "users":
				return `${selectedUserIds.length} selected user${
					selectedUserIds.length === 1 ? "" : "s"
				}.`;
		}
	}, [activeSessionId, audienceType, selectedUserIds.length]);

	const canSend =
		title.trim().length > 0 &&
		body.trim().length > 0 &&
		(audienceType !== "session" || activeSessionId !== null) &&
		(audienceType !== "users" || selectedUserIds.length > 0);

	const toggleUser = (userId: string, checked: boolean) => {
		setSelectedUserIds((current) =>
			checked
				? Array.from(new Set([...current, userId]))
				: current.filter((id) => id !== userId),
		);
	};

	const send = async () => {
		if (!canSend || !session?.access_token) return;
		setIsSending(true);
		setMessage(null);
		const audience =
			audienceType === "all"
				? { type: "all" as const }
				: audienceType === "session"
					? {
							type: "session" as const,
							sessionId: activeSessionId!,
						}
					: {
							type: "users" as const,
							userIds: selectedUserIds,
						};
		try {
			const response = await fetch("/api/admin/notifications/send", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${session.access_token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					title: title.trim(),
					body: body.trim(),
					category: "announcements",
					audience,
				}),
			});
			const responseBody = await response.json();
			if (!response.ok) {
				throw new Error(responseBody.error || "Notification failed");
			}

			const result = responseBody.result;
			setMessage(
				result.status === "configuration_required"
					? `Prepared for ${result.recipients} device(s), but APNs credentials are not connected yet.`
					: `Sent to ${result.sent} device(s)${
							result.failed ? `; ${result.failed} failed` : ""
						}.`,
			);
			if (result.status === "sent" || result.status === "partial") {
				setTitle("");
				setBody("");
			}
		} catch (error) {
			setMessage(
				error instanceof Error
					? error.message
					: "The notification could not be sent.",
			);
		} finally {
			setIsSending(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<BellRingIcon className="size-5 text-primary" />
					Send a notification
				</CardTitle>
				<CardDescription>
					Messages are filtered through every recipient’s personal
					notification settings.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="grid gap-2">
					<Label htmlFor="notification-title">Title</Label>
					<Input
						id="notification-title"
						maxLength={100}
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						placeholder="Tonight’s session"
					/>
				</div>

				<div className="grid gap-2">
					<Label htmlFor="notification-body">Message</Label>
					<textarea
						id="notification-body"
						maxLength={500}
						rows={4}
						value={body}
						onChange={(event) => setBody(event.target.value)}
						placeholder="Warm-up starts at 20:00."
						className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					/>
				</div>

				<div className="grid gap-2">
					<Label>Audience</Label>
					<Select
						value={audienceType}
						onValueChange={(value) =>
							setAudienceType(value as AudienceType)
						}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All users</SelectItem>
							<SelectItem value="session">
								Current session players
							</SelectItem>
							<SelectItem value="users">Specific users</SelectItem>
						</SelectContent>
					</Select>
					<p className="text-sm text-muted-foreground">
						{audienceDescription}
					</p>
				</div>

				{audienceType === "users" ? (
					<div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
						{users.map((user) => {
							const checked = selectedUserIds.includes(user.id);
							return (
								<label
									key={user.id}
									className="flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2 hover:bg-muted"
								>
									<Checkbox
										checked={checked}
										onCheckedChange={(value) =>
											toggleUser(user.id, value === true)
										}
									/>
									<UsersIcon className="size-4 text-muted-foreground" />
									<span className="min-w-0">
										<span className="block font-medium">{user.name}</span>
										<span className="block truncate text-xs text-muted-foreground">
											{user.email}
										</span>
									</span>
								</label>
							);
						})}
					</div>
				) : null}

				<div className="flex flex-wrap items-center gap-3">
					<Button disabled={!canSend || isSending} onClick={send}>
						<SendIcon />
						{isSending ? "Sending…" : "Send notification"}
					</Button>
					{message ? (
						<p className="text-sm text-muted-foreground">{message}</p>
					) : null}
				</div>
			</CardContent>
		</Card>
	);
}

