# Edit Match Bug Fix

## Root Cause

The bug was in the player collection logic. When editing a match, the code only collected player IDs from `matchesToReplay` (the edited match and all matches after it), but it should collect ALL players from the ENTIRE session.

### The Problem

1. **Player Collection (Line 370-377)**: Only collected players from `matchesToReplay`
   ```typescript
   // OLD (BUGGY):
   const allPlayerIds = new Set<string>();
   for (const match of matchesToReplay) {  // ❌ Only replay matches
       // ...
   }
   ```

2. **Baseline Loading (Line 393)**: Only loaded baselines for players in `allPlayerIds`
   - If a player participated in match 1 but not in matches 2-3, they wouldn't get a baseline loaded

3. **State Initialization (Line 491)**: Only initialized `currentState` for players in `baselineState`
   - Players not in replay matches wouldn't be in `currentState`

4. **Persistence (Line 817)**: Only persisted players in `currentState`
   - Players not in replay matches wouldn't be persisted, causing their stats to be lost

### The Scenario

- **Match 1**: Ivan 2:1 Andrej
- **Match 2**: Gara 1:2 Ivan (edited to Gara 2:2 Ivan)
- **Match 3**: Andrej 1:2 Gara

When editing match 2:
- `matchesToReplay` = [match 2, match 3]
- `allPlayerIds` (old) = {Gara, Ivan, Andrej} ✓ (all players are in replay matches)

**BUT**: The issue was that when loading baselines:
- If snapshots don't exist or are incorrect, players fall back to `initial_baseline`
- `initial_baseline` returns state BEFORE the session started, not after match 1
- This resets Ivan and Andrej to 1500/0 matches, losing their match 1 stats

## The Fix

### 1. Collect ALL Players from Entire Session

```typescript
// NEW (FIXED):
const allPlayerIds = new Set<string>();
for (const match of allMatches) {  // ✅ All matches in session
    if (match.match_type === "singles") {
        const playerIds = match.player_ids as string[];
        allPlayerIds.add(playerIds[0]);
        allPlayerIds.add(playerIds[1]);
    }
}
```

### 2. Initialize ALL Players in currentState

```typescript
// NEW (FIXED):
// Initialize current state from baseline for ALL players in session
// CRITICAL: Initialize ALL players, even if they're not in replay matches
// Players not in replay matches keep their baseline state (from before edited match)
for (const playerId of allPlayerIds) {
    const baseline = baselineState.get(playerId);
    if (baseline) {
        currentState.set(playerId, { ...baseline });
    } else {
        // Fallback: if no baseline found, use initial baseline
        const initialBaseline = await getInitialBaseline(playerId, sessionId);
        currentState.set(playerId, { ...initialBaseline });
    }
}
```

### 3. Enhanced Logging

Added comprehensive logging to track:
- Which players are in the session vs replay matches
- Baseline loading for each player
- State initialization
- DB upserts (before/after values)

## Verification

After the fix, when editing match 2:

1. **Ivan** should have:
   - 2 matches (match 1 + match 2)
   - Elo updated from match 1 and match 2
   - Stats: 1 win, 0 loss, 1 draw (from match 1 win + match 2 draw)

2. **Andrej** should have:
   - 2 matches (match 1 + match 3)
   - Elo updated from match 1 and match 3
   - Stats: 0 win, 1 loss, 0 draw (from match 1 loss + match 3 loss)

3. **Gara** should have:
   - 2 matches (match 2 + match 3)
   - Elo updated from match 2 and match 3
   - Stats: 1 win, 0 loss, 1 draw (from match 2 draw + match 3 win)

### SQL Query to Verify

```sql
SELECT 
    player_id,
    elo,
    matches_played,
    wins,
    losses,
    draws,
    sets_won,
    sets_lost
FROM player_ratings
WHERE player_id IN (
    SELECT DISTINCT unnest(player_ids) 
    FROM session_matches 
    WHERE session_id = 'YOUR_SESSION_ID'
)
ORDER BY player_id;
```

## Changes Made

1. **`app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`**:
   - Changed player collection to include ALL players from entire session
   - Enhanced baseline loading to handle all players
   - Enhanced state initialization to include all players
   - Added comprehensive logging for debugging

## Testing Checklist

- [ ] Edit match 2 in a 3-match session
- [ ] Verify all 3 players have correct match counts
- [ ] Verify all 3 players have correct Elo values
- [ ] Verify all 3 players have correct win/loss/draw stats
- [ ] Check server logs for `[PLAYER_COLLECTION]`, `[BASELINE_LOADED]`, `[CURRENT_STATE_INITIALIZED]`, `[DB_UPSERT]` tags
- [ ] Verify no players are stuck at 1500/0 matches

