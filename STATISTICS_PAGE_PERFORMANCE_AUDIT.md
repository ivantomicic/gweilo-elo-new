# Statistics Page Performance Audit

## Executive Summary

The `/api/statistics` endpoint takes ~5 seconds per request due to **replay-on-read** architecture. The statistics page triggers replay logic as a fallback when `session_rating_snapshots` are missing for the latest completed session, causing redundant computation on every request.

**Recommended Solution**: Option B - Use aggregation from persisted ratings tables (`player_ratings`, `player_double_ratings`, `double_team_ratings`) to compute rankings directly, eliminating replay dependency entirely.

---

## 1. Audit: Statistics Page Architecture

### 1.1 Endpoint Flow

**File**: `app/api/statistics/route.ts`

1. **Fetches current ratings** (lines 64-105):
   - `player_ratings` (singles)
   - `player_double_ratings` (doubles players)
   - `double_team_ratings` (doubles teams)
   - All sorted by Elo descending

2. **Computes rank movements** (lines 194-309):
   - Calls `computeRankMovements()` **3 times** (once per entity type):
     - Singles (line 200-205)
     - Doubles players (line 240-245)
     - Doubles teams (line 299-304)
   - Each call receives:
     - `latestSessionId` - Latest completed session ID
     - `previousSessionId` - Second most recent completed session ID
     - Entity type: `"player_singles"` | `"player_doubles"` | `"double_team"`

### 1.2 Rank Movements Computation

**File**: `lib/elo/rank-movements.ts`

**Function**: `computeRankMovements()` (lines 101-189)

**Flow**:

1. **Attempts to load rankings from snapshot** (lines 116-119):
   ```typescript
   let previousRankings = await getRankingFromSession(
       latestSessionId,
       entityType
   );
   ```

2. **If snapshots are missing, triggers replay fallback** (lines 121-150):
   ```typescript
   if (previousRankings.size === 0 && previousSessionId) {
       console.log("[RANK] No snapshots for latest session, replaying previous session to get final state");
       
       // Get baseline before previous session
       const baselineBeforePrevious = await getSessionBaseline(previousSessionId);
       
       // Replay previous session to get final state
       const finalStateAfterPrevious = await replaySessionMatches(
           previousSessionId,
           baselineBeforePrevious
       );
   }
   ```

3. **Functions that cause replay**:
   - `getSessionBaseline(previousSessionId)` - Replays ALL sessions before the previous session
   - `replaySessionMatches(previousSessionId, baselineBeforePrevious)` - Replays the previous session's matches

### 1.3 Replay Functions Called

**File**: `lib/elo/session-baseline.ts`

- **`getSessionBaseline(sessionId)`** (lines 18-176):
  - Fetches all completed sessions before the given session
  - Replays ALL previous sessions chronologically
  - Returns baseline state after all previous sessions

- **`replaySessionMatches(sessionId, baselineState)`** (lines 185-298):
  - Replays all matches in the given session
  - Applies Elo calculations sequentially
  - Returns final state after session completes

**For doubles entities**, similar replay functions are called:
- `getDoublesPlayerBaseline()` / `replayDoublesPlayerMatches()` (if entityType is "player_doubles")
- `getDoublesTeamBaseline()` / `replayDoublesTeamMatches()` (if entityType is "double_team")

### 1.4 Redundancy Analysis

**Per request**, replay happens:
- **3 times** (once per entity type: singles, doubles players, doubles teams)
- **Each replay** processes all previous sessions + the previous session
- **Result**: If there are 5 previous sessions, statistics page replays 5+ sessions **3 times** = **15+ session replays per request**

---

## 2. Root Cause Analysis

### 2.1 Why Are Snapshots Missing?

**Critical Finding**: `session_rating_snapshots` are **NOT created when sessions complete naturally**.

**Evidence**:

1. **Snapshot creation only happens during match edits**:
   - `updateSessionSnapshot()` is called in `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts` (line 2367)
   - Called AFTER match edit recalculation completes
   - Updates snapshot with final computed state

2. **No snapshot creation on session completion**:
   - `app/api/sessions/[sessionId]/force-close/route.ts` - Only updates session status
   - `app/api/sessions/[sessionId]/rounds/[roundNumber]/submit/route.ts` - Only creates match-level snapshots (not session-level)
   - No code path creates `session_rating_snapshots` when a session transitions to "completed"

