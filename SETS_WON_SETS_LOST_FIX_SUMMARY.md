# Sets Won / Sets Lost Fix - Implementation Summary

## Overview

Fixed the broken `sets_won` and `sets_lost` calculation that was treating match scores as binary win/loss indicators (0/1) instead of actual set counts.

## Changes Made

### Part 1: Forward-Looking Code Fixes

#### 1.1 `lib/elo/updates.ts`

**Singles (`updateSinglesRatings`):**
- **Before:** `player1SetsWon = player1Score > player2Score ? 1 : 0`
- **After:** `player1SetsWon = player1Score` (actual score value)
- **Lines changed:** 70-74

**Doubles (`updateDoublesRatings`):**
- **Before:** `team1SetsWon = team1Score > team2Score ? 1 : 0`
- **After:** `team1SetsWon = team1Score` (actual score value)
- **Lines changed:** 386-390

**Impact:** All new matches will now correctly track sets won/lost.

#### 1.2 `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

**Singles Replay:**
- **Before:** Binary logic `if (score1 > score2) sets_won += 1`
- **After:** Direct score addition `sets_won += score1`, `sets_lost += score2`
- **Lines changed:** 1319-1325

**Doubles Team Replay:**
- **Before:** Binary logic `if (score1 > score2) sets_won += 1`
- **After:** Direct score addition `sets_won += score1`, `sets_lost += score2`
- **Lines changed:** 1689-1695

**Doubles Player Replay:**
- **Before:** Binary logic for each player
- **After:** Direct score addition (team scores applied to each player)
- **Lines changed:** 1813-1842

**Impact:** Match edits/replays will now correctly recalculate sets.

### Part 2: Historical Data Migration

#### 2.1 SQL Migration Script: `supabase-fix-sets-won-sets-lost.sql`

**Strategy:**
1. **RESET:** Set all `sets_won` and `sets_lost` to 0
2. **REBUILD:** Recompute from completed matches in chronological order
3. **NO Elo changes:** Only set counters are corrected

**What it does:**
- Resets all sets counters to 0 (safe because current values are incorrect)
- Recomputes from `session_matches` table for:
  - **Singles:** Each player gets their score as `sets_won`, opponent's as `sets_lost`
  - **Doubles Team:** Each team gets their score as `sets_won`, opponent's as `sets_lost`
  - **Doubles Player:** Each player gets their team's score as `sets_won`, opponent's as `sets_lost`

**Safety:**
- Idempotent (can be run multiple times)
- Only processes completed matches with valid scores
- Uses transactions for atomicity
- Includes verification query (commented out)

## Expected Outcomes

### Before Fix:
- `sets_won === wins` (always)
- `sets_lost === losses` (always)
- No meaningful set statistics

### After Fix:
- `sets_won ≠ wins` (unless player always wins with exactly 1 set)
- `sets_lost ≠ losses` (unless player always loses with exactly 1 set)
- Meaningful statistics:
  - Total sets won across all matches
  - Set difference (sets_won - sets_lost)
  - Set dominance metrics

## Example

**Match:** Ivan 4 : 2 Andrej

**Before:**
- Ivan: `sets_won += 1`, `sets_lost += 0`
- Andrej: `sets_won += 0`, `sets_lost += 1`

**After:**
- Ivan: `sets_won += 4`, `sets_lost += 2`
- Andrej: `sets_won += 2`, `sets_lost += 4`

## Files Changed

1. `lib/elo/updates.ts` - Primary Elo update functions
2. `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts` - Match edit/replay logic
3. `supabase-fix-sets-won-sets-lost.sql` - Historical data migration script

## Deployment Steps

1. **Deploy code changes** (forward-looking fix)
2. **Run SQL migration** on production database:
   ```sql
   -- Execute supabase-fix-sets-won-sets-lost.sql
   ```
3. **Verify migration** using the verification query in the SQL script
4. **Test** that new matches correctly track sets

## Notes

- **No Elo changes:** This fix only affects set tracking, not Elo calculations
- **No schema changes:** All changes are to calculation logic and data migration
- **Backward compatible:** Existing Elo ratings, wins, losses remain unchanged
- **Forward compatible:** All new matches will use corrected logic automatically

