"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { PageLoading } from "@/components/ui/loading";
import { PageContainer } from "@/components/ui/page-container";
import { Icon } from "@/components/ui/icon";
import { StateBlock } from "@/components/ui/state-block";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useActiveSession } from "@/lib/client/use-active-session";
import { BasePlayerPicker } from "@/app/calculator/_components/base-player-picker";
import { OpponentPickerSection } from "@/app/calculator/_components/opponent-picker-section";
import { SelectedOpponentsSection } from "@/app/calculator/_components/selected-opponents-section";
import { useCalculatorData } from "@/app/calculator/_hooks/use-calculator-data";
import { useHorizontalScrollIndicators } from "@/app/calculator/_hooks/use-horizontal-scroll-indicators";
import { eloDeltaClass, formatDelta, opponentLabel } from "@/app/calculator/_lib/utils";

function CalculatorPageContent() {
	const {
		players,
		currentPlayer,
		availableOpponents,
		selectedOpponents,
		selectedOpponentIds,
		predictedResults,
		loading,
		error,
		refresh,
		selectPlayer,
		toggleOpponent,
		removeOpponent,
		setPredictionForOpponent,
		getOpponentDelta,
		totalProjectedDelta,
	} = useCalculatorData();
	const { activeSession } = useActiveSession();

	const { scrollRef, canScrollRight, updateScrollIndicators } =
		useHorizontalScrollIndicators(availableOpponents.length);

	return (
		<AppShell
			title={t.pages.calculator}
			showHeader={false}
			contentPadding={false}
			insetClassName="calculator-native-shell overflow-x-hidden"
			contentClassName="calculator-native min-w-0 !gap-0 !py-0"
		>
			<PageContainer className="flex flex-col gap-7 pb-10 pt-[calc(22px+env(safe-area-inset-top,0px))]">
				<header className="grid gap-2">
					<div className="flex items-center justify-between gap-3">
						<p className="font-session-label text-ios-label-13 font-semibold uppercase leading-[15px] tracking-[2px] text-[rgb(var(--ds-native-lime))]">
							Šta ako…
						</p>
						<Button type="button" variant="ghost" size="icon" className="calculator-refresh" aria-label="Osveži Elo kalkulator" onClick={refresh} disabled={loading}>
							<Icon icon="solar:refresh-bold" aria-hidden="true" />
						</Button>
					</div>
					<h1 className="font-session-display text-ios-display-46 font-black uppercase leading-[59px] text-[rgb(var(--ds-native-bone))] max-[359px]:text-[38px] max-[359px]:leading-[52px]">
						Elo kalkulator
					</h1>
					<p className="max-w-xl text-ios-subheadline leading-5 text-[rgb(var(--ds-native-muted))]">
						Izaberi protivnike i proveri kako bi svaki rezultat promenio rejting.
					</p>
				</header>
				{loading && players.length === 0 ? (
					<PageLoading label="Učitavanje Elo kalkulatora" />
				) : error && players.length === 0 ? (
					<div className="flex min-h-[55dvh] w-full items-center">
						<div className="calculator-flat-surface w-full rounded-[18px] p-5 text-center">
							<StateBlock variant="error" title="Kalkulator nije učitan" description={error} />
							<Button className="mt-4" variant="prominent" onClick={refresh}>
								Pokušaj ponovo
							</Button>
						</div>
					</div>
				) : !currentPlayer ? (
					<div className="flex min-h-[55dvh] w-full items-center">
						<StateBlock
							variant="empty"
							title="Nema igrača"
							description="Trenutno nema dostupnih igrača za kalkulator."
						/>
					</div>
				) : (
					<>
						{error && (
							<p role="alert" className="text-ios-subheadline text-[rgb(var(--ds-native-coral))]">
								{error} Prikazani su prethodno učitani podaci.
							</p>
						)}

						<BasePlayerPicker
							player={currentPlayer}
							players={players}
							onSelect={selectPlayer}
						/>

						<OpponentPickerSection
							availableOpponents={availableOpponents}
							selectedCount={selectedOpponentIds.length}
							scrollRef={scrollRef}
							canScrollRight={canScrollRight}
							onScroll={updateScrollIndicators}
							onToggleOpponent={toggleOpponent}
						/>

						<SelectedOpponentsSection
							player={currentPlayer}
							selectedOpponents={selectedOpponents}
							predictedResults={predictedResults}
							totalProjectedDelta={totalProjectedDelta}
							onRemoveOpponent={removeOpponent}
							onSetPredictionForOpponent={setPredictionForOpponent}
							getOpponentDelta={getOpponentDelta}
						/>

						<p className="pt-0.5 text-center text-ios-footnote leading-4 text-[rgb(var(--ds-native-muted))]">
							Ovo je procena. Kalkulator ne čuva rezultat i ne menja Elo.
						</p>
						{!activeSession && selectedOpponents.length > 0 && (
							<div className="calculator-projection-accessory mobile-nav-accessory md:hidden">
								<div
									className="calculator-floating-summary flex items-center gap-4 rounded-full px-4 py-3"
									role="status"
									aria-label={`Projektovana promena Elo rejtinga, ${formatDelta(totalProjectedDelta)} Elo`}
								>
									<div className="min-w-0">
										<p className="font-session-label text-ios-label-12 font-semibold uppercase leading-[15px] tracking-[1.3px] text-[rgb(var(--ds-native-lime))]">
											Projektovana promena
										</p>
										<p className="mt-0.5 text-ios-caption font-semibold leading-[14px] text-[rgb(var(--ds-native-muted))]">
											{selectedOpponents.length} {opponentLabel(selectedOpponents.length)}
										</p>
									</div>
									<strong
										className={cn(
											"ml-auto shrink-0 font-session-display text-ios-display-30 font-black leading-none tabular-nums",
											eloDeltaClass(totalProjectedDelta),
										)}
									>
										{formatDelta(totalProjectedDelta)} Elo
									</strong>
								</div>
							</div>
						)}
					</>
				)}
			</PageContainer>
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
