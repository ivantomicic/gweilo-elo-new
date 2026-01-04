# Session Preview Performance Audit

## Executive Summary

The `/api/sessions/[sessionId]/summary` endpoint takes ~10 seconds to load due to **replay-on-read** architecture. Every page load triggers full replay of all previous sessions and repeated doubles team resolution, despite having persisted snapshot and history data available.

**Recommended Solution**: Replace replay functions with snapshot + aggregation queries using `session_rating_snapshots` and `match_elo_history` tables.

---

## Root Cause Analysis

### Current Data Flow

When `/api/sessions/[sessionId]/summary` is called (on every session preview page load):

1. **Singles Summary** (lines 202-314):
   - Calls `getSessionBaseline(sessionId)` → Replays ALL previous sessions chronologically
   - Calls `replaySessionMatches(sessionId, baselineState)` → Replays current session matches
   - Uses `match_elo_history` only for win/loss/draw counting (not for Elo values)

2. **Doubles Player Summary** (lines 316-411):
   - Calls `getDoublesPlayerBaseline(sessionId)` → Replays ALL previous sessions' doubles matches
   - Calls `replayDoublesPlayerMatches(sessionId, baselineState)` → Replays current session doubles matches

3. **Doubles Team Summary** (lines 413-539):
   - Calls `getDoublesTeamBaseline(sessionId)` → Replays ALL previous sessions' doubles matches
     - **For EVERY match in EVERY previous session**: calls `getOrCreateDoubleTeam()` → Database query
   - Calls `replayDoublesTeamMatches(sessionId, baselineState)` → Replays current session matches
     - **For EVERY match in current session**: calls `getOrCreateDoubleTeam()` again → Database query
   - **Then in the summary route itself** (lines 435-442): calls `getOrCreateDoubleTeam()` again for each match → More database queries

### Performance Bottlenecks

1. **O(N) Replay Complexity**:
   - `getSessionBaseline`: Replays all N previous sessions (fetches matches, calculates Elo)
   - `getDoublesPlayerBaseline`: Replays all N previous sessions (doubles matches only)
   - `getDoublesTeamBaseline`: Replays all N previous sessions (doubles matches only)

2. **Repeated Doubles Team Resolution** (Critical):
   - `getDoublesTeamBaseline`: Calls `getOrCreateDoubleTeam()` for every match in every previous session
   - `replayDoublesTeamMatches`: Calls `getOrCreateDoubleTeam()` again for every match in current session
   - Summary route: Calls `getOrCreateDoubleTeam()` again when building team summaries
   - **Result**: For a session with 10 doubles matches and 5 previous sessions, `getOrCreateDoubleTeam()` is called **50+ times per page load**

3. **Blocking I/O**:
   - All three summaries are calculated sequentially
   - Each replay function blocks until completion
   - Page rendering waits for all calculations

### Evidence from Code

**File**: `app/api/sessions/[sessionId]/summary/route.ts`

```204:208:app/api/sessions/[sessionId]/summary/route.ts
const baselineState = await getSessionBaseline(sessionId);
const postSessionState = await replaySessionMatches(
	sessionId,
	baselineState
);
```

```319:324:app/api/sessions/[sessionId]/summary/route.ts
const baselineState =
	await getDoublesPlayerBaseline(sessionId);
const postSessionState = await replayDoublesPlayerMatches(
	sessionId,
	baselineState
);
```

```416:420:app/api/sessions/[sessionId]/summary/route.ts
const baselineState = await getDoublesTeamBaseline(sessionId);
const postSessionState = await replayDoublesTeamMatches(
	sessionId,
	baselineState
);
```

**File**: `lib/elo/session-baseline.ts`

