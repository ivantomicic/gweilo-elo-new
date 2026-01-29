"use client";

import { useEffect, useState, useMemo } from "react";
import { Box } from "@/components/ui/box";
import { Stack } from "@/components/ui/stack";
import { Loading } from "@/components/ui/loading";
import { supabase } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";
import { PieChart, Pie } from "recharts";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	ChartLegend,
	ChartLegendContent,
	type ChartConfig,
} from "@/components/ui/chart";

type NoShowUser = {
	id: string;
	name: string;
	avatar: string | null;
	noShowCount: number;
	lastNoShowDate: string;
};

export function NoShowDistributionWidget() {
	const [users, setUsers] = useState<NoShowUser[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fetchNoShowStats = async () => {
			try {
				setLoading(true);

				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					setUsers([]);
					return;
				}

				const response = await fetch("/api/no-shows", {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				});

				if (!response.ok) {
					setUsers([]);
					return;
				}

				const data = await response.json();
				const fetchedUsers = data.users || [];
				setUsers(fetchedUsers);
			} catch (error) {
				console.error("Error fetching no-show stats:", error);
				setUsers([]);
			} finally {
				setLoading(false);
			}
		};

		fetchNoShowStats();
	}, []);

	// Prepare data for pie chart - top 5 players
	const topFive = users.slice(0, 5);
	
	// Calculate total for percentage calculation
	const totalNoShows = users.reduce((sum, user) => sum + user.noShowCount, 0);

	// Chart config for shadcn chart style - using blue shades
	const chartConfig = useMemo(() => {
		const config: ChartConfig = {
			value: {
				label: t.ispale.cards.noShows,
			},
		};

		// Blue shades: vary lightness from 40% to 70% (darker to lighter)
		const blueShades = [
			"217 91% 40%", // Darker blue
			"217 91% 50%", // Medium-dark blue
			"217 91% 60%", // Primary blue
			"217 91% 65%", // Medium-light blue
			"217 91% 70%", // Lighter blue
		];

		topFive.forEach((user, index) => {
			// Create a safe key from player name
			const key = user.name.toLowerCase().replace(/\s+/g, "");
			config[key] = {
				label: user.name,
				color: `hsl(${blueShades[index % blueShades.length]})`,
			};
		});

		return config;
	}, [topFive]);

	const chartData = useMemo(() => {
		return topFive.map((user) => {
			const key = user.name.toLowerCase().replace(/\s+/g, "");
			return {
				player: key,
				name: user.name,
				value: user.noShowCount,
				fill: `var(--color-${key})`,
			};
		});
	}, [topFive]);

	if (loading) {
		return (
			<Box className="bg-card rounded-[24px] border border-border/50 shadow-sm relative overflow-hidden p-6 aspect-[7/5] flex flex-col">
				<Stack
					direction="column"
					alignItems="center"
					justifyContent="center"
					className="relative z-10 w-full flex-1"
				>
					<Loading inline />
				</Stack>
			</Box>
		);
	}

	if (users.length === 0) {
		return (
			<Box className="bg-card rounded-[24px] border border-border/50 shadow-sm relative overflow-hidden p-6 aspect-[7/5] flex flex-col">
				<Stack
					direction="column"
					alignItems="center"
					justifyContent="center"
					className="relative z-10 w-full flex-1"
				>
					<Box className="text-center text-muted-foreground">
						{t.ispale.noNoShows}
					</Box>
				</Stack>
			</Box>
		);
	}

	return (
		<Box className="bg-card rounded-[24px] border border-border/50 shadow-sm relative overflow-hidden p-6 aspect-[7/5] flex flex-col">
			<Stack
				direction="column"
				alignItems="center"
				justifyContent="center"
				className="relative z-10 w-full flex-1"
			>
				<Box className="w-full h-full min-h-0">
					<ChartContainer
						config={chartConfig}
						className="w-full h-full"
					>
						<PieChart>
							<ChartTooltip
								cursor={false}
								content={
									<ChartTooltipContent
										hideLabel
										formatter={(value: any, name: any, item: any, index: any, payload: any) => {
											const numValue = typeof value === 'number' ? value : Number(value);
											const playerKey = typeof name === 'string' ? name : String(name);
											const dataEntry = chartData.find(
												(d) => d.player === playerKey
											);
											const playerName = dataEntry?.name || playerKey;
											return `${playerName}: ${numValue} ${numValue === 1 ? t.ispale.miss : t.ispale.misses}`;
										}}
									/>
								}
							/>
							<Pie
								data={chartData}
								dataKey="value"
								nameKey="player"
								stroke="0"
							/>
							<ChartLegend
								content={<ChartLegendContent nameKey="player" />}
							/>
						</PieChart>
					</ChartContainer>
				</Box>
			</Stack>
		</Box>
	);
}
