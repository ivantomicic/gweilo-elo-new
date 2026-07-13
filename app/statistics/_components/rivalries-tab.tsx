"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PlayerTableIdentity } from "@/components/ui/stats-table-cells";
import { StateBlock } from "@/components/ui/state-block";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { t } from "@/lib/i18n";

type PlayerOption = {
	player_id: string;
	display_name: string;
};

type Rivalry = {
	opponentId: string;
	opponentName: string;
	opponentAvatar: string | null;
	totalMatches: number;
	wins: number;
	losses: number;
	draws: number;
	winRate: number;
	lastPlayedAt: string | null;
	streak: { result: "win" | "loss"; count: number } | null;
};

type RivalryResponse = {
	player: {
		id: string;
		displayName: string;
		avatar: string | null;
	};
	rivalries: Rivalry[];
};

type RivalriesTabProps = {
	accessToken: string;
	selectedPlayerId: string;
	players: PlayerOption[];
	onPlayerChange: (playerId: string) => void;
};

function formatLastPlayed(value: string | null) {
	if (!value) return "-";
	return new Intl.DateTimeFormat("sr-Latn-RS", {
		day: "2-digit",
		month: "2-digit",
		year: "2-digit",
	}).format(new Date(value));
}

export function RivalriesTab({
	accessToken,
	selectedPlayerId,
	players,
	onPlayerChange,
}: RivalriesTabProps) {
	const router = useRouter();
	const [data, setData] = useState<RivalryResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const controller = new AbortController();

		async function loadRivalries() {
			setLoading(true);
			setError(null);

			try {
				const response = await fetch(
					`/api/statistics/rivalries?playerId=${encodeURIComponent(selectedPlayerId)}`,
					{
						cache: "no-store",
						signal: controller.signal,
						headers: { Authorization: `Bearer ${accessToken}` },
					},
				);

				if (!response.ok) {
					throw new Error("Failed to load rivalries");
				}

				setData((await response.json()) as RivalryResponse);
			} catch (loadError) {
				if ((loadError as Error).name !== "AbortError") {
					setError(t.statistics.rivalries.error);
				}
			} finally {
				if (!controller.signal.aborted) setLoading(false);
			}
		}

		void loadRivalries();
		return () => controller.abort();
	}, [accessToken, selectedPlayerId]);

	return (
		<div className="space-y-4">
			<div className="max-w-sm">
				<label className="mb-2 block text-sm font-medium" htmlFor="rivalry-player">
					{t.statistics.rivalries.playerLabel}
				</label>
				<Select value={selectedPlayerId} onValueChange={onPlayerChange}>
					<SelectTrigger id="rivalry-player">
						<SelectValue placeholder={t.statistics.rivalries.selectPlayer} />
					</SelectTrigger>
					<SelectContent>
						{players.map((player) => (
							<SelectItem key={player.player_id} value={player.player_id}>
								{player.display_name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="overflow-hidden rounded-lg border border-border/50 bg-card">
				{loading ? (
					<StateBlock variant="loading" title={t.statistics.rivalries.loading} />
				) : error ? (
					<StateBlock variant="error" title={error} />
				) : !data || data.rivalries.length === 0 ? (
					<StateBlock
						variant="empty"
						title={t.statistics.rivalries.empty}
						description={t.statistics.rivalries.emptyDescription}
					/>
				) : (
					<Table>
						<TableHeader className="bg-muted/30">
							<TableRow>
								<TableHead>{t.statistics.rivalries.opponent}</TableHead>
								<TableHead className="text-center">{t.statistics.table.matches}</TableHead>
								<TableHead className="text-center">{t.statistics.table.wins}</TableHead>
								<TableHead className="hidden text-center sm:table-cell">{t.statistics.table.losses}</TableHead>
								<TableHead className="hidden text-center md:table-cell">{t.statistics.table.draws}</TableHead>
								<TableHead className="text-center">{t.statistics.rivalries.winRate}</TableHead>
								<TableHead className="hidden text-center lg:table-cell">{t.statistics.rivalries.streak}</TableHead>
								<TableHead className="hidden text-center xl:table-cell">{t.statistics.rivalries.lastPlayed}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.rivalries.map((rivalry) => (
								<TableRow key={rivalry.opponentId}>
									<TableCell>
										<PlayerTableIdentity
											id={rivalry.opponentId}
											name={rivalry.opponentName}
											avatar={rivalry.opponentAvatar}
											size="md"
											onClick={() => router.push(`/player/${rivalry.opponentId}`)}
											mobileRecord={rivalry}
										/>
									</TableCell>
									<TableCell className="text-center font-medium">{rivalry.totalMatches}</TableCell>
									<TableCell className="text-center font-medium text-emerald-500">{rivalry.wins}</TableCell>
									<TableCell className="hidden text-center font-medium text-red-500 sm:table-cell">{rivalry.losses}</TableCell>
									<TableCell className="hidden text-center font-medium text-yellow-500 md:table-cell">{rivalry.draws}</TableCell>
									<TableCell className="text-center font-bold">{rivalry.winRate}%</TableCell>
									<TableCell className="hidden text-center font-mono font-semibold lg:table-cell">
										{rivalry.streak
											? `${rivalry.streak.result === "win" ? "W" : "L"}${rivalry.streak.count}`
											: "-"}
									</TableCell>
									<TableCell className="hidden text-center text-muted-foreground xl:table-cell">
										{formatLastPlayed(rivalry.lastPlayedAt)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</div>
		</div>
	);
}
