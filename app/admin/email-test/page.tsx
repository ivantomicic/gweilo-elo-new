"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminGuard } from "@/components/auth/admin-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Box } from "@/components/ui/box";
import { Stack } from "@/components/ui/stack";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { t } from "@/lib/i18n";
import { supabase } from "@/lib/supabase/client";

function AdminEmailTestPageContent() {
	const pathname = usePathname();
	const router = useRouter();
	const [loading, setLoading] = useState(false);
	const [formData, setFormData] = useState({
		recipient: "",
		title: "Nova anketa, gweilo...",
		message:
			"Klikni na odgovor ispod da glasaš...! Kliknite na opciju ispod da glasate.",
		ctaLabel: "",
		pollQuestion: "Koji dan vam najviše odgovara za termin?",
		pollDescription:
			"Molimo vas da izaberete dan koji vam najviše odgovara za naredni termin.",
		pollOptions: [
			{ id: "1", text: "Ponedeljak" },
			{ id: "2", text: "Sreda" },
			{ id: "3", text: "Petak" },
			{ id: "4", text: "Subota" },
		],
	});

	// Determine active tab based on current route
	const activeTab =
		pathname === "/admin/activity"
			? "activity"
			: pathname === "/admin/email-test"
				? "email-test"
				: pathname === "/admin/settings"
					? "settings"
					: "users";

	const handleTabChange = (value: string) => {
		if (value === "activity") {
			router.push("/admin/activity");
		} else if (value === "email-test") {
			router.push("/admin/email-test");
		} else if (value === "settings") {
			router.push("/admin/settings");
		} else {
			router.push("/admin");
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		// Validate email
		if (!formData.recipient || !formData.recipient.includes("@")) {
			toast.error(t.admin.emailTest.error.invalidEmail);
			return;
		}

		// Validate required fields
		if (!formData.title || !formData.message) {
			toast.error("Naslov i poruka su obavezni");
			return;
		}

		setLoading(true);

		try {
			// Get Supabase URL and anon key
			const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
			const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

			if (!supabaseUrl || !supabaseAnonKey) {
				throw new Error("Supabase configuration missing");
			}

			// Get session for auth token
			const {
				data: { session },
			} = await supabase.auth.getSession();
			if (!session) {
				throw new Error("Not authenticated");
			}

			// Call Edge Function
			const functionUrl = `${supabaseUrl}/functions/v1/send-email`;
			const response = await fetch(functionUrl, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${supabaseAnonKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					to: formData.recipient,
					type: "test",
					payload: {
						title: formData.title,
						message: formData.message,
						ctaLabel: formData.ctaLabel || undefined,
						pollQuestion: formData.pollQuestion,
						pollDescription: formData.pollDescription,
						pollOptions: formData.pollOptions,
					},
				}),
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(
					result.error || t.admin.emailTest.error.sendFailed,
				);
			}

			toast.success(t.admin.emailTest.success);

			// Reset form (keep defaults for poll fields)
			setFormData({
				recipient: "",
				title: "Nova anketa, gweilo...",
				message:
					"Klikni na odgovor ispod da glasaš...! Kliknite na opciju ispod da glasate.",
				ctaLabel: "",
				pollQuestion: "Koji dan vam najviše odgovara za termin?",
				pollDescription:
					"Molimo vas da izaberete dan koji vam najviše odgovara za naredni termin.",
				pollOptions: [
					{ id: "1", text: "Ponedeljak" },
					{ id: "2", text: "Sreda" },
					{ id: "3", text: "Petak" },
					{ id: "4", text: "Subota" },
				],
			});
		} catch (error) {
			console.error("Failed to send test email:", error);
			toast.error(
				error instanceof Error
					? error.message
					: t.admin.emailTest.error.generic,
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<SidebarProvider>
			<AppSidebar variant="inset" />
			<SidebarInset>
				<SiteHeader title="Admin panel" />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
							{/* Admin Navigation Tabs */}
							<Box className="mb-4">
								<Tabs
									value={activeTab}
									onValueChange={handleTabChange}
								>
									<TabsList>
										<TabsTrigger value="users">
											Users
										</TabsTrigger>
										<TabsTrigger value="activity">
											Activity Log
										</TabsTrigger>
										<TabsTrigger value="email-test">
											Email Test
										</TabsTrigger>
										<TabsTrigger value="settings">
											Settings
										</TabsTrigger>
									</TabsList>
								</Tabs>
							</Box>

							{/* Email Test Form */}
							<Card>
								<CardHeader>
									<CardTitle>
										{t.admin.emailTest.title}
									</CardTitle>
									<CardDescription>
										{t.admin.emailTest.description}
									</CardDescription>
								</CardHeader>
								<CardContent>
									<form onSubmit={handleSubmit}>
										<Stack direction="column" spacing={6}>
											{/* Recipient Email */}
											<Stack
												direction="column"
												spacing={2}
											>
												<Label htmlFor="recipient">
													{
														t.admin.emailTest
															.recipient
													}
												</Label>
												<Input
													id="recipient"
													type="email"
													placeholder={
														t.admin.emailTest
															.recipientPlaceholder
													}
													value={formData.recipient}
													onChange={(e) =>
														setFormData({
															...formData,
															recipient:
																e.target.value,
														})
													}
													required
													disabled={loading}
												/>
											</Stack>

											{/* Email Title */}
											<Stack
												direction="column"
												spacing={2}
											>
												<Label htmlFor="title">
													{
														t.admin.emailTest
															.emailTitle
													}
												</Label>
												<Input
													id="title"
													type="text"
													placeholder={
														t.admin.emailTest
															.emailTitlePlaceholder
													}
													value={formData.title}
													onChange={(e) =>
														setFormData({
															...formData,
															title: e.target
																.value,
														})
													}
													required
													disabled={loading}
												/>
											</Stack>

											{/* Message */}
											<Stack
												direction="column"
												spacing={2}
											>
												<Label htmlFor="message">
													{t.admin.emailTest.message}
												</Label>
												<textarea
													id="message"
													placeholder={
														t.admin.emailTest
															.messagePlaceholder
													}
													value={formData.message}
													onChange={(e) =>
														setFormData({
															...formData,
															message:
																e.target.value,
														})
													}
													required
													disabled={loading}
													rows={6}
													className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
												/>
											</Stack>

											{/* Poll Question */}
											<Stack
												direction="column"
												spacing={2}
											>
												<Label htmlFor="pollQuestion">
													Poll Question (Anketa
													pitanje)
												</Label>
												<Input
													id="pollQuestion"
													type="text"
													placeholder="Unesite pitanje ankete"
													value={
														formData.pollQuestion
													}
													onChange={(e) =>
														setFormData({
															...formData,
															pollQuestion:
																e.target.value,
														})
													}
													disabled={loading}
												/>
											</Stack>

											{/* Poll Description */}
											<Stack
												direction="column"
												spacing={2}
											>
												<Label htmlFor="pollDescription">
													Poll Description (Opis
													ankete)
												</Label>
												<textarea
													id="pollDescription"
													placeholder="Opis ankete (opciono)"
													value={
														formData.pollDescription
													}
													onChange={(e) =>
														setFormData({
															...formData,
															pollDescription:
																e.target.value,
														})
													}
													disabled={loading}
													rows={3}
													className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
												/>
											</Stack>

											{/* Poll Options */}
											<Stack
												direction="column"
												spacing={2}
											>
												<Label>
													Poll Options (Opcije ankete)
												</Label>
												{formData.pollOptions.map(
													(option, index) => (
														<Input
															key={option.id}
															type="text"
															placeholder={`Opcija ${index + 1}`}
															value={option.text}
															onChange={(e) => {
																const newOptions =
																	[
																		...formData.pollOptions,
																	];
																newOptions[
																	index
																] = {
																	...newOptions[
																		index
																	],
																	text: e
																		.target
																		.value,
																};
																setFormData({
																	...formData,
																	pollOptions:
																		newOptions,
																});
															}}
															disabled={loading}
														/>
													),
												)}
											</Stack>

											{/* CTA Label (Optional) */}
											<Stack
												direction="column"
												spacing={2}
											>
												<Label htmlFor="ctaLabel">
													{t.admin.emailTest.ctaLabel}
												</Label>
												<Input
													id="ctaLabel"
													type="text"
													placeholder={
														t.admin.emailTest
															.ctaLabelPlaceholder
													}
													value={formData.ctaLabel}
													onChange={(e) =>
														setFormData({
															...formData,
															ctaLabel:
																e.target.value,
														})
													}
													disabled={loading}
												/>
											</Stack>

											{/* Submit Button */}
											<Button
												type="submit"
												disabled={loading}
											>
												{loading
													? t.admin.emailTest.sending
													: t.admin.emailTest.send}
											</Button>
										</Stack>
									</form>
								</CardContent>
							</Card>
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

export default function AdminEmailTestPage() {
	return (
		<AdminGuard>
			<AdminEmailTestPageContent />
		</AdminGuard>
	);
}
