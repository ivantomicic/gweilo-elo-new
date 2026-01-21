"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetFooter,
} from "@/components/ui/sheet";
import { t } from "@/lib/i18n";
import type { Poll, PollOption } from "@/components/polls/poll-card";

type EditPollDrawerProps = {
	open: boolean;
	onClose: () => void;
	poll: Poll | null;
	onUpdateSuccess?: () => void;
};

export function EditPollDrawer({
	open,
	onClose,
	poll,
	onUpdateSuccess,
}: EditPollDrawerProps) {
	const [question, setQuestion] = useState("");
	const [description, setDescription] = useState<string>("");
	const [options, setOptions] = useState<Array<{ id: string | null; text: string }>>([]);
	const [endDate, setEndDate] = useState<string>("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Load poll data when drawer opens
	useEffect(() => {
		if (open && poll) {
			setQuestion(poll.question);
			setDescription(poll.description || "");
			// Map existing options with their IDs
			setOptions(
				poll.options.map((opt) => ({
					id: opt.id,
					text: opt.text,
				}))
			);
			// Format endDate for datetime-local input
			if (poll.endDate) {
				const date = new Date(poll.endDate);
				const year = date.getFullYear();
				const month = String(date.getMonth() + 1).padStart(2, "0");
				const day = String(date.getDate()).padStart(2, "0");
				const hours = String(date.getHours()).padStart(2, "0");
				const minutes = String(date.getMinutes()).padStart(2, "0");
				setEndDate(`${year}-${month}-${day}T${hours}:${minutes}`);
			} else {
				setEndDate("");
			}
			setError(null);
		}
	}, [open, poll]);

	const addOption = () => {
		setOptions([...options, { id: null, text: "" }]);
	};

	const removeOption = (index: number) => {
		if (options.length > 2) {
			setOptions(options.filter((_, i) => i !== index));
		}
	};

	const updateOption = (index: number, value: string) => {
		const newOptions = [...options];
		newOptions[index] = { ...newOptions[index], text: value };
		setOptions(newOptions);
	};

	const handleSave = async () => {
		if (!poll) return;

		// Validate question
		if (!question.trim()) {
			setError("Pitanje ne može biti prazno");
			return;
		}

		// Validate options (at least 2 non-empty)
		const validOptions = options.filter((opt) => opt.text.trim().length > 0);
		if (validOptions.length < 2) {
			setError("Potrebne su najmanje 2 opcije");
			return;
		}

		try {
			setSaving(true);
			setError(null);

			const {
				data: { session },
			} = await supabase.auth.getSession();

			if (!session) {
				setError(t.polls.error.notAuthenticated);
				return;
			}

			// Format endDate if provided (convert from datetime-local to ISO)
			let formattedEndDate: string | null = null;
			if (endDate) {
				formattedEndDate = new Date(endDate).toISOString();
			}

			// Update poll via API
			const response = await fetch(`/api/polls/${poll.id}`, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${session.access_token}`,
				},
				body: JSON.stringify({
					question: question.trim(),
					description: description.trim() || null,
					options: validOptions.map((opt) => ({
						id: opt.id,
						text: opt.text.trim(),
					})),
					endDate: formattedEndDate,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				setError(data.error || t.polls.error.updateFailed);
				return;
			}

			// Success - close drawer and trigger refetch
			onClose();
			if (onUpdateSuccess) {
				onUpdateSuccess();
			}
		} catch (err) {
			console.error("Error updating poll:", err);
			setError(t.polls.error.updateFailed);
		} finally {
			setSaving(false);
		}
	};

	const isValid =
		question.trim().length > 0 &&
		options.filter((opt) => opt.text.trim().length > 0).length >= 2;

	return (
		<Sheet open={open} onOpenChange={(open) => !open && onClose()}>
			<SheetContent side="right" className="w-full sm:max-w-md">
				<SheetHeader>
					<SheetTitle>{t.polls.drawer.editTitle}</SheetTitle>
				</SheetHeader>

				<div className="mt-6 space-y-6">
					{/* Error message */}
					{error && (
						<div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2 text-sm text-red-600 dark:text-red-400">
							{error}
						</div>
					)}

					{/* Question */}
					<div className="space-y-2">
						<Input
							label={t.polls.drawer.question}
							value={question}
							onChange={(e) => setQuestion(e.target.value)}
							placeholder={t.polls.drawer.questionPlaceholder}
							disabled={saving}
						/>
					</div>

					{/* Description */}
					<div className="space-y-2">
						<label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">
							{t.polls.drawer.description}
						</label>
						<textarea
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder={t.polls.drawer.descriptionPlaceholder}
							disabled={saving}
							className="w-full min-h-[100px] px-3 py-2 text-sm bg-background border border-border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
						/>
					</div>

					{/* Options */}
					<div className="space-y-3">
						<label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">
							Opcije
						</label>
						{options.map((option, index) => (
							<div key={index} className="flex gap-2">
								<Input
									value={option.text}
									onChange={(e) =>
										updateOption(index, e.target.value)
									}
									placeholder={t.polls.drawer.optionPlaceholder(
										index + 1
									)}
									disabled={saving}
									className="flex-1"
								/>
								{options.length > 2 && (
									<Button
										onClick={() => removeOption(index)}
										variant="ghost"
										size="icon"
										disabled={saving}
									>
										×
									</Button>
								)}
							</div>
						))}
						<Button
							onClick={addOption}
							variant="outline"
							disabled={saving}
							className="w-full"
						>
							{t.polls.drawer.addOption}
						</Button>
					</div>

					{/* End Date (optional) */}
					<div className="space-y-2">
						<Input
							label={t.polls.drawer.endDate}
							type="datetime-local"
							value={endDate}
							onChange={(e) => setEndDate(e.target.value)}
							disabled={saving}
						/>
					</div>
				</div>

				<SheetFooter className="mt-8">
					<Button
						variant="outline"
						onClick={onClose}
						disabled={saving}
					>
						{t.polls.drawer.cancel}
					</Button>
					<Button
						onClick={handleSave}
						disabled={saving || !isValid}
					>
						{saving ? t.settings.saving : t.polls.drawer.save}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
