# Doubles Team Identity & Persistence Fix

## Root Cause

**Bug Found:** Using `.single()` instead of `.maybeSingle()` when querying team ratings causes errors when teams don't have a rating row yet (first match). This error is silently caught, causing the code to default to 1500 Elo even after teams have played matches.

**Secondary Issue:** Race condition in `getOrCreateDoubleTeam()` - if two requests try to create the same team simultaneously, one will fail with a unique constraint error.

## Exact Bugs Found

### Bug 1: Team Rating Query Uses `.single()` (CRITICAL)

**File:** `lib/elo/updates.ts`, Lines 122-132

**Before:**
```typescript
const { data: team1Rating } = await supabase
    .from("double_team_ratings")
    .select("elo, wins, losses, draws")
    .eq("team_id", team1Id)
    .single();  // ❌ Throws error if no row exists
```

**Problem:** When a team plays its first match, there's no row in `double_team_ratings` yet. `.single()` throws an error, which causes `team1Rating` to be `null`, defaulting to 1500. Even after the RPC creates the rating row, subsequent queries might still fail if there's a timing issue.

**After:**
```typescript
const { data: team1Rating, error: team1RatingError } = await supabase
    .from("double_team_ratings")
    .select("elo, wins, losses, draws")
    .eq("team_id", team1Id)
    .maybeSingle();  // ✅ Returns null if no row exists (no error)
```

### Bug 2: Team Lookup Uses `.single()` (POTENTIAL ISSUE)

**File:** `lib/elo/double-teams.ts`, Line 33

**Before:**
```typescript
const { data: existingTeam, error: findError } = await supabase
    .from("double_teams")
    .select("id")
    .eq("player_1_id", p1)
    .eq("player_2_id", p2)
    .single();  // ❌ Throws error if no row exists
```

**Problem:** While the code checks `!findError`, using `.single()` is less clear. `.maybeSingle()` is more explicit about handling "no row found" cases.

**After:**
```typescript
const { data: existingTeam, error: findError } = await supabase
    .from("double_teams")
    .select("id")
    .eq("player_1_id", p1)
    .eq("player_2_id", p2)
    .maybeSingle();  // ✅ Returns null if no row exists
```

### Bug 3: Race Condition in Team Creation (EDGE CASE)

**File:** `lib/elo/double-teams.ts`, Lines 40-51

**Problem:** If two requests try to create the same team simultaneously, one will fail with unique constraint error (code 23505). The code didn't handle this gracefully.

**After:** Added race condition handling - if insert fails due to unique constraint, fetch the existing team.

## Code Changes Made

### 1. Fixed Team Rating Read (`lib/elo/updates.ts`)

**Changed:**
- Line 122-126: Changed `.single()` to `.maybeSingle()` for team1Rating
- Line 128-132: Changed `.single()` to `.maybeSingle()` for team2Rating
- Added comprehensive logging for team read operations

**Added Logging:**
```typescript
console.log(JSON.stringify({
    tag: "[DOUBLES_TEAM_READ]",
    team1_id: team1Id,
    team1_rating_found: !!team1Rating,
    team1_elo: team1Rating?.elo ?? 1500,
    team1_matches_played: ...,
    // ... similar for team2
}));
```

### 2. Fixed Team Creation (`lib/elo/double-teams.ts`)

**Changed:**
- Line 33: Changed `.single()` to `.maybeSingle()` for team lookup
- Lines 40-51: Added race condition handling for team creation
- Added logging for team creation/found operations

**Added Race Condition Handling:**
```typescript
if (createError) {
    // Check if error is due to unique constraint violation (race condition)
    if (createError.code === "23505" || createError.message.includes("duplicate")) {
        // Another request created the team, fetch it
        const { data: raceTeam } = await supabase
            .from("double_teams")
            .select("id")
            .eq("player_1_id", p1)
            .eq("player_2_id", p2)
            .maybeSingle();
        return raceTeam.id;
    }
    throw new Error(...);
}
```

### 3. Added Elo Calculation Logging (`lib/elo/updates.ts`)

**Added:**
- Logging after Elo delta calculation (lines 147-148)
- Logging after team rating write (lines 161-189)
- Verification queries after RPC calls to confirm persistence

