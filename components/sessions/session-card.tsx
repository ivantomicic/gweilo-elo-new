"use client";

import Link from "next/link";
import { PlayIcon } from "lucide-react";
import { useWebHaptics } from "web-haptics/react";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export type SessionCardPerformer = {
	id: string | null;
	name: string | null;
	avatar: string | null;
	delta: number | null;
};

export type SessionCardSession = {
	id: string;
	player_count: number;
	created_at: string;
	status: "active" | "completed";
	singles_match_count: number;
	doubles_match_count: number;
	current_round?: number | null;
	total_rounds?: number | null;
	best_player?: SessionCardPerformer | null;
	worst_player?: SessionCardPerformer | null;
};

type SessionCardProps = {
	session: SessionCardSession;
	href?: string;
	presentation?: "regular" | "compact";
	className?: string;
};

const locale = "sr-Latn-RS";

const cardDateFormatter = new Intl.DateTimeFormat(locale, {
	weekday: "long",
	day: "numeric",
	month: "long",
});

function capitalizeWords(value: string) {
	return value
		.split(/(\s+)/)
		.map((part) =>
			/^\s+$/.test(part) || !part
				? part
				: part.charAt(0).toLocaleUpperCase(locale) + part.slice(1),
		)
		.join("");
}

function formatCardDate(dateString: string, active: boolean) {
	const formatted = cardDateFormatter.format(new Date(dateString));
	return active
		? formatted
		: capitalizeWords(formatted.replaceAll(".", ""));
}

function pluralized(
	value: number,
	words: { one: string; few: string; many: string },
) {
	const lastTwo = Math.abs(value) % 100;
	const last = Math.abs(value) % 10;
	if (last === 1 && lastTwo !== 11) return words.one;
	if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
		return words.few;
	}
	return words.many;
}

function formatMatchSummary(session: SessionCardSession) {
	const values: string[] = [];
	if (session.singles_match_count > 0) {
		values.push(
			`${session.singles_match_count} ${pluralized(session.singles_match_count, {
				one: "singl",
				few: "singla",
				many: "singlova",
			})}`,
		);
	}
	if (session.doubles_match_count > 0) {
		values.push(
			`${session.doubles_match_count} ${pluralized(session.doubles_match_count, {
				one: "dubl",
				few: "dubla",
				many: "dublova",
			})}`,
		);
	}
	return values.join(" · ");
}

function formatDelta(delta: number) {
	const rounded = Math.round(delta);
	return `${rounded > 0 ? "+" : ""}${rounded} Elo`;
}

function initials(name: string) {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part.charAt(0))
		.join("")
		.toLocaleUpperCase(locale);
}

function Performer({
	performer,
	tone,
	compact,
}: {
	performer: SessionCardPerformer;
	tone: "best" | "worst";
	compact: boolean;
}) {
	if (!performer.name || performer.delta === null) return null;

	return (
		<div className={cn("flex min-w-0 items-center", compact ? "gap-1.5" : "gap-2")}>
			<Avatar
				className={cn(
					"ring-1 ring-white/10",
					compact ? "size-[29px]" : "size-[35px]",
				)}
			>
				<AvatarImage
					src={performer.avatar || undefined}
					alt={performer.name}
					fallbackSeed={performer.id || performer.name}
				/>
				<AvatarFallback className="bg-ds-surface-selected text-ios-caption2 font-semibold text-ds-button-foreground">
					{initials(performer.name)}
				</AvatarFallback>
			</Avatar>

			<div className="min-w-0">
				<p
					className={cn(
						"truncate font-semibold text-ds-button-foreground",
						compact ? "text-ios-caption2 leading-3" : "text-ios-caption leading-[13px]",
					)}
				>
					{performer.name}
				</p>
				<p
					className={cn(
						"mt-px font-bold tabular-nums",
						compact ? "text-ios-caption2 leading-3" : "text-ios-caption leading-[13px]",
						tone === "best"
							? "text-ds-control-selected"
							: "text-ds-button-destructive",
					)}
				>
					{formatDelta(performer.delta)}
				</p>
			</div>
		</div>
	);
}

