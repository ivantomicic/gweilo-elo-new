import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type CalculatorPlayerAvatarProps = {
	name: string;
	avatar: string | null;
	size: 48 | 58;
	className?: string;
};

function initials(name: string) {
	return name
		.trim()
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0])
		.join("")
		.toUpperCase();
}

export function CalculatorPlayerAvatar({
	name,
	avatar,
	size,
	className,
}: CalculatorPlayerAvatarProps) {
	return (
		<span
			className={cn("calculator-player-avatar shrink-0", className)}
			style={{ width: size, height: size }}
		>
			<Avatar className="size-full border-0">
				<AvatarImage src={avatar || undefined} alt={name} fallbackSeed={name} />
				<AvatarFallback
					className="bg-[rgb(var(--ds-native-raised))] font-session-display font-black text-[rgb(var(--ds-native-bone))]"
					style={{ fontSize: size * 0.32 }}
				>
					{initials(name)}
				</AvatarFallback>
			</Avatar>
		</span>
	);
}
