"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDownIcon, ExternalLinkIcon, RefreshCwIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { StateBlock } from "@/components/ui/state-block";
import { SurfaceCard } from "@/components/ui/surface-card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/vendor/shadcn/badge";
import { getSessionSafely } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type FormClassification = "good" | "neutral" | "bad";

type FormAuditMatch = {
	matchId: string;
	roundNumber: number;
	matchOrder: number;
	opponentId: string;
	opponentName: string;
	result: "win" | "draw" | "loss";
	score: string;
	actualScore: number;
	expectedScore: number;
	performanceAboveExpectation: number;
	eloDelta: number;
};

type FormAuditEntry = {
	id: string;
	player: {
		id: string;
		name: string;
		avatar: string | null;
	};
	session: {
		id: string;
		date: string;
	};
	record: {
		wins: number;
		draws: number;
		losses: number;
	};
	eloDelta: number;
	formScore: number;
	classification: FormClassification;
	calculation: {
		actualScore: number;
		expectedScore: number;
		performanceAboveExpectation: number;
		availableOpportunity: number;
	};
	matches: FormAuditMatch[];
};

type FormAuditResponse = {
	entries: FormAuditEntry[];
	players: Array<{
		id: string;
		name: string;
		avatar: string | null;
	}>;
	sessions: Array<{
		id: string;
		date: string;
	}>;
};

const CLASSIFICATION_COPY: Record<
	FormClassification,
	{ label: string; className: string; dotClassName: string }
> = {
	good: {
		label: "Good",
		className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-500",
		dotClassName: "bg-emerald-500",
	},
	neutral: {
		label: "Neutral",
		className: "border-amber-500/25 bg-amber-500/10 text-amber-500",
		dotClassName: "bg-amber-400",
	},
	bad: {
		label: "Bad",
		className: "border-red-500/25 bg-red-500/10 text-red-500",
		dotClassName: "bg-red-500",
	},
};

