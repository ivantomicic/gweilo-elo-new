# Global Elo Overwrite Bug - Root Cause Analysis

## Root Cause

**The Bug:** When editing a match in Session 2, `player_ratings` is overwritten with only Session 2's totals, losing all matches from Session 1.

**Exact Location:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

### 1. Query Only Fetches Current Session (Line 185-191)

```typescript
const { data: allMatches, error: allMatchesError } =
    await adminClient
        .from("session_matches")
        .select("*")
        .eq("session_id", sessionId)  // ❌ ONLY CURRENT SESSION!
        .order("round_number", { ascending: true })
        .order("match_order", { ascending: true });
```

**Problem:** `allMatches` only contains matches from the current session, not all matches globally.

### 2. Baseline Computation Only Uses Current Session (Line 441)

```typescript
const matchesBeforeEdit = allMatches.slice(0, matchIndex);
```

**Problem:** Only replays matches from current session before the edited match. Missing all matches from previous sessions.

### 3. Replay Only Uses Current Session (Line 286)

```typescript
const matchesToReplay = allMatches.slice(matchIndex);
```

**Problem:** Only replays matches from current session from edited match onward. Missing all matches from future sessions.

### 4. Persistence Overwrites Global Totals (Line 894-900)

```typescript
await adminClient.from("player_ratings").upsert({
    player_id: playerId,
    elo: state.elo,                    // ❌ Session-only Elo
    matches_played: state.matches_played,  // ❌ Session-only count
    wins: state.wins,                   // ❌ Session-only wins
    losses: state.losses,               // ❌ Session-only losses
    draws: state.draws,                 // ❌ Session-only draws
    // ...
});
```

**Problem:** `upsert` overwrites global `player_ratings` with session-only totals, losing all previous sessions.

## Example Scenario

**Session 1:**
- Match 1: Ivan 2:1 Andrej
- Match 2: Ivan 2:1 Gara

**Session 2:**
- Match 1: Andrej 1:2 Gara
- Match 2: Ivan 2:1 Miladin (edited to Ivan 2:2 Miladin)

**When editing Session 2 Match 2:**
1. `allMatches` = [Session 2 Match 1, Session 2 Match 2]
2. Baseline computed from: [Session 2 Match 1] only
3. Replay: [Session 2 Match 2] only
4. Final state: Ivan has 1 match (Session 2 Match 2), not 3 matches total
5. `upsert` overwrites: Ivan's global `matches_played` becomes 1, losing Session 1's 2 matches

## Required Fix

**Option B: Full Historical Replay**

1. Query ALL matches globally in chronological order (across all sessions)
2. Find the edited match in the global timeline
3. Compute baseline by replaying all matches from start up to edited match
4. Replay all matches from edited match to end of timeline
5. Persist final global totals
6. Add guardrails to prevent matches_played from decreasing

