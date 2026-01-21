// Re-export from reusable component
export { PollCard, type Poll, type PollOption } from "@/components/polls/poll-card";
	const [showConfirmDialog, setShowConfirmDialog] = useState(false);
	const [selectedOption, setSelectedOption] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [timeRemaining, setTimeRemaining] = useState<string>("");

	const handleOptionClick = (optionId: string) => {
		setSelectedOption(optionId);
		setShowConfirmDialog(true);
	};

	const handleConfirm = async () => {
		if (!selectedOption) return;

		setSubmitting(true);
		setShowConfirmDialog(false);
		try {
			await onAnswer(poll.id, selectedOption);
			setSelectedOption(null);
		} catch (err) {
			console.error("Error submitting answer:", err);
		} finally {
			setSubmitting(false);
		}
	};

	const handleCancel = () => {
		setShowConfirmDialog(false);
		setSelectedOption(null);
	};

	// Format end date and time for display
	const formatEndDateTime = (dateString: string) => {
		const date = new Date(dateString);
		const formattedDate = date.toLocaleDateString("sr-Latn-RS", {
			day: "numeric",
			month: "short",
			year: "numeric",
		});
		const formattedTime = date.toLocaleTimeString("sr-Latn-RS", {
			hour: "2-digit",
			minute: "2-digit",
		});
		return `${formattedDate} u ${formattedTime}`;
	};

	// Calculate and format time remaining until poll ends
	const calculateTimeRemaining = (endDate: string): string => {
		const now = new Date();
		const end = new Date(endDate);
		const diff = end.getTime() - now.getTime();

		if (diff <= 0) {
			return "Završeno";
		}

		const days = Math.floor(diff / (1000 * 60 * 60 * 24));
		const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
		const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
		const seconds = Math.floor((diff % (1000 * 60)) / 1000);

		if (days > 0) {
			return `${days} ${days === 1 ? "dan" : "dana"}, ${hours} ${hours === 1 ? "sat" : "sati"}`;
		} else if (hours > 0) {
			return `${hours} ${hours === 1 ? "sat" : "sati"}, ${minutes} ${minutes === 1 ? "minut" : "minuta"}`;
		} else if (minutes > 0) {
			return `${minutes} ${minutes === 1 ? "minut" : "minuta"}, ${seconds} ${seconds === 1 ? "sekund" : "sekundi"}`;
		} else {
			return `${seconds} ${seconds === 1 ? "sekund" : "sekundi"}`;
		}
	};

	// Update countdown timer
	useEffect(() => {
		if (!poll.endDate || !poll.isActive) {
			setTimeRemaining("");
			return;
		}

		// Calculate immediately
		setTimeRemaining(calculateTimeRemaining(poll.endDate));

		// Update every second
		const interval = setInterval(() => {
			const remaining = calculateTimeRemaining(poll.endDate);
			setTimeRemaining(remaining);
			
			// If poll has ended, clear interval
			if (remaining === "Završeno") {
				clearInterval(interval);
			}
		}, 1000);

		return () => clearInterval(interval);
	}, [poll.endDate, poll.isActive]);

	// If user already answered, show results
	if (poll.hasUserAnswered) {
		return (
			<Card className="bg-card">
				<CardHeader>
					<CardTitle>{poll.question}</CardTitle>
					{poll.description && (
						<p className="text-sm text-muted-foreground mt-2">
							{poll.description}
						</p>
					)}
					{poll.endDate && (
						<p className="text-sm text-muted-foreground mt-1">
							{t.polls.card.ends}: {timeRemaining} ({formatEndDateTime(poll.endDate)})
						</p>
					)}
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-3">
						{/* Sort by answer count (most votes first) */}
						{[...poll.options]
							.sort((a, b) => b.answerCount - a.answerCount)
							.map((option) => {
								const percentage =
									poll.totalAnswers > 0
										? Math.round(
												(option.answerCount /
													poll.totalAnswers) *
													100
										  )
										: 0;

								// Find max votes to determine winner
								const maxVotes = Math.max(
									...poll.options.map((opt) => opt.answerCount)
								);
								const isWinner =
									poll.totalAnswers > 0 &&
									option.answerCount === maxVotes &&
									maxVotes > 0;

								return (
									<div key={option.id} className="space-y-1.5">
										<div className="flex items-center justify-between text-sm">
											<span className="font-medium">
												{option.text}
											</span>
											<div className="flex items-center gap-2">
												<span className="text-muted-foreground">
													{option.answerCount}{" "}
													{option.answerCount === 1
														? t.polls.card.vote
														: t.polls.card.votes}
												</span>
												<span className="text-xs text-muted-foreground font-mono">
													{percentage}%
												</span>
											</div>
										</div>
										{/* Progress bar */}
										<div className="relative h-2 w-full bg-muted/30 rounded-full overflow-hidden">
											<div
												className={`h-full rounded-full transition-all duration-500 ${
													isWinner
														? "bg-yellow-500"
														: "bg-primary/60"
												}`}
												style={{
													width: `${percentage}%`,
												}}
											/>
										</div>
									</div>
								);
							})}
					</div>

					<div className="pt-2 text-sm text-muted-foreground">
						{t.polls.card.alreadyAnswered}
					</div>
				</CardContent>
			</Card>
		);
	}

	// If poll is closed, show message
	if (!poll.isActive) {
		return (
			<Card className="bg-card">
				<CardHeader>
					<CardTitle>{poll.question}</CardTitle>
					{poll.description && (
						<p className="text-sm text-muted-foreground mt-2">
							{poll.description}
						</p>
					)}
					<p className="text-sm text-muted-foreground mt-1">
						{t.polls.card.pollEnded}
					</p>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-3">
						{/* Sort by answer count (most votes first) */}
						{[...poll.options]
							.sort((a, b) => b.answerCount - a.answerCount)
							.map((option) => {
								const percentage =
									poll.totalAnswers > 0
										? Math.round(
												(option.answerCount /
													poll.totalAnswers) *
													100
										  )
										: 0;

								// Find max votes to determine winner
								const maxVotes = Math.max(
									...poll.options.map((opt) => opt.answerCount)
								);
								const isWinner =
									poll.totalAnswers > 0 &&
									option.answerCount === maxVotes &&
									maxVotes > 0;

								return (
									<div key={option.id} className="space-y-1.5">
										<div className="flex items-center justify-between text-sm">
											<span className="font-medium">
												{option.text}
											</span>
											<div className="flex items-center gap-2">
												<span className="text-muted-foreground">
													{option.answerCount}{" "}
													{option.answerCount === 1
														? t.polls.card.vote
														: t.polls.card.votes}
												</span>
												<span className="text-xs text-muted-foreground font-mono">
													{percentage}%
												</span>
											</div>
										</div>
										{/* Progress bar */}
										<div className="relative h-2 w-full bg-muted/30 rounded-full overflow-hidden">
											<div
												className={`h-full rounded-full transition-all duration-500 ${
													isWinner
														? "bg-yellow-500"
														: "bg-primary/60"
												}`}
												style={{
													width: `${percentage}%`,
												}}
											/>
										</div>
									</div>
								);
							})}
					</div>
				</CardContent>
			</Card>
		);
	}

	// Active poll - show answer options
	const selectedOptionText = poll.options.find(
		(opt) => opt.id === selectedOption
	)?.text;

	return (
		<>
			<Card className="bg-card">
				<CardHeader>
					<CardTitle>{poll.question}</CardTitle>
					{poll.description && (
						<p className="text-sm text-muted-foreground mt-2">
							{poll.description}
						</p>
					)}
					{poll.endDate && (
						<p className="text-sm text-muted-foreground mt-1">
							{t.polls.card.ends}: {timeRemaining} ({formatEndDateTime(poll.endDate)})
						</p>
					)}
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						{poll.options.map((option) => (
							<Button
								key={option.id}
								variant="outline"
								onClick={() => handleOptionClick(option.id)}
								className="w-full justify-start"
								disabled={submitting}
							>
								{option.text}
							</Button>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Confirmation Dialog */}
			{showConfirmDialog && (
				<Box className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
					<Box className="bg-card rounded-[24px] p-6 border border-border/50 max-w-sm w-full mx-4">
						<Stack direction="column" spacing={4}>
							<Box>
								<h2 className="text-2xl font-bold font-heading">
									{t.polls.confirm.title}
								</h2>
								<p className="text-muted-foreground mt-2 text-sm">
									{t.polls.confirm.description}
								</p>
								{selectedOptionText && (
									<Box className="mt-3 p-3 rounded-lg bg-muted/30">
										<p className="font-medium">{selectedOptionText}</p>
									</Box>
								)}
							</Box>
							<Stack direction="row" spacing={3}>
								<Button
									variant="outline"
									onClick={handleCancel}
									disabled={submitting}
									className="flex-1"
								>
									{t.common.cancel}
								</Button>
								<Button
									onClick={handleConfirm}
									disabled={submitting}
									className="flex-1"
								>
									{submitting
										? t.polls.card.submitting
										: t.polls.confirm.submit}
								</Button>
							</Stack>
						</Stack>
					</Box>
				</Box>
			)}
		</>
	);
}
