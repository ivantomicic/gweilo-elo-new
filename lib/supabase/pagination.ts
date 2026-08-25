export const DEFAULT_SUPABASE_PAGE_SIZE = 1_000;

type SupabasePageResult<T> = {
	data: T[] | null;
	error: unknown;
};

export async function fetchAllQueryPages<T>(
	fetchPage: (
		from: number,
		to: number,
	) => PromiseLike<SupabasePageResult<T>>,
	pageSize = DEFAULT_SUPABASE_PAGE_SIZE,
): Promise<T[]> {
	if (!Number.isInteger(pageSize) || pageSize <= 0) {
		throw new Error("Supabase page size must be a positive integer");
	}

	const rows: T[] = [];

	while (true) {
		const from = rows.length;
		const { data, error } = await fetchPage(from, from + pageSize - 1);

		if (error) throw error;

		const page = data ?? [];
		rows.push(...page);

		if (page.length < pageSize) {
			return rows;
		}
	}
}
