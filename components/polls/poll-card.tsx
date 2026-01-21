"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Box } from "@/components/ui/box";
import { Stack } from "@/components/ui/stack";
import { Icon } from "@/components/ui/icon";
import { t } from "@/lib/i18n";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

export type PollOption = {
	id: string;
	text: string;
	displayOrder: number;
	answerCount: number;
	users?: Array<{ id: string; name: string; avatar: string | null }>;
};

export type Poll = {
	id: string;
	question: string;
	description: string | null;
	endDate: string | null;
	createdAt: string;
	createdBy: string;
	isActive: boolean;
	options: PollOption[];
	hasUserAnswered: boolean;
	userSelectedOptionId?: string | null;
	totalAnswers: number;
};

type PollCardProps = {
	poll: Poll;
	onAnswer: (pollId: string, optionId: string) => Promise<void>;
	isAdmin?: boolean;
	onEdit?: (poll: Poll) => void;
	onDelete?: (pollId: string) => void;
	autoOpenOptionId?: string; // Option ID to auto-open confirmation dialog for (from email deep link)
};

export function PollCard({ poll, onAnswer, isAdmin = false, onEdit, onDelete, autoOpenOptionId }: PollCardProps) {
	const [showConfirmDialog, setShowConfirmDialog] = useState(false);
	const [selectedOption, setSelectedOption] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [timeRemaining, setTimeRemaining] = useState<string>("");
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [deleting, setDeleting] = useState(false);

	// Debug: Log when delete confirm state changes
	useEffect(() => {
		console.log('[PollCard] showDeleteConfirm changed:', showDeleteConfirm, 'for poll:', poll.id);
	}, [showDeleteConfirm, poll.id]);

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
			return `${hours} ${hours === 1 ? "sat" : "sati"}, ${minutes} min`;
		} else if (minutes > 0) {
			return `${minutes} min, ${seconds} ${seconds === 1 ? "sekund" : "sekundi"}`;
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
			if (!poll.endDate) {
				clearInterval(interval);
				return;
			}
			const remaining = calculateTimeRemaining(poll.endDate);
			setTimeRemaining(remaining);
			
			// If poll has ended, clear interval
			if (remaining === "Završeno") {
				clearInterval(interval);
			}
		}, 1000);

		return () => clearInterval(interval);
	}, [poll.endDate, poll.isActive]);

	// Auto-open confirmation dialog if option ID is provided (from email deep link)
	useEffect(() => {
		if (!autoOpenOptionId) return;
		
		console.log('[PollCard] Auto-open check:', {
			autoOpenOptionId,
			pollId: poll.id,
			isActive: poll.isActive,
			hasUserAnswered: poll.hasUserAnswered,
			optionsCount: poll.options.length,
			optionIds: poll.options.map(opt => opt.id),
		});

		if (poll.isActive && !poll.hasUserAnswered && poll.options.length > 0) {
			// Verify the option exists in this poll
			const optionExists = poll.options.some(opt => opt.id === autoOpenOptionId);
			console.log('[PollCard] Option exists check:', { optionExists, autoOpenOptionId });
			
			if (optionExists) {
				// Small delay to ensure UI is ready
				const timer = setTimeout(() => {
					console.log('[PollCard] Opening confirmation dialog for option:', autoOpenOptionId);
					setSelectedOption(autoOpenOptionId);
					setShowConfirmDialog(true);
				}, 300); // Increased delay to ensure polls are fully rendered
				return () => clearTimeout(timer);
			} else {
				console.warn('[PollCard] Option ID not found in poll options:', autoOpenOptionId);
			}
		} else {
			console.log('[PollCard] Cannot auto-open:', {
				isActive: poll.isActive,
				hasUserAnswered: poll.hasUserAnswered,
				optionsCount: poll.options.length,
			});
		}
	}, [autoOpenOptionId, poll.id, poll.isActive, poll.hasUserAnswered, poll.options]);

	const handleDelete = async () => {
		console.log('[PollCard] handleDelete called for poll:', poll.id, 'onDelete exists:', !!onDelete);
		if (!onDelete) {
			console.warn('[PollCard] onDelete handler is not provided');
			return;
		}
		
		setDeleting(true);
		try {
			await onDelete(poll.id);
			setShowDeleteConfirm(false);
		} catch (err) {
			console.error("Error deleting poll:", err);
		} finally {
			setDeleting(false);
		}
	};

	// If user already answered, show results
	if (poll.hasUserAnswered) {
		return (
			<>
			<Box className="bg-card rounded-[24px] border border-border/50 shadow-sm p-6 relative overflow-hidden">
				<div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-[60px] rounded-full pointer-events-none" />
				<div className="flex items-center justify-between mb-4 relative z-10 gap-2 flex-wrap">
					<span className="flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase text-emerald-500 shrink-0">
						<Icon icon="solar:check-circle-bold" className="size-3.5" />
						{poll.isActive ? t.polls.card.answered : t.polls.card.completed}
					</span>
					<div className="flex items-center gap-2 shrink-0">
						{poll.endDate && (
							<span className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono whitespace-nowrap">
								{poll.isActive && timeRemaining ? (
									<>
										<Icon icon="solar:clock-circle-bold" className="size-3.5" />
										{timeRemaining}
									</>
								) : (
									<>
										{t.polls.card.ended}: {formatRelativeTime(poll.endDate)}
									</>
								)}
							</span>
						)}
						{isAdmin && (
							<>
								<Button
									variant="ghost"
									size="icon"
									onClick={() => onEdit?.(poll)}
									className="size-8 shrink-0"
								>
									<Icon icon="solar:pen-bold" className="size-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										console.log('[PollCard] Delete button clicked for poll:', poll.id);
										setShowDeleteConfirm(true);
									}}
									className="size-8 text-destructive hover:text-destructive shrink-0"
								>
									<Icon icon="solar:trash-bin-trash-bold" className="size-4" />
								</Button>
							</>
						)}
					</div>
				</div>
				<h3 className="text-lg font-bold font-heading mb-2 leading-tight relative z-10">
					{poll.question}
				</h3>
				{poll.description && (
					<p className="text-sm text-muted-foreground mb-4 relative z-10">
						{poll.description}
					</p>
				)}
				{poll.totalAnswers > 0 && (
					<p className="text-[10px] text-muted-foreground/60 mb-4 relative z-10">
						{t.polls.card.total}: {poll.totalAnswers} {poll.totalAnswers === 1 ? t.polls.card.vote : t.polls.card.votes}
					</p>
				)}
				<div className="pt-4 border-t border-border/30 space-y-4 relative z-10">
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

							// Check if this is the user's selected option
							const isUserChoice = poll.userSelectedOptionId === option.id;

							return (
								<div key={option.id}>
									<div className="flex justify-between text-xs font-semibold mb-2">
										<span className={`flex items-center gap-2 ${isWinner ? "text-primary" : "text-foreground/70"}`}>
											{isWinner && (
												<Icon icon="solar:star-bold" className="text-primary size-4" />
											)}
											{isUserChoice && (
												<span className="text-[10px] text-muted-foreground">({t.polls.card.yourChoice})</span>
											)}
											{option.text}
										</span>
										<div className="flex items-center gap-2">
											{option.users && option.users.length > 0 && (
												<div className="flex items-center -space-x-1.5">
													{option.users.slice(0, 5).map((user) => (
														<Avatar key={user.id} className="size-5 border border-background/50">
															<AvatarImage src={user.avatar || undefined} alt={user.name} />
															<AvatarFallback className="text-[10px]">
																{user.name.charAt(0).toUpperCase()}
															</AvatarFallback>
														</Avatar>
													))}
													{option.users.length > 5 && (
														<div className="size-5 rounded-full bg-muted border border-background/50 flex items-center justify-center">
															<span className="text-[8px] font-semibold text-muted-foreground">
																+{option.users.length - 5}
															</span>
														</div>
													)}
												</div>
											)}
											<span className={isWinner ? "text-primary" : "text-foreground/70"}>
												{percentage}%
											</span>
										</div>
									</div>
									<div className="h-2 w-full bg-muted/30 rounded-full overflow-hidden">
										<div
											className={`h-full rounded-full transition-all duration-500 ${
												isWinner
													? "bg-primary"
													: option.answerCount > 0
													? "bg-primary/40"
													: "bg-muted/50"
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
			</Box>
			{/* Delete Confirmation Dialog */}
			{showDeleteConfirm && (
				<div 
					className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
					onClick={(e) => {
						if (e.target === e.currentTarget) {
							setShowDeleteConfirm(false);
						}
					}}
				>
					<Box className="bg-card rounded-[24px] p-6 border border-border/50 max-w-sm w-full mx-4 shadow-2xl">
						<Stack direction="column" spacing={4}>
							<Box>
								<h2 className="text-2xl font-bold font-heading text-destructive">
									{t.polls.delete.title}
								</h2>
								<p className="text-muted-foreground mt-2 text-sm">
									{t.polls.delete.description}
								</p>
							</Box>
							<Stack direction="row" spacing={3}>
								<Button
									variant="outline"
									onClick={() => {
										console.log('[PollCard] Cancel delete clicked');
										setShowDeleteConfirm(false);
									}}
									disabled={deleting}
									className="flex-1"
								>
									{t.common.cancel}
								</Button>
								<Button
									variant="destructive"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										console.log('[PollCard] Confirm delete clicked');
										handleDelete();
									}}
									disabled={deleting}
									className="flex-1"
								>
									{deleting ? t.polls.delete.deleting : t.polls.delete.confirm}
								</Button>
							</Stack>
						</Stack>
					</Box>
				</div>
			)}
		</>
		);
	}

	// If poll is closed, show message
	if (!poll.isActive) {
		return (
			<>
			<Box className="bg-card rounded-[24px] border border-border/50 shadow-sm p-6 relative overflow-hidden opacity-80">
				<div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
					<span className="bg-secondary px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase text-muted-foreground shrink-0">
						{t.polls.card.pollEnded}
					</span>
					<div className="flex items-center gap-2 shrink-0">
						{poll.endDate && (
							<span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
								{t.polls.card.ended}: {formatRelativeTime(poll.endDate)}
							</span>
						)}
						{isAdmin && (
							<>
								<Button
									variant="ghost"
									size="icon"
									onClick={() => onEdit?.(poll)}
									className="size-8 shrink-0"
								>
									<Icon icon="solar:pen-bold" className="size-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										console.log('[PollCard] Delete button clicked for poll:', poll.id);
										setShowDeleteConfirm(true);
									}}
									className="size-8 text-destructive hover:text-destructive shrink-0"
								>
									<Icon icon="solar:trash-bin-trash-bold" className="size-4" />
								</Button>
							</>
						)}
					</div>
				</div>
				<h3 className="text-lg font-bold font-heading mb-4">
					{poll.question}
				</h3>
				{poll.description && (
					<p className="text-sm text-muted-foreground mb-4">
						{poll.description}
					</p>
				)}
				{poll.totalAnswers > 0 && (
					<p className="text-[10px] text-muted-foreground/60 mb-4">
						{t.polls.card.total}: {poll.totalAnswers} {poll.totalAnswers === 1 ? t.polls.card.vote : t.polls.card.votes}
					</p>
				)}
				<div className="pt-4 border-t border-border/30 space-y-4">
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
								<div key={option.id}>
									<div className="flex justify-between text-xs font-semibold mb-2">
										<span className={isWinner ? "text-primary" : "text-muted-foreground"}>
											{isWinner && (
												<Icon icon="solar:star-bold" className="text-primary size-4 inline-block mr-2" />
											)}
											{option.text}
										</span>
										<span className={isWinner ? "text-primary" : "text-muted-foreground"}>
											{percentage}%
										</span>
									</div>
									<div className="h-2 w-full bg-muted/30 rounded-full overflow-hidden">
										<div
											className={`h-full rounded-full transition-all duration-500 ${
												isWinner
													? "bg-primary"
													: "bg-muted"
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
			</Box>
			{/* Delete Confirmation Dialog */}
			{showDeleteConfirm && (
				<div 
					className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
					onClick={(e) => {
						if (e.target === e.currentTarget) {
							setShowDeleteConfirm(false);
						}
					}}
				>
					<Box className="bg-card rounded-[24px] p-6 border border-border/50 max-w-sm w-full mx-4 shadow-2xl">
						<Stack direction="column" spacing={4}>
							<Box>
								<h2 className="text-2xl font-bold font-heading text-destructive">
									{t.polls.delete.title}
								</h2>
								<p className="text-muted-foreground mt-2 text-sm">
									{t.polls.delete.description}
								</p>
							</Box>
							<Stack direction="row" spacing={3}>
								<Button
									variant="outline"
									onClick={() => {
										console.log('[PollCard] Cancel delete clicked');
										setShowDeleteConfirm(false);
									}}
									disabled={deleting}
									className="flex-1"
								>
									{t.common.cancel}
								</Button>
								<Button
									variant="destructive"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										console.log('[PollCard] Confirm delete clicked');
										handleDelete();
									}}
									disabled={deleting}
									className="flex-1"
								>
									{deleting ? t.polls.delete.deleting : t.polls.delete.confirm}
								</Button>
							</Stack>
						</Stack>
					</Box>
				</div>
			)}
		</>
		);
	}

	// Active poll - show answer options
	const selectedOptionText = poll.options.find(
		(opt) => opt.id === selectedOption
	)?.text;

	return (
		<>
			<Box className="bg-card rounded-[24px] border border-border/50 shadow-sm p-6 relative overflow-hidden">
				<div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-[60px] rounded-full pointer-events-none" />
				<div className="flex items-center justify-between mb-4 relative z-10 gap-2 flex-wrap">
					<span className="bg-primary/10 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase text-primary shrink-0">
						{t.polls.card.newPoll}
					</span>
					<div className="flex items-center gap-2 shrink-0">
						{poll.endDate && (
							<span className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono whitespace-nowrap">
								<Icon icon="solar:clock-circle-bold" className="size-3.5" />
								{timeRemaining}
							</span>
						)}
						{isAdmin && (
							<>
								<Button
									variant="ghost"
									size="icon"
									onClick={() => onEdit?.(poll)}
									className="size-8 shrink-0"
								>
									<Icon icon="solar:pen-bold" className="size-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										console.log('[PollCard] Delete button clicked for poll:', poll.id);
										setShowDeleteConfirm(true);
									}}
									className="size-8 text-destructive hover:text-destructive shrink-0"
								>
									<Icon icon="solar:trash-bin-trash-bold" className="size-4" />
								</Button>
							</>
						)}
					</div>
				</div>
				<h3 className="text-lg font-bold font-heading mb-2 leading-tight relative z-10">
					{poll.question}
				</h3>
				{poll.description && (
					<p className="text-sm text-muted-foreground mb-6 relative z-10">
						{poll.description}
					</p>
				)}
				<div className="space-y-3 relative z-10">
					{poll.options.map((option) => {
						const isSelected = selectedOption === option.id;
						return (
							<button
								key={option.id}
								onClick={() => handleOptionClick(option.id)}
								disabled={submitting}
								className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-all ${
									isSelected
										? "bg-input/50 border-primary/50 shadow-md shadow-primary/10"
										: "bg-input/50 border-border/30 hover:border-primary/30 hover:bg-input/70 focus:border-primary/50 focus:bg-input/70 focus:outline-none focus:ring-2 focus:ring-primary/20"
								} group active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed`}
							>
								<div className={`size-5 rounded-full border-2 flex items-center justify-center transition-all ${
									isSelected
										? "border-primary scale-110"
										: "border-primary/30 group-hover:border-primary/50 group-focus:border-primary/50"
								}`}>
									<div className={`size-2.5 bg-primary rounded-full transition-transform ${
										isSelected ? "scale-100" : "scale-0 group-hover:scale-50 group-focus:scale-50"
									}`} />
								</div>
								<span className={`text-sm font-medium flex-1 text-left transition-colors ${
									isSelected ? "text-foreground" : "text-foreground group-hover:text-foreground"
								}`}>
									{option.text}
								</span>
							</button>
						);
					})}
				</div>
			</Box>

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

			{/* Delete Confirmation Dialog */}
			{showDeleteConfirm && (
				<div 
					className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
					onClick={(e) => {
						if (e.target === e.currentTarget) {
							setShowDeleteConfirm(false);
						}
					}}
				>
					<Box className="bg-card rounded-[24px] p-6 border border-border/50 max-w-sm w-full mx-4 shadow-2xl">
						<Stack direction="column" spacing={4}>
							<Box>
								<h2 className="text-2xl font-bold font-heading text-destructive">
									{t.polls.delete.title}
								</h2>
								<p className="text-muted-foreground mt-2 text-sm">
									{t.polls.delete.description}
								</p>
							</Box>
							<Stack direction="row" spacing={3}>
								<Button
									variant="outline"
									onClick={() => {
										console.log('[PollCard] Cancel delete clicked');
										setShowDeleteConfirm(false);
									}}
									disabled={deleting}
									className="flex-1"
								>
									{t.common.cancel}
								</Button>
								<Button
									variant="destructive"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										console.log('[PollCard] Confirm delete clicked');
										handleDelete();
									}}
									disabled={deleting}
									className="flex-1"
								>
									{deleting ? t.polls.delete.deleting : t.polls.delete.confirm}
								</Button>
							</Stack>
						</Stack>
					</Box>
				</div>
			)}
		</>
	);
}
