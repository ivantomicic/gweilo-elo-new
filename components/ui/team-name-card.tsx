"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type TeamNameCardProps = {
	player1: {
		name: string;
		avatar: string | null;
		id?: string;
	};
	player2: {
		name: string;
		avatar: string | null;
		id?: string;
	};
	size?: "sm" | "md" | "lg";
	variant?: "horizontal" | "vertical";
	className?: string;
};

const sizeClasses = {
	sm: "h-8 w-8",
	md: "h-10 w-10",
	lg: "h-16 w-16",
};

const textSizeClasses = {
	sm: "text-xs",
	md: "text-sm",
	lg: "text-base",
};

export function TeamNameCard({
	player1,
	player2,
	size = "md",
	variant = "horizontal",
	className,
}: TeamNameCardProps) {
	const avatarSize = sizeClasses[size];
	const textSize = textSizeClasses[size];

	if (variant === "vertical") {
		return (
			<div className={cn("flex flex-col items-center gap-2", className)}>
				{/* Stacked avatars */}
				<div className="relative flex items-center">
					<Avatar className={avatarSize}>
						<AvatarImage
							src={player1.avatar || undefined}
							alt={player1.name}
						/>
						<AvatarFallback className={size === "lg" ? "text-lg" : ""}>
							{player1.name.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>
					<Avatar className={cn(avatarSize, "-ml-2")}>
						<AvatarImage
							src={player2.avatar || undefined}
							alt={player2.name}
						/>
						<AvatarFallback className={size === "lg" ? "text-lg" : ""}>
							{player2.name.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>
				</div>
				{/* Names */}
				<span className={cn("font-semibold text-center", textSize)}>
					{player1.name} & {player2.name}
				</span>
			</div>
		);
	}

	return (
		<div className={cn("flex items-center gap-3", className)}>
			{/* Stacked avatars */}
			<div className="relative flex items-center">
				<Avatar className={avatarSize}>
					<AvatarImage
						src={player1.avatar || undefined}
						alt={player1.name}
					/>
					<AvatarFallback className={size === "lg" ? "text-lg" : ""}>
						{player1.name.charAt(0).toUpperCase()}
					</AvatarFallback>
				</Avatar>
				<Avatar className={cn(avatarSize, "-ml-2")}>
					<AvatarImage
						src={player2.avatar || undefined}
						alt={player2.name}
					/>
					<AvatarFallback className={size === "lg" ? "text-lg" : ""}>
						{player2.name.charAt(0).toUpperCase()}
					</AvatarFallback>
				</Avatar>
			</div>
			{/* Names */}
			<span className={cn("font-medium", textSize)}>
				{player1.name} & {player2.name}
			</span>
		</div>
	);
}

