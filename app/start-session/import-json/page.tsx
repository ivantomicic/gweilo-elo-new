// TEMPORARY JSON IMPORT – safe to remove after migration

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminGuard } from "@/components/auth/admin-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { Stack } from "@/components/ui/stack";
import { Box } from "@/components/ui/box";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { supabase } from "@/lib/supabase/client";
import {
	validateJsonSession,
	parseJsonSession,
	type PlayerMapping,
	type ParsedSession,
} from "@/lib/import/json-session-parser";

type ImportStep = "paste" | "preview" | "confirming";

function ImportJsonPageContent() {
	const router = useRouter();
	const [step, setStep] = useState<ImportStep>("paste");
	const [jsonInput, setJsonInput] = useState("");
	const [parsedSession, setParsedSession] = useState<ParsedSession | null>(
		null
	);
	const [playerMappings, setPlayerMappings] = useState<PlayerMapping[]>([]);
	const [validationErrors, setValidationErrors] = useState<
		Array<{ field: string; message: string }>
	>([]);
	const [isImporting, setIsImporting] = useState(false);
	const [importError, setImportError] = useState<string | null>(null);

	// Load all players for name matching
	useEffect(() => {
		const loadPlayers = async () => {
			try {
				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					return;
				}

				// Fetch players via admin API (admin-only endpoint)
				const response = await fetch("/api/admin/users", {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				});

				if (!response.ok) {
					console.error("Error loading players:", response.statusText);
					return;
				}

				const data = await response.json();
				const mappings: PlayerMapping[] = data.users.map((user: any) => ({
					id: user.id,
					name: user.name || "User",
				}));

				setPlayerMappings(mappings);
			} catch (err) {
				console.error("Error loading players:", err);
			}
		};

		loadPlayers();
	}, []);

	const handlePreview = () => {
		setValidationErrors([]);
		setImportError(null);

		try {
			const json = JSON.parse(jsonInput);
			const validation = validateJsonSession(json);

			if (!validation.valid) {
				setValidationErrors(validation.errors);
				return;
			}

			const parsing = parseJsonSession(validation.data, playerMappings);

			if (!parsing.valid) {
				setValidationErrors(parsing.errors);
				return;
			}

			setParsedSession(parsing.session);
			setStep("preview");
		} catch (err) {
			setValidationErrors([
				{
					field: "json",
					message: `Invalid JSON: ${err instanceof Error ? err.message : "Unknown error"}`,
				},
			]);
		}
	};

	const handleConfirmImport = async () => {
		if (!parsedSession) return;

		setIsImporting(true);
		setImportError(null);

		try {
			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				setImportError("Not authenticated");
				setIsImporting(false);
				return;
			}

			const response = await fetch("/api/sessions/import-json", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${session.access_token}`,
				},
				body: JSON.stringify(parsedSession),
			});

			if (!response.ok) {
				const data = await response.json();
				setImportError(data.error || "Failed to import session");
				setIsImporting(false);
				return;
			}

			const data = await response.json();

			// Redirect to imported session
			router.push(`/session/${data.sessionId}`);
		} catch (err) {
			console.error("Error importing session:", err);
			setImportError(
				err instanceof Error ? err.message : "Failed to import session"
			);
			setIsImporting(false);
		}
	};

	const getPlayerName = (playerId: string): string => {
		const player = playerMappings.find((p) => p.id === playerId);
		return player?.name || "Unknown";
	};

	return (
		<SidebarProvider>
			<AppSidebar variant="inset" />
			<SidebarInset>
				<SiteHeader title="Import JSON Session" />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
							{/* Step 1: Paste JSON */}
							{step === "paste" && (
								<>
									<Box>
										<h1 className="text-3xl font-bold font-heading tracking-tight mb-2">
											Import JSON Session
										</h1>
										<p className="text-muted-foreground">
											Paste exported session JSON here
										</p>
									</Box>

									<Box>
										<label className="text-sm font-semibold text-foreground mb-2 block">
											JSON Data
										</label>
										<textarea
											value={jsonInput}
											onChange={(e) => setJsonInput(e.target.value)}
											className="w-full h-96 p-4 rounded-lg border border-border bg-background text-foreground font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
											placeholder='{"started_at": "...", "ended_at": "...", "matches": [...]}'
										/>
									</Box>

									{validationErrors.length > 0 && (
										<Box className="bg-destructive/10 border border-destructive/50 rounded-lg p-4">
											<p className="text-sm font-semibold text-destructive mb-2">
												Validation Errors:
											</p>
											<ul className="list-disc list-inside space-y-1 text-sm text-destructive">
												{validationErrors.map((error, index) => (
													<li key={index}>
														<strong>{error.field}:</strong> {error.message}
													</li>
												))}
											</ul>
										</Box>
									)}

									<Box>
										<Button
											onClick={handlePreview}
											disabled={!jsonInput.trim()}
											className="w-full py-4 px-6 rounded-full font-bold text-lg shadow-lg h-auto"
										>
											<Stack
												direction="row"
												alignItems="center"
												justifyContent="center"
												spacing={2}
											>
												<span>Preview</span>
												<Icon icon="solar:eye-bold" className="size-5" />
											</Stack>
										</Button>
									</Box>
								</>
							)}

							{/* Step 2: Preview */}
							{step === "preview" && parsedSession && (
								<>
									<Box>
										<h1 className="text-3xl font-bold font-heading tracking-tight mb-2">
											Preview Import
										</h1>
										<p className="text-muted-foreground mb-4">
											This is a preview. No data has been saved yet.
										</p>
									</Box>

									<Box className="bg-card rounded-lg border border-border/50 overflow-hidden">
										<Table>
											<TableHeader className="bg-muted/30">
												<TableRow>
													<TableHead>Match #</TableHead>
													<TableHead>Type</TableHead>
													<TableHead>Players / Teams</TableHead>
													<TableHead className="text-right">Score</TableHead>
													<TableHead>Round</TableHead>
													<TableHead>Order</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{parsedSession.matches.map((match, index) => (
													<TableRow key={index}>
														<TableCell className="font-medium">
															{match.matchIndex + 1}
														</TableCell>
														<TableCell>
															<span className="capitalize">{match.type}</span>
														</TableCell>
														<TableCell>
															{match.type === "singles" ? (
																<span>
																	{getPlayerName(match.playerIds[0])} vs{" "}
																	{getPlayerName(match.playerIds[1])}
																</span>
															) : (
																<span>
																	{getPlayerName(match.playerIds[0])} &{" "}
																	{getPlayerName(match.playerIds[1])} vs{" "}
																	{getPlayerName(match.playerIds[2])} &{" "}
																	{getPlayerName(match.playerIds[3])}
																</span>
															)}
														</TableCell>
														<TableCell className="text-right font-medium">
															{match.score1} - {match.score2}
														</TableCell>
														<TableCell>{match.roundNumber}</TableCell>
														<TableCell>{match.matchOrder}</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</Box>

									<Box className="bg-muted/30 rounded-lg p-4 border border-border/50">
										<Stack direction="column" spacing={2}>
											<p className="text-sm font-semibold">Session Details:</p>
											<p className="text-sm text-muted-foreground">
												Started: {new Date(parsedSession.startedAt).toLocaleString()}
											</p>
											<p className="text-sm text-muted-foreground">
												Ended: {new Date(parsedSession.endedAt).toLocaleString()}
											</p>
											<p className="text-sm text-muted-foreground">
												Players: {parsedSession.playerCount}
											</p>
											<p className="text-sm text-muted-foreground">
												Matches: {parsedSession.matches.length}
											</p>
										</Stack>
									</Box>

									{importError && (
										<Box className="bg-destructive/10 border border-destructive/50 rounded-lg p-4">
											<p className="text-sm text-destructive">{importError}</p>
										</Box>
									)}

									<Stack direction="row" spacing={3}>
										<Button
											variant="secondary"
											onClick={() => {
												setStep("paste");
												setParsedSession(null);
												setImportError(null);
											}}
											className="flex-1 py-4 px-6 rounded-full font-bold text-lg h-auto"
										>
											Back
										</Button>
										<Button
											onClick={handleConfirmImport}
											disabled={isImporting}
											className="flex-1 py-4 px-6 rounded-full font-bold text-lg shadow-lg h-auto"
										>
											{isImporting ? "Importing..." : "Confirm Import"}
										</Button>
									</Stack>
								</>
							)}
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

export default function ImportJsonPage() {
	return (
		<AdminGuard>
			<ImportJsonPageContent />
		</AdminGuard>
	);
}

