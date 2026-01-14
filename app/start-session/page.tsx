"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { Stack } from "@/components/ui/stack";
import { Box } from "@/components/ui/box";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function StartSessionPageContent() {
	const router = useRouter();
	const [selectedPlayers, setSelectedPlayers] = useState<number | null>(null);
	const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
	const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
		if (typeof window === "undefined") return null;
		const stored = sessionStorage.getItem("sessionDateTime");
		if (stored) {
			try {
				return new Date(stored);
			} catch (e) {
				return null;
			}
		}
		return null;
	});

	// Format date/time for display
	const formatSessionDateTime = () => {
		const date = selectedDate || new Date();
		const now = new Date();
		const isToday =
			date.getDate() === now.getDate() &&
			date.getMonth() === now.getMonth() &&
			date.getFullYear() === now.getFullYear();

		const days = ["Ned", "Pon", "Uto", "Sre", "Čet", "Pet", "Sub"];
		const dayName = days[date.getDay()];
		const day = date.getDate();
		const month = date.getMonth() + 1;
		const hours = date.getHours().toString().padStart(2, "0");
		const minutes = date.getMinutes().toString().padStart(2, "0");

		if (isToday) {
			return `Danas · ${dayName}, ${day}. ${month}. · ${hours}:${minutes}`;
		}
		return `${dayName}, ${day}. ${month}. · ${hours}:${minutes}`;
	};

	// Format date for input (YYYY-MM-DD)
	const formatDateForInput = (date: Date) => {
		const year = date.getFullYear();
		const month = (date.getMonth() + 1).toString().padStart(2, "0");
		const day = date.getDate().toString().padStart(2, "0");
		return `${year}-${month}-${day}`;
	};

	// Format time for input (HH:MM)
	const formatTimeForInput = (date: Date) => {
		const hours = date.getHours().toString().padStart(2, "0");
		const minutes = date.getMinutes().toString().padStart(2, "0");
		return `${hours}:${minutes}`;
	};

	// Handle date/time change
	const handleDateTimeChange = (dateValue: string, timeValue: string) => {
		if (dateValue && timeValue) {
			const [hours, minutes] = timeValue.split(":");
			const newDate = new Date(dateValue);
			newDate.setHours(parseInt(hours, 10));
			newDate.setMinutes(parseInt(minutes, 10));
			setSelectedDate(newDate);
			sessionStorage.setItem("sessionDateTime", newDate.toISOString());
		}
	};

	const playerOptions = [3, 4, 5, 6];

	return (
		<SidebarProvider>
			<AppSidebar variant="inset" />
			<SidebarInset>
				<SiteHeader title={t.startSession.title} />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
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

							{/* Session Time Section */}
							<Box>
								<Sheet
									open={isDatePickerOpen}
									onOpenChange={setIsDatePickerOpen}
								>
									<SheetTrigger asChild>
										<Box className="bg-card rounded-[24px] p-5 border border-border/50 flex items-center justify-between group active:scale-[0.98] transition-all cursor-pointer">
											<Stack
												direction="row"
												alignItems="center"
												spacing={4}
											>
												<Box className="bg-primary/10 p-3 rounded-2xl text-primary">
													<Icon
														icon="solar:calendar-date-bold"
														className="size-6"
													/>
												</Box>
												<Stack
													direction="column"
													spacing={0}
												>
													<p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
														{
															t.startSession
																.sessionTime
														}
													</p>
													<p className="text-base font-semibold">
														{formatSessionDateTime()}
													</p>
												</Stack>
											</Stack>
											<Icon
												icon="solar:pen-bold"
												className="size-5 text-muted-foreground group-active:text-primary transition-colors"
											/>
										</Box>
									</SheetTrigger>
									<SheetContent>
										<SheetHeader>
											<SheetTitle>
												{t.startSession.sessionTime}
											</SheetTitle>
										</SheetHeader>
										<Stack
											direction="column"
											spacing={6}
											className="mt-6"
										>
											<Box>
												<Label
													htmlFor="session-date"
													className="mb-2 block"
												>
													Datum
												</Label>
												<Input
													id="session-date"
													type="date"
													defaultValue={formatDateForInput(
														selectedDate ||
															new Date()
													)}
													onChange={(e) => {
														const dateValue =
															e.target.value;
														const currentDate =
															selectedDate ||
															new Date();
														const timeValue =
															formatTimeForInput(
																currentDate
															);
														handleDateTimeChange(
															dateValue,
															timeValue
														);
													}}
													className="w-full"
												/>
											</Box>
											<Box>
												<Label
													htmlFor="session-time"
													className="mb-2 block"
												>
													Vreme
												</Label>
												<Input
													id="session-time"
													type="time"
													defaultValue={formatTimeForInput(
														selectedDate ||
															new Date()
													)}
													onChange={(e) => {
														const timeValue =
															e.target.value;
														const currentDate =
															selectedDate ||
															new Date();
														const dateValue =
															formatDateForInput(
																currentDate
															);
														handleDateTimeChange(
															dateValue,
															timeValue
														);
													}}
													className="w-full"
												/>
											</Box>
											<Button
												onClick={() =>
													setIsDatePickerOpen(false)
												}
												className="w-full"
											>
												Gotovo
											</Button>
										</Stack>
									</SheetContent>
								</Sheet>
							</Box>

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
											<Box
												key={num}
												component="button"
												onClick={() =>
													setSelectedPlayers(num)
												}
												className={cn(
													"rounded-[24px] p-6 border flex flex-col items-center justify-center gap-2 relative overflow-hidden active:scale-95 transition-all cursor-pointer",
													isSelected
														? "bg-primary border-2 border-primary shadow-[0_0_20px_rgba(59,130,246,0.3)]"
														: "bg-card border-border/50"
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
											</Box>
										);
									})}
								</Box>
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
									disabled={selectedPlayers === null}
									onClick={() => {
										if (selectedPlayers !== null) {
											router.push(
												`/start-session/players?count=${selectedPlayers}`
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
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

export default function StartSessionPage() {
	return (
		<AuthGuard>
			<StartSessionPageContent />
		</AuthGuard>
	);
}