```18:44:lib/elo/session-baseline.ts
export async function getSessionBaseline(
	sessionId: string
): Promise<Map<string, { elo: number; matches_played: number; wins: number; losses: number; draws: number }>> {
	const adminClient = createAdminClient();

	// Get current session's created_at
	const { data: currentSession, error: currentSessionError } =
		await adminClient
			.from("sessions")
			.select("created_at")
			.eq("id", sessionId)
			.single();

	if (currentSessionError || !currentSession) {
		console.error("Error getting current session:", currentSessionError);
		// Return default baseline (1500/0) if session not found
		return new Map();
	}

	// Get all completed sessions before this session, in chronological order
	const { data: previousSessions, error: prevSessionsError } =
		await adminClient
			.from("sessions")
			.select("id, created_at")
			.lt("created_at", currentSession.created_at)
			.eq("status", "completed")
			.order("created_at", { ascending: true });
```

```710:714:lib/elo/session-baseline.ts
const playerIds = match.player_ids as string[];
const team1Id = await getOrCreateDoubleTeam(playerIds[0], playerIds[1]);
const team2Id = await getOrCreateDoubleTeam(playerIds[2], playerIds[3]);
const score1 = match.team1_score;
const score2 = match.team2_score;
```

**File**: `lib/elo/double-teams.ts`

```42:48:lib/elo/double-teams.ts
if (existingTeam) {
	console.log(JSON.stringify({
		tag: "[DOUBLES_TEAM_FOUND]",
		player1_id: p1,
		player2_id: p2,
		team_id: existingTeam.id,
	}));
	return existingTeam.id;
```

---

## Call Graph / Flow Explanation

### Singles Summary Flow

```
GET /api/sessions/[sessionId]/summary
  ↓
getSessionBaseline(sessionId)
  ├─ Query: Get current session created_at
  ├─ Query: Get all previous sessions (ORDER BY created_at ASC)
  └─ For each previous session:
      ├─ Query: Get all singles matches for session
      └─ For each match:
          └─ Calculate Elo delta (in-memory)
  ↓
replaySessionMatches(sessionId, baselineState)
  ├─ Query: Get all singles matches for current session
  └─ For each match:
      └─ Calculate Elo delta (in-memory)
  ↓
Query: match_elo_history (only for win/loss/draw counts)
  ↓
Build response (elo_before, elo_after, stats)
```

### Doubles Player Summary Flow

```
GET /api/sessions/[sessionId]/summary
  ↓
getDoublesPlayerBaseline(sessionId)
  ├─ Query: Get current session created_at
  ├─ Query: Get all previous sessions (ORDER BY created_at ASC)
  └─ For each previous session:
      ├─ Query: Get all doubles matches for session
      └─ For each match:
          └─ Calculate player doubles Elo delta (in-memory)
  ↓
replayDoublesPlayerMatches(sessionId, baselineState)
  ├─ Query: Get all doubles matches for current session
  └─ For each match:
      └─ Calculate player doubles Elo delta (in-memory)
  ↓
Build response (elo_before, elo_after, stats)
```

### Doubles Team Summary Flow (Most Expensive)

```
GET /api/sessions/[sessionId]/summary
  ↓
getDoublesTeamBaseline(sessionId)
  ├─ Query: Get current session created_at
  ├─ Query: Get all previous sessions (ORDER BY created_at ASC)
  └─ For each previous session:
      ├─ Query: Get all doubles matches for session
      └─ For each match:
          ├─ getOrCreateDoubleTeam(player1, player2) → Database query
          ├─ getOrCreateDoubleTeam(player3, player4) → Database query
          └─ Calculate team Elo delta (in-memory)
  ↓
replayDoublesTeamMatches(sessionId, baselineState)
  ├─ Query: Get all doubles matches for current session
  └─ For each match:
      ├─ getOrCreateDoubleTeam(player1, player2) → Database query (again!)
      ├─ getOrCreateDoubleTeam(player3, player4) → Database query (again!)
      └─ Calculate team Elo delta (in-memory)
  ↓
Summary route building (lines 425-521)
  └─ For each match:
      ├─ getOrCreateDoubleTeam(player1, player2) → Database query (third time!)
      └─ getOrCreateDoubleTeam(player3, player4) → Database query (third time!)
  ↓
Build response (elo_before, elo_after, stats)
```

