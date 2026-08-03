export type SelectedSessionPlayer = {
	id: string;
	name: string;
	avatar: string | null;
	isPlaceholder?: boolean;
};

export function parseSelectedPlayers(
	stored: string | null,
): SelectedSessionPlayer[] {
	if (!stored) return [];

	try {
		const parsed: unknown = JSON.parse(stored);
		if (!Array.isArray(parsed)) return [];

		return parsed.flatMap((value) => {
			if (
				typeof value !== "object" ||
				value === null ||
				!("id" in value) ||
				typeof value.id !== "string" ||
				!("name" in value) ||
				typeof value.name !== "string"
			) {
				return [];
			}

			return [
				{
					id: value.id,
					name: value.name,
					avatar:
						"avatar" in value && typeof value.avatar === "string"
							? value.avatar
							: null,
					isPlaceholder:
						"isPlaceholder" in value && value.isPlaceholder === true,
				},
			];
		});
	} catch {
		return [];
	}
}
