"use client";

import { useEffect, useRef, useState, useId } from "react";
import { Box } from "./box";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

export type TerminalLine = {
	text: string;
	type?: "info" | "success" | "error" | "highlight" | "dim";
	delay?: number; // Delay before showing this line (ms)
};

// Internal type with stable ID for rendering
type InternalLine = TerminalLine & {
	id: string;
	isNew: boolean;
};

type CalculationTerminalProps = {
	lines: TerminalLine[];
	isComplete?: boolean;
	onComplete?: () => void;
	className?: string;
};

export function CalculationTerminal({
	lines,
	isComplete = false,
	onComplete,
	className,
}: CalculationTerminalProps) {
	// Completed lines that are fully typed
	const [completedLines, setCompletedLines] = useState<InternalLine[]>([]);
	// Currently typing line
	const [currentTypingLine, setCurrentTypingLine] = useState<InternalLine | null>(null);
	const [currentTypingText, setCurrentTypingText] = useState("");
	
	const [currentLineIndex, setCurrentLineIndex] = useState(0);
	const [isTyping, setIsTyping] = useState(true);
	const [isEntering, setIsEntering] = useState(true);
	const containerRef = useRef<HTMLDivElement>(null);
	const hasCalledComplete = useRef(false);
	const lineIdCounter = useRef(0);
	const instanceId = useId();

	// Generate stable ID for lines
	const generateLineId = () => {
		lineIdCounter.current += 1;
		return `${instanceId}-line-${lineIdCounter.current}`;
	};

	// Entrance animation
	useEffect(() => {
		const timer = setTimeout(() => setIsEntering(false), 50);
		return () => clearTimeout(timer);
	}, []);

	// Reset when lines change
	useEffect(() => {
		setCompletedLines([]);
		setCurrentTypingLine(null);
		setCurrentTypingText("");
		setCurrentLineIndex(0);
		setIsTyping(true);
		hasCalledComplete.current = false;
		lineIdCounter.current = 0;
	}, [lines]);

	// Main typing effect
	useEffect(() => {
		// All lines done
		if (currentLineIndex >= lines.length) {
			setIsTyping(false);
			setCurrentTypingLine(null);
			if (isComplete && onComplete && !hasCalledComplete.current) {
				hasCalledComplete.current = true;
				const timer = setTimeout(onComplete, 600);
				return () => clearTimeout(timer);
			}
			return;
		}

		const sourceLine = lines[currentLineIndex];

		// Start new line if we don't have one
		if (!currentTypingLine) {
			const delay = sourceLine.delay || 0;
			const timer = setTimeout(() => {
				const newLine: InternalLine = {
					...sourceLine,
					id: generateLineId(),
					isNew: true,
				};
				setCurrentTypingLine(newLine);
				setCurrentTypingText("");
			}, delay);
			return () => clearTimeout(timer);
		}

		// Type characters
		if (currentTypingText.length < sourceLine.text.length) {
			const charsPerTick = 1 + Math.floor(Math.random() * 2); // 1-2 chars
			const typingSpeed = 18 + Math.random() * 22; // 18-40ms
			const timer = setTimeout(() => {
				const newLength = Math.min(
					currentTypingText.length + charsPerTick,
					sourceLine.text.length
				);
				setCurrentTypingText(sourceLine.text.slice(0, newLength));
			}, typingSpeed);
			return () => clearTimeout(timer);
		}

		// Line complete - move to completed and start next
		const lineEndDelay = 80 + Math.random() * 120;
		const timer = setTimeout(() => {
			// Add to completed lines (mark as not new after a tick)
			setCompletedLines((prev) => [
				...prev,
				{ ...currentTypingLine, text: sourceLine.text, isNew: false },
			]);
			setCurrentTypingLine(null);
			setCurrentTypingText("");
			setCurrentLineIndex((i) => i + 1);
		}, lineEndDelay);
		return () => clearTimeout(timer);
	}, [currentLineIndex, currentTypingLine, currentTypingText, lines, isComplete, onComplete]);

	// Auto-scroll to bottom
	useEffect(() => {
		if (containerRef.current) {
			containerRef.current.scrollTo({
				top: containerRef.current.scrollHeight,
				behavior: "smooth",
			});
		}
	}, [completedLines, currentTypingText]);

	const getLineColor = (type?: TerminalLine["type"]) => {
		switch (type) {
			case "success":
				return "text-emerald-400";
			case "error":
				return "text-red-400";
			case "highlight":
				return "text-primary";
			case "dim":
				return "text-muted-foreground/60";
			default:
				return "text-foreground/80";
		}
	};

	return (
		<Box
			className={cn(
				"bg-[#0d1117] border border-border/30 rounded-xl overflow-hidden shadow-2xl",
				"transition-all duration-300 ease-out",
				isEntering
					? "opacity-0 scale-95 translate-y-4"
					: "opacity-100 scale-100 translate-y-0",
				className
			)}
		>
			{/* Terminal header */}
			<Box className="flex items-center gap-2 px-4 py-3 bg-[#161b22] border-b border-border/20">
				<Box className="flex gap-1.5">
					<span className="size-3 rounded-full bg-red-500/80" />
					<span className="size-3 rounded-full bg-yellow-500/80" />
					<span className="size-3 rounded-full bg-green-500/80" />
				</Box>
				<span className="text-xs text-muted-foreground/60 font-mono ml-2">
					elo-calculator
				</span>
				{/* Activity indicator */}
				{isTyping && (
					<Box className="ml-auto flex items-center gap-1.5">
						<span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
						<span className="text-[10px] text-emerald-500/80 font-mono">
							{t.terminal.running}
						</span>
					</Box>
				)}
			</Box>

			{/* Terminal content */}
			<Box
				ref={containerRef}
				className="p-4 font-mono text-sm leading-relaxed max-h-[350px] overflow-y-auto scrollbar-thin scrollbar-thumb-border/30"
			>
				{/* Completed lines - stable, no re-animation */}
				{completedLines.map((line) => (
					<Box
						key={line.id}
						className="flex items-start gap-2 min-h-[1.5rem]"
					>
						<span className="text-primary/60 select-none shrink-0">❯</span>
						<span className={cn("break-all", getLineColor(line.type))}>
							{line.text}
						</span>
					</Box>
				))}

				{/* Currently typing line */}
				{currentTypingLine && (
					<Box
						key={currentTypingLine.id}
						className="flex items-start gap-2 min-h-[1.5rem] animate-in fade-in-0 slide-in-from-left-2 duration-150"
					>
						<span className="text-primary/60 select-none shrink-0">❯</span>
						<span className={cn("break-all", getLineColor(currentTypingLine.type))}>
							{currentTypingText}
							<span className="inline-block w-2 h-4 bg-primary/80 ml-0.5 animate-pulse" />
						</span>
					</Box>
				)}

				{/* Blinking cursor when done typing but waiting */}
				{!isTyping && !isComplete && (
					<Box className="flex items-start gap-2 min-h-[1.5rem]">
						<span className="text-primary/60 select-none">❯</span>
						<span className="inline-block w-2 h-4 bg-primary/80 animate-pulse" />
					</Box>
				)}
			</Box>
		</Box>
	);
}

