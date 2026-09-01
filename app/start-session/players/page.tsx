"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWebHaptics } from "web-haptics/react";

import { AuthGuard } from "@/components/auth/auth-guard";
import { SessionCreationGuard } from "@/components/auth/session-creation-guard";
import {
	SessionCreationSectionHeading,
	SessionCreationShell,
} from "@/components/sessions/session-creation-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Loading } from "@/components/ui/loading";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { createClientUuid } from "@/lib/sessions/client-uuid";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type SessionFormat = "singles" | "mixed";

type User = {
	id: string;
	name: string;
	avatar: string | null;
	email: string;
	role?: string;
	elo?: number;
	matchesPlayed?: number;
	isPlaceholder?: boolean;
};

const PLAYER_OPTIONS = [2, 3, 4, 5, 6] as const;
const FORMAT_OPTIONS = ["singles", "mixed"] as const;

function readStoredPlayers(expectedCount: number): User[] {
	if (typeof window === "undefined") return [];

	try {
		const value = JSON.parse(
			sessionStorage.getItem("selectedPlayers") ?? "[]",
		) as User[];
		return Array.isArray(value) && value.length <= expectedCount ? value : [];
	} catch {
		return [];
	}
}

function SelectPlayersPageContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { trigger } = useWebHaptics();
	const playerCount = Number.parseInt(searchParams.get("count") ?? "0", 10);
	const sessionFormat: SessionFormat =
		searchParams.get("format") === "singles" ? "singles" : "mixed";
	const isDoubles = playerCount === 6 && sessionFormat === "mixed";

	const [users, setUsers] = useState<User[]>([]);
	const [loadingUsers, setLoadingUsers] = useState(true);
	const [selectedPlayers, setSelectedPlayers] = useState<User[]>(() =>
		readStoredPlayers(playerCount),
	);
	const [showGuestSheet, setShowGuestSheet] = useState(false);
	const [guestName, setGuestName] = useState("");
	const railRef = useRef<HTMLDivElement>(null);
	const [canScrollLeft, setCanScrollLeft] = useState(false);
	const [canScrollRight, setCanScrollRight] = useState(false);

	const availablePlayers = useMemo(() => {
		const selectedIds = new Set(selectedPlayers.map((player) => player.id));
		return users.filter((player) => !selectedIds.has(player.id));
	}, [selectedPlayers, users]);

	const teams = useMemo(
		() => [
			selectedPlayers.slice(0, 2),
			selectedPlayers.slice(2, 4),
			selectedPlayers.slice(4, 6),
		],
		[selectedPlayers],
	);

	const isComplete =
		playerCount >= 2 && selectedPlayers.length === playerCount;

	const updateRailEdges = useCallback(() => {
		const rail = railRef.current;
		if (!rail) return;
		const maximumOffset = Math.max(0, rail.scrollWidth - rail.clientWidth);
		setCanScrollLeft(rail.scrollLeft > 4);
		setCanScrollRight(rail.scrollLeft < maximumOffset - 4);
	}, []);

	useEffect(() => {
		if (!playerCount || playerCount < 2 || playerCount > 6) {
			router.replace("/start-session");
		}
	}, [playerCount, router]);

	useEffect(() => {
		updateRailEdges();
		window.addEventListener("resize", updateRailEdges);
		return () => window.removeEventListener("resize", updateRailEdges);
	}, [availablePlayers.length, updateRailEdges]);

	useEffect(() => {
		const fetchUsersAndRatings = async () => {
			try {
				setLoadingUsers(true);
				const {
					data: { session },
				} = await supabase.auth.getSession();
				if (!session) return;

				const [usersResponse, ratingsResult] = await Promise.all([
					fetch("/api/admin/users?excludeGuests=true", {
						headers: {
							Authorization: `Bearer ${session.access_token}`,
						},
					}),
					supabase
						.from("player_ratings")
						.select("player_id, elo, matches_played"),
				]);

				if (!usersResponse.ok) {
					console.error("Failed to fetch users");
					return;
				}

				const usersData = await usersResponse.json();
				const ratingsMap = new Map<
					string,
					{ elo: number; matchesPlayed: number }
				>();
				for (const rating of ratingsResult.data ?? []) {
					ratingsMap.set(rating.player_id, {
						elo: rating.elo,
						matchesPlayed: rating.matches_played ?? 0,
					});
				}

				const rankedUsers = ((usersData.users ?? []) as User[])
					.filter((user) => user.role !== "guest")
					.map((user) => ({
						...user,
						elo: ratingsMap.get(user.id)?.elo,
						matchesPlayed: ratingsMap.get(user.id)?.matchesPlayed ?? 0,
					}))
					.sort(
						(a, b) => (b.matchesPlayed ?? 0) - (a.matchesPlayed ?? 0),
					);
				setUsers(rankedUsers);
			} catch (error) {
				console.error("Error fetching users:", error);
			} finally {
				setLoadingUsers(false);
			}
		};

		void fetchUsersAndRatings();
	}, []);

	const changePlayerCount = (count: number) => {
		if (count === playerCount) return;
		void trigger();
		setSelectedPlayers([]);
		sessionStorage.removeItem("selectedPlayers");
		const format = count === 4 || count === 6 ? "&format=mixed" : "";
		router.replace(`/start-session/players?count=${count}${format}`);
	};

	const changeFormat = (format: SessionFormat) => {
		void trigger();
		router.replace(`/start-session/players?count=${playerCount}&format=${format}`);
	};

	const addPlayer = (player: User) => {
		if (selectedPlayers.length >= playerCount) return;
		void trigger();
		setSelectedPlayers((current) => [...current, player]);
	};

	const removePlayer = (playerId: string) => {
		void trigger();
		setSelectedPlayers((current) =>
			current.filter((player) => player.id !== playerId),
		);
	};

	const closeGuestSheet = () => {
		setGuestName("");
		setShowGuestSheet(false);
	};

	const addGuest = () => {
		const name = guestName.trim();
		if (!name || name.length > 80 || selectedPlayers.length >= playerCount) {
			return;
		}
		addPlayer({
			id: createClientUuid(),
			name,
			avatar: null,
			email: "",
			isPlaceholder: true,
		});
		closeGuestSheet();
	};

	const continueToSchedule = () => {
		if (!isComplete) return;
		void trigger();
		sessionStorage.setItem("selectedPlayers", JSON.stringify(selectedPlayers));
		router.push(
			`/start-session/schedule?count=${playerCount}${
				playerCount === 4 || playerCount === 6
					? `&format=${sessionFormat}`
					: ""
			}`,
		);
	};

	return (
		<SessionCreationShell
			title="Novi termin"
			leadingAction={{
				label: "Nazad",
				icon: "solar:alt-arrow-left-linear",
				onClick: () => router.push("/start-session"),
			}}
			footerLabel="Napravi raspored"
			onFooterAction={continueToSchedule}
			footerDisabled={!isComplete || loadingUsers}
		>
			<div className="flex flex-col gap-5">
				<section className="space-y-2.5" aria-labelledby="player-count-heading">
					<SessionCreationSectionHeading
						detail={`${selectedPlayers.length}/${playerCount} izabrano`}
					>
						<span id="player-count-heading">Broj igrača</span>
					</SessionCreationSectionHeading>
					<SegmentedControl
						value={playerCount}
						options={PLAYER_OPTIONS.map((count) => ({
							value: count,
							label: count,
							ariaLabel: `${count} igrača`,
						}))}
						onValueChange={changePlayerCount}
						ariaLabel="Broj igrača"
						className="rounded-full [&>button]:min-h-10 [&>button]:rounded-full [&>button]:py-0 [&>button]:font-body [&>button]:text-ios-body [&>button]:font-bold [&>button[data-state=on]]:shadow-none"
					/>
				</section>

				{(playerCount === 4 || playerCount === 6) && (
					<section className="space-y-2.5" aria-labelledby="format-heading">
						<SessionCreationSectionHeading>
							<span id="format-heading">Format</span>
						</SessionCreationSectionHeading>
						<SegmentedControl
							value={sessionFormat}
							options={FORMAT_OPTIONS.map((format) => ({
								value: format,
								label: format === "singles" ? "Samo singlovi" : "Singlovi + dublovi",
							}))}
							onValueChange={changeFormat}
							ariaLabel="Format"
							className="rounded-full [&>button]:rounded-full [&>button]:font-body [&>button]:text-ios-subheadline [&>button]:font-semibold [&>button[data-state=on]]:!bg-[rgb(var(--ds-native-muted)/0.22)] [&>button[data-state=on]]:!text-[rgb(var(--ds-native-bone))] [&>button[data-state=on]]:shadow-none"
						/>
					</section>
				)}

				<section className="space-y-2.5" aria-labelledby="available-heading">
					<SessionCreationSectionHeading detail="DODIRNI ZA DODAVANJE">
						<span id="available-heading">Dostupni igrači</span>
					</SessionCreationSectionHeading>

					{loadingUsers ? (
						<Loading
							label="Učitavam igrače…"
							showsQuote={false}
							size="sm"
							className="min-h-24"
						/>
					) : availablePlayers.length === 0 ? (
						<p className="flex h-[84px] items-center text-ios-subheadline font-semibold text-[rgb(var(--ds-native-lime))]">
							Svi igrači su raspoređeni
						</p>
					) : (
						<div className="relative h-[84px]">
							<div
								aria-hidden="true"
								className={cn(
									"pointer-events-none absolute inset-y-0 left-0 z-10 w-[30px] bg-gradient-to-r from-[rgb(var(--ds-native-background))] to-transparent transition-opacity duration-150 ease-ds-out",
									canScrollLeft ? "opacity-100" : "opacity-0",
								)}
							/>
							<div
								aria-hidden="true"
								className={cn(
									"pointer-events-none absolute inset-y-0 right-0 z-10 w-[30px] bg-gradient-to-l from-[rgb(var(--ds-native-background))] to-transparent transition-opacity duration-150 ease-ds-out",
									canScrollRight ? "opacity-100" : "opacity-0",
								)}
							/>
							<div
								ref={railRef}
								onScroll={updateRailEdges}
								className="h-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
							>
								<div className="flex w-max gap-3 px-0.5">
									{availablePlayers.map((player) => (
										<button
											key={player.id}
											type="button"
											onClick={() => addPlayer(player)}
											disabled={isComplete}
											aria-label={`Dodaj ${player.name}`}
											className="flex w-[68px] shrink-0 flex-col items-center gap-[7px] overflow-hidden transition-[transform,opacity] duration-press ease-ds-out active:scale-[0.965] disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-opacity motion-reduce:active:scale-100"
										>
											<PlayerAvatar player={player} size="rail" />
											<span className="w-full truncate text-center text-ios-caption font-semibold">
												{player.name}
											</span>
										</button>
									))}
								</div>
							</div>
						</div>
					)}

					<Button
						variant="outline"
						onClick={() => setShowGuestSheet(true)}
						disabled={isComplete}
						className="h-10 w-full rounded-[10px] border-ds-button-accent-bright/60 text-ios-subheadline text-ds-button-accent-bright"
					>
						<Icon icon="solar:user-plus-linear" className="size-4" />
						Dodaj gosta
					</Button>
				</section>

				{isDoubles ? (
					<section aria-labelledby="teams-heading">
						<SessionCreationSectionHeading
							detail={`${selectedPlayers.length}/6`}
							className="mb-1"
						>
							<span id="teams-heading">Dubl timovi</span>
						</SessionCreationSectionHeading>
						{teams.map((team, teamIndex) => (
							<div
								key={teamIndex}
								className="flex h-[66px] items-center gap-3 border-b border-ds-button-hairline/[0.13]"
								aria-label={`Tim ${String.fromCharCode(65 + teamIndex)}`}
							>
								<span
									className={cn(
										"w-6 shrink-0 font-session-display text-ios-display-24",
										team.length === 2
											? "text-[rgb(var(--ds-native-lime))]"
											: "text-[rgb(var(--ds-native-muted))]",
									)}
								>
									{String.fromCharCode(65 + teamIndex)}
								</span>
								<PlayerSlot player={team[0]} onRemove={removePlayer} />
								<div className="h-[38px] w-px bg-ds-button-hairline/[0.13]" />
								<PlayerSlot player={team[1]} onRemove={removePlayer} />
							</div>
						))}
					</section>
				) : (
					<section aria-labelledby="selected-heading">
						<SessionCreationSectionHeading
							detail={`${selectedPlayers.length}/${playerCount}`}
							className="mb-1"
						>
							<span id="selected-heading">Izabrani igrači</span>
						</SessionCreationSectionHeading>
						{Array.from({ length: playerCount }, (_, index) => (
							<div
								key={index}
								className="flex h-[62px] items-center border-b border-ds-button-hairline/[0.13]"
							>
								<PlayerSlot
									player={selectedPlayers[index]}
									emptyLabel={`Igrač ${index + 1}`}
									onRemove={removePlayer}
								/>
							</div>
						))}
					</section>
				)}
			</div>

			{showGuestSheet && (
				<GuestSheet
					name={guestName}
					onNameChange={setGuestName}
					onCancel={closeGuestSheet}
					onAdd={addGuest}
				/>
			)}
		</SessionCreationShell>
	);
}

