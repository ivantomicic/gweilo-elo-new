"use client";

import { useEffect, useState } from "react";
import {
	BellIcon,
	CalendarDaysIcon,
	ClipboardListIcon,
	MegaphoneIcon,
	TrophyIcon,
} from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/vendor/shadcn/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/vendor/shadcn/card";
import { Switch } from "@/components/vendor/shadcn/switch";
import { useAuth } from "@/lib/auth/useAuth";

type Preferences = {
	enabled: boolean;
	sessionsEnabled: boolean;
	roundsEnabled: boolean;
	resultsEnabled: boolean;
	pollsEnabled: boolean;
	announcementsEnabled: boolean;
};

const preferenceRows = [
	{
		key: "sessionsEnabled",
		title: "Sessions",
		description: "Session starts, cancellations, and important changes.",
		icon: CalendarDaysIcon,
	},
	{
		key: "roundsEnabled",
		title: "Rounds",
		description: "A new round is ready and your next match is available.",
		icon: ClipboardListIcon,
	},
	{
		key: "resultsEnabled",
		title: "Results and Elo",
		description: "A session finished and updated ratings are available.",
		icon: TrophyIcon,
	},
	{
		key: "pollsEnabled",
		title: "Polls",
		description: "A new club poll needs your answer.",
		icon: BellIcon,
	},
	{
		key: "announcementsEnabled",
		title: "Announcements",
		description: "Occasional messages sent by a Gweilo admin.",
		icon: MegaphoneIcon,
	},
] as const;

function NotificationPreferences() {
	const { session } = useAuth();
	const [preferences, setPreferences] = useState<Preferences | null>(null);
	const [savingKey, setSavingKey] = useState<keyof Preferences | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	useEffect(() => {
		if (!session?.access_token) return;
		void fetch("/api/notifications/preferences", {
			headers: { Authorization: `Bearer ${session.access_token}` },
		})
			.then(async (response) => {
				if (!response.ok) throw new Error("Could not load preferences");
				return response.json();
			})
			.then((body) => setPreferences(body.preferences as Preferences))
			.catch(() => setMessage("Could not load notification preferences."));
	}, [session?.access_token]);

	const updatePreference = async (
		key: keyof Preferences,
		value: boolean,
	) => {
		if (!preferences || !session?.access_token) return;
		const previous = preferences;
		setPreferences({ ...preferences, [key]: value });
		setSavingKey(key);
		setMessage(null);
		try {
			const response = await fetch("/api/notifications/preferences", {
				method: "PATCH",
				headers: {
					Authorization: `Bearer ${session.access_token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ [key]: value }),
			});
			const body = await response.json();
			if (!response.ok) {
				throw new Error(body.error || "Could not save preferences");
			}
			setPreferences(body.preferences as Preferences);
		} catch {
			setPreferences(previous);
			setMessage("Your change could not be saved.");
		} finally {
			setSavingKey(null);
		}
	};

	const sendTest = async () => {
		if (!session?.access_token) return;
		setMessage(null);
		const response = await fetch("/api/notifications/test", {
			method: "POST",
			headers: { Authorization: `Bearer ${session.access_token}` },
		});
		const body = await response.json();
		if (!response.ok) {
			setMessage(body.error || "The test notification could not be sent.");
			return;
		}
		const status = body.result?.status as string | undefined;
		setMessage(
			status === "configuration_required"
				? "The app is ready, but Apple APNs credentials still need to be connected."
				: status === "no_recipients"
					? "No iPhone is registered for this account yet."
					: "Test notification requested.",
		);
	};

	return (
		<AppShell title="Notifications">
			<div className="mx-auto w-full max-w-3xl space-y-6">
				<div>
					<p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
						Your attention, your rules
					</p>
					<h1 className="mt-2 font-heading text-4xl font-bold">
						Notifications
					</h1>
					<p className="mt-2 text-muted-foreground">
						These settings apply to every iPhone connected to your
						Gweilo account.
					</p>
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<BellIcon className="size-5 text-primary" />
							Push notifications
						</CardTitle>
						<CardDescription>
							Turn everything off, or choose exactly which updates
							matter to you.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-1">
						{preferences ? (
							<>
								<div className="flex items-center justify-between gap-4 border-b py-4">
									<div>
										<p className="font-semibold">Allow notifications</p>
										<p className="text-sm text-muted-foreground">
											Master switch for this Gweilo account.
										</p>
									</div>
									<Switch
										checked={preferences.enabled}
										disabled={savingKey !== null}
										onCheckedChange={(checked) =>
											updatePreference("enabled", checked)
										}
										aria-label="Allow notifications"
									/>
								</div>

								{preferenceRows.map((row) => (
									<div
										key={row.key}
										className="flex items-center justify-between gap-4 border-b py-4 last:border-0"
									>
										<div className="flex min-w-0 items-start gap-3">
											<row.icon className="mt-0.5 size-5 shrink-0 text-primary" />
											<div>
												<p className="font-semibold">{row.title}</p>
												<p className="text-sm text-muted-foreground">
													{row.description}
												</p>
											</div>
										</div>
										<Switch
											checked={preferences[row.key]}
											disabled={
												!preferences.enabled || savingKey !== null
											}
											onCheckedChange={(checked) =>
												updatePreference(row.key, checked)
											}
											aria-label={row.title}
										/>
									</div>
								))}
							</>
						) : (
							<p className="py-8 text-center text-muted-foreground">
								Loading preferences…
							</p>
						)}
					</CardContent>
				</Card>

				<div className="flex flex-wrap items-center gap-3">
					<Button
						variant="outline"
						disabled={!preferences?.enabled}
						onClick={sendTest}
					>
						Send me a test
					</Button>
					{message ? (
						<p className="text-sm text-muted-foreground">{message}</p>
					) : null}
				</div>
			</div>
		</AppShell>
	);
}

export default function NotificationsPage() {
	return (
		<AuthGuard>
			<NotificationPreferences />
		</AuthGuard>
	);
}
