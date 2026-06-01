"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/vendor/shadcn/sidebar";
import { t } from "@/lib/i18n";
import {
	MAX_DOUBLES_PLAYER_INACTIVITY_DAYS,
	MAX_DOUBLES_TEAM_INACTIVITY_DAYS,
	MAX_SINGLES_INACTIVITY_DAYS,
	MIN_DOUBLES_PLAYER_MATCHES,
	MIN_DOUBLES_TEAM_MATCHES,
	MIN_SINGLES_MATCHES,
} from "@/lib/statistics/min-matches";

const rankingRules = [
	{
		title: "Singl tabela",
		minimum: `${MIN_SINGLES_MATCHES} singl mečeva`,
		activity: `bar jedan singl meč u poslednjih ${MAX_SINGLES_INACTIVITY_DAYS} dana`,
	},
	{
		title: "Dubl igrači",
		minimum: `${MIN_DOUBLES_PLAYER_MATCHES} dubl mečeva`,
		activity: `bar jedan dubl meč u poslednjih ${MAX_DOUBLES_PLAYER_INACTIVITY_DAYS} dana`,
	},
	{
		title: "Dubl timovi",
		minimum: `${MIN_DOUBLES_TEAM_MATCHES} dubl mečeva kao tim`,
		activity: `taj tim je igrao u poslednjih ${MAX_DOUBLES_TEAM_INACTIVITY_DAYS} dana`,
	},
	{
		title: "Top 3 na početnoj",
		minimum: `${MIN_SINGLES_MATCHES} singl mečeva`,
		activity: `ista aktivnost kao singl tabela`,
	},
];

export default function RulesPage() {
	return (
		<AuthGuard>
			<SidebarProvider>
				<AppSidebar variant="inset" />
				<SidebarInset>
					<SiteHeader title={t.pages.rules} />
					<div className="flex flex-1 flex-col">
						<div className="@container/main flex flex-1 flex-col gap-2 pb-mobile-nav">
							<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
								<div className="px-4 lg:px-6">
									<section className="max-w-4xl space-y-5">
										<div className="max-w-3xl space-y-2">
											<h1 className="text-2xl font-semibold md:text-3xl">
												Pravila prikaza na tabelama
											</h1>
											<p className="max-w-3xl text-sm leading-6 text-muted-foreground">
												Ova pravila određuju ko se vidi u statistici i na Top 3
												podijumu. Rezultati i Elo se ne brišu ako igrač ili tim
												trenutno ne ispunjava uslove.
											</p>
										</div>

										<div className="overflow-hidden rounded-lg border border-border/50">
											<div className="hidden grid-cols-[1.1fr_1fr_1.4fr] border-b border-border/50 bg-muted/20 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
												<span>Prikaz</span>
												<span>Minimum</span>
												<span>Aktivnost</span>
											</div>
											{rankingRules.map((rule) => (
												<div
													key={rule.title}
													className="grid gap-2 border-b border-border/50 px-4 py-4 last:border-b-0 md:grid-cols-[1.1fr_1fr_1.4fr] md:items-center"
												>
													<div className="font-medium">{rule.title}</div>
													<div className="text-sm leading-6 text-muted-foreground">
														<span className="font-medium text-foreground md:hidden">
															Minimum:{" "}
														</span>
														{rule.minimum}
													</div>
													<div className="text-sm leading-6 text-muted-foreground">
														<span className="font-medium text-foreground md:hidden">
															Aktivnost:{" "}
														</span>
														{rule.activity}
													</div>
												</div>
											))}
										</div>

										<p className="max-w-3xl text-sm leading-6 text-muted-foreground">
											Kada igrač ili tim ponovo ispuni uslove, automatski se
											vraća na odgovarajuću tabelu sa svojim postojećim Elo
											rejtingom.
										</p>
									</section>
								</div>
							</div>
						</div>
					</div>
				</SidebarInset>
			</SidebarProvider>
		</AuthGuard>
	);
}
