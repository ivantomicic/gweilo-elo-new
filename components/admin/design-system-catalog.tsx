"use client";

import { useState, type ReactNode } from "react";
import {
	ArrowRightIcon,
	BellIcon,
	CheckIcon,
	InfoIcon,
	MoreHorizontalIcon,
	PlusIcon,
	Trash2Icon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pagination } from "@/components/ui/pagination";
import { PlayerNameCard } from "@/components/ui/player-name-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Separator } from "@/components/ui/separator";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { StateBlock } from "@/components/ui/state-block";
import { SurfaceCard } from "@/components/ui/surface-card";
import { Switch } from "@/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/components/ui/tabs";
import { TeamNameCard } from "@/components/ui/team-name-card";
import {
	DisplayHeading,
	SectionLabel,
	Text,
} from "@/components/ui/typography";
import { cn } from "@/lib/utils";

const colorTokens = [
	{
		name: "Canvas",
		token: "background",
		className: "bg-background",
	},
	{ name: "Card", token: "card", className: "bg-card" },
	{
		name: "Raised surface",
		token: "ds-surface-raised",
		className: "bg-ds-surface-raised",
	},
	{
		name: "Selected surface",
		token: "ds-surface-selected",
		className: "bg-ds-surface-selected",
	},
	{ name: "Primary action", token: "primary", className: "bg-primary" },
	{
		name: "Section accent",
		token: "ds-section-accent",
		className: "bg-ds-section-accent",
	},
	{
		name: "Selected control",
		token: "ds-control-selected",
		className: "bg-ds-control-selected",
	},
	{
		name: "Destructive",
		token: "destructive",
		className: "bg-destructive",
	},
] as const;

const inventory = [
	{
		name: "Button",
		path: "@/components/ui/button",
		status: "App-owned",
		note: "Product variants and sizes live here.",
	},
	{
		name: "SurfaceCard",
		path: "@/components/ui/surface-card",
		status: "App-owned",
		note: "Shared product surface and radius contract.",
	},
	{
		name: "SegmentedControl",
		path: "@/components/ui/segmented-control",
		status: "App-owned",
		note: "Single and multi-option selection patterns.",
	},
	{
		name: "Typography",
		path: "@/components/ui/typography",
		status: "App-owned",
		note: "Semantic text roles for new and migrated screens.",
	},
	{
		name: "Input / Label / Select",
		path: "@/components/ui/input, label, select",
		status: "Wrapped",
		note: "Form boundaries with shared label and focus behavior.",
	},
	{
		name: "Switch / Checkbox",
		path: "@/components/ui/switch, checkbox",
		status: "Wrapped",
		note: "Boolean controls exposed through stable app imports.",
	},
	{
		name: "Tabs / Pagination",
		path: "@/components/ui/tabs, pagination",
		status: "App-owned",
		note: "Navigation states and pagination composition.",
	},
	{
		name: "Sheet / Drawer / SheetForm",
		path: "@/components/ui/sheet, drawer, sheet-form",
		status: "Wrapped",
		note: "Overlay primitives and the standard form composition.",
	},
	{
		name: "Sidebar / DropdownMenu",
		path: "@/components/ui/sidebar, dropdown-menu",
		status: "Wrapped",
		note: "Application navigation and compact action menus.",
	},
	{
		name: "Player / Team identity",
		path: "@/components/ui/*-name-card",
		status: "App-owned",
		note: "One identity language across match and stats views.",
	},
	{
		name: "Table / StatsTableCells",
		path: "@/components/ui/table, stats-table-cells",
		status: "App-owned",
		note: "Data grid boundary and shared ranking/result cells.",
	},
	{
		name: "StateBlock / Loading",
		path: "@/components/ui/state-block, loading",
		status: "App-owned",
		note: "Loading, empty, and error feedback states.",
	},
	{
		name: "Icon / Badge / Separator",
		path: "@/components/ui/icon, badge, separator",
		status: "Wrapped",
		note: "Small supporting primitives used throughout compositions.",
	},
	{
		name: "Box / Stack / InfiniteScroll",
		path: "@/components/ui/box, stack, infinite-scroll",
		status: "Utility",
		note: "Thin layout and behavior helpers; keep them intentionally small.",
	},
	{
		name: "Chart",
		path: "@/components/ui/chart",
		status: "Review",
		note: "Vendor chart wrapper exists, while current charts still use Recharts directly.",
	},
	{
		name: "CalculationTerminal",
		path: "@/components/ui/calculation-terminal",
		status: "App-owned",
		note: "Specialized calculator progress pattern with its own motion.",
	},
	{
		name: "AnimatedContainer",
		path: "@/components/ui/animated-container",
		status: "Review",
		note: "Unused legacy helper; do not expand its use.",
	},
] as const;