// Wrapper component for the modal with entrance/exit animations
type TerminalModalProps = {
	isVisible: boolean;
	onExitComplete?: () => void;
	children: React.ReactNode;
};

export function TerminalModal({
	isVisible,
	onExitComplete,
	children,
}: TerminalModalProps) {
	const [shouldRender, setShouldRender] = useState(false);
	const [isAnimatingOut, setIsAnimatingOut] = useState(false);

	useEffect(() => {
		if (isVisible) {
			setShouldRender(true);
			setIsAnimatingOut(false);
		} else if (shouldRender) {
			// Start exit animation
			setIsAnimatingOut(true);
			const timer = setTimeout(() => {
				setShouldRender(false);
				setIsAnimatingOut(false);
				onExitComplete?.();
			}, 300); // Match animation duration
			return () => clearTimeout(timer);
		}
	}, [isVisible, shouldRender, onExitComplete]);

	if (!shouldRender) return null;

	return (
		<Box
			className={cn(
				"fixed inset-0 z-50 flex items-center justify-center p-4",
				"transition-all duration-300 ease-out",
				isAnimatingOut
					? "bg-black/0 backdrop-blur-none"
					: "bg-black/90 backdrop-blur-sm"
			)}
		>
			<Box
				className={cn(
					"w-full max-w-lg transition-all duration-300 ease-out",
					isAnimatingOut
						? "opacity-0 scale-95 translate-y-4"
						: "opacity-100 scale-100 translate-y-0"
				)}
			>
				{children}
			</Box>
		</Box>
	);
}
