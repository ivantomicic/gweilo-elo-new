"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type PaginationProps = {
	currentPage: number;
	totalPages: number;
	onPageChange: (page: number) => void;
	disabled?: boolean;
};

export function Pagination({
	currentPage,
	totalPages,
	onPageChange,
	disabled = false,
}: PaginationProps) {
	if (totalPages <= 1) return null;

	// Calculate which page numbers to show (max 7 pages shown)
	const getPageNumbers = () => {
		const maxVisible = 7;
		const pages: (number | string)[] = [];

		if (totalPages <= maxVisible) {
			// Show all pages if total is small
			return Array.from({ length: totalPages }, (_, i) => i + 1);
		}

		// Always show first page
		pages.push(1);

		const start = Math.max(2, currentPage - 1);
		const end = Math.min(totalPages - 1, currentPage + 1);

		// Add ellipsis before current range if needed
		if (start > 2) {
			pages.push("...");
		}

		// Add pages around current page
		for (let i = start; i <= end; i++) {
			pages.push(i);
		}

		// Add ellipsis after current range if needed
		if (end < totalPages - 1) {
			pages.push("...");
		}

		// Always show last page
		pages.push(totalPages);

		return pages;
	};

	const pageNumbers = getPageNumbers();

	return (
		<div className="flex items-center gap-2">
			<Button
				variant="outline"
				size="sm"
				onClick={() => onPageChange(currentPage - 1)}
				disabled={currentPage === 1 || disabled}
				className="h-8 w-8 p-0"
			>
				<ChevronLeft className="h-4 w-4" />
				<span className="sr-only">Previous page</span>
			</Button>

			<div className="flex items-center gap-1">
				{pageNumbers.map((page, index) => {
					if (page === "...") {
						return (
							<span
								key={`ellipsis-${index}`}
								className="px-2 text-sm text-muted-foreground"
							>
								...
							</span>
						);
					}

					const pageNum = page as number;
					const isActive = pageNum === currentPage;

					return (
						<Button
							key={pageNum}
							variant={isActive ? "default" : "outline"}
							size="sm"
							onClick={() => onPageChange(pageNum)}
							disabled={disabled}
							className={cn(
								"h-8 min-w-8 px-3",
								isActive && "pointer-events-none"
							)}
						>
							{pageNum}
						</Button>
					);
				})}
			</div>

			<Button
				variant="outline"
				size="sm"
				onClick={() => onPageChange(currentPage + 1)}
				disabled={currentPage === totalPages || disabled}
				className="h-8 w-8 p-0"
			>
				<ChevronRight className="h-4 w-4" />
				<span className="sr-only">Next page</span>
			</Button>
		</div>
	);
}

