export function normalizePlayerID(playerID: string): string {
	return playerID.toLowerCase();
}

export function normalizePlayerIDs(playerIDs: string[]): string[] {
	return playerIDs.map(normalizePlayerID);
}
