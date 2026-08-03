"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageSquareTextIcon, RotateCcwIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
	SERBIAN_NAME_CASE_KEYS,
	type SerbianNameCaseKey,
	type SerbianNameCases,
} from "@/lib/serbian-name-cases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StateBlock } from "@/components/ui/state-block";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

type NameCaseUser = {
	id: string;
	displayName: string;
	cases: SerbianNameCases;
};

const CASE_COLUMNS: Array<{
	key: SerbianNameCaseKey;
	label: string;
	prompt: string;
}> = [
	{ key: "genitive", label: "Genitiv", prompt: "koga? čega?" },
	{ key: "dative", label: "Dativ", prompt: "kome? čemu?" },
	{ key: "accusative", label: "Akuzativ", prompt: "koga? šta?" },
	{ key: "vocative", label: "Vokativ", prompt: "hej!" },
	{ key: "instrumental", label: "Instrumental", prompt: "s kim? čim?" },
	{ key: "locative", label: "Lokativ", prompt: "o kome? čemu?" },
];

const CASE_EXAMPLES: Record<SerbianNameCaseKey, (name: string) => string> = {
	genitive: (name) => `Sačuvaj poziciju ispred ${name}.`,
	dative: (name) => `Približi se igraču ${name}.`,
	accusative: (name) => `Izazovi ${name} na duel.`,
	vocative: (name) => `${name}, tvoj meč počinje.`,
	instrumental: (name) => `Duel sa ${name}.`,
	locative: (name) => `Pričamo o ${name}.`,
};

type FocusedCell = {
	userId: string;
	caseKey: SerbianNameCaseKey;
} | null;

function rowsAreEqual(left: NameCaseUser, right: NameCaseUser) {
	return SERBIAN_NAME_CASE_KEYS.every(
		(key) => (left.cases[key] || "") === (right.cases[key] || ""),
	);
}

