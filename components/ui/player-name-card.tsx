"use client";

import {
	ParticipantNameCard,
	type ParticipantAvatarBorder,
	type ParticipantNameCardSize,
	type ParticipantNameCardVariant,
} from "@/components/ui/participant-name-card";

type PlayerNameCardProps = {
	name: string;
	avatar: string | null;
	id?: string;
	size?: ParticipantNameCardSize;
	variant?: ParticipantNameCardVariant;
	avatarBorder?: ParticipantAvatarBorder;
	reverse?: boolean;
	className?: string;
	addon?: React.ReactNode;
};

export function PlayerNameCard({
	name,
	avatar,
	id,
	size = "md",
	variant = "horizontal",
	avatarBorder = "none",
	reverse = false,
	className,
	addon,
}: PlayerNameCardProps) {
	return (
		<ParticipantNameCard
			participants={[{ name, avatar, id }]}
			size={size}
			variant={variant}
			avatarBorder={avatarBorder}
			reverse={reverse}
			className={className}
			addon={addon}
		/>
	);
}