function PlayerAvatar({ player, size }: { player: User; size: "rail" | "slot" }) {
	const className = size === "rail" ? "size-14" : "size-[42px]";

	return (
		<Avatar className={cn(className, "shrink-0 border border-ds-button-hairline/[0.13]")}>
			<AvatarImage src={player.avatar ?? undefined} alt={player.name} />
			<AvatarFallback className="bg-ds-surface-raised font-body text-ios-body font-medium text-[rgb(var(--ds-native-bone))]">
				{player.name.charAt(0).toUpperCase()}
			</AvatarFallback>
		</Avatar>
	);
}

function PlayerSlot({
	player,
	emptyLabel = "Igrač",
	onRemove,
}: {
	player?: User;
	emptyLabel?: string;
	onRemove: (id: string) => void;
}) {
	if (!player) {
		return (
			<div aria-hidden="true" className="flex min-w-0 flex-1 items-center gap-2">
				<div className="flex size-[42px] shrink-0 items-center justify-center rounded-full border border-dashed border-ds-button-hairline/[0.13] text-[rgb(var(--ds-native-muted))]">
					<Icon icon="solar:add-circle-linear" className="size-4" />
				</div>
				<span className="truncate text-ios-subheadline text-[rgb(var(--ds-native-muted))]">
					{emptyLabel}
				</span>
			</div>
		);
	}

	return (
		<button
			type="button"
			onClick={() => onRemove(player.id)}
			aria-label={`Ukloni ${player.name}`}
			className="flex min-w-0 flex-1 items-center gap-2 text-left transition-[transform,opacity] duration-press ease-ds-out active:scale-[0.98] active:opacity-80 focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-button-accent-bright motion-reduce:transition-opacity motion-reduce:active:scale-100"
		>
			<PlayerAvatar player={player} size="slot" />
			<span className="min-w-0">
				<span className="block truncate text-ios-subheadline font-semibold">
					{player.name}
				</span>
				{player.isPlaceholder && (
					<span className="block text-ios-label-9 font-bold uppercase tracking-[0.12em] text-[rgb(var(--ds-native-amber))]">
						Gost · Bez ELO-a
					</span>
				)}
			</span>
		</button>
	);
}