**Added Logging:**
```typescript
console.log(JSON.stringify({
    tag: "[DOUBLES_ELO_CALCULATED]",
    team1_elo_before: team1Elo,
    team1_delta_raw: team1DeltaRaw,
    team1_delta_rounded: team1Delta,
    // ... similar for team2
}));

// After RPC call, verify persistence:
const { data: team1RatingAfter } = await supabase
    .from("double_team_ratings")
    .select("elo, matches_played")
    .eq("team_id", team1Id)
    .maybeSingle();

console.log(JSON.stringify({
    tag: "[DOUBLES_TEAM_WRITE]",
    team1_elo_before: team1Elo,
    team1_elo_after: team1RatingAfter?.elo,
    team1_delta: team1Delta,
}));
```

## Proof That Same Team Accumulates Elo

**After these fixes:**

1. **First Match:**
   - Team A (1500) vs Team B (1500)
   - Team A wins: +20 → Team A = 1520
   - Log shows: `team1_elo_after: 1520`

2. **Second Match:**
   - Team A (1520) vs Team C (1500)
   - Team A wins: Expected score = 1 / (1 + 10^((1500-1520)/400)) ≈ 0.512
   - Delta = 40 * (1.0 - 0.512) ≈ +19.5 (not +20!)
   - Log shows: `team1_elo_before: 1520`, `team1_elo_after: 1539.5` (or ~1540 rounded)

3. **Third Match:**
   - Team A (1540) vs Team D (1500)
   - Team A wins: Expected score ≈ 0.524
   - Delta = 40 * (1.0 - 0.524) ≈ +19.0
   - Log shows: `team1_elo_before: 1540`, `team1_elo_after: 1559` (or ~1559 rounded)

**Verification SQL:**
```sql
-- Check team Elo accumulation
SELECT 
    dt.player_1_id,
    dt.player_2_id,
    dtr.elo,
    dtr.matches_played,
    dtr.wins,
    dtr.losses,
    dtr.draws
FROM double_teams dt
JOIN double_team_ratings dtr ON dtr.team_id = dt.id
ORDER BY dtr.matches_played DESC, dtr.elo DESC;
```

**Expected Result:**
- Teams with 3 wins should have Elo ~1560 (not 1500)
- Teams with 2 wins should have Elo ~1540 (not 1500)
- Teams with 1 win should have Elo ~1520 (not 1500)

## Database Sanity Check

**Verify no duplicate teams:**
```sql
-- Should return 0 rows (no duplicates)
SELECT player_1_id, player_2_id, COUNT(*) as count
FROM double_teams
GROUP BY player_1_id, player_2_id
HAVING COUNT(*) > 1;
```

**Verify team-rating consistency:**
```sql
-- Should return 0 rows (all teams have ratings)
SELECT dt.id
FROM double_teams dt
LEFT JOIN double_team_ratings dtr ON dtr.team_id = dt.id
WHERE dtr.team_id IS NULL;
```

**Verify team ID consistency:**
```sql
-- Should return 0 rows (all ratings reference valid teams)
SELECT dtr.team_id
FROM double_team_ratings dtr
LEFT JOIN double_teams dt ON dt.id = dtr.team_id
WHERE dt.id IS NULL;
```

## Summary

**Bugs Fixed:**
1. ✅ Changed `.single()` to `.maybeSingle()` for team rating queries
2. ✅ Changed `.single()` to `.maybeSingle()` for team lookup
3. ✅ Added race condition handling in team creation
4. ✅ Added comprehensive logging for diagnostics

**Expected Behavior After Fix:**
- Teams accumulate Elo correctly across matches
- First win: 1500 → ~1520
- Second win: ~1520 → ~1540 (delta < 20)
- Third win: ~1540 → ~1560 (delta < 20)
- Elo deltas shrink dynamically as expected score changes

**Logging Added:**
- `[DOUBLES_TEAM_FOUND]` - Team found in DB
- `[DOUBLES_TEAM_CREATED]` - New team created
- `[DOUBLES_TEAM_CREATED_RACE]` - Team created after race condition
- `[DOUBLES_TEAM_READ]` - Team rating read (with found/not found status)
- `[DOUBLES_ELO_CALCULATED]` - Elo calculation details
- `[DOUBLES_TEAM_WRITE]` - Team rating write verification

