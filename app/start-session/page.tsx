"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWebHaptics } from "web-haptics/react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { SessionCreationGuard } from "@/components/auth/session-creation-guard";
import { AppShell } from "@/components/app-shell";
import { Stack } from "@/components/ui/stack";
import { Box } from "@/components/ui/box";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { SurfaceCard } from "@/components/ui/surface-card";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function StartSessionPageContent() {
	const router = useRouter();
	const { trigger } = useWebHaptics();
	const [selectedPlayers, setSelectedPlayers] = useState<number | null>(null);
	const [fourPlayerFormat, setFourPlayerFormat] = useState<
		"singles" | "mixed" | null
	>(null);
	const playerOptions = [2, 3, 4, 5, 6];

	return (
		<AppShell title={t.startSession.title}>
			{/* Step Indicator */}
			<Box className="flex justify-end">
				<Box className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full uppercase tracking-wider">
					{t.startSession.stepIndicator}
				</Box>
			</Box>

			{/* Subtitle */}
			<p className="text-muted-foreground">
				{t.startSession.subtitle}
			</p>

			{/* Number of Players Section */}
			<Box>
				<h3 className="text-lg font-bold text-foreground mb-4 px-1">
					{t.startSession.numberOfPlayers}
				</h3>
				<Box className="grid grid-cols-2 gap-4">
					{playerOptions.map((num) => {
						const isSelected =
							selectedPlayers === num;
						return (
							<SurfaceCard
								key={num}
								component="button"
								variant="interactive"
								clipped
									onClick={() => {
										void trigger();
										setSelectedPlayers(num);
									}}
									className={cn(
										"flex flex-col items-center justify-center gap-2",
										isSelected
											? "bg-primary border-2 border-primary shadow-[0_0_20px_rgba(59,130,246,0.3)]"
											: undefined,
									)}
							>
								{isSelected && (
									<Box className="absolute top-0 right-0 p-2">
										<Icon
											icon="solar:check-circle-bold"
											className="size-5 text-primary-foreground"
										/>
									</Box>
								)}
								<span
									className={cn(
										"text-4xl font-bold font-heading",
										isSelected
											? "text-primary-foreground"
											: "text-foreground"
									)}
								>
									{num}
								</span>
								<span
									className={cn(
										"text-xs font-bold uppercase tracking-widest",
										isSelected
											? "text-primary-foreground"
											: "text-muted-foreground"
									)}
								>
									{t.startSession.players}
								</span>
							</SurfaceCard>
						);
					})}
				</Box>
				{selectedPlayers === 4 && (
					<Box className="mt-6">
						<h3 className="text-lg font-bold text-foreground mb-4 px-1">
							{t.startSession.fourPlayerFormat.title}
						</h3>
						<Box className="grid grid-cols-2 gap-4">
							{(["singles", "mixed"] as const).map((format) => {
								const option =
									t.startSession.fourPlayerFormat[format];
								const isSelected = fourPlayerFormat === format;

								return (
									<SurfaceCard
										key={format}
										component="button"
										variant="interactive"
										clipped
										onClick={() => {
											void trigger();
											setFourPlayerFormat(format);
										}}
										className={cn(
											"items-start text-left gap-2",
											isSelected
												? "bg-primary border-2 border-primary"
												: undefined,
										)}
									>
										<Icon
											icon={
												format === "singles"
													? "solar:user-bold"
													: "solar:users-group-rounded-bold"
											}
											className={cn(
												"size-6",
												isSelected
													? "text-primary-foreground"
													: "text-primary",
											)}
										/>
										<p
											className={cn(
												"font-bold",
												isSelected
													? "text-primary-foreground"
													: "text-foreground",
											)}
										>
											{option.title}
										</p>
										<p
											className={cn(
												"text-xs leading-relaxed",
												isSelected
													? "text-primary-foreground/80"
													: "text-muted-foreground",
											)}
										>
											{option.description}
										</p>
									</SurfaceCard>
								);
							})}
						</Box>
					</Box>
				)}
				<Box className="mt-6 bg-secondary/30 rounded-2xl p-4 border border-border/30">
					<Stack
						direction="row"
						alignItems="start"
						spacing={3}
					>
						<Icon
							icon="solar:info-circle-bold"
							className="size-5 text-primary shrink-0 mt-0.5"
						/>
						<p className="text-sm text-muted-foreground leading-relaxed">
							{t.startSession.info}
						</p>
					</Stack>
				</Box>
			</Box>
			{/* Continue Button */}
			<Box className="pt-4">
				<Button
					disabled={
						selectedPlayers === null ||
						(selectedPlayers === 4 && fourPlayerFormat === null)
					}
					onClick={() => {
						if (
							selectedPlayers !== null &&
							(selectedPlayers !== 4 || fourPlayerFormat !== null)
						) {
							void trigger();
							const formatParam =
								selectedPlayers === 4
									? `&format=${fourPlayerFormat}`
									: "";
							router.push(
								`/start-session/players?count=${selectedPlayers}${formatParam}`
							);
						}
					}}
					className="w-full py-4 px-6 rounded-full font-bold text-lg shadow-lg h-auto"
				>
					<Stack
						direction="row"
						alignItems="center"
						justifyContent="center"
						spacing={2}
					>
						<span>{t.startSession.continue}</span>
						<Icon
							icon="solar:arrow-right-linear"
							className="size-5"
						/>
					</Stack>
				</Button>
			</Box>
		</AppShell>
	);
}

export default function StartSessionPage() {
	return (
		<AuthGuard>
			<SessionCreationGuard>
				<StartSessionPageContent />
			</SessionCreationGuard>
		</AuthGuard>
	);
}