export function NameCasesTable() {
	const [users, setUsers] = useState<NameCaseUser[]>([]);
	const [savedUsers, setSavedUsers] = useState<NameCaseUser[]>([]);
	const [query, setQuery] = useState("");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [focusedCell, setFocusedCell] = useState<FocusedCell>(null);

	useEffect(() => {
		let cancelled = false;

		async function fetchNameCases() {
			try {
				setLoading(true);
				setError(null);
				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session?.access_token) {
					setError("Niste prijavljeni.");
					return;
				}

				const response = await fetch("/api/admin/name-cases", {
					headers: { Authorization: `Bearer ${session.access_token}` },
				});

				if (!response.ok) {
					throw new Error(
						response.status === 401
							? "Nemate dozvolu za ovu stranicu."
							: "Učitavanje padeža nije uspelo.",
					);
				}

				const data = await response.json();
				if (!cancelled) {
					const nextUsers = (data.users || []) as NameCaseUser[];
					setUsers(nextUsers);
					setSavedUsers(nextUsers);
				}
			} catch (fetchError) {
				console.error("Error fetching name cases:", fetchError);
				if (!cancelled) {
					setError(
						fetchError instanceof Error
							? fetchError.message
							: "Učitavanje padeža nije uspelo.",
					);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		fetchNameCases();
		return () => {
			cancelled = true;
		};
	}, []);

	const savedUsersById = useMemo(
		() => new Map(savedUsers.map((user) => [user.id, user])),
		[savedUsers],
	);

	const dirtyUserIds = useMemo(
		() =>
			new Set(
				users
					.filter((user) => {
						const savedUser = savedUsersById.get(user.id);
						return !savedUser || !rowsAreEqual(user, savedUser);
					})
					.map((user) => user.id),
			),
		[users, savedUsersById],
	);

	const filteredUsers = useMemo(() => {
		const normalizedQuery = query.trim().toLocaleLowerCase("sr-Latn-RS");
		if (!normalizedQuery) return users;
		return users.filter((user) =>
			user.displayName
				.toLocaleLowerCase("sr-Latn-RS")
				.includes(normalizedQuery),
		);
	}, [query, users]);

	const focusedExample = useMemo(() => {
		if (!focusedCell) return null;
		const user = users.find((candidate) => candidate.id === focusedCell.userId);
		const column = CASE_COLUMNS.find(
			(candidate) => candidate.key === focusedCell.caseKey,
		);
		if (!user || !column) return null;

		const name = user.cases[focusedCell.caseKey]?.trim() || user.displayName;
		return {
			caseLabel: column.label,
			prompt: column.prompt,
			sentence: CASE_EXAMPLES[focusedCell.caseKey](name),
		};
	}, [focusedCell, users]);

	useEffect(() => {
		if (dirtyUserIds.size === 0) return;
		const warnAboutUnsavedChanges = (event: BeforeUnloadEvent) => {
			event.preventDefault();
		};
		window.addEventListener("beforeunload", warnAboutUnsavedChanges);
		return () =>
			window.removeEventListener("beforeunload", warnAboutUnsavedChanges);
	}, [dirtyUserIds.size]);

	const updateCase = (
		userId: string,
		key: SerbianNameCaseKey,
		value: string,
	) => {
		setUsers((currentUsers) =>
			currentUsers.map((user) =>
				user.id === userId
					? { ...user, cases: { ...user.cases, [key]: value } }
					: user,
			),
		);
	};

	const resetChanges = () => {
		setUsers(savedUsers);
	};

	const saveChanges = async () => {
		const changedUsers = users.filter((user) => dirtyUserIds.has(user.id));
		if (changedUsers.length === 0) return;

		try {
			setSaving(true);
			const {
				data: { session },
			} = await supabase.auth.getSession();
			if (!session?.access_token) {
				toast.error("Niste prijavljeni.");
				return;
			}

			const response = await fetch("/api/admin/name-cases", {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${session.access_token}`,
				},
				body: JSON.stringify({
					updates: changedUsers.map((user) => ({
						id: user.id,
						...user.cases,
					})),
				}),
			});

			if (!response.ok) {
				const data = await response.json().catch(() => null);
				throw new Error(data?.error || "Čuvanje padeža nije uspelo.");
			}

			const normalizedUsers = users.map((user) => ({
				...user,
				cases: Object.fromEntries(
					SERBIAN_NAME_CASE_KEYS.map((key) => [
						key,
						user.cases[key]?.trim() || null,
					]),
				) as SerbianNameCases,
			}));
			setUsers(normalizedUsers);
			setSavedUsers(normalizedUsers);
			toast.success(
				changedUsers.length === 1
					? "Padeži su sačuvani za jednog igrača."
					: `Padeži su sačuvani za ${changedUsers.length} igrača.`,
			);
		} catch (saveError) {
			console.error("Error saving name cases:", saveError);
			toast.error(
				saveError instanceof Error
					? saveError.message
					: "Čuvanje padeža nije uspelo.",
			);
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return <StateBlock variant="loading" title="Učitavanje padeža…" />;
	}

	if (error) {
		return <StateBlock variant="error" title={error} />;
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
				<div>
					<h2 className="text-lg font-semibold">Oblici imena igrača</h2>
					<p className="mt-1 max-w-2xl text-sm text-muted-foreground">
						Unesite ceo oblik imena u svakom padežu. Prazna polja koriste nominativ.
						Tab prelazi na sledeći padež, pa zatim na sledećeg igrača.
					</p>
				</div>

				<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Pretraži igrače"
						icon="lucide:search"
						aria-label="Pretraži igrače"
						className="sm:w-64"
						disabled={saving}
					/>
					<Button
						variant="outline"
						onClick={resetChanges}
						disabled={dirtyUserIds.size === 0 || saving}
						className="active:scale-[0.97] transition-transform duration-150"
					>
						<RotateCcwIcon />
						Poništi
					</Button>
					<Button
						onClick={saveChanges}
						disabled={dirtyUserIds.size === 0 || saving}
						className="active:scale-[0.97] transition-transform duration-150"
					>
						<SaveIcon />
						{saving
							? "Čuvanje…"
							: dirtyUserIds.size > 0
								? `Sačuvaj (${dirtyUserIds.size})`
								: "Sačuvaj"}
					</Button>
				</div>
			</div>

			<div className="flex min-h-16 items-center gap-3 rounded-xl border bg-muted/35 px-4 py-3">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground shadow-sm ring-1 ring-border">
					<MessageSquareTextIcon className="size-4" aria-hidden="true" />
				</div>
				{focusedExample ? (
					<div className="min-w-0">
						<p className="text-xs font-medium text-muted-foreground">
							{focusedExample.caseLabel} · {focusedExample.prompt}
						</p>
						<p className="truncate text-sm font-medium">
							Primer: {focusedExample.sentence}
						</p>
					</div>
				) : (
					<p className="text-sm text-muted-foreground">
						Izaberite polje da vidite primer upotrebe tog oblika imena.
					</p>
				)}
			</div>

			<div className="overflow-hidden rounded-xl border bg-card shadow-sm">
				<div className="overflow-x-auto">
					<Table className="min-w-[1180px] table-fixed">
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead className="sticky left-0 z-20 w-52 bg-muted/95 backdrop-blur-sm">
									Nominativ
								</TableHead>
								{CASE_COLUMNS.map((column) => (
									<TableHead key={column.key} className="w-40">
										<span className="block text-foreground">
											{column.label}
										</span>
										<span className="block text-[11px] font-normal normal-case text-muted-foreground">
											{column.prompt}
										</span>
									</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							{filteredUsers.length === 0 ? (
								<TableRow>
									<TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
										{users.length === 0
											? "Nema igrača."
											: "Nema rezultata za ovu pretragu."}
									</TableCell>
								</TableRow>
							) : (
								filteredUsers.map((user) => {
									const isDirty = dirtyUserIds.has(user.id);
									return (
										<TableRow
											key={user.id}
											className={cn(isDirty && "bg-primary/[0.045]")}
										>
											<TableCell className="sticky left-0 z-10 bg-card font-medium shadow-[1px_0_0_0_hsl(var(--border))]">
												<div className="flex items-center gap-2">
													<span
														className={cn(
															"size-1.5 shrink-0 rounded-full",
															isDirty ? "bg-primary" : "bg-transparent",
														)}
														aria-hidden="true"
													/>
													<span className="truncate" title={user.displayName}>
														{user.displayName}
													</span>
												</div>
											</TableCell>
											{CASE_COLUMNS.map((column) => (
												<TableCell key={column.key} className="p-1.5">
													<Input
														value={user.cases[column.key] || ""}
														onChange={(event) =>
															updateCase(user.id, column.key, event.target.value)
														}
														onFocus={() =>
															setFocusedCell({
																userId: user.id,
																caseKey: column.key,
															})
														}
														onBlur={() => setFocusedCell(null)}
														placeholder={user.displayName}
														maxLength={100}
														disabled={saving}
														aria-label={`${column.label} za ${user.displayName}`}
														className="h-9 border-transparent bg-transparent px-2 text-sm shadow-none hover:border-input focus-visible:bg-background"
													/>
												</TableCell>
											))}
										</TableRow>
									);
								})
							)}
						</TableBody>
					</Table>
				</div>
			</div>

			<p className="text-xs text-muted-foreground">
				{filteredUsers.length} od {users.length} igrača
				{dirtyUserIds.size > 0 ? ` • ${dirtyUserIds.size} sa izmenama` : ""}
			</p>
		</div>
	);
}
