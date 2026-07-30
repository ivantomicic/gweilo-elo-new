"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthScreen } from "@/components/auth/auth-screen";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Loading } from "@/components/ui/loading";
import { useAuth } from "@/lib/auth/useAuth";
import { supabase } from "@/lib/supabase/client";

type AuthorizationDetails = {
	authorization_id: string;
	redirect_url?: string;
	client: {
		id: string;
		name: string;
		uri: string;
	};
	user: {
		id: string;
		email: string;
	};
	scope: string;
};

type ConsentAction = "approve" | "deny";

export function OAuthConsent() {
	const searchParams = useSearchParams();
	const authorizationId = searchParams.get("authorization_id");
	const { isAuthenticated, user } = useAuth();
	const [details, setDetails] = useState<AuthorizationDetails | null>(null);
	const [loading, setLoading] = useState(true);
	const [action, setAction] = useState<ConsentAction | null>(null);
	const [error, setError] = useState<string | null>(null);

	const consentPath = useMemo(() => {
		if (!authorizationId) return "/oauth/consent";
		return `/oauth/consent?authorization_id=${encodeURIComponent(
			authorizationId,
		)}`;
	}, [authorizationId]);

	useEffect(() => {
		if (isAuthenticated !== true || !authorizationId) {
			setLoading(false);
			return;
		}

		let active = true;
		setLoading(true);
		setError(null);

		void supabase.auth.oauth
			.getAuthorizationDetails(authorizationId)
			.then(({ data, error: detailsError }) => {
				if (!active) return;

				if (detailsError || !data) {
					setError(
						detailsError?.message ||
							"This authorization request is invalid or has expired.",
					);
					setLoading(false);
					return;
				}

				if (data.redirect_url) {
					window.location.assign(data.redirect_url);
					return;
				}

				setDetails(data);
				setLoading(false);
			})
			.catch(() => {
				if (!active) return;
				setError("Unable to load this authorization request.");
				setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [authorizationId, isAuthenticated]);

	const submitConsent = useCallback(
		async (nextAction: ConsentAction) => {
			if (!authorizationId || action) return;

			setAction(nextAction);
			setError(null);

			const operation =
				nextAction === "approve"
					? supabase.auth.oauth.approveAuthorization
					: supabase.auth.oauth.denyAuthorization;

			const { data, error: consentError } = await operation(
				authorizationId,
				{ skipBrowserRedirect: true },
			);

			if (consentError || !data?.redirect_url) {
				setError(
					consentError?.message ||
						"Unable to complete this authorization request.",
				);
				setAction(null);
				return;
			}

			window.location.assign(data.redirect_url);
		},
		[action, authorizationId],
	);

	if (!authorizationId) {
		return (
			<ConsentShell>
				<ErrorCard message="The authorization request is missing its authorization ID." />
			</ConsentShell>
		);
	}

	if (isAuthenticated === null || (isAuthenticated && loading)) {
		return <Loading label="Loading authorization request…" />;
	}

	if (!isAuthenticated) {
		return <AuthScreen redirectPath={consentPath} />;
	}

	if (error || !details) {
		return (
			<ConsentShell>
				<ErrorCard
					message={
						error ||
						"This authorization request is invalid or has expired."
					}
				/>
			</ConsentShell>
		);
	}

	const scopes = details.scope
		.split(/\s+/)
		.map((scope) => scope.trim())
		.filter(Boolean);

	return (
		<ConsentShell>
			<Card className="w-full max-w-lg">
				<CardHeader className="text-center">
					<div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
						<Icon icon="solar:chat-round-dots-bold" className="size-7" />
					</div>
					<CardTitle>Connect {details.client.name}</CardTitle>
					<CardDescription>
						Signed in as {user?.email || details.user.email}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-5">
					<div className="rounded-lg border border-border bg-muted/30 p-4">
						<p className="mb-3 text-sm font-medium">
							This connection can:
						</p>
						<ul className="space-y-2 text-sm text-muted-foreground">
							<li className="flex gap-2">
								<Icon
									icon="solar:check-circle-bold"
									className="mt-0.5 size-4 shrink-0 text-primary"
								/>
								Read your recent singles matches
							</li>
							<li className="flex gap-2">
								<Icon
									icon="solar:check-circle-bold"
									className="mt-0.5 size-4 shrink-0 text-primary"
								/>
								Summarize your wins, losses, win rate, and recent form
							</li>
							<li className="flex gap-2">
								<Icon
									icon="solar:check-circle-bold"
									className="mt-0.5 size-4 shrink-0 text-primary"
								/>
								Compare your record with an opponent you select
							</li>
						</ul>
					</div>

					<p className="text-sm text-muted-foreground">
						Gweilo only exposes read-only tools scoped to your account.
						This connection cannot create, edit, or delete match data.
					</p>

					{scopes.length > 0 && (
						<details className="text-xs text-muted-foreground">
							<summary className="cursor-pointer">
								Authentication permissions
							</summary>
							<p className="mt-2 break-words">{scopes.join(", ")}</p>
						</details>
					)}

					{error && (
						<p role="alert" className="text-sm text-destructive">
							{error}
						</p>
					)}
				</CardContent>
				<CardFooter className="flex flex-col-reverse gap-3 sm:flex-row">
					<Button
						type="button"
						variant="outline"
						className="w-full"
						disabled={action !== null}
						onClick={() => void submitConsent("deny")}
					>
						{action === "deny" ? "Denying…" : "Deny"}
					</Button>
					<Button
						type="button"
						className="w-full"
						disabled={action !== null}
						onClick={() => void submitConsent("approve")}
					>
						{action === "approve" ? "Connecting…" : "Allow connection"}
					</Button>
				</CardFooter>
			</Card>
		</ConsentShell>
	);
}

function ConsentShell({ children }: { children: React.ReactNode }) {
	return (
		<main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
			{children}
		</main>
	);
}

function ErrorCard({ message }: { message: string }) {
	return (
		<Card className="w-full max-w-md">
			<CardHeader>
				<CardTitle>Cannot connect</CardTitle>
				<CardDescription>{message}</CardDescription>
			</CardHeader>
			<CardFooter>
				<Button asChild variant="outline" className="w-full">
					<Link href="/">Return to Gweilo</Link>
				</Button>
			</CardFooter>
		</Card>
	);
}
