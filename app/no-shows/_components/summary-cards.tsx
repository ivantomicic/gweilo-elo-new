"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { PlayerNameCard } from "@/components/ui/player-name-card";
import { TrophyIcon } from "lucide-react";
import { t } from "@/lib/i18n";
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	ResponsiveContainer,
	Cell,
} from "recharts";

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
			{/* Card 1: Worst Offender - Hero Card */}
			<Card>
				<CardContent className="pt-6">
					{worstOffender ? (
						<div className="flex flex-col items-center space-y-6">
							{/* Trophy Icon */}
							<div className="relative">
								<TrophyIcon
									className="h-8 w-8 text-primary drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]"
									strokeWidth={2}
								/>
							</div>

							{/* Large Avatar */}
							<Avatar className="h-24 w-24">
								<AvatarImage
									src={worstOffender.avatar || undefined}
									alt={worstOffender.name}
								/>
								<AvatarFallback className="text-2xl">
									{worstOffender.name
										.charAt(0)
										.toUpperCase()}
								</AvatarFallback>
							</Avatar>

							{/* Player Name */}
							<div className="text-center space-y-2">
								<div className="text-xl font-semibold">
									{worstOffender.name}
								</div>
								<div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
									{t.ispale.cards.worstOffender}
								</div>
							</div>

							{/* Main Stat - No-show Count */}
							<div className="text-4xl font-bold text-primary">
								{worstOffender.noShowCount}
							</div>
						</div>
					) : (
						<div className="text-center text-muted-foreground py-8">
							{t.ispale.noNoShows}
						</div>
					)}
				</CardContent>
			</Card>

			{/* Card 2: Top 5 Ranking - Chart */}
			<Card>
				<CardContent className="pt-6">
					<div className="space-y-4">
						<div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
							{t.ispale.cards.topOffenders}
						</div>
						{topFive.length > 0 ? (
							<div className="h-[300px] w-full">
								<ResponsiveContainer width="100%" height="100%">
									<BarChart
										data={topFive.map((user) => ({
											name: user.name,
											count: user.noShowCount,
										}))}
										layout="vertical"
										margin={{ top: 5, right: 5, left: 80, bottom: 5 }}
									>
										<XAxis
											type="number"
											axisLine={false}
											tickLine={false}
											tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
										/>
										<YAxis
											type="category"
											dataKey="name"
											axisLine={false}
											tickLine={false}
											tick={{ fill: "hsl(var(--foreground))", fontSize: 12 }}
											width={75}
										/>
										<Bar
											dataKey="count"
											radius={[0, 4, 4, 0]}
											fill="hsl(var(--primary))"
										>
											{topFive.map((_, index) => (
												<Cell
													key={`cell-${index}`}
													fill="hsl(var(--primary))"
												/>
											))}
										</Bar>
									</BarChart>
								</ResponsiveContainer>
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
