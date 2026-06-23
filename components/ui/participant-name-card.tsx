"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export type ParticipantNameCardSize = "sm" | "md" | "lg";
export type ParticipantNameCardVariant = "horizontal" | "vertical";
export type ParticipantAvatarBorder = "none" | "primary" | "transparent";

export type ParticipantIdentity = {
	name: string;
	avatar: string | null;
	id?: string;
};

export type ParticipantIdentityGroup =
	| [ParticipantIdentity]
	| [ParticipantIdentity, ParticipantIdentity];

type ParticipantNameCardProps = {
	participants: ParticipantIdentityGroup;
	size?: ParticipantNameCardSize;
	variant?: ParticipantNameCardVariant;
	avatarBorder?: ParticipantAvatarBorder;
	reverse?: boolean;
	className?: string;
	addon?: React.ReactNode;
};

const sizeClasses: Record<ParticipantNameCardSize, string> = {
	sm: "h-8 w-8",
	md: "h-10 w-10",
	lg: "h-16 w-16",
};

const textSizeClasses: Record<ParticipantNameCardSize, string> = {
	sm: "text-xs",
	md: "text-sm",
	lg: "text-base",
};

function getInitial(name: string) {
	return name.charAt(0).toUpperCase();
}

function ParticipantAvatar({
	participant,
	size,
	className,
}: {
	participant: ParticipantIdentity;
	size: ParticipantNameCardSize;
	className?: string;
}) {
	return (
		<Avatar className={cn(sizeClasses[size], className)}>
			<AvatarImage
				src={participant.avatar || undefined}
				alt={participant.name}
			/>
			<AvatarFallback className={size === "lg" ? "text-lg" : ""}>
				{getInitial(participant.name)}
			</AvatarFallback>
		</Avatar>
	);
}

function ParticipantAvatars({
	participants,
	size,
	avatarBorder,
	variant,
}: {
	participants: ParticipantIdentityGroup;
	size: ParticipantNameCardSize;
	avatarBorder: ParticipantAvatarBorder;
	variant: ParticipantNameCardVariant;
}) {
	if (participants.length === 2) {
		const [player1, player2] = participants;

		return (
			<div className="relative flex items-center">
				<ParticipantAvatar participant={player1} size={size} />
				<ParticipantAvatar
					participant={player2}
					size={size}
					className="-ml-2"
				/>
			</div>
		);
	}

	const participant = participants[0];
	const horizontalBorderClass =
		avatarBorder === "primary"
			? "border-2 border-primary/40"
			: avatarBorder === "transparent"
				? "border-2 border-transparent"
				: "";

	if (variant === "vertical" && avatarBorder !== "none") {
		const verticalBorderClass =
			avatarBorder === "primary"
				? "border-2 border-primary"
				: "border-2 border-transparent";

		return (
			<div className={cn("rounded-full p-0.5", verticalBorderClass)}>
				<ParticipantAvatar participant={participant} size={size} />
			</div>
		);
	}

	return (
		<ParticipantAvatar
			participant={participant}
			size={size}
			className={horizontalBorderClass}
		/>
	);
}

function getDisplayName(participants: ParticipantIdentityGroup) {
	return participants.map((participant) => participant.name).join(" & ");
}

export function ParticipantNameCard({
	participants,
	size = "md",
	variant = "horizontal",
	avatarBorder = "none",
	reverse = false,
	className,
	addon,
}: ParticipantNameCardProps) {
	const textSize = textSizeClasses[size];
	const displayName = getDisplayName(participants);

	if (variant === "vertical") {
		return (
			<div className={cn("flex flex-col items-center gap-2", className)}>
				<ParticipantAvatars
					participants={participants}
					size={size}
					avatarBorder={avatarBorder}
					variant={variant}
				/>
				<div className="flex flex-col items-center">
					<span
						className={cn(
							"font-semibold",
							participants.length > 1 && "text-center",
							textSize,
						)}
					>
						{displayName}
					</span>
					{addon}
				</div>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"flex items-center gap-3",
				reverse && "flex-row-reverse",
				className,
			)}
		>
			<ParticipantAvatars
				participants={participants}
				size={size}
				avatarBorder={avatarBorder}
				variant={variant}
			/>
			<div className={cn("flex flex-col", reverse && "items-end")}>
				<span className={cn("font-medium", textSize)}>
					{displayName}
				</span>
				<div className={cn(reverse && "text-right")}>{addon}</div>
			</div>
		</div>
	);
}
