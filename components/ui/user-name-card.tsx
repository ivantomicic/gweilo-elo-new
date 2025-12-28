"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type UserNameCardProps = {
	name: string;
	avatar: string | null;
	id?: string;
	size?: "sm" | "md" | "lg";
	className?: string;
};

const sizeClasses = {
	sm: "h-8 w-8",
	md: "h-10 w-10",
	lg: "h-16 w-16",
};

const textSizeClasses = {
	sm: "text-sm",
	md: "text-base",
	lg: "text-lg",
};

export function UserNameCard({
	name,
	avatar,
	id,
	size = "md",
	className,
}: UserNameCardProps) {
	const avatarSize = sizeClasses[size];
	const textSize = textSizeClasses[size];

	return (
		<div className={cn("flex items-center gap-3", className)}>
			<Avatar className={avatarSize}>
				<AvatarImage src={avatar || undefined} alt={name} />
				<AvatarFallback className={size === "lg" ? "text-lg" : ""}>
					{name.charAt(0).toUpperCase()}
				</AvatarFallback>
			</Avatar>
			<span className={cn("font-medium", textSize)}>{name}</span>
		</div>
	);
}

