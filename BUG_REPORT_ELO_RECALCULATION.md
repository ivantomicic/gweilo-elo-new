# Critical Bug Report: Elo Recalculation After Match Edit

## Root Cause Analysis

### Bug #1: Doubles Teams Created for Singles Matches ⚠️ **CRITICAL**

**Location:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts:751-752`

**Problem:**
```typescript
// Line 749-763
} else {
    // Doubles match
    const team1Id = match.team_1_id || await getOrCreateDoubleTeam(playerIds[0], playerIds[1]);
    const team2Id = match.team_2_id || await getOrCreateDoubleTeam(playerIds[2], playerIds[3]);
```

**Issue:** The code checks `isSingles` on line 677, but then in the `else` block (doubles), it calls `getOrCreateDoubleTeam` even when `match.team_1_id` is null. For singles matches that somehow have `match_type !== "singles"` or have null `team_1_id`, this creates doubles teams incorrectly.

**Evidence:** The condition `match.team_1_id || await getOrCreateDoubleTeam(...)` will create teams if `team_1_id` is null, even for singles matches.

---

### Bug #2: Baseline Restoration Creates Doubles Ratings for Singles Players ⚠️ **CRITICAL**

**Location:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts:328-344`

**Problem:**
```typescript
// Doubles player ratings
for (const playerId of allPlayerIds) {
    const { data: rating } = await adminClient
        .from("player_double_ratings")
        .select("*")
        .eq("player_id", playerId)
        .single();
    currentRatings.set(`player_doubles:${playerId}`, rating || {
        player_id: playerId,
        elo: 1500,
        matches_played: 0,
        // ...
    });
}
```

**Issue:** The baseline restoration code loads `player_double_ratings` for ALL players in the session, even if they only played singles matches. This creates doubles rating rows that shouldn't exist for singles-only sessions.

**Impact:** Creates phantom doubles ratings, causing the UI to show doubles tables.

---

### Bug #3: K-Factor Uses Wrong matches_played Count ⚠️ **HIGH**

**Location:** `lib/elo/updates.ts:42-43`

**Problem:**
```typescript
const player1MatchCount = (rating1?.wins ?? 0) + (rating1?.losses ?? 0) + (rating1?.draws ?? 0);
const player2MatchCount = (rating2?.wins ?? 0) + (rating2?.losses ?? 0) + (rating2?.draws ?? 0);
```

**Issue:** When replaying matches after a baseline restore, `updateSinglesRatings` reads the current `matches_played` from the database. However, during replay:
- The baseline has been restored (e.g., matches_played = 5)
- We're replaying match #6, #7, #8...
- But `matches_played` should be: baseline (5) + matches replayed so far (1, 2, 3...)
- Currently, it uses the current DB value, which might be wrong if the baseline restoration didn't properly reset `matches_played`.

**Impact:** Wrong K-factor calculation → wrong Elo deltas → incorrect final ratings.

---

### Bug #4: Baseline Calculation Includes All History (Not Just Session) ⚠️ **MEDIUM**

**Location:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts:270-273`

**Problem:**
```typescript
const { data: allHistory, error: historyError } = await adminClient
    .from("match_elo_history")
    .select("*")
    .in("match_id", allMatches.map(m => m.id));
```

**Issue:** This only gets history for matches in `allMatches`, which is correct. However, the baseline restoration reverses ALL history entries for the session. If a match was edited multiple times, or if there are duplicate history entries, this could cause incorrect baseline calculation.

**Impact:** Baseline might be wrong if history has duplicates or if matches were edited before.

---

## SQL Evidence Queries

Run these queries to verify the bugs:

```sql
-- 1. Check for doubles teams created for singles-only sessions
SELECT 
    dt.id,
    dt.player_1_id,
    dt.player_2_id,
    dt.created_at,
    sm.session_id,
    sm.match_type
FROM double_teams dt
LEFT JOIN session_matches sm ON (
    (sm.player_ids[1] = dt.player_1_id AND sm.player_ids[2] = dt.player_2_id)
    OR (sm.player_ids[1] = dt.player_2_id AND sm.player_ids[2] = dt.player_1_id)
)
WHERE sm.match_type = 'singles'
GROUP BY dt.id, dt.player_1_id, dt.player_2_id, dt.created_at, sm.session_id, sm.match_type;

-- 2. Check for doubles ratings for players who only played singles in a session
SELECT 
    pdr.player_id,
    pdr.matches_played,
    pdr.elo,
    COUNT(DISTINCT sm.id) as singles_matches_in_session,
    COUNT(DISTINCT CASE WHEN sm.match_type = 'doubles' THEN sm.id END) as doubles_matches_in_session
FROM player_double_ratings pdr
LEFT JOIN session_matches sm ON (
    sm.player_ids @> ARRAY[pdr.player_id]::uuid[]
)
WHERE sm.match_type = 'singles'
GROUP BY pdr.player_id, pdr.matches_played, pdr.elo
HAVING COUNT(DISTINCT CASE WHEN sm.match_type = 'doubles' THEN sm.id END) = 0;

-- 3. Check for duplicate match_elo_history entries
SELECT match_id, COUNT(*) as count
FROM match_elo_history
GROUP BY match_id
HAVING COUNT(*) > 1;

-- 4. Check matches_played vs actual match count
SELECT 
    pr.player_id,
    pr.matches_played as db_matches_played,
    pr.wins + pr.losses + pr.draws as calculated_matches_played,
    COUNT(DISTINCT meh.match_id) as history_match_count
FROM player_ratings pr
LEFT JOIN match_elo_history meh ON (
    meh.player1_id = pr.player_id OR meh.player2_id = pr.player_id
)
GROUP BY pr.player_id, pr.matches_played, pr.wins, pr.losses, pr.draws
HAVING pr.matches_played != (pr.wins + pr.losses + pr.draws);
```

---

## Fix Plan

### Fix #1: Prevent Doubles Team Creation for Singles Matches

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

**Change:**
```typescript
// BEFORE (line 749-763)
} else {
    // Doubles match
    const team1Id = match.team_1_id || await getOrCreateDoubleTeam(playerIds[0], playerIds[1]);
    const team2Id = match.team_2_id || await getOrCreateDoubleTeam(playerIds[2], playerIds[3]);

// AFTER
} else if (match.match_type === "doubles") {
    // Only process doubles matches here
    if (!match.team_1_id || !match.team_2_id) {
        // Create teams if missing
        const team1Id = match.team_1_id || await getOrCreateDoubleTeam(playerIds[0], playerIds[1]);
        const team2Id = match.team_2_id || await getOrCreateDoubleTeam(playerIds[2], playerIds[3]);
        // ... rest of doubles logic
    }
} else {
    // This should never happen, but log it
    console.error(`Unknown match type: ${match.match_type} for match ${match.id}`);
    continue;
}
```

---

### Fix #2: Only Load Doubles Ratings for Doubles Players

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

**Change:**
```typescript
// BEFORE (line 328-344)
// Doubles player ratings
for (const playerId of allPlayerIds) {
    const { data: rating } = await adminClient
        .from("player_double_ratings")
        .select("*")
        .eq("player_id", playerId)
        .single();
    // ...
}