**Example**: Session with 10 doubles matches, 5 previous sessions:
- Previous sessions: 5 sessions × 10 matches × 2 teams = 100 `getOrCreateDoubleTeam()` calls
- Current session replay: 10 matches × 2 teams = 20 `getOrCreateDoubleTeam()` calls
- Summary building: 10 matches × 2 teams = 20 `getOrCreateDoubleTeam()` calls
- **Total: 140 database queries just for team resolution**

---

## Available Infrastructure (Currently Unused)

### 1. `session_rating_snapshots` Table

**Purpose**: Stores baseline Elo state at session start (before any matches)

**Schema**:
- `session_id` (UUID)
- `entity_type` ('player_singles' | 'player_doubles' | 'double_team')
- `entity_id` (UUID: player_id or team_id)
- `elo` (NUMERIC)
- `matches_played`, `wins`, `losses`, `draws`, `sets_won`, `sets_lost`

**Current Usage**: Used in match edit route (`app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`) but **NOT** in summary route

**Potential Usage**: 
- Query `session_rating_snapshots` for session N-1 → Get `elo_before` for all entities
- No replay needed

### 2. `match_elo_history` Table

**Purpose**: Stores Elo deltas per match (created when match completes)

**Schema**:
- `match_id` (UUID, UNIQUE)
- For singles: `player1_id`, `player2_id`, `player1_elo_before`, `player1_elo_after`, `player1_elo_delta`, etc.
- For doubles teams: `team1_id`, `team2_id`, `team1_elo_before`, `team1_elo_after`, `team1_elo_delta`, etc.

**Current Usage**: Used in summary route **only** for counting wins/losses/draws (lines 223-280), NOT for Elo values

**Potential Usage**:
- Query `match_elo_history` for all matches in current session
- Aggregate deltas: `elo_after = elo_before + SUM(deltas)` per entity
- No replay needed

### 3. `session_matches.team_1_id` and `team_2_id` Columns

**Purpose**: Stores team IDs directly on matches (populated when session is created)

**Current Usage**: Column exists but summary route ignores it, calls `getOrCreateDoubleTeam()` instead

**Potential Usage**:
- Query matches with `team_1_id`, `team_2_id` already populated
- No `getOrCreateDoubleTeam()` calls needed

---

## Recommended Solution

### Architecture: Snapshot + Aggregation (No Replay)

Replace replay functions with direct database queries using existing persisted data.

#### Singles Summary

**Before** (Replay):
```typescript
const baselineState = await getSessionBaseline(sessionId); // Replays all previous sessions
const postSessionState = await replaySessionMatches(sessionId, baselineState); // Replays current session
```

**After** (Snapshot + Aggregation):
```typescript
// 1. Get baseline from Session N-1 snapshot
const { data: snapshots } = await adminClient
  .from("session_rating_snapshots")
  .select("entity_id, elo, matches_played, wins, losses, draws")
  .eq("session_id", previousSessionId) // Session N-1
  .eq("entity_type", "player_singles")
  .in("entity_id", playerIds);

// 2. Aggregate deltas from match_elo_history
const { data: matchHistory } = await adminClient
  .from("match_elo_history")
  .select("player1_id, player2_id, player1_elo_delta, player2_elo_delta")
  .in("match_id", currentSessionMatchIds);

// 3. Calculate elo_after = elo_before + SUM(deltas)
// (In-memory aggregation)
```

#### Doubles Player Summary

**Before** (Replay):
```typescript
const baselineState = await getDoublesPlayerBaseline(sessionId); // Replays all previous sessions
const postSessionState = await replayDoublesPlayerMatches(sessionId, baselineState); // Replays current session
```

**After** (Snapshot + Aggregation):
```typescript
// 1. Get baseline from Session N-1 snapshot
const { data: snapshots } = await adminClient
  .from("session_rating_snapshots")
  .select("entity_id, elo, matches_played, wins, losses, draws")
  .eq("session_id", previousSessionId)
  .eq("entity_type", "player_doubles")
  .in("entity_id", playerIds);

// 2. Aggregate deltas from match_elo_history
// (Note: match_elo_history doesn't store player_doubles deltas directly,
//  but we can reconstruct from team deltas - see implementation notes)
```

