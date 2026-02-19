"use client";

import { AdminGuard } from "@/components/auth/admin-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { Box } from "@/components/ui/box";
import { Stack } from "@/components/ui/stack";
import {
	SidebarInset,
	SidebarProvider,
} from "@/components/vendor/shadcn/sidebar";
import { t } from "@/lib/i18n";
import { OpponentPickerSection } from "@/app/calculator/_components/opponent-picker-section";
import { SelectedOpponentsSection } from "@/app/calculator/_components/selected-opponents-section";
import { useCalculatorData } from "@/app/calculator/_hooks/use-calculator-data";
import { useHorizontalScrollIndicators } from "@/app/calculator/_hooks/use-horizontal-scroll-indicators";

function StatusCard({
	message,
	error = false,
}: {
	message: string;
	error?: boolean;
}) {
	return (
		<Box
			className={
				error
					? "bg-card rounded-[24px] p-6 border border-destructive/40"
					: "bg-card rounded-[24px] p-6 border border-border/50"
			}
		>
			<p className={error ? "text-destructive" : "text-muted-foreground"}>
				{message}
			</p>
		</Box>
	);
}

function CalculatorPageContent() {
	const {
		currentPlayer,
		availableOpponents,
		selectedOpponents,
		selectedOpponentIds,
		predictedResults,
		loading,
		error,
		toggleOpponent,
		removeOpponent,
		setPredictionForOpponent,
		getOpponentDelta,
		totalProjectedDelta,
	} = useCalculatorData();

	const {
		scrollRef,
		canScrollLeft,
		canScrollRight,
		updateScrollIndicators,
	} = useHorizontalScrollIndicators(availableOpponents.length);

	return (
		<SidebarProvider>
			<AppSidebar variant="inset" />
			<SidebarInset className="overflow-x-hidden">
				<SiteHeader title={t.pages.calculator} />
				<div className="flex flex-1 flex-col min-w-0">
					<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav min-w-0">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6 min-w-0">
							{loading ? (
								<StatusCard message="Učitavanje kalkulatora..." />
							) : error ? (
								<StatusCard
									message={error}
									error
								/>
							) : !currentPlayer ? (
								<StatusCard
									message="Nema podataka za trenutno prijavljenog igrača."
									error
								/>
							) : (
								<Stack
									direction="column"
									spacing={6}
								>
									<OpponentPickerSection
										availableOpponents={
											availableOpponents
										}
										selectedCount={
											selectedOpponentIds.length
										}
										scrollRef={scrollRef}
										canScrollLeft={canScrollLeft}
										canScrollRight={canScrollRight}
										onScroll={updateScrollIndicators}
										onToggleOpponent={toggleOpponent}
									/>
									<SelectedOpponentsSection
										selectedOpponents={selectedOpponents}
										predictedResults={predictedResults}
										totalProjectedDelta={
											totalProjectedDelta
										}
										onRemoveOpponent={removeOpponent}
										onSetPredictionForOpponent={
											setPredictionForOpponent
										}
										getOpponentDelta={getOpponentDelta}
									/>
								</Stack>
							)}
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

export default function CalculatorPage() {
	return (
		<AdminGuard>
			<CalculatorPageContent />
		</AdminGuard>
	);
}