function formatDate(dateString: string) {
	return new Date(dateString).toLocaleDateString("sr-Latn-RS", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

function formatSigned(value: number, digits = 2) {
	return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function formatPercentage(value: number) {
	return `${value > 0 ? "+" : ""}${Math.round(value * 100)}%`;
}

function formatExpected(value: number) {
	return `${Math.round(value * 100)}%`;
}

function playerInitials(name: string) {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("");
}

function resultLabel(result: FormAuditMatch["result"]) {
	if (result === "win") return "Win";
	if (result === "loss") return "Loss";
	return "Draw";
}

function ResultBadge({ result }: { result: FormAuditMatch["result"] }) {
	return (
		<span
			className={cn(
				"inline-flex min-w-12 justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
				result === "win" && "bg-emerald-500/10 text-emerald-500",
				result === "draw" && "bg-amber-500/10 text-amber-500",
				result === "loss" && "bg-red-500/10 text-red-500",
			)}
		>
			{resultLabel(result)}
		</span>
	);
}

function ClassificationBadge({ value }: { value: FormClassification }) {
	const copy = CLASSIFICATION_COPY[value];
	return (
		<Badge variant="outline" className={cn("gap-1.5", copy.className)}>
			<span className={cn("size-1.5 rounded-full", copy.dotClassName)} />
			{copy.label}
		</Badge>
	);
}

function FormMeter({ score }: { score: number }) {
	const markerPosition = Math.min(100, Math.max(0, (score + 1) * 50));
	return (
		<div className="relative h-1.5 w-full overflow-visible rounded-full bg-gradient-to-r from-red-500/50 via-amber-400/50 to-emerald-500/50">
			<span
				className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground shadow-sm"
				style={{ left: `${markerPosition}%` }}
			/>
		</div>
	);
}

export function FormAuditPanel() {
	const [data, setData] = useState<FormAuditResponse>({
		entries: [],
		players: [],
		sessions: [],
	});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [playerFilter, setPlayerFilter] = useState("all");
	const [classificationFilter, setClassificationFilter] = useState("all");
	const [sessionLimit, setSessionLimit] = useState("12");
	const [reloadKey, setReloadKey] = useState(0);
	const [expandedEntries, setExpandedEntries] = useState<Set<string>>(
		new Set(),
	);

	useEffect(() => {
		let active = true;

		const loadAudit = async () => {
			setLoading(true);
			setError(null);
			try {
				const session = await getSessionSafely();
				if (!session?.access_token) {
					throw new Error("You must be signed in as an admin.");
				}
				const response = await fetch(
					`/api/admin/form-audit?limit=${sessionLimit}`,
					{
						headers: {
							Authorization: `Bearer ${session.access_token}`,
						},
						cache: "no-store",
					},
				);
				if (!response.ok) {
					throw new Error(
						response.status === 401
							? "Admin access is required."
							: "Form audit could not be loaded.",
					);
				}
				const payload = (await response.json()) as FormAuditResponse;
				if (active) setData(payload);
			} catch (loadError) {
				if (active) {
					setError(
						loadError instanceof Error
							? loadError.message
							: "Form audit could not be loaded.",
					);
				}
			} finally {
				if (active) setLoading(false);
			}
		};

		void loadAudit();
		return () => {
			active = false;
		};
	}, [reloadKey, sessionLimit]);

	const filteredEntries = useMemo(
		() =>
			data.entries.filter(
				(entry) =>
					(playerFilter === "all" || entry.player.id === playerFilter) &&
					(classificationFilter === "all" ||
						entry.classification === classificationFilter),
			),
		[data.entries, playerFilter, classificationFilter],
	);

	const summary = useMemo(
		() => ({
			total: filteredEntries.length,
			good: filteredEntries.filter((entry) => entry.classification === "good")
				.length,
			neutral: filteredEntries.filter(
				(entry) => entry.classification === "neutral",
			).length,
			bad: filteredEntries.filter((entry) => entry.classification === "bad")
				.length,
		}),
		[filteredEntries],
	);

	const toggleEntry = (entryId: string) => {
		setExpandedEntries((current) => {
			const next = new Set(current);
			if (next.has(entryId)) next.delete(entryId);
			else next.add(entryId);
			return next;
		});
	};

	if (loading) {
		return (
			<StateBlock
				variant="loading"
				size="lg"
				title="Calculating recent singles form…"
				description="Rebuilding each player-session result from match and Elo history."
			/>
		);
	}

	if (error) {
		return (
			<StateBlock
				variant="error"
				size="lg"
				title={error}
				action={
					<Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
						Try again
					</Button>
				}
			/>
		);
	}

	return (
		<div className="space-y-5">
			<SurfaceCard padding="md" className="overflow-hidden">
				<div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start">
					<div className="max-w-3xl">
						<p className="text-sm font-semibold">How the label is decided</p>
						<p className="mt-1 text-sm leading-6 text-muted-foreground">
							For every rated singles match: actual result minus Elo-expected
							result. That difference is divided by the opportunity available in
							the same direction. The final score is from −100% to +100%.
						</p>
						<div className="mt-3 flex flex-wrap gap-2 text-xs">
							<span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-500">
								Good ≥ +30%
							</span>
							<span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-500">
								Neutral −29.9% to +29.9%
							</span>
							<span className="rounded-full bg-red-500/10 px-2.5 py-1 text-red-500">
								Bad ≤ −30%
							</span>
						</div>
					</div>
					<Button
						variant="outline"
						size="sm"
						className="active:scale-[0.97]"
						onClick={() => setReloadKey((key) => key + 1)}
					>
						<RefreshCwIcon className="mr-2 size-4" />
						Refresh
					</Button>
				</div>
			</SurfaceCard>

			<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
				{[
					["Player sessions", summary.total, "text-foreground"],
					["Good", summary.good, "text-emerald-500"],
					["Neutral", summary.neutral, "text-amber-500"],
					["Bad", summary.bad, "text-red-500"],
				].map(([label, value, tone]) => (
					<SurfaceCard key={label} padding="sm">
						<p className="text-xs text-muted-foreground">{label}</p>
						<p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone)}>
							{value}
						</p>
					</SurfaceCard>
				))}
			</div>

			<div className="grid gap-3 sm:grid-cols-3">
				<Select value={playerFilter} onValueChange={setPlayerFilter}>
					<SelectTrigger aria-label="Filter by player">
						<SelectValue placeholder="All players" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All players</SelectItem>
						{data.players.map((player) => (
							<SelectItem key={player.id} value={player.id}>
								{player.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Select
					value={classificationFilter}
					onValueChange={setClassificationFilter}
				>
					<SelectTrigger aria-label="Filter by classification">
						<SelectValue placeholder="All classifications" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All classifications</SelectItem>
						<SelectItem value="good">Good</SelectItem>
						<SelectItem value="neutral">Neutral</SelectItem>
						<SelectItem value="bad">Bad</SelectItem>
					</SelectContent>
				</Select>

				<Select value={sessionLimit} onValueChange={setSessionLimit}>
					<SelectTrigger aria-label="Number of recent sessions">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="6">Last 6 sessions</SelectItem>
						<SelectItem value="12">Last 12 sessions</SelectItem>
						<SelectItem value="20">Last 20 sessions</SelectItem>
						<SelectItem value="30">Last 30 sessions</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{filteredEntries.length === 0 ? (
				<SurfaceCard padding="none">
					<StateBlock
						variant="empty"
						title="No player sessions match these filters."
					/>
				</SurfaceCard>
			) : (
				<div className="space-y-3">
					{filteredEntries.map((entry) => {
						const expanded = expandedEntries.has(entry.id);
						return (
							<SurfaceCard key={entry.id} padding="none" className="overflow-hidden">
								<button
									type="button"
									className="grid w-full grid-cols-[1fr_auto] gap-4 p-4 text-left transition-transform duration-150 active:scale-[0.995] md:grid-cols-[minmax(180px,1.4fr)_110px_100px_120px_100px_120px_24px] md:items-center md:px-5"
									onClick={() => toggleEntry(entry.id)}
									aria-expanded={expanded}
								>
									<div className="flex min-w-0 items-center gap-3">
										<Avatar className="size-9">
											<AvatarImage src={entry.player.avatar ?? undefined} />
											<AvatarFallback>{playerInitials(entry.player.name)}</AvatarFallback>
										</Avatar>
										<div className="min-w-0">
											<p className="truncate text-sm font-semibold">{entry.player.name}</p>
											<p className="text-xs text-muted-foreground md:hidden">
												{formatDate(entry.session.date)}
											</p>
										</div>
									</div>

									<div className="flex items-center gap-2 md:contents">
										<p className="hidden text-sm text-muted-foreground md:block">
											{formatDate(entry.session.date)}
										</p>
										<p className="hidden text-sm font-medium tabular-nums md:block">
											{entry.record.wins}W · {entry.record.draws}D · {entry.record.losses}L
										</p>
										<p className="hidden text-sm tabular-nums text-muted-foreground md:block">
											{entry.calculation.actualScore.toFixed(1)} actual /{" "}
											{entry.calculation.expectedScore.toFixed(1)} expected
										</p>
										<p
											className={cn(
												"hidden text-sm font-semibold tabular-nums md:block",
												entry.eloDelta > 0 && "text-emerald-500",
												entry.eloDelta < 0 && "text-red-500",
											)}
										>
											{formatSigned(entry.eloDelta, 1)} Elo
										</p>
										<div className="hidden md:block">
											<ClassificationBadge value={entry.classification} />
											<p className="mt-1 text-xs tabular-nums text-muted-foreground">
												{formatPercentage(entry.formScore)}
											</p>
										</div>
										<div className="md:hidden">
											<ClassificationBadge value={entry.classification} />
										</div>
										<ChevronDownIcon
											className={cn(
												"size-4 text-muted-foreground transition-transform duration-200",
												expanded && "rotate-180",
											)}
										/>
									</div>
								</button>

								{expanded && (
									<div className="border-t border-border/60 bg-muted/15 px-4 py-5 md:px-5">
										<div className="grid gap-5 lg:grid-cols-[220px_1fr]">
											<div className="space-y-4">
												<div>
													<div className="flex items-end justify-between">
														<div>
															<p className="text-xs text-muted-foreground">Normalized form</p>
															<p className="mt-0.5 text-2xl font-semibold tabular-nums">
																{formatPercentage(entry.formScore)}
															</p>
														</div>
														<ClassificationBadge value={entry.classification} />
													</div>
													<div className="mt-3 px-1">
														<FormMeter score={entry.formScore} />
													</div>
												</div>

												<div className="rounded-xl border border-border/60 bg-background/55 p-3 text-xs leading-5">
													<p className="font-medium">Calculation</p>
													<p className="mt-1 font-mono text-muted-foreground">
														{entry.calculation.actualScore.toFixed(2)} actual −{" "}
														{entry.calculation.expectedScore.toFixed(2)} expected ={" "}
														{formatSigned(
															entry.calculation.performanceAboveExpectation,
														)}
													</p>
													<p className="font-mono text-muted-foreground">
														÷ {entry.calculation.availableOpportunity.toFixed(2)} opportunity ={" "}
														{formatPercentage(entry.formScore)}
													</p>
												</div>

												<Button variant="outline" size="sm" asChild className="w-full">
													<Link href={`/session/${entry.session.id}`}>
														Open session
														<ExternalLinkIcon className="ml-2 size-3.5" />
													</Link>
												</Button>
											</div>

											<div className="min-w-0 overflow-x-auto rounded-xl border border-border/60 bg-background/55">
												<Table>
													<TableHeader>
														<TableRow>
															<TableHead>Match</TableHead>
															<TableHead>Opponent</TableHead>
															<TableHead>Result</TableHead>
															<TableHead className="text-right">Expected</TableHead>
															<TableHead className="text-right">vs expected</TableHead>
															<TableHead className="text-right">Elo</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{entry.matches.map((match) => (
															<TableRow key={match.matchId}>
																<TableCell className="whitespace-nowrap text-xs text-muted-foreground">
																	R{match.roundNumber}
																</TableCell>
																<TableCell className="whitespace-nowrap font-medium">
																	{match.opponentName}
																</TableCell>
																<TableCell className="whitespace-nowrap">
																	<div className="flex items-center gap-2">
																		<ResultBadge result={match.result} />
																		<span className="tabular-nums">{match.score}</span>
																	</div>
																</TableCell>
																<TableCell className="text-right tabular-nums">
																	{formatExpected(match.expectedScore)}
																</TableCell>
																<TableCell
																	className={cn(
																		"text-right font-medium tabular-nums",
																		match.performanceAboveExpectation > 0 && "text-emerald-500",
																		match.performanceAboveExpectation < 0 && "text-red-500",
																	)}
																>
																	{formatPercentage(match.performanceAboveExpectation)}
																</TableCell>
																<TableCell className="text-right font-medium tabular-nums">
																	{formatSigned(match.eloDelta, 1)}
																</TableCell>
															</TableRow>
														))}
													</TableBody>
												</Table>
											</div>
										</div>
									</div>
								)}
							</SurfaceCard>
						);
					})}
				</div>
			)}
		</div>
	);
}
