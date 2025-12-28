"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { UserNameCard } from "@/components/ui/user-name-card";
import { t } from "@/lib/i18n";

type NoShowUser = {
	id: string;
	name: string;
	avatar: string | null;
	noShowCount: number;
	lastNoShowDate: string;
};

type SummaryCardsProps = {
	users: NoShowUser[];
};

export function SummaryCards({ users }: SummaryCardsProps) {
	const worstOffender = users[0] || null;
	const topFive = users.slice(0, 5);

	return (
		<div className="grid gap-4 md:grid-cols-2">
			{/* Card 1: Worst Offender */}
			<Card>
				<CardContent className="pt-6">
					{worstOffender ? (
						<div className="space-y-4">
							<div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
								{t.ispale.cards.worstOffender}
							</div>
							<div className="flex items-center gap-4">
								<Avatar className="h-16 w-16">
									<AvatarImage
										src={worstOffender.avatar || undefined}
										alt={worstOffender.name}
									/>
									<AvatarFallback className="text-lg">
										{worstOffender.name
											.charAt(0)
											.toUpperCase()}
									</AvatarFallback>
								</Avatar>
								<div className="flex-1">
									<div className="text-lg font-semibold">
										{worstOffender.name}
									</div>
									<div className="text-2xl font-bold text-primary">
										{worstOffender.noShowCount}
									</div>
								</div>
							</div>
						</div>
					) : (
						<div className="text-center text-muted-foreground py-8">
							{t.ispale.noNoShows}
						</div>
					)}
				</CardContent>
			</Card>

			{/* Card 2: Top 5 Ranking */}
			<Card>
				<CardContent className="pt-6">
					<div className="space-y-4">
						<div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
							{t.ispale.cards.topOffenders}
						</div>
						{topFive.length > 0 ? (
							<div className="space-y-3">
								{topFive.map((user, index) => (
									<div
										key={user.id}
										className="flex items-center gap-3"
									>
										<div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">
											{index + 1}
										</div>
										<UserNameCard
											name={user.name}
											avatar={user.avatar}
											id={user.id}
											className="flex-1 truncate"
										/>
										<div className="text-sm font-semibold">
											{user.noShowCount}
										</div>
									</div>
								))}
							</div>
						) : (
							<div className="text-center text-muted-foreground py-8">
								{t.ispale.noNoShows}
							</div>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
