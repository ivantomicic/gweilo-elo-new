"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/app-shell";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Stack } from "@/components/ui/stack";
import { StateBlock } from "@/components/ui/state-block";
import { t } from "@/lib/i18n";
import { OpponentPickerSection } from "@/app/calculator/_components/opponent-picker-section";
import { SelectedOpponentsSection } from "@/app/calculator/_components/selected-opponents-section";
import { useCalculatorData } from "@/app/calculator/_hooks/use-calculator-data";
import { useHorizontalScrollIndicators } from "@/app/calculator/_hooks/use-horizontal-scroll-indicators";

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
		<AppShell
			title={t.pages.calculator}
			insetClassName="overflow-x-hidden"
			contentClassName="min-w-0"
		>
			{loading ? (
				<SurfaceCard>
					<StateBlock
						variant="loading"
						title="Učitavanje kalkulatora..."
					/>
				</SurfaceCard>
			) : error ? (
				<SurfaceCard className="border-destructive/40">
					<StateBlock variant="error" title={error} />
				</SurfaceCard>
			) : !currentPlayer ? (
				<SurfaceCard>
					<StateBlock
						variant="empty"
						title="Vaš igrački profil nije dostupan za kalkulator."
					/>
				</SurfaceCard>
			) : (
				<Stack direction="column" spacing={6}>
					<OpponentPickerSection
						availableOpponents={availableOpponents}
						selectedCount={selectedOpponentIds.length}
						scrollRef={scrollRef}
						canScrollLeft={canScrollLeft}
						canScrollRight={canScrollRight}
						onScroll={updateScrollIndicators}
						onToggleOpponent={toggleOpponent}
					/>
					<SelectedOpponentsSection
						selectedOpponents={selectedOpponents}
						predictedResults={predictedResults}
						totalProjectedDelta={totalProjectedDelta}
						onRemoveOpponent={removeOpponent}
						onSetPredictionForOpponent={setPredictionForOpponent}
						getOpponentDelta={getOpponentDelta}
					/>
				</Stack>
			)}
		</AppShell>
	);
}

export default function CalculatorPage() {
	return (
		<AuthGuard>
			<CalculatorPageContent />
		</AuthGuard>
	);
}