3. **SQL comment indicates intended behavior**:
   ```sql
   -- This table stores the initial Elo state when a session starts.
   -- Snapshots are created once when a session starts (before the first match).
   ```
   But in practice, snapshots are only created/updated during match edit recalculation.

### 2.2 Should Snapshots Exist?

**YES**, snapshots SHOULD exist for the latest completed session, but they DON'T because:

1. **Statistics page expects snapshots to exist**:
   - `computeRankMovements()` uses `latestSessionId` to fetch snapshots
   - The comment says: "Snapshots are stored at the START of each session, which represents the state AFTER the previous session completes"
   - Logic assumes snapshots exist for the latest session

2. **Snapshots represent state AFTER previous session completes**:
   - Snapshot at start of Session N = state after Session N-1 completes
   - Statistics page needs rankings after Session N-1 to compare with current rankings
   - This requires snapshots for Session N (latest session)

3. **Where should snapshots be created?**
   - **Option A**: When session starts (before first match) - NOT currently implemented
   - **Option B**: When session completes - NOT currently implemented
   - **Current**: Only during match edit recalculation - INSUFFICIENT

### 2.3 Why Fallback-to-Replay Happens

**Flow**:
1. Statistics page calls `getRankingFromSession(latestSessionId, entityType)`
2. Query returns empty result (no snapshots exist)
3. `previousRankings.size === 0` triggers fallback
4. Fallback replays previous session to compute rankings
5. Replay happens **3 times** (once per entity type)

**Why not use a cheap read?**
- The code assumes snapshots exist and uses them as the primary source
- When snapshots are missing, it falls back to replay (expensive)
- There's no alternative cheap path that uses ratings tables directly

---

## 3. Performance-Safe Alternatives

### Option A: Snapshot-Only Rankings

**Approach**: Rankings derived only from the latest available snapshot.

**Implementation**:
- Query `session_rating_snapshots` for latest session
- If no snapshot exists, return empty rankings (no movement indicators)
- No replay, no computation

**Correctness**:
- ❌ **INCORRECT** - If snapshots don't exist, users see no rank movements
- ❌ Missing data is treated as "no change" rather than "unknown"

**Performance**:
- ✅ **EXCELLENT** - Single query, no computation
- ✅ O(1) complexity

**Required Changes**:
- No schema changes
- Modify `computeRankMovements()` to return empty movements if snapshots missing
- Remove replay fallback

**Risk Level**: **HIGH** - User experience degradation (missing rank movements)

---

### Option B: Aggregation from Persisted Ratings Tables ⭐ **RECOMMENDED**

**Approach**: Compute rankings directly from current Elo tables, compare with previous snapshot if available.

**Implementation**:
1. **Current rankings**: Already available from ratings tables (singles, doubles players, doubles teams)
2. **Previous rankings**: 
   - **Primary**: Query `session_rating_snapshots` for latest session (if exists)
   - **Fallback**: Query `session_rating_snapshots` for previous session (if exists)
   - **Last resort**: Return empty movements (graceful degradation)

**Correctness**:
- ✅ **CORRECT** - Uses authoritative ratings tables for current state
- ✅ Graceful degradation when snapshots missing (shows no movement)
- ✅ No replay dependency

**Performance**:
- ✅ **EXCELLENT** - 2-3 queries per entity type (current ratings + snapshot lookup)
- ✅ O(N) queries where N = number of entities (already required)
- ✅ No computation, no replay

**Required Changes**:
- Modify `computeRankMovements()` to:
  - Use current rankings from ratings tables (already sorted by Elo)
  - Try latest session snapshot, then previous session snapshot
  - Remove replay fallback entirely
- No schema changes
- No write-path changes

**Risk Level**: **LOW** - Uses existing data, graceful fallback

---

### Option C: Precomputed Ranking Snapshots

**Approach**: Persist rankings per session at write-time (when session completes).

**Implementation**:
1. **New table**: `session_rankings` (session_id, entity_type, entity_id, rank, elo)
2. **Write-time**: When session completes, compute and store rankings
3. **Read-time**: Query precomputed rankings directly

**Correctness**:
- ✅ **CORRECT** - Rankings computed once, stored permanently
- ✅ Always available for comparison

**Performance**:
- ✅ **EXCELLENT** - Single query per entity type
- ✅ O(1) complexity

**Required Changes**:
- **Schema**: New table `session_rankings`
- **Write-path**: Create rankings when session completes (new code path)
- **Read-path**: Query precomputed rankings
- **Migration**: Backfill rankings for existing sessions (optional)