// AFTER
// Only load doubles ratings for players who actually played doubles in this session
const doublesPlayerIds = new Set<string>();
for (const match of allMatches) {
    if (match.match_type === "doubles") {
        const playerIds = match.player_ids as string[];
        doublesPlayerIds.add(playerIds[0]);
        doublesPlayerIds.add(playerIds[1]);
        doublesPlayerIds.add(playerIds[2]);
        doublesPlayerIds.add(playerIds[3]);
    }
}

// Doubles player ratings (only for doubles players)
for (const playerId of doublesPlayerIds) {
    const { data: rating } = await adminClient
        .from("player_double_ratings")
        .select("*")
        .eq("player_id", playerId)
        .single();
    // ...
}
```

---

### Fix #3: Track matches_played During Replay

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

**Change:** Add a map to track matches_played per player during replay:

```typescript
// Before replay loop (line 673)
const playerMatchesPlayed = new Map<string, number>();
const teamMatchesPlayed = new Map<string, number>();

// Initialize from baseline
for (const [key, rating] of currentRatings.entries()) {
    const [entityType, entityId] = key.split(":");
    if (entityType === "player_singles") {
        playerMatchesPlayed.set(entityId, rating.matches_played);
    } else if (entityType === "double_team") {
        teamMatchesPlayed.set(entityId, rating.matches_played);
    }
}

// In replay loop, before calling updateSinglesRatings:
// We need to pass the correct matches_played count
// But updateSinglesRatings reads from DB, so we need to either:
// A) Modify updateSinglesRatings to accept matches_played as parameter
// B) Temporarily update the DB with correct matches_played before calling updateSinglesRatings
```

**Better Solution:** Modify `updateSinglesRatings` to accept optional `matches_played` parameter, or create a new function that accepts it.

---

### Fix #4: Add Validation and Logging

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

**Add before replay:**
```typescript
// Validate: No doubles matches in singles-only session
const hasDoublesMatches = allMatches.some(m => m.match_type === "doubles");
const hasSinglesMatches = allMatches.some(m => m.match_type === "singles");

if (hasSinglesMatches && hasDoublesMatches) {
    console.warn(`Session ${sessionId} has both singles and doubles matches - this is unusual`);
}

// Validate: All matches have valid match_type
const invalidMatches = allMatches.filter(m => 
    m.match_type !== "singles" && m.match_type !== "doubles"
);
if (invalidMatches.length > 0) {
    console.error(`Found ${invalidMatches.length} matches with invalid match_type:`, invalidMatches);
    await adminClient
        .from("sessions")
        .update({ recalc_status: "failed" })
        .eq("id", sessionId);
    return NextResponse.json(
        { error: "Invalid match types found" },
        { status: 500 }
    );
}
```

---

## Test Cases

### Test 1: Singles-Only Session Edit
```typescript
// Setup: 3 players, all starting at 1500 Elo
// Matches:
// 1. Ivan 2-1 Andrej
// 2. Gara 1-2 Ivan  
// 3. Andrej 2-1 Ivan

// Edit match 1 to: Ivan 1-2 Andrej

// Expected:
// - No doubles teams created
// - No player_double_ratings rows created
// - Final Elo calculated correctly
// - matches_played = 3 for all players
```

### Test 2: Verify No Doubles Tables
```typescript
// After edit, verify:
// - SELECT COUNT(*) FROM double_teams WHERE created_at > session_start = 0
// - SELECT COUNT(*) FROM player_double_ratings WHERE updated_at > session_start = 0
```

### Test 3: Deterministic Replay
```typescript
// Edit same match twice with same result
// Verify: Final Elo is identical both times
```

---

## Implementation Checklist

- [ ] Fix doubles team creation for singles matches
- [ ] Fix baseline restoration to only load doubles ratings for doubles players
- [ ] Fix matches_played tracking during replay
- [ ] Add validation for match types
- [ ] Add logging for debugging
- [ ] Add unit tests for singles-only session edit
- [ ] Add integration test for no doubles tables created
- [ ] Add test for deterministic replay
- [ ] Update documentation

