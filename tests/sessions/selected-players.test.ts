import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSelectedPlayers } from "../../lib/sessions/selected-players";

describe("selected session players", () => {
	it("preserves the guest marker while removing unrelated stored fields", () => {
		const players = parseSelectedPlayers(
			JSON.stringify([
				{
					id: "00000000-0000-4000-8000-000000000001",
					name: "Gost",
					avatar: null,
					email: "",
					isPlaceholder: true,
				},
			]),
		);

		assert.deepEqual(players, [
			{
				id: "00000000-0000-4000-8000-000000000001",
				name: "Gost",
				avatar: null,
				isPlaceholder: true,
			},
		]);
	});

	it("defaults normal players to a false guest marker", () => {
		const players = parseSelectedPlayers(
			JSON.stringify([{ id: "player-id", name: "Igrač", avatar: "avatar.png" }]),
		);

		assert.equal(players[0]?.isPlaceholder, false);
	});
});
