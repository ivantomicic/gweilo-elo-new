"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type PlayerNameCardProps = {
	name: string;
	avatar: string | null;
	id?: string;
	size?: "sm" | "md" | "lg";
	variant?: "horizontal" | "vertical";
	avatarBorder?: "none" | "primary" | "transparent";
	reverse?: boolean;
	className?: string;
	addon?: React.ReactNode;
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
	const avatarSize = sizeClasses[size];
	const textSize = textSizeClasses[size];

	if (variant === "vertical") {
		const borderClass =
			avatarBorder === "primary"
				? "border-2 border-primary"
				: avatarBorder === "transparent"
				? "border-2 border-transparent"
				: "";
		const avatarWrapperClass = borderClass ? "rounded-full p-0.5" : "";

		return (
			<div className={cn("flex flex-col items-center gap-2", className)}>
				{avatarBorder !== "none" ? (
					<div className={cn(avatarWrapperClass, borderClass)}>
						<Avatar className={avatarSize}>
							<AvatarImage src={avatar || undefined} alt={name} />
							<AvatarFallback
								className={size === "lg" ? "text-lg" : ""}
							>
								{name.charAt(0).toUpperCase()}
							</AvatarFallback>
						</Avatar>
					</div>
				) : (
					<Avatar className={avatarSize}>
						<AvatarImage src={avatar || undefined} alt={name} />
						<AvatarFallback
							className={size === "lg" ? "text-lg" : ""}
						>
							{name.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>
				)}
				<div className="flex flex-col items-center">
					<span className={cn("font-semibold", textSize)}>
						{name}
					</span>
					{addon}
				</div>
			</div>
		);
	}

	const borderClass =
		avatarBorder === "primary"
			? "border-2 border-primary/40"
			: avatarBorder === "transparent"
			? "border-2 border-transparent"
			: "";

	return (
		<div
			className={cn(
				"flex items-center gap-3",
				reverse && "flex-row-reverse",
				className
			)}
		>
			<Avatar className={cn(avatarSize, borderClass)}>
				<AvatarImage src={avatar || undefined} alt={name} />
				<AvatarFallback className={size === "lg" ? "text-lg" : ""}>
					{name.charAt(0).toUpperCase()}
				</AvatarFallback>
			</Avatar>
			<div className={cn("flex flex-col", reverse && "items-end")}>
				<span className={cn("font-medium", textSize)}>{name}</span>
				<div className={cn(reverse && "text-right")}>{addon}</div>
			</div>
		</div>
	);
}