function GuestSheet({
	name,
	onNameChange,
	onCancel,
	onAdd,
}: {
	name: string;
	onNameChange: (value: string) => void;
	onCancel: () => void;
	onAdd: () => void;
}) {
	const canAdd = name.trim().length > 0 && name.trim().length <= 80;

	return (
		<div
			className="fixed inset-0 z-50 flex items-end justify-center bg-black/65"
			onClick={onCancel}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="guest-title"
				className="w-full max-w-2xl rounded-t-[28px] border border-b-0 border-ds-button-hairline/[0.13] bg-[rgb(var(--ds-native-raised))] px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-3 shadow-2xl"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
				<div className="flex h-11 items-center justify-between">
					<button
						type="button"
						onClick={onCancel}
						className="min-h-11 text-ios-subheadline font-semibold text-ds-button-accent-bright"
					>
						Otkaži
					</button>
					<h2 id="guest-title" className="font-body text-ios-body font-semibold">
						Gost
					</h2>
					<button
						type="button"
						onClick={onAdd}
						disabled={!canAdd}
						className="min-h-11 text-ios-subheadline font-semibold text-ds-button-accent-bright disabled:opacity-40"
					>
						Dodaj
					</button>
				</div>
				<Input
					autoFocus
					value={name}
					onChange={(event) => onNameChange(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && canAdd) onAdd();
					}}
					maxLength={80}
					placeholder="Ime gosta"
					className="mt-3 h-12 rounded-xl border-ds-button-hairline/[0.13] bg-[rgb(var(--ds-native-surface))] text-ios-body"
				/>
				<p className="mt-3 text-ios-caption leading-5 text-[rgb(var(--ds-native-muted))]">
					Mečevi će biti vidljivi u terminu, ali neće uticati na ELO ili statistiku. Najviše 80 znakova.
				</p>
			</div>
		</div>
	);
}

export default function SelectPlayersPage() {
	return (
		<AuthGuard>
			<SessionCreationGuard>
				<SelectPlayersPageContent />
			</SessionCreationGuard>
		</AuthGuard>
	);
}
