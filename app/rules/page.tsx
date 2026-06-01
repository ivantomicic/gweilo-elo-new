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
		description: `Igrač se prikazuje na singl tabeli samo ako ima najmanje ${MIN_SINGLES_MATCHES} odigranih singl mečeva i ako je odigrao bar jedan singl meč u poslednjih ${MAX_SINGLES_INACTIVITY_DAYS} dana.`,
	},
	{
		title: "Dubl igrači",
		description: `Igrač se prikazuje u dubl poretku samo ako ima najmanje ${MIN_DOUBLES_PLAYER_MATCHES} odigranih dubl mečeva i ako je odigrao bar jedan dubl meč u poslednjih ${MAX_DOUBLES_PLAYER_INACTIVITY_DAYS} dana.`,
	},
	{
		title: "Dubl timovi",
		description: `Tim se prikazuje na tabeli dubl timova samo ako ima najmanje ${MIN_DOUBLES_TEAM_MATCHES} odigranih dubl mečeva i ako je taj tim igrao u poslednjih ${MAX_DOUBLES_TEAM_INACTIVITY_DAYS} dana.`,
	},
	{
		title: "Top 3 na početnoj",
		description: `Podijum na početnoj strani koristi ista pravila kao singl tabela: najmanje ${MIN_SINGLES_MATCHES} singl mečeva i aktivnost u poslednjih ${MAX_SINGLES_INACTIVITY_DAYS} dana.`,
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
									<h1 className="text-4xl font-bold font-heading">
										{t.pages.rules}
									</h1>
								</div>
								<div className="px-4 lg:px-6">
									<section className="max-w-4xl space-y-4">
										<div className="space-y-2">
											<h2 className="text-2xl font-semibold">
												Pravila prikaza na tabelama
											</h2>
											<p className="max-w-3xl text-sm leading-6 text-muted-foreground">
												Ova pravila određuju ko se vidi u statistici i na Top 3
												podijumu. Rezultati i Elo se ne brišu ako igrač ili tim
												trenutno ne ispunjava uslove.
											</p>
										</div>

										<div className="grid gap-3 md:grid-cols-2">
											{rankingRules.map((rule) => (
												<article
													key={rule.title}
													className="rounded-lg border border-border/50 bg-card p-4"
												>
													<h3 className="font-semibold">{rule.title}</h3>
													<p className="mt-2 text-sm leading-6 text-muted-foreground">
														{rule.description}
													</p>
												</article>
											))}
										</div>

										<div className="rounded-lg border border-border/50 bg-muted/30 p-4">
											<p className="text-sm leading-6 text-muted-foreground">
												Kada igrač ili tim ponovo ispuni uslove, automatski se
												vraća na odgovarajuću tabelu sa svojim postojećim Elo
												rejtingom.
											</p>
										</div>
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