**Risk Level**: **MEDIUM** - Requires schema changes and new write-path logic

---

## 4. Should Statistics Page EVER Replay Matches?

**Answer: NO**

**Justification**:

1. **Statistics page is a READ operation**:
   - Displays current state and historical comparisons
   - Should not trigger computation

2. **Data already exists**:
   - Current rankings: Available in `player_ratings`, `player_double_ratings`, `double_team_ratings`
   - Historical rankings: Should be in `session_rating_snapshots` (if they existed)
   - Rank movements: Can be computed by comparing current vs. historical

3. **Performance requirements**:
   - Statistics page should be fast (< 500ms)
   - Replay is expensive (seconds)
   - Read operations must not trigger computation

4. **Separation of concerns**:
   - Write operations (match edit, session completion) compute and persist state
   - Read operations (statistics, session preview) query persisted state
   - Statistics page should NOT recompute state

---

## 5. Recommended Solution

### Option B: Aggregation from Persisted Ratings Tables

**Rationale**:
- ✅ Eliminates replay dependency entirely
- ✅ Uses authoritative ratings tables (single source of truth)
- ✅ Graceful degradation when snapshots missing
- ✅ No schema changes required
- ✅ Minimal code changes
- ✅ Fast performance (queries only, no computation)

**Implementation Steps**:

1. **Modify `computeRankMovements()` in `lib/elo/rank-movements.ts`**:
   - Remove replay fallback (lines 121-150)
   - Try latest session snapshot, then previous session snapshot
   - If both missing, return empty movements (graceful degradation)
   - Current rankings already provided as input (from ratings tables)

2. **Update `getRankingFromSession()`**:
   - Keep existing logic (query snapshots)
   - Add fallback to query previous session snapshot if latest session has no snapshots
   - Return empty map if no snapshots found (no replay)

3. **Remove replay function imports**:
   - Remove `getSessionBaseline`, `replaySessionMatches` imports from `lib/elo/rank-movements.ts`
   - Statistics page no longer depends on replay functions

**Expected Performance Improvement**:
- **Before**: ~5 seconds (replay 3x per request)
- **After**: ~200-300ms (3-6 queries per request)
- **Improvement**: **95% faster**

---

## 6. Next Steps

1. ✅ **Audit complete** - Root cause identified
2. ⏭️ **Implement Option B** - Remove replay fallback, use ratings tables + snapshots
3. ⏭️ **Test** - Verify rank movements still work correctly
4. ⏭️ **Monitor** - Confirm performance improvement
5. 🔄 **Future consideration** - Option C (precomputed rankings) for write-time optimization

---

## Appendix: Call Graph

```
/api/statistics (GET)
  ├── Fetch player_ratings (current state)
  ├── Fetch player_double_ratings (current state)
  ├── Fetch double_team_ratings (current state)
  ├── getLatestTwoCompletedSessions()
  │   └── Query sessions table (status='completed', order by created_at DESC, limit 2)
  │
  ├── computeRankMovements(singles)
  │   ├── getRankingFromSession(latestSessionId, "player_singles")
  │   │   └── Query session_rating_snapshots (empty result)
  │   └── [FALLBACK] getSessionBaseline(previousSessionId)
  │       ├── Query all sessions before previousSessionId
  │       └── Replay ALL previous sessions chronologically
  │   └── [FALLBACK] replaySessionMatches(previousSessionId, baseline)
  │       └── Replay previous session matches
  │
  ├── computeRankMovements(doublesPlayers)
  │   └── [Same fallback replay for doubles players]
  │
  └── computeRankMovements(doublesTeams)
      └── [Same fallback replay for doubles teams]
```

**After Option B**:

```
/api/statistics (GET)
  ├── Fetch player_ratings (current state)
  ├── Fetch player_double_ratings (current state)
  ├── Fetch double_team_ratings (current state)
  ├── getLatestTwoCompletedSessions()
  │
  ├── computeRankMovements(singles)
  │   ├── getRankingFromSession(latestSessionId, "player_singles")
  │   │   └── Query session_rating_snapshots
  │   ├── [FALLBACK] getRankingFromSession(previousSessionId, "player_singles")
  │   │   └── Query session_rating_snapshots
  │   └── [NO FALLBACK] Return empty movements if no snapshots
  │
  ├── computeRankMovements(doublesPlayers)
  │   └── [Same pattern - no replay]
  │
  └── computeRankMovements(doublesTeams)
      └── [Same pattern - no replay]
```