#### Doubles Team Summary

**Before** (Replay + Repeated Team Resolution):
```typescript
const baselineState = await getDoublesTeamBaseline(sessionId); // Replays + getOrCreateDoubleTeam() for every match
const postSessionState = await replayDoublesTeamMatches(sessionId, baselineState); // Replays + getOrCreateDoubleTeam() again
// Then in summary building: getOrCreateDoubleTeam() again
```

**After** (Snapshot + Aggregation + Use Stored Team IDs):
```typescript
// 1. Get matches with team IDs already stored
const { data: matches } = await adminClient
  .from("session_matches")
  .select("id, team_1_id, team_2_id, team1_score, team2_score")
  .eq("session_id", sessionId)
  .eq("match_type", "doubles")
  .eq("status", "completed");

// 2. Get baseline from Session N-1 snapshot
const teamIds = [...new Set(matches.flatMap(m => [m.team_1_id, m.team_2_id].filter(Boolean)))];
const { data: snapshots } = await adminClient
  .from("session_rating_snapshots")
  .select("entity_id, elo, matches_played, wins, losses, draws")
  .eq("session_id", previousSessionId)
  .eq("entity_type", "double_team")
  .in("entity_id", teamIds);

// 3. Aggregate deltas from match_elo_history
const { data: matchHistory } = await adminClient
  .from("match_elo_history")
  .select("match_id, team1_id, team2_id, team1_elo_delta, team2_elo_delta")
  .in("match_id", matches.map(m => m.id));

// 4. Calculate elo_after = elo_before + SUM(deltas)
// (In-memory aggregation)

// NO getOrCreateDoubleTeam() calls needed!
```

### Performance Improvements

1. **Singles/Doubles Player**:
   - Before: O(N) replay where N = number of previous sessions
   - After: O(1) snapshot query + O(M) aggregation where M = matches in current session
   - **Expected speedup**: 10-100x (depends on number of previous sessions)

2. **Doubles Team**:
   - Before: O(N×M) replay + O(N×M×2) `getOrCreateDoubleTeam()` calls
   - After: O(1) snapshot query + O(M) aggregation + 0 `getOrCreateDoubleTeam()` calls
   - **Expected speedup**: 100-1000x (eliminates all team resolution queries)

3. **Total Request Time**:
   - Before: ~10 seconds
   - After: ~100-500ms (estimates: 50ms snapshot queries, 50ms match_elo_history queries, 100-400ms aggregation)

### Implementation Complexity

**Medium**: Requires careful handling of edge cases:
- Sessions with no previous session (use initial baseline 1500/0)
- Sessions where snapshot doesn't exist (fallback to current rating - session deltas)
- Players/teams not in snapshot (use default 1500/0)
- Ensuring deterministic results (must match replay logic exactly)

### Correctness Guarantee

**High**: Results must be identical to replay logic:
- `elo_before` = snapshot value (matches replay baseline exactly)
- `elo_after` = `elo_before + SUM(match_elo_history.deltas)` (matches replay result exactly)
- Aggregation logic must preserve match ordering (round_number, match_order)

---

## Alternative Solutions

### Option 2: Cache Replay Results

**Approach**: Cache baseline and post-session states in database after first calculation.

**Implementation**:
- Add `session_summary_cache` table with columns: `session_id`, `entity_type`, `entity_id`, `elo_before`, `elo_after`, `matches_played`, `wins`, `losses`, `draws`
- On first request: Run replay, cache results
- On subsequent requests: Read from cache

**Pros**:
- Simple implementation (add caching layer, keep existing replay logic)
- Fast reads after cache warmup

**Cons**:
- Cache invalidation complexity (when to invalidate? Match edits, session changes)
- Still slow on first request (cache miss)
- Cache becomes stale if matches are edited after caching
- Doesn't solve root cause (replay is still needed)
- Cache maintenance overhead