function CompletedSessionContent({
	session,
	compact,
}: {
	session: SessionCardSession;
	compact: boolean;
}) {
	const matchSummary = formatMatchSummary(session);
	const summary = `${session.player_count} igrača${
		matchSummary ? ` · ${matchSummary}` : ""
	}`;
	const hasBest = Boolean(
		session.best_player?.name && session.best_player.delta !== null,
	);
	const hasWorst = Boolean(
		session.worst_player?.name && session.worst_player.delta !== null,
	);

	return (
		<div className={cn("flex h-full flex-col items-start", compact ? "gap-1.5" : "gap-[7px]")}>
			<p
				className={cn(
					"max-w-full truncate font-session-heading font-bold text-ds-button-foreground",
					compact ? "text-ios-display-18 leading-[23px]" : "text-ios-display-20 leading-[25px]",
				)}
			>
				{formatCardDate(session.created_at, false)}
			</p>
			<p
				className={cn(
					"max-w-full truncate text-ds-button-foreground/60",
					compact ? "text-ios-caption2 leading-3" : "text-ios-caption leading-[13px]",
				)}
			>
				{summary}
			</p>

			{(hasBest || hasWorst) && (
				<div
					className={cn(
						"grid w-fit min-w-0 max-w-full items-center",
						compact ? "pt-2" : "pt-1.5",
						hasBest && hasWorst
							? "grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]"
							: "grid-cols-1",
					)}
				>
					{hasBest && session.best_player && (
						<div className={cn("min-w-0", hasWorst && "pr-4")}>
							<Performer
								performer={session.best_player}
								tone="best"
								compact={compact}
							/>
						</div>
					)}

					{hasBest && hasWorst && (
						<div
							aria-hidden="true"
							className={cn(
								"w-px bg-white/[0.13]",
								compact ? "h-[31px]" : "h-[38px]",
							)}
						/>
					)}

					{hasWorst && session.worst_player && (
						<div className={cn("min-w-0", hasBest && "pl-4")}>
							<Performer
								performer={session.worst_player}
								tone="worst"
								compact={compact}
							/>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function ActiveSessionContent({ session }: { session: SessionCardSession }) {
	const currentRound = Math.max(session.current_round ?? 1, 1);
	const totalRounds = Math.max(session.total_rounds ?? 0, 0);
	const hasRoundProgress = totalRounds > 0;
	const progress = hasRoundProgress
		? Math.min(currentRound / totalRounds, 1)
		: 0;
	const matchSummary = formatMatchSummary(session);

	return (
		<div className="flex h-full flex-col items-start gap-2.5">
			<p className="font-session-heading text-ios-display-20 font-bold leading-[25px] text-ds-button-foreground">
				{formatCardDate(session.created_at, true)}
			</p>

			<div className="w-full space-y-[7px]">
				<div className="flex min-w-0 items-baseline gap-1.5">
					<p className="shrink-0 font-session-heading text-ios-display-24 font-bold leading-[30px] text-ds-button-foreground">
						{hasRoundProgress ? `Runda ${currentRound}` : "Termin u toku"}
					</p>
					{hasRoundProgress && (
						<span className="text-ios-caption font-semibold text-ds-button-muted">
							od {totalRounds}
						</span>
					)}
					{matchSummary && (
						<span className="ml-auto truncate text-ios-caption2 font-semibold text-ds-button-muted">
							{matchSummary}
						</span>
					)}
				</div>

				<div
					className="h-1 overflow-hidden rounded-full bg-white/[0.08]"
					role={hasRoundProgress ? "progressbar" : undefined}
					aria-label={hasRoundProgress ? "Napredak termina" : undefined}
					aria-valuemin={hasRoundProgress ? 1 : undefined}
					aria-valuemax={hasRoundProgress ? totalRounds : undefined}
					aria-valuenow={hasRoundProgress ? currentRound : undefined}
				>
					<div
						className={cn(
							"h-full rounded-full bg-ds-control-selected",
							!hasRoundProgress && "w-0",
						)}
						style={hasRoundProgress ? { width: `${progress * 100}%` } : undefined}
					/>
				</div>
			</div>

			<div className="mt-auto flex w-full items-center justify-between gap-4">
				<span className="flex items-center gap-1.5 text-ios-caption font-bold text-ds-control-selected">
					<PlayIcon className="size-3 fill-current" aria-hidden="true" />
					Nastavi termin
				</span>
				<span className="text-ios-caption font-semibold text-ds-button-muted">
					{session.player_count} igrača
				</span>
			</div>
		</div>
	);
}

export function SessionCard({
	session,
	href = `/session/${session.id}`,
	presentation = "regular",
	className,
}: SessionCardProps) {
	const { trigger } = useWebHaptics();
	const compact = presentation === "compact";
	const active = session.status === "active";
	const matchSummary = formatMatchSummary(session);
	const roundSummary =
		active && session.total_rounds
			? `, runda ${Math.max(session.current_round ?? 1, 1)} od ${session.total_rounds}`
			: "";
	const accessibilityLabel = active
		? `Aktivan termin${roundSummary}, ${session.player_count} igrača. Otvara aktivni termin.`
		: `Završen termin, ${formatCardDate(session.created_at, false)}, ${
				session.player_count
		  } igrača${matchSummary ? `, ${matchSummary}` : ""}. Otvara završeni termin.`;

	return (
		<Link
			href={href}
			onClick={() => void trigger()}
			aria-label={accessibilityLabel}
			data-session-card="true"
			data-session-status={session.status}
			data-session-presentation={presentation}
			className={cn(
				"session-card block w-full p-[14px]",
				active
					? "min-h-[148px]"
					: compact
						? "min-h-[120px] p-[13px]"
						: "min-h-[128px]",
				className,
			)}
		>
			{active ? (
				<ActiveSessionContent session={session} />
			) : (
				<CompletedSessionContent session={session} compact={compact} />
			)}
		</Link>
	);
}
