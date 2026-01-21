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

type CreatePollDrawerProps = {
	open: boolean;
	onClose: () => void;
	onInsertSuccess?: () => void;
};

export function CreatePollDrawer({
	open,
	onClose,
	onInsertSuccess,
}: CreatePollDrawerProps) {
	const [question, setQuestion] = useState("");
	const [description, setDescription] = useState("");
	const [options, setOptions] = useState<string[]>(["", ""]);
	const [endDate, setEndDate] = useState<string>("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Reset form when drawer opens/closes
	useEffect(() => {
		if (!open) {
			setQuestion("");
			setDescription("");
			setOptions(["", ""]);
			setEndDate("");
			setError(null);
		}
	}, [open]);

	const addOption = () => {
		setOptions([...options, ""]);
	};

	const removeOption = (index: number) => {
		if (options.length > 2) {
			setOptions(options.filter((_, i) => i !== index));
		}
	};

	const updateOption = (index: number, value: string) => {
		const newOptions = [...options];
		newOptions[index] = value;
		setOptions(newOptions);
	};

	const handleSave = async () => {
		// Validate question
		if (!question.trim()) {
			setError("Pitanje ne može biti prazno");
			return;
		}

		// Validate options (at least 2 non-empty)
		const validOptions = options.filter((opt) => opt.trim().length > 0);
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
				// datetime-local format is "YYYY-MM-DDTHH:mm"
				// Convert to ISO string
				formattedEndDate = new Date(endDate).toISOString();
			}

			// Create poll via API
			const response = await fetch("/api/polls", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${session.access_token}`,
				},
				body: JSON.stringify({
					question: question.trim(),
					description: description.trim() || null,
					options: validOptions.map((opt) => opt.trim()),
					endDate: formattedEndDate,
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				setError(data.error || t.polls.error.createFailed);
				return;
			}

			const pollData = await response.json();
			console.log('[CreatePoll] Poll created successfully:', pollData);
			console.log('[CreatePoll] Email notifications should be sent to all players (check server logs)');

			// Success - close drawer and trigger refetch
			onClose();
			if (onInsertSuccess) {
				onInsertSuccess();
			}
		} catch (err) {
			console.error("Error creating poll:", err);
			setError(t.polls.error.createFailed);
		} finally {
			setSaving(false);
		}
	};

	const isValid =
		question.trim().length > 0 &&
		options.filter((opt) => opt.trim().length > 0).length >= 2;

	return (
		<Sheet open={open} onOpenChange={(open) => !open && onClose()}>
			<SheetContent side="right" className="w-full sm:max-w-md">
				<SheetHeader>
					<SheetTitle>{t.polls.drawer.title}</SheetTitle>
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
									value={option}
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
