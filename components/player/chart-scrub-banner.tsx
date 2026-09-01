export type ChartScrubMatch = {
	match: number;
	elo: number;
	date: string;
	opponent?: string;
	delta?: number;
	scoreFor?: number | null;
	scoreAgainst?: number | null;
	result?: "win" | "loss" | "draw" | null;
};

const dateFormatter = new Intl.DateTimeFormat("sr-Latn-RS", {
	day: "numeric",
	month: "short",
	year: "numeric",
});

const resultLabels = { win: "Pobeda", loss: "Poraz", draw: "Nerešeno" };
const resultColors = {
	win: "text-[rgb(var(--ds-native-lime))]",
	loss: "text-[rgb(var(--ds-native-coral))]",
	draw: "text-[rgb(var(--ds-native-amber))]",
};

function formatElo(value: number | undefined) {
	return value !== undefined && Number.isFinite(value)
		? Math.round(value).toLocaleString("sr-Latn-RS")
		: "—";
}

/** A single fixed-height shell: swapping matches never moves the plot below it. */
export function ChartScrubBanner({ point }: { point: ChartScrubMatch | null }) {
	const date = point ? new Date(point.date) : null;
	const dateLabel = date && !Number.isNaN(date.getTime()) ? dateFormatter.format(date) : "—";
	const result = point?.result ? resultLabels[point.result] : "Rezultat";
	const hasScore = point?.scoreFor != null && point.scoreAgainst != null
		&& Number.isFinite(point.scoreFor) && Number.isFinite(point.scoreAgainst);
	const score = hasScore ? `${point.scoreFor}–${point.scoreAgainst}` : "—";
	const delta = point?.delta !== undefined && Number.isFinite(point.delta) ? Math.round(point.delta) : null;
	const deltaLabel = delta === null ? "—" : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)}`;
	const deltaColor = delta === null || delta === 0
		? "text-[rgb(var(--ds-native-muted))]"
		: delta > 0 ? resultColors.win : resultColors.loss;

	return (
		<div
			data-chart-scrub-banner
			role="group"
			aria-label={point ? "Izabrani meč" : "Pregled mečeva"}
			className="grid h-[88px] min-h-[88px] shrink-0 grid-rows-[16px_36px] content-center gap-y-2 overflow-hidden rounded-[20px] bg-[rgb(var(--ds-native-surface))] px-3.5 text-[rgb(var(--ds-native-bone))]"
		>
			<div className="flex min-w-0 items-center justify-between gap-3 text-ios-caption leading-4 text-[rgb(var(--ds-native-muted))]">
				<span className="shrink-0 font-session-label text-ios-label-12 font-semibold uppercase tracking-[0.8px]">
					{point ? `Meč ${point.match}` : "Istorija mečeva"}
				</span>
				{point && <span className="truncate tabular-nums">{dateLabel}</span>}
			</div>

			{point ? (
				<div className="grid min-w-0 grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] items-center gap-x-2">
					<div className="min-w-0">
						<p className="truncate text-ios-body font-semibold leading-5" title={point.opponent || "Nepoznat protivnik"}>
							<span className="mr-1 font-normal text-[rgb(var(--ds-native-muted))]">vs</span>
							{point.opponent || "Nepoznat protivnik"}
						</p>
					</div>
					<div data-chart-scrub-result className="min-w-0 text-center">
						<strong
							className="block text-ios-display-20 font-semibold leading-5 tabular-nums"
							aria-label={hasScore ? `${result}, rezultat ${score}, prvo rezultat ovog igrača` : "Rezultat nije zabeležen"}
						>
							{score}
						</strong>
						<p className={`text-ios-caption leading-4 ${point.result ? resultColors[point.result] : "text-[rgb(var(--ds-native-muted))]"}`}>
							{result}
						</p>
					</div>
					<div className="min-w-0 text-right tabular-nums">
						<p className={`text-ios-body font-semibold leading-5 ${deltaColor}`} aria-label={delta === null ? "Promena Elo rejtinga nije zabeležena" : `Promena ${deltaLabel} Elo`}>
							{deltaLabel}<span className="ml-1 text-ios-caption font-normal text-[rgb(var(--ds-native-muted))]">Elo</span>
						</p>
						<p className="text-ios-caption leading-4 text-[rgb(var(--ds-native-muted))]" aria-label={`${formatElo(point.elo)} Elo posle meča`}>
							{formatElo(point.elo)}
						</p>
					</div>
				</div>
			) : (
				<div className="min-w-0">
					<p className="truncate text-ios-subheadline font-semibold leading-5">Prevuci preko grafikona</p>
					<p className="truncate text-ios-caption leading-4 text-[rgb(var(--ds-native-muted))]">Za rezultat meča i promenu Elo rejtinga</p>
				</div>
			)}
		</div>
	);
}
