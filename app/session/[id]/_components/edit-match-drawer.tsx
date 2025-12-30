"use client";

import { useState, useEffect } from "react";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stack } from "@/components/ui/stack";
import { Box } from "@/components/ui/box";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/ui/icon";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

type Match = {
	id: string;
	round_number: number;
	match_type: "singles" | "doubles";
	match_order: number;
	player_ids: string[];
	status?: "pending" | "completed";
	team1_score?: number | null;
	team2_score?: number | null;
};

type Player = {
	id: string;
	name: string;
	avatar: string | null;
};

type EditMatchDrawerProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	match: Match | null;
	team1Players: Player[];
	team2Players: Player[];
	onSave: (team1Score: number, team2Score: number, reason?: string) => Promise<void>;
	isSaving?: boolean;
};

export function EditMatchDrawer({
	open,
	onOpenChange,
	match,
	team1Players,
	team2Players,
	onSave,
	isSaving = false,
}: EditMatchDrawerProps) {
	const [team1Score, setTeam1Score] = useState<string>("");
	const [team2Score, setTeam2Score] = useState<string>("");
	const [reason, setReason] = useState<string>("");
	const [error, setError] = useState<string | null>(null);

	// Initialize scores when match changes
	useEffect(() => {
		if (match) {
			setTeam1Score(match.team1_score?.toString() ?? "");
			setTeam2Score(match.team2_score?.toString() ?? "");
			setReason("");
			setError(null);
		}
	}, [match]);

	const handleSave = async () => {
		setError(null);

		const score1 = parseInt(team1Score, 10);
		const score2 = parseInt(team2Score, 10);

		if (isNaN(score1) || isNaN(score2)) {
			setError("Both scores must be valid numbers");
			return;
		}

		if (score1 < 0 || score2 < 0) {
			setError("Scores cannot be negative");
			return;
		}

		try {
			await onSave(score1, score2, reason.trim() || undefined);
			onOpenChange(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save match");
		}
	};

	const isSingles = match?.match_type === "singles";
	const team1Name = isSingles
		? team1Players[0]?.name || "Unknown"
		: `${team1Players[0]?.name || ""} & ${team1Players[1]?.name || ""}`.trim();
	const team2Name = isSingles
		? team2Players[0]?.name || "Unknown"
		: `${team2Players[0]?.name || ""} & ${team2Players[1]?.name || ""}`.trim();

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent className="max-h-[90vh]">
				<DrawerHeader>
					<DrawerTitle>Edit Match Result</DrawerTitle>
				</DrawerHeader>

				<Box className="px-4 pb-4 overflow-y-auto">
					{error && (
						<Box className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
							<p className="text-sm text-destructive">{error}</p>
						</Box>
					)}

					{/* Team 1 */}
					<Stack direction="column" spacing={4} className="mb-6">
						<Stack direction="row" alignItems="center" spacing={3}>
							{isSingles ? (
								<Avatar className="size-12 border-2 border-border">
									<AvatarImage
										src={team1Players[0]?.avatar || undefined}
										alt={team1Players[0]?.name}
									/>
									<AvatarFallback>
										{team1Players[0]?.name?.charAt(0).toUpperCase() || "?"}
									</AvatarFallback>
								</Avatar>
							) : (
								<Stack direction="row" spacing={-2}>
									{team1Players.map((player) => (
										<Avatar
											key={player.id}
											className="size-10 border-2 border-background"
										>
											<AvatarImage
												src={player.avatar || undefined}
												alt={player.name}
											/>
											<AvatarFallback>
												{player.name?.charAt(0).toUpperCase() || "?"}
											</AvatarFallback>
										</Avatar>
									))}
								</Stack>
							)}
							<Box>
								<p className="font-semibold">{team1Name}</p>
							</Box>
						</Stack>
						<Box>
							<Label htmlFor="team1-score">Team 1 Score</Label>
							<Input
								id="team1-score"
								type="number"
								value={team1Score}
								onChange={(e) => setTeam1Score(e.target.value)}
								placeholder="0"
								min="0"
								disabled={isSaving}
								className="mt-1"
							/>
						</Box>
					</Stack>

					{/* Team 2 */}
					<Stack direction="column" spacing={4} className="mb-6">
						<Stack direction="row" alignItems="center" spacing={3}>
							{isSingles ? (
								<Avatar className="size-12 border-2 border-border">
									<AvatarImage
										src={team2Players[0]?.avatar || undefined}
										alt={team2Players[0]?.name}
									/>
									<AvatarFallback>
										{team2Players[0]?.name?.charAt(0).toUpperCase() || "?"}
									</AvatarFallback>
								</Avatar>
							) : (
								<Stack direction="row" spacing={-2}>
									{team2Players.map((player) => (
										<Avatar
											key={player.id}
											className="size-10 border-2 border-background"
										>
											<AvatarImage
												src={player.avatar || undefined}
												alt={player.name}
											/>
											<AvatarFallback>
												{player.name?.charAt(0).toUpperCase() || "?"}
											</AvatarFallback>
										</Avatar>
									))}
								</Stack>
							)}
							<Box>
								<p className="font-semibold">{team2Name}</p>
							</Box>
						</Stack>
						<Box>
							<Label htmlFor="team2-score">Team 2 Score</Label>
							<Input
								id="team2-score"
								type="number"
								value={team2Score}
								onChange={(e) => setTeam2Score(e.target.value)}
								placeholder="0"
								min="0"
								disabled={isSaving}
								className="mt-1"
							/>
						</Box>
					</Stack>

					{/* Edit Reason (Optional) */}
					<Box className="mb-4">
						<Label htmlFor="edit-reason">Reason for Edit (Optional)</Label>
						<Input
							id="edit-reason"
							type="text"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							placeholder="e.g., Score correction"
							disabled={isSaving}
							className="mt-1"
						/>
					</Box>

					<Box className="p-3 bg-muted/50 rounded-lg border border-border/50">
						<p className="text-xs text-muted-foreground">
							<Icon icon="lucide:info" className="inline size-3 mr-1" />
							Editing this match will recalculate Elo ratings for all subsequent matches in this session.
						</p>
					</Box>
				</Box>

				<DrawerFooter>
					<Stack direction="row" spacing={2} justifyContent="end">
						<Button
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={isSaving}
						>
							Cancel
						</Button>
						<Button onClick={handleSave} disabled={isSaving}>
							{isSaving ? (
								<>
									<Icon icon="lucide:loader-circle" className="animate-spin mr-2" />
									Saving...
								</>
							) : (
								"Save Changes"
							)}
						</Button>
					</Stack>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}

