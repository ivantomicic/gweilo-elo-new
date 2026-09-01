import { canStartSession } from "../auth/roles";

type ActiveSession = {
	id: string;
	current_round: number | null;
	total_rounds: number;
};

/** Returning null means no link or reserved accessory space is rendered. */
export function getSessionAccessory({
	isAuthenticated,
	role,
	loading,
	pathname,
	activeSession,
}: {
	isAuthenticated: boolean | null;
	role: string | null | undefined;
	loading: boolean;
	pathname: string;
	activeSession: ActiveSession | null;
}) {
	if (
		isAuthenticated !== true || loading ||
		pathname.startsWith("/oauth/") || pathname.startsWith("/start-session")
	) return null;

	// Viewing an existing session is available to players; creation is not.
	if (activeSession) {
		if (pathname === `/session/${activeSession.id}`) return null;
		const round = Math.max(activeSession.current_round ?? 1, 1);
		return {
			href: `/session/${activeSession.id}`,
			label: `Termin u toku · Runda ${round} od ${activeSession.total_rounds}`,
			ariaLabel: `Aktivan termin, runda ${round} od ${activeSession.total_rounds}. Otvara aktivni termin.`,
		};
	}
	if (!canStartSession(role)) return null;
	return {
		href: "/start-session",
		label: "Pokreni novi termin",
		ariaLabel: "Pokreni novi termin. Otvara izbor igrača i raspored.",
	};
}
