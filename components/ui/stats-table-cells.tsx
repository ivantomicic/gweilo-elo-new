"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { Box } from "@/components/ui/box";
import { PlayerNameCard } from "@/components/ui/player-name-card";
import { TeamNameCard } from "@/components/ui/team-name-card";
import { TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type ResultRecord = {
	wins: number;
	losses: number;
	draws: number;
};

type PlayerIdentity = {
	id?: string;
	name: string;
	avatar: string | null;
};

type TeamIdentity = {
	player1: PlayerIdentity;
	player2: PlayerIdentity;
};

type IdentitySize = "sm" | "md" | "lg";

export function getRankTextClass(index: number) {
	if (index === 0) return "text-yellow-500";
	if (index === 1) return "text-zinc-400";
	if (index === 2) return "text-orange-700";
	return "text-muted-foreground";
}

export function RankCell({
	index,
	className,
}: {
	index: number;
	className?: string;
}) {
	return (
		<TableCell
			className={cn("w-8 font-bold", getRankTextClass(index), className)}
		>
			{index + 1}
		</TableCell>
	);
}

export function MobileResultSummary({ wins, losses, draws }: ResultRecord) {
	return (
		<span className="text-[10px] font-mono font-semibold leading-tight md:hidden">
			<span className="text-emerald-500">{wins}</span>
			{" / "}
			<span className="text-red-500">{losses}</span>
			{" / "}
			<span className="text-muted-foreground">{draws}</span>
		</span>
	);
}

export function RankMovementIcon({ movement }: { movement?: number }) {
	if (movement === undefined || movement === 0) {
		return null;
	}

	return movement > 0 ? (
		<ArrowUp className="size-4 text-green-500" />
	) : (
		<ArrowDown className="size-4 text-red-500" />
	);
}

function ClickableIdentity({
	children,
	onClick,
	selected,
}: {
	children: React.ReactNode;
	onClick?: () => void;
	selected?: boolean;
}) {
	return (
		<Box
			onClick={onClick}
			className={cn(
				onClick && "cursor-pointer hover:opacity-80 transition-opacity",
				selected && "opacity-100",
			)}
		>
			{children}
		</Box>
	);
}

export function PlayerTableIdentity({
	name,
	avatar,
	id,
	size = "sm",
	onClick,
	selected,
	rankMovement,
	mobileRecord,
}: PlayerIdentity & {
	size?: IdentitySize;
	onClick?: () => void;
	selected?: boolean;
	rankMovement?: number;
	mobileRecord?: ResultRecord;
}) {
	return (
		<div className="flex items-center gap-3">
			<ClickableIdentity onClick={onClick} selected={selected}>
				<PlayerNameCard
					name={name}
					avatar={avatar}
					id={id}
					size={size}
					addon={
						mobileRecord ? (
							<MobileResultSummary {...mobileRecord} />
						) : undefined
					}
				/>
			</ClickableIdentity>
			<RankMovementIcon movement={rankMovement} />
		</div>
	);
}

export function TeamTableIdentity({
	player1,
	player2,
	size = "sm",
	onClick,
	selected,
	rankMovement,
	mobileRecord,
}: TeamIdentity & {
	size?: IdentitySize;
	onClick?: () => void;
	selected?: boolean;
	rankMovement?: number;
	mobileRecord?: ResultRecord;
}) {
	return (
		<div className="flex items-center gap-3">
			<ClickableIdentity onClick={onClick} selected={selected}>
				<TeamNameCard
					player1={player1}
					player2={player2}
					size={size}
					addon={
						mobileRecord ? (
							<MobileResultSummary {...mobileRecord} />
						) : undefined
					}
				/>
			</ClickableIdentity>
			<RankMovementIcon movement={rankMovement} />
		</div>
	);
}

export function formatRoundedEloChange(change: number) {
	const rounded = Math.round(change);
	return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

export function getEloChangeTextClass(change: number) {
	if (change > 0) return "text-emerald-500";
	if (change < 0) return "text-red-500";
	return "text-foreground";
}

export function EloChangeText({ change }: { change: number }) {
	return (
		<span className={getEloChangeTextClass(change)}>
			{formatRoundedEloChange(change)}
		</span>
	);
}

export function EloChangeCell({
	change,
	eloAfter,
}: {
	change: number;
	eloAfter: number;
}) {
	return (
		<TableCell className="text-center font-mono">
			<EloChangeText change={change} /> / {Math.round(eloAfter)}
		</TableCell>
	);
}