function CatalogueSection({
	id,
	eyebrow,
	title,
	description,
	children,
}: {
	id: string;
	eyebrow: string;
	title: string;
	description: string;
	children: ReactNode;
}) {
	return (
		<section id={id} className="scroll-mt-24 space-y-4">
		<div className="max-w-2xl space-y-1.5">
			<SectionLabel>{eyebrow}</SectionLabel>
			<h2 className="font-heading text-2xl font-bold tracking-tight">
				{title}
			</h2>
			<Text variant="secondary">{description}</Text>
		</div>
		{children}
		</section>
	);
}

function PreviewFrame({
	label,
	children,
	className,
}: {
	label: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className="overflow-hidden rounded-panel border border-border/50 bg-background">
		<div className="border-b border-border/50 px-4 py-2.5">
			<p className="text-xs font-semibold text-muted-foreground">{label}</p>
		</div>
		<div className={cn("p-4 sm:p-5", className)}>{children}</div>
		</div>
	);
}

export function DesignSystemCatalog() {
	const [playerCount, setPlayerCount] = useState<number | null>(4);
	const [format, setFormat] = useState<"singles" | "mixed">("mixed");
	const [notificationsEnabled, setNotificationsEnabled] = useState(true);
	const [checked, setChecked] = useState(true);
	const [currentPage, setCurrentPage] = useState(2);

	return (
		<div className="mx-auto w-full max-w-6xl space-y-12 pb-8">
		<SurfaceCard
			variant="elevated"
			className="overflow-hidden border-ds-section-accent/20 bg-gradient-to-br from-card to-ds-surface-raised"
		>
			<div className="max-w-3xl space-y-4">
				<Badge className="border-ds-section-accent/25 bg-ds-section-accent/10 text-ds-section-accent hover:bg-ds-section-accent/10">
					Living reference
				</Badge>
				<DisplayHeading className="text-3xl sm:text-4xl">
					Gweilo web design system
				</DisplayHeading>
				<Text variant="secondary" className="max-w-2xl text-base">
					This page renders the same components used by the site. Reference a
					component name and state when requesting a change; updates should be
					made at the shared boundary first.
				</Text>
			</div>

			<nav
				aria-label="Design system sections"
				className="mt-6 flex flex-wrap gap-2"
			>
				{[
					["foundations", "Foundations"],
					["actions", "Actions"],
					["surfaces", "Surfaces"],
					["forms", "Forms"],
					["identity", "Identity"],
					["data", "Data"],
					["feedback", "Feedback"],
					["inventory", "Inventory"],
				].map(([href, label]) => (
					<Button key={href} asChild variant="outline" size="xs">
						<a href={`#${href}`}>{label}</a>
					</Button>
				))}
			</nav>
		</SurfaceCard>

		<CatalogueSection
			id="foundations"
			eyebrow="01 · Foundations"
			title="Color and type roles"
			description="Semantic names are the stable contract. Their values can change later without hunting through product screens."
		>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{colorTokens.map((color) => (
					<div
						key={color.token}
						className="rounded-panel border border-border/50 bg-card p-3"
					>
						<div
							className={cn(
								"h-20 rounded-xl border border-white/10",
								color.className,
							)}
						/>
						<p className="mt-3 text-sm font-semibold">{color.name}</p>
						<code className="text-xs text-muted-foreground">
							{color.token}
						</code>
					</div>
				))}
			</div>

			<PreviewFrame label="Typography roles" className="space-y-5">
				<div>
					<SectionLabel>Section label</SectionLabel>
					<DisplayHeading className="mt-2">
						Display heading
					</DisplayHeading>
				</div>
				<div className="space-y-1">
					<Text>Primary body text communicates the core content.</Text>
					<Text variant="secondary">
						Secondary text supports the hierarchy without competing.
					</Text>
					<Text variant="caption">
						Caption · metadata · 12:34 · +19 Elo
					</Text>
				</div>
			</PreviewFrame>
		</CatalogueSection>

		<CatalogueSection
			id="actions"
			eyebrow="02 · Actions"
			title="Buttons and selection"
			description="Every supported hierarchy and state is visible here, including the product-emphasis action introduced on session setup."
		>
			<div className="grid gap-4 lg:grid-cols-2">
				<PreviewFrame label="Button hierarchy">
					<div className="flex flex-wrap items-center gap-3">
						<Button>
							<PlusIcon /> Primary
						</Button>
						<Button variant="secondary">Secondary</Button>
						<Button variant="outline">Outline</Button>
						<Button variant="ghost">Ghost</Button>
						<Button variant="destructive">
							<Trash2Icon /> Delete
						</Button>
						<Button variant="link">Text link</Button>
						<Button disabled>Disabled</Button>
					</div>
				</PreviewFrame>

				<PreviewFrame label="Prominent action">
					<Button variant="prominent" size="cta">
						Continue <ArrowRightIcon />
					</Button>
				</PreviewFrame>

				<PreviewFrame label="Highlighted selection">
					<SegmentedControl
						value={playerCount}
						options={[2, 3, 4, 5, 6].map((count) => ({
							value: count,
							label: count,
						}))}
						onValueChange={setPlayerCount}
						ariaLabel="Player count preview"
						selection="highlight"
						size="number"
						elevated
					/>
				</PreviewFrame>

				<PreviewFrame label="Subtle selection">
					<SegmentedControl
						value={format}
						options={[
							{ value: "singles", label: "Singles" },
							{ value: "mixed", label: "Mixed" },
						]}
						onValueChange={setFormat}
						ariaLabel="Session format preview"
					/>
				</PreviewFrame>
			</div>
		</CatalogueSection>

		<CatalogueSection
			id="surfaces"
			eyebrow="03 · Surfaces"
			title="Cards and containers"
			description="SurfaceCard is the app-level product card. Base Card remains available for conventional admin and form compositions."
		>
			<div className="grid gap-4 md:grid-cols-3">
				<SurfaceCard>
					<p className="font-semibold">Default surface</p>
					<Text variant="secondary" className="mt-1">
						Standard content grouping.
					</Text>
				</SurfaceCard>
				<SurfaceCard variant="elevated">
					<p className="font-semibold">Elevated surface</p>
					<Text variant="secondary" className="mt-1">
						A little more depth for hierarchy.
					</Text>
				</SurfaceCard>
				<SurfaceCard variant="interactive" tabIndex={0}>
					<p className="font-semibold">Interactive surface</p>
					<Text variant="secondary" className="mt-1">
						Press feedback for tappable cards.
					</Text>
				</SurfaceCard>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Base card composition</CardTitle>
					<CardDescription>
						Header, content and footer slots for structured tools.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Text>Useful for admin forms and dense content.</Text>
				</CardContent>
				<CardFooter className="gap-2">
					<Button size="sm">Save</Button>
					<Button size="sm" variant="ghost">
						Cancel
					</Button>
				</CardFooter>
			</Card>
		</CatalogueSection>

		<CatalogueSection
			id="forms"
			eyebrow="04 · Forms"
			title="Inputs and controls"
			description="These previews are interactive. Labels, focus states, selected states and helper copy should be reviewed together."
		>
			<div className="grid gap-4 lg:grid-cols-2">
				<PreviewFrame label="Text inputs" className="space-y-4">
					<Input label="Player name" placeholder="Enter a name" />
					<Input
						label="Search"
						icon="solar:magnifer-linear"
						placeholder="Players or sessions"
					/>
					<Input label="Disabled" value="Unavailable" disabled readOnly />
				</PreviewFrame>

				<PreviewFrame label="Choice controls" className="space-y-5">
					<div className="grid gap-2">
						<Label htmlFor="catalog-select">Session format</Label>
						<Select defaultValue="mixed">
							<SelectTrigger id="catalog-select">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="singles">Singles</SelectItem>
								<SelectItem value="mixed">Mixed</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="flex items-center justify-between gap-4">
						<div>
							<Label htmlFor="catalog-switch">Notifications</Label>
							<Text variant="caption">Receive session updates.</Text>
						</div>
						<Switch
							id="catalog-switch"
							checked={notificationsEnabled}
							onCheckedChange={setNotificationsEnabled}
						/>
					</div>

					<label className="flex items-center gap-3 text-sm">
						<Checkbox checked={checked} onCheckedChange={(value) => setChecked(value === true)} />
						Include guest players
					</label>
				</PreviewFrame>
			</div>

			<PreviewFrame label="Tabs">
				<Tabs defaultValue="overview">
					<TabsList className="w-full sm:w-auto">
						<TabsTrigger value="overview">Overview</TabsTrigger>
						<TabsTrigger value="matches">Matches</TabsTrigger>
						<TabsTrigger value="form">Form</TabsTrigger>
					</TabsList>
					<TabsContent value="overview" className="pt-3 text-sm text-muted-foreground">
						Overview content and selected state.
					</TabsContent>
					<TabsContent value="matches" className="pt-3 text-sm text-muted-foreground">
						Matches content and selected state.
					</TabsContent>
					<TabsContent value="form" className="pt-3 text-sm text-muted-foreground">
						Form content and selected state.
					</TabsContent>
				</Tabs>
			</PreviewFrame>
		</CatalogueSection>

		<CatalogueSection
			id="identity"
			eyebrow="05 · Identity"
			title="Players and teams"
			description="Identity components keep avatars, names and supporting data consistent across match, mission and statistics views."
		>
			<PreviewFrame label="Identity rows">
				<div className="grid gap-6 sm:grid-cols-2">
					<PlayerNameCard
						name="Miladin"
						avatar="/favicon.png"
						addon={<Text variant="caption">1,284 Elo · +12</Text>}
					/>
					<TeamNameCard
						player1={{ name: "Andrej", avatar: "/favicon.png" }}
						player2={{ name: "Leo", avatar: "/favicon.png" }}
						addon={<Text variant="caption">Doubles team</Text>}
					/>
				</div>
			</PreviewFrame>
		</CatalogueSection>

		<CatalogueSection
			id="data"
			eyebrow="06 · Data & navigation"
			title="Tables, pages and menus"
			description="Dense information still needs the same hierarchy, touch targets and state language as the rest of the product."
		>
			<PreviewFrame label="Data table" className="p-0">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Player</TableHead>
							<TableHead>Form</TableHead>
							<TableHead className="text-right">Elo</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{[
							["Miladin", "4–1", "+19"],
							["Andrej", "3–2", "+7"],
							["Leo", "1–4", "−13"],
						].map(([name, form, change]) => (
							<TableRow key={name}>
								<TableCell className="font-medium">{name}</TableCell>
								<TableCell>{form}</TableCell>
								<TableCell className="text-right tabular-nums">{change}</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</PreviewFrame>

			<div className="grid gap-4 lg:grid-cols-2">
				<PreviewFrame label="Pagination" className="overflow-x-auto">
					<Pagination
						currentPage={currentPage}
						totalPages={5}
						onPageChange={setCurrentPage}
					/>
				</PreviewFrame>

				<PreviewFrame label="Compact menu">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline">
								<MoreHorizontalIcon /> Open actions
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start">
							<DropdownMenuItem>View player</DropdownMenuItem>
							<DropdownMenuItem>Edit result</DropdownMenuItem>
							<DropdownMenuItem className="text-destructive">Remove</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</PreviewFrame>
			</div>
		</CatalogueSection>

		<CatalogueSection
			id="feedback"
			eyebrow="07 · Feedback"
			title="Status and overlays"
			description="Loading, empty, error and overlay patterns should remain predictable throughout the product."
		>
			<div className="grid gap-4 lg:grid-cols-3">
				<PreviewFrame label="Loading">
					<StateBlock variant="loading" size="sm" title="Loading sessions" />
				</PreviewFrame>
				<PreviewFrame label="Empty">
					<StateBlock
						variant="empty"
						size="sm"
						title="No sessions yet"
						description="Start one when players arrive."
					/>
				</PreviewFrame>
				<PreviewFrame label="Error">
					<StateBlock
						variant="error"
						size="sm"
						title="Could not load data"
						action={<Button size="xs" variant="outline">Retry</Button>}
					/>
				</PreviewFrame>
			</div>

			<PreviewFrame label="Sheet overlay">
				<Sheet>
					<SheetTrigger asChild>
						<Button variant="outline">
							<BellIcon /> Open preview sheet
						</Button>
					</SheetTrigger>
					<SheetContent>
						<SheetHeader>
							<SheetTitle>Component sheet</SheetTitle>
							<SheetDescription>
								This is the production overlay primitive and its spacing.
							</SheetDescription>
						</SheetHeader>
						<div className="mt-6 rounded-panel border border-border/50 bg-card p-4">
							<div className="flex items-center gap-3">
								<span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
									<InfoIcon className="size-4" />
								</span>
								<div>
									<p className="text-sm font-semibold">Reusable overlay</p>
									<Text variant="caption">Focus and dismissal are built in.</Text>
								</div>
							</div>
						</div>
					</SheetContent>
				</Sheet>
			</PreviewFrame>
		</CatalogueSection>

		<CatalogueSection
			id="inventory"
			eyebrow="08 · Inventory"
			title="Ownership and migration map"
			description="The status tells us where a visual change belongs and which older helpers should not spread further."
		>
			<div className="overflow-hidden rounded-panel border border-border/50 bg-card">
				{inventory.map((item, index) => (
					<div key={item.name}>
						<div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<p className="font-semibold">{item.name}</p>
									<Badge
										variant={item.status === "Review" ? "destructive" : "secondary"}
									>
										{item.status === "App-owned" && <CheckIcon className="mr-1 size-3" />}
										{item.status}
									</Badge>
								</div>
								<p className="mt-1 text-sm text-muted-foreground">{item.note}</p>
							</div>
							<code className="break-all text-xs text-muted-foreground sm:text-right">
								{item.path}
							</code>
						</div>
						{index < inventory.length - 1 && <Separator />}
					</div>
				))}
			</div>
		</CatalogueSection>
		</div>
	);
}
