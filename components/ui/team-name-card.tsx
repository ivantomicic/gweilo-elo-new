"use client";

import {
	ParticipantNameCard,
	type ParticipantNameCardSize,
	type ParticipantNameCardVariant,
	type ParticipantIdentity,
} from "@/components/ui/participant-name-card";

type TeamNameCardProps = {
	player1: ParticipantIdentity;
	player2: ParticipantIdentity;
	size?: ParticipantNameCardSize;
	variant?: ParticipantNameCardVariant;
	reverse?: boolean;
	className?: string;
	addon?: React.ReactNode;
};

export function TeamNameCard({
	player1,
	player2,
	size = "md",
	variant = "horizontal",
	reverse = false,
	className,
	addon,
}: TeamNameCardProps) {
	return (
		<ParticipantNameCard
			participants={[player1, player2]}
			size={size}
			variant={variant}
			reverse={reverse}
			className={className}
			addon={addon}
		/>
	);
}
