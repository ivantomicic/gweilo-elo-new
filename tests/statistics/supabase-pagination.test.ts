import assert from "node:assert/strict";
import test from "node:test";
import { fetchAllQueryPages } from "../../lib/supabase/pagination";

test("continues past a full Supabase response page", async () => {
	const sourceRows = ["oldest", "older", "newer", "newest"];
	const requestedRanges: Array<[number, number]> = [];

	const rows = await fetchAllQueryPages(
		(from, to) => {
			requestedRanges.push([from, to]);
			return Promise.resolve({
				data: sourceRows.slice(from, to + 1),
				error: null,
			});
		},
		2,
	);

	assert.deepEqual(rows, sourceRows);
	assert.deepEqual(requestedRanges, [
		[0, 1],
		[2, 3],
		[4, 5],
	]);
});

test("stops after a partial final page", async () => {
	let requests = 0;

	const rows = await fetchAllQueryPages(
		(from, to) => {
			requests += 1;
			return Promise.resolve({
				data: [1, 2, 3].slice(from, to + 1),
				error: null,
			});
		},
		2,
	);

	assert.deepEqual(rows, [1, 2, 3]);
	assert.equal(requests, 2);
});
