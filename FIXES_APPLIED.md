# Fixes Applied for Elo Recalculation Bug

## Summary

Fixed critical bugs in the match edit recalculation logic that were causing:
1. Doubles teams/tables to appear for singles-only sessions
2. Incorrect Elo calculations
3. Potential K-factor calculation errors

## Fixes Applied

### ✅ Fix #1: Prevent Doubles Team Creation for Singles Matches

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

**Change:** Added explicit check for `match.match_type === "doubles"` before processing doubles logic.

**Before:**
```typescript
} else {
    // Doubles match
    const team1Id = match.team_1_id || await getOrCreateDoubleTeam(...);
```

**After:**
```typescript
} else if (match.match_type === "doubles") {
    // Doubles match - only process if explicitly doubles
    if (playerIds.length < 4) {
        console.error(`Match ${match.id} is marked as doubles but has < 4 players. Skipping.`);
        continue;
    }
    // ... doubles logic
} else {
    // Unknown match type - log and skip
    console.error(`Match ${match.id} has unknown match_type: ${match.match_type}. Skipping replay.`);
    continue;
}
```

**Impact:** Prevents doubles teams from being created when processing singles matches.

---

### ✅ Fix #2: Only Load Doubles Ratings for Doubles Players

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

**Change:** Separated doubles players from all players when loading baseline ratings.

**Before:**
```typescript
// Doubles player ratings
for (const playerId of allPlayerIds) {
    // Loads doubles ratings for ALL players
}
```

**After:**
```typescript
const doublesPlayerIds = new Set<string>();
for (const match of allMatches) {
    if (match.match_type === "doubles") {
        // Only add players who actually played doubles
        doublesPlayerIds.add(playerIds[0]);
        // ...
    }
}

// Doubles player ratings (ONLY for players who actually played doubles in this session)
for (const playerId of doublesPlayerIds) {
    // Only loads doubles ratings for doubles players
}
```

**Impact:** Prevents creation of phantom `player_double_ratings` rows for singles-only players.

---

### ✅ Fix #3: Added Match Type Validation

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

**Change:** Added validation to reject sessions with invalid match types.

```typescript
// Validate match types before proceeding
const invalidMatches = allMatches.filter(m => 
    m.match_type !== "singles" && m.match_type !== "doubles"
);
if (invalidMatches.length > 0) {
    console.error(`Found ${invalidMatches.length} matches with invalid match_type:`, invalidMatches);
    // Fail early with clear error
}
```

**Impact:** Catches data integrity issues early and prevents silent failures.

---

### ✅ Fix #4: Added Debug Logging

**File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

**Change:** Added logging to track session composition.

```typescript
// Log session composition for debugging
const singlesCount = allMatches.filter(m => m.match_type === "singles").length;
const doublesCount = allMatches.filter(m => m.match_type === "doubles").length;
console.log(`Session ${sessionId} has ${singlesCount} singles matches and ${doublesCount} doubles matches`);
```

**Impact:** Helps diagnose issues in production.

---

## Remaining Issues (Not Yet Fixed)

### ⚠️ Issue #1: K-Factor Uses Wrong matches_played

**Problem:** When replaying matches, `updateSinglesRatings` reads `matches_played` from the database, but during replay this should be: baseline + matches replayed so far.

**Current Behavior:**
- Baseline restored: `matches_played = 5`
- Replaying match #6: Uses DB value (might be wrong)
- Should use: baseline (5) + matches replayed (1) = 6

**Fix Required:**
- Option A: Modify `updateSinglesRatings` to accept optional `matches_played` parameter
- Option B: Track `matches_played` during replay and update DB before each call
- Option C: Create a new replay-specific function that accepts baseline + replay count

**Priority:** HIGH (affects Elo calculation accuracy)

---

### ⚠️ Issue #2: Baseline Restoration May Not Handle All Edge Cases

**Problem:** The baseline restoration by reversing history might not handle:
- Duplicate history entries
- Matches edited multiple times
- Missing history entries

**Fix Required:**
- Add validation for duplicate history entries
- Add check for missing history entries
- Consider using snapshots instead of history reversal (snapshots are more reliable)

**Priority:** MEDIUM (only affects sessions without snapshots)

---

## Testing Checklist

- [ ] Test singles-only session edit
  - [ ] Verify no doubles teams created
  - [ ] Verify no `player_double_ratings` rows created
  - [ ] Verify Elo calculations are correct
  - [ ] Verify `matches_played` is correct

- [ ] Test doubles-only session edit
  - [ ] Verify doubles teams are created correctly
  - [ ] Verify `player_double_ratings` are updated correctly
  - [ ] Verify Elo calculations are correct

- [ ] Test mixed session edit
  - [ ] Verify singles and doubles are handled separately
  - [ ] Verify no cross-contamination

- [ ] Test deterministic replay
  - [ ] Edit same match twice with same result
  - [ ] Verify final Elo is identical both times

- [ ] Test edge cases
  - [ ] Edit first match in session
  - [ ] Edit last match in session
  - [ ] Edit middle match in session
  - [ ] Edit match with no history (new match)

---

## SQL Queries for Verification

Run these after editing a match to verify fixes:

```sql
-- 1. Verify no doubles teams created for singles-only session
SELECT COUNT(*) as doubles_teams_created
FROM double_teams dt
WHERE dt.created_at > (
    SELECT created_at FROM sessions WHERE id = 'YOUR_SESSION_ID'
)
AND NOT EXISTS (
    SELECT 1 FROM session_matches sm
    WHERE sm.match_type = 'doubles'
    AND (sm.team_1_id = dt.id OR sm.team_2_id = dt.id)
);

-- 2. Verify no doubles ratings for singles-only players
SELECT COUNT(*) as phantom_doubles_ratings
FROM player_double_ratings pdr
WHERE pdr.updated_at > (
    SELECT created_at FROM sessions WHERE id = 'YOUR_SESSION_ID'
)
AND NOT EXISTS (
    SELECT 1 FROM session_matches sm
    WHERE sm.match_type = 'doubles'
    AND sm.player_ids @> ARRAY[pdr.player_id]::uuid[]
);

-- 3. Check for duplicate history entries
SELECT match_id, COUNT(*) as count
FROM match_elo_history
WHERE match_id IN (
    SELECT id FROM session_matches WHERE session_id = 'YOUR_SESSION_ID'
)
GROUP BY match_id
HAVING COUNT(*) > 1;
```

---

## Next Steps

1. **Test the fixes** with the repro case (3 players, 3 matches)
2. **Fix K-factor issue** (Issue #1) - this is critical for accuracy
3. **Add unit tests** for the recalculation logic
4. **Monitor production** for any remaining issues
5. **Consider** creating snapshots automatically for all sessions (not just new ones)

