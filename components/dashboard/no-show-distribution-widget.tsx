"use client";

import { useState } from "react";
import { Box } from "@/components/ui/box";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatNoShowPoints } from "@/lib/no-shows/sessions-per-week";

type NoShowEntry = {
	id: string;
	date: string;
	reason: string | null;
	points: number;
};

type NoShowUser = {
	id: string;
	name: string;
	avatar: string | null;
	noShowCount: number;
	totalPoints: number;
	lastNoShowDate: string;
	entries: NoShowEntry[];
};

type NoShowDistributionWidgetProps = {
	users: NoShowUser[];
};

const CHART_GRADIENT =
	"linear-gradient(90deg, hsl(var(--primary)), hsl(var(--chart-1)), hsl(var(--chart-2)))";

function formatDate(dateString: string) {
	return new Date(dateString).toLocaleDateString("sr-Latn-RS", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

export function NoShowDistributionWidget({
	users,
}: NoShowDistributionWidgetProps) {
	const [selectedEntryByUser, setSelectedEntryByUser] = useState<
		Record<string, string | null>
	>({});
	const maxPoints = users[0]?.totalPoints ?? 0;

	if (users.length === 0) {
		return (
			<Box className="bg-card rounded-[24px] border border-border/50 shadow-sm p-6 min-h-[18rem] flex items-center justify-center text-center text-muted-foreground">
				{t.ispale.noNoShows}
			</Box>
		);
	}

	return (
		<Box className="bg-card rounded-[24px] border border-border/50 shadow-sm p-6">
			<div>
				{users.map((user, index) => {
					const relativeWidth =
						maxPoints === 0
							? 0
							: Math.max((user.totalPoints / maxPoints) * 100, 10);
					const isLeader = index === 0;
					const selectedEntry =
						user.entries.find(
							(entry) => entry.id === selectedEntryByUser[user.id]
						) ?? null;

					return (
						<details
							key={user.id}
							className={cn(
								"group border-b border-border/50 transition-colors last:border-b-0",
								isLeader && "border-primary/20"
							)}
						>
							<summary className="cursor-pointer list-none py-4 [&::-webkit-details-marker]:hidden">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="min-w-0 flex items-center gap-3">
										<Avatar className="size-11 border border-border/60">
											<AvatarImage
												src={user.avatar || undefined}
												alt={user.name}
											/>
											<AvatarFallback>
												{user.name.charAt(0).toUpperCase()}
											</AvatarFallback>
										</Avatar>
										<div className="min-w-0">
											<p className="truncate text-sm font-semibold sm:text-base">
												{user.name}
											</p>
											<p className="text-xs text-muted-foreground sm:text-sm">
												{t.ispale.last}: {formatDate(user.lastNoShowDate)}
											</p>
										</div>
									</div>

									<div className="flex min-w-fit items-center gap-2">
										<Box className="rounded-full bg-background/90 px-3 py-1 text-sm font-semibold text-foreground ring-1 ring-border/50">
											{formatNoShowPoints(user.totalPoints)}{" "}
											{t.ispale.points}
										</Box>
										<Box className="rounded-full bg-muted/70 px-3 py-1 text-sm font-medium text-muted-foreground ring-1 ring-border/40">
											{user.noShowCount} {t.ispale.misses}
										</Box>
										<Icon
											icon="solar:alt-arrow-down-linear"
											className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
										/>
									</div>
								</div>

								<div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
									<div
										className="h-full rounded-full"
										style={{
											width: `${relativeWidth}%`,
											background: CHART_GRADIENT,
										}}
									/>
								</div>
							</summary>

							<div className="border-t border-border/50 pb-4 pt-4">
								<p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									{t.ispale.cards.dateList}
								</p>
								<div className="flex flex-wrap gap-2">
									{user.entries.map((entry) => (
										<button
											key={entry.id}
											type="button"
											onClick={() => {
												setSelectedEntryByUser((current) => ({
													...current,
													[user.id]:
														current[user.id] === entry.id
															? null
															: entry.id,
												}));
											}}
											className={cn(
												"rounded-full px-2.5 py-1 text-xs text-foreground ring-1 transition-colors",
												selectedEntry?.id === entry.id
													? "bg-primary text-primary-foreground ring-primary/30"
													: "bg-background ring-border/50 hover:bg-muted"
											)}
										>
											{formatDate(entry.date)}
										</button>
									))}
								</div>
								{selectedEntry ? (
									<div className="mt-3 rounded-xl bg-muted/40 px-3 py-2 text-sm text-foreground space-y-1">
										<p>
											<span className="font-medium">
												{t.ispale.cards.points}:
											</span>{" "}
											{formatNoShowPoints(selectedEntry.points)}{" "}
											{t.ispale.points}
										</p>
										<p>
											<span className="font-medium">
												{t.ispale.table.reason}:
											</span>{" "}
											{selectedEntry.reason?.trim() || t.ispale.cards.noReason}
										</p>
									</div>
								) : null}
							</div>
						</details>
					);
				})}
			</div>
		</Box>
	);
}
