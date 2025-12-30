# Doubles Team Elo Baseline Audit

## Problem Statement

**Observed Symptom:**
- First-ever doubles session (clean database)
- Brand-new doubles teams should start at exactly 1500 Elo
- First match between two new teams (K=40) should produce ±20.00 (no decimals)
- **Actual:** Teams starting at values like 1480/1520, producing decimals on first match

## Root Cause Analysis

### 1. Doubles Team Creation ✅ CORRECT

**Location:** `lib/elo/double-teams.ts:18-102`

**Finding:**
- `getOrCreateDoubleTeam()` **only** creates a row in `double_teams` table
- It does **NOT** create a row in `double_team_ratings`
- Team rating is created later when `upsert_double_team_rating` RPC is called
- **No issue here** - team creation is correct

**Initial Elo Source:**
- New teams get Elo from RPC function: `1500 + p_elo_delta` (line 230 in `supabase-setup-elo-ratings.sql`)
- This is correct for first match

### 2. Live Match Submission ✅ CORRECT

**Location:** `lib/elo/updates.ts:117-267`

**Finding:**
- Team Elo is read from `double_team_ratings` with fallback: `team1Rating?.elo ?? 1500` (line 188)
- For new teams (no rating exists), correctly defaults to 1500
- RPC function correctly handles new teams: `1500 + p_elo_delta`
- **No issue here** - live submission is correct

### 3. Baseline Loading During Edit/Replay ❌ **CRITICAL BUG**

**Location:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts:1213-1265`

**Finding:**
```typescript
// Line 1214-1237: Team baseline loading
if (!teamState.has(team1Id)) {
    const { data: team1Rating } = await adminClient
        .from("double_team_ratings")
        .select("elo, wins, losses, draws, sets_won, sets_lost")
        .eq("team_id", team1Id)
        .maybeSingle();
    
    teamState.set(team1Id, {
        elo: team1Rating?.elo ?? 1500,  // ❌ BUG: Uses current DB state
        matches_played: team1MatchesPlayed,
        // ...
    });
}
```

**The Bug:**
- Teams are loaded directly from `double_team_ratings` **without reversing session matches**
- If a team has already played matches in this session, the DB contains:
  - Elo = 1500 + (sum of session match deltas)
  - matches_played = (session matches)
- During replay, code starts from this **already-inflated** Elo
- Then adds deltas again → **double counting**

**Comparison with Players:**
- Players have baseline reversal logic (lines 414-573)
- Players reverse session matches: `baselineElo = currentElo - sessionEloDelta`
- **Teams have NO such reversal logic** - they use current DB state directly

### 4. Player Doubles Elo Influence ✅ NO INFLUENCE

**Finding:**
- Team Elo is **never** derived from player doubles Elo
- Team Elo is read exclusively from `double_team_ratings.elo` (line 1216, 188)
- Player doubles Elo is downstream only (receives team delta, never used as input)
- **No issue here** - systems are correctly separated

### 5. Session Scoping ❌ **CRITICAL BUG**

**Location:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts:1213-1265`

**Finding:**
- Teams are scoped **globally** (across all sessions) - this is correct
- However, during edit/replay, teams are loaded from **current global DB state**
- If this is the first doubles session, but teams have already played matches in this session:
  - DB has: `elo = 1500 + delta1 + delta2 + ...` (all session matches)
  - Replay starts from this state, then adds deltas again
  - Result: Teams start at non-1500 even though they should start at 1500 for replay

**Example Scenario:**
1. First doubles session, Match 1: Team A vs Team B (both new)
   - Team A: 1500 → 1520 (win, +20)
   - Team B: 1500 → 1480 (loss, -20)
   - DB: Team A = 1520, Team B = 1480

2. Edit Match 1:
   - Code loads Team A from DB: `elo = 1520` (line 1230)
   - Replay Match 1: 1520 + 20 = 1540 ❌ **WRONG**
   - Should be: 1500 + 20 = 1520 ✅ **CORRECT**

### 6. Logging vs Actual State

**Location:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts:1473-1474`

**Finding:**
- Logged "pre" team Elo comes from `teamState.get(team1Id).elo`
- This is loaded from DB without reversal (line 1230)
- **Logs show the bug**: Teams start at 1480/1520 instead of 1500

## Root Cause Summary

**Primary Bug: Missing Baseline Reversal for Teams**

When editing a doubles match, the code:
1. ✅ Loads team Elo from `double_team_ratings` (correct source)
2. ❌ **Does NOT reverse session matches** before replay (unlike players)
3. ❌ Uses current DB state (which includes session matches) as baseline
4. ❌ Replays matches on top of already-inflated Elo → double counting

**Why Players Work But Teams Don't:**
- Players have baseline reversal logic (lines 414-573) that reverses session matches
- Teams have NO baseline reversal logic - they use DB state directly
- This is a **replay/edit bug**, not a team creation bug

## Exact Logic Path Where Wrong Baseline is Introduced

1. **Edit route entry** (line 49)
2. **Baseline calculation for players** (lines 339-573) - ✅ Reverses session matches
3. **Team baseline loading** (lines 1213-1265) - ❌ **NO reversal, uses DB directly**
4. **Replay loop** (line 913) - Starts from wrong baseline
5. **Persistence** (line 1970) - Writes incorrect state

**The Bug Location:**
- **File:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`
- **Lines:** 1213-1265 (team baseline loading)
- **Issue:** Missing reversal of session doubles matches before replay

## Confirmation

**This is a:**
- ✅ **Replay/Edit Bug** - Teams are not reversed from session matches before replay
- ❌ NOT a baseline bug (baseline logic doesn't exist for teams)
- ❌ NOT a team creation bug (team creation is correct)
- ❌ NOT state leakage from player doubles (systems are separated)

**Fix Required:**
- Add baseline reversal logic for teams (similar to players)
- Reverse session doubles matches before replay
- Start replay from correct baseline (1500 for new teams, or DB - session deltas for existing teams)

