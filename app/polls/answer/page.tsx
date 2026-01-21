"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loading } from "@/components/ui/loading";
import { Box } from "@/components/ui/box";
import { Stack } from "@/components/ui/stack";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { toast } from "sonner";

function PollAnswerPageContent() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
	const [message, setMessage] = useState<string>("");

	useEffect(() => {
		const submitAnswer = async () => {
			const pollId = searchParams.get("pollId");
			const optionId = searchParams.get("optionId");
			const userId = searchParams.get("userId");

			if (!pollId || !optionId || !userId) {
				setStatus("error");
				setMessage("Nedostaju potrebni parametri u linku.");
				return;
			}

			try {
				// Call API to submit answer using userId
				const response = await fetch(`/api/polls/${pollId}/answer-by-token`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						optionId,
						userId,
					}),
				});

				const data = await response.json();

				if (!response.ok) {
					throw new Error(data.error || "Greška pri slanju odgovora");
				}

				setStatus("success");
				setMessage("Vaš odgovor je uspešno poslat!");
				toast.success("Odgovor je uspešno poslat!");

				// Redirect to polls page after 2 seconds
				setTimeout(() => {
					router.push("/polls");
				}, 2000);
			} catch (error) {
				console.error("Error submitting answer:", error);
				setStatus("error");
				setMessage(
					error instanceof Error
						? error.message
						: "Došlo je do greške pri slanju odgovora."
				);
				toast.error("Greška pri slanju odgovora");
			}
		};

		submitAnswer();
	}, [searchParams, router]);

	if (status === "loading") {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<Stack direction="column" spacing={4} alignItems="center">
					<Loading inline label="Slanje odgovora..." />
				</Stack>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-background">
			<Box className="max-w-md w-full mx-4">
				<Stack direction="column" spacing={4} alignItems="center">
					{status === "success" ? (
						<>
							<div className="text-6xl">✅</div>
							<h1 className="text-2xl font-bold text-center">{message}</h1>
							<p className="text-muted-foreground text-center">
								Preusmeravanje na stranicu anketa...
							</p>
						</>
					) : (
						<>
							<div className="text-6xl">❌</div>
							<h1 className="text-2xl font-bold text-center text-destructive">
								Greška
							</h1>
							<p className="text-muted-foreground text-center">{message}</p>
							<Button onClick={() => router.push("/polls")}>
								Idi na ankete
							</Button>
						</>
					)}
				</Stack>
			</Box>
		</div>
	);
}

export default function PollAnswerPage() {
	return (
		<Suspense
			fallback={
				<div className="flex min-h-screen items-center justify-center bg-background">
					<Loading inline label="Učitavanje..." />
				</div>
			}
		>
			<PollAnswerPageContent />
		</Suspense>
	);
}