**Performance**: 
- First request: Same as current (~10 seconds)
- Subsequent requests: ~100ms (cache hit)

**Correctness**: Medium (cache invalidation bugs can cause stale data)

**Recommendation**: ❌ Not recommended - treats symptom, not root cause

---

### Option 3: Materialized View / Computed Columns

**Approach**: Pre-compute session summaries using database triggers or materialized views.

**Implementation**:
- Create materialized view: `session_summaries` updated via triggers on `session_matches`, `match_elo_history`
- Query materialized view instead of replaying

**Pros**:
- Very fast reads (single query)
- Database handles computation

**Cons**:
- High complexity (trigger logic, materialized view maintenance)
- Database-specific (less portable)
- Maintenance overhead (must update on every match change)
- Still requires replay logic in triggers (just moved to database)

**Performance**: 
- Reads: ~50ms (single query)
- Writes: Slower (trigger overhead on match completion/edit)

**Correctness**: High (if triggers are correct)

**Recommendation**: ❌ Not recommended - high complexity, over-engineered for this use case

---

## Why Recommended Solution is Best

1. **Uses Existing Infrastructure**:
   - `session_rating_snapshots` already exists and is maintained
   - `match_elo_history` already exists and is maintained
   - `session_matches.team_1_id` / `team_2_id` already populated

2. **Eliminates Root Cause**:
   - No replay on read
   - No repeated team resolution
   - Direct queries on indexed tables

3. **Performance**:
   - 20-100x faster than current implementation
   - Predictable performance (doesn't scale with number of previous sessions)

4. **Correctness**:
   - Deterministic (uses same data as replay, just different computation method)
   - Can be validated against replay results

5. **Maintainability**:
   - Simpler code (queries vs replay loops)
   - Easier to debug (SQL queries vs in-memory state)
   - Aligns with existing architecture (snapshots used in match edit route)

6. **Implementation Complexity**:
   - Medium complexity (requires careful aggregation logic)
   - No database schema changes needed
   - Clear migration path (can implement alongside existing code, validate, then switch)

---

## Implementation Notes

### Edge Cases to Handle

1. **No Previous Session**:
   - Use initial baseline: `elo_before = 1500`, `matches_played = 0`, etc.

2. **Snapshot Missing**:
   - Fallback: Query current rating from `player_ratings` / `player_double_ratings` / `double_team_ratings`
   - Reverse session deltas: `elo_before = current_elo - SUM(session_deltas)`

3. **Entity Not in Snapshot**:
   - Use initial baseline: `elo_before = 1500`, etc.

4. **Match History Missing**:
   - Should not happen (history created when match completes)
   - Log error, skip match, or use replay fallback

### Validation Strategy

1. **Parallel Implementation**:
   - Implement new aggregation logic alongside existing replay logic
   - Return both results, compare, log discrepancies

2. **Gradual Rollout**:
   - Feature flag: Use aggregation for new sessions, replay for old sessions
   - Monitor performance and correctness

3. **Unit Tests**:
   - Test aggregation logic with known inputs/outputs
   - Compare aggregation results with replay results for same sessions

### Migration Path

1. **Phase 1**: Implement aggregation functions (no route changes)
2. **Phase 2**: Add validation logging (compare aggregation vs replay)
3. **Phase 3**: Switch route to use aggregation (feature flag)
4. **Phase 4**: Monitor, fix edge cases
5. **Phase 5**: Remove replay code (after validation period)

---

## Summary

**Problem**: Session preview page blocks for ~10 seconds due to replay-on-read architecture.

**Root Cause**: Summary endpoint replays all previous sessions and repeatedly resolves doubles teams on every page load.

**Solution**: Replace replay functions with snapshot queries + aggregation using `session_rating_snapshots` and `match_elo_history`.

**Expected Outcome**: 20-100x performance improvement, ~100-500ms response time, eliminates replay-on-read pattern.
