# Session Card Statistics Enrichment - Feasibility Audit

## Executive Summary

**Feasibility: PARTIALLY FEASIBLE**

- ✅ **Singles/Doubles Match Counts**: Fully feasible with simple SQL aggregation
- ⚠️ **Best/Worst Player**: Feasible but requires careful design to avoid Elo replay

## 1. Current Schema Analysis

### 1.1 Sessions Table
- `id` (UUID, PK)
- `player_count` (INTEGER)
- `created_at` (TIMESTAMPTZ)
- `created_by` (UUID)
- `status` ('active' | 'completed')
- `completed_at` (TIMESTAMPTZ, nullable)
- `recalc_status`, `recalc_started_at`, `recalc_finished_at`, `recalc_token` (for Elo recalculation locking)

**Current State**: Only basic metadata. No aggregated statistics.

### 1.2 Session Matches Table
- `id` (UUID, PK)
- `session_id` (UUID, FK → sessions)
- `round_number` (INTEGER)
- `match_type` ('singles' | 'doubles') ← **KEY COLUMN**
- `match_order` (INTEGER)
- `player_ids` (JSONB) - Array of player UUIDs
- `team_1_id`, `team_2_id` (UUID, nullable, FK → double_teams)
- `status` ('pending' | 'completed')
- `team1_score`, `team2_score` (INTEGER, nullable)
- `created_at` (TIMESTAMPTZ)

**Key Observation**: `match_type` column exists and is indexed. Match counts can be computed via simple aggregation.

### 1.3 Match Elo History Table
- `id` (UUID, PK)
- `match_id` (UUID, FK → session_matches, UNIQUE)
- **For Singles Matches:**
  - `player1_id`, `player2_id` (UUID)
  - `player1_elo_delta`, `player2_elo_delta` (INTEGER)
  - `player1_elo_before`, `player1_elo_after` (INTEGER)
  - `player2_elo_before`, `player2_elo_after` (INTEGER)
- **For Doubles Matches:**
  - `team1_id`, `team2_id` (UUID, FK → double_teams)
  - `team1_elo_delta`, `team2_elo_delta` (INTEGER)
  - `team1_elo_before`, `team1_elo_after` (INTEGER)
  - `team2_elo_before`, `team2_elo_after` (INTEGER)
- **Note**: Individual player deltas for doubles are NOT stored. Players receive the same delta as their team.

**Key Observation**: Elo deltas are persisted per match. For singles, player-level aggregation is straightforward. For doubles, requires team-to-player mapping.

### 1.4 Session Rating Snapshots Table
- `session_id` (UUID, FK → sessions)
- `entity_type` ('player_singles' | 'player_doubles' | 'double_team')
- `entity_id` (UUID) - player_id or team_id
- `elo` (INTEGER) - Elo at session start
- `matches_played`, `wins`, `losses`, `draws`, `sets_won`, `sets_lost` (INTEGER)

**Key Observation**: Snapshots store baseline state at session start. Can be used to compute "before" state, but "after" state requires aggregation.

## 2. Requirements Analysis

### 2.1 Singles Match Count
**Requirement**: Count of completed singles matches in the session.

**Feasibility**: ✅ **FULLY FEASIBLE**

**Approach**:
```sql
SELECT COUNT(*) 
FROM session_matches 
WHERE session_id = $1 
  AND match_type = 'singles' 
  AND status = 'completed'
```

**Performance**: O(1) with index on `(session_id, match_type, status)`. Existing index on `(session_id, status)` is sufficient.

**Data Source**: `session_matches` table directly.

### 2.2 Doubles Match Count
**Requirement**: Count of completed doubles matches in the session.

**Feasibility**: ✅ **FULLY FEASIBLE**

**Approach**:
```sql
SELECT COUNT(*) 
FROM session_matches 
WHERE session_id = $1 
  AND match_type = 'doubles' 
  AND status = 'completed'
```

**Performance**: O(1) with index on `(session_id, match_type, status)`. Existing index on `(session_id, status)` is sufficient.

**Data Source**: `session_matches` table directly.

### 2.3 Best Player of Session
**Requirement**: Identify the player with the best performance in the session.

**Feasibility**: ⚠️ **FEASIBLE WITH CAVEATS**

**Definition Challenges**:
- "Best" could mean:
  1. Highest Elo change (net gain)
  2. Most wins
  3. Highest win rate
  4. Best win/loss ratio
  5. Combination of factors

**Approach Options**:

#### Option A: Elo Change (Net Gain)
**For Singles**:
```sql
SELECT 
  player_id,
  SUM(elo_delta) as total_elo_change
FROM (
  SELECT player1_id as player_id, player1_elo_delta as elo_delta
  FROM match_elo_history meh
  JOIN session_matches sm ON sm.id = meh.match_id
  WHERE sm.session_id = $1 AND sm.match_type = 'singles'
  UNION ALL
  SELECT player2_id as player_id, player2_elo_delta as elo_delta
  FROM match_elo_history meh
  JOIN session_matches sm ON sm.id = meh.match_id
  WHERE sm.session_id = $1 AND sm.match_type = 'singles'
) player_deltas
GROUP BY player_id
ORDER BY total_elo_change DESC
LIMIT 1
```

**For Doubles**:
More complex - requires:
1. Join `match_elo_history` with `session_matches` to get `player_ids` (JSONB)
2. Join with `double_teams` to map `team_id` → `(player_1_id, player_2_id)`
3. Sum team deltas per player (each player gets team delta)
4. Aggregate across all doubles matches

**Performance**: O(n) where n = matches in session. Acceptable for typical session sizes (10-30 matches).

**Data Source**: `match_elo_history` + `session_matches` + `double_teams` (for doubles).

#### Option B: Win Count
**For Singles**:
```sql
SELECT 
  player_id,
  COUNT(*) FILTER (WHERE won) as wins
FROM (
  SELECT 
    player_ids->>0 as player_id,
    (team1_score > team2_score) as won
  FROM session_matches
  WHERE session_id = $1 
    AND match_type = 'singles' 
    AND status = 'completed'
  UNION ALL
  SELECT 
    player_ids->>1 as player_id,
    (team2_score > team1_score) as won
  FROM session_matches
  WHERE session_id = $1 
    AND match_type = 'singles' 
    AND status = 'completed'
) player_results
GROUP BY player_id
ORDER BY wins DESC
LIMIT 1
```

**For Doubles**:
Requires parsing `player_ids` JSONB array and determining winners from scores. More complex due to team structure.

**Performance**: O(n) where n = matches. Acceptable.

**Data Source**: `session_matches` table directly.

#### Option C: Combined Metric (Recommended)
Use a composite score: `(wins * 3) + (draws * 1) - (losses * 1) + (elo_change / 10)`

This balances multiple factors without requiring Elo replay.

### 2.4 Worst Player of Session
**Requirement**: Identify the player with the worst performance in the session.

**Feasibility**: ⚠️ **FEASIBLE WITH CAVEATS**

**Approach**: Same as "Best Player" but inverted:
- Lowest Elo change (net loss)
- Most losses
- Lowest win rate
- Worst win/loss ratio

**Implementation**: Same SQL patterns as "Best Player" but with `ASC` ordering or inverted logic.

## 3. Architectural Options

### Option 1: On-Demand SQL Aggregation (Recommended for MVP)
**Approach**: Compute statistics on-the-fly when loading session cards.

**Pros**:
- No additional persistence required
- Always accurate (no stale data)
- Simple implementation
- No write overhead

**Cons**:
- Requires query per session card
- Slightly slower than precomputed (but acceptable for list view)

**Performance Estimate**:
- Match counts: < 1ms per session
- Best/worst player: 5-20ms per session (depending on match count)
- Total for 20 sessions: ~100-400ms (acceptable for paginated list)

**SQL Complexity**: Medium (requires joins and aggregations)

**Implementation Effort**: Low-Medium

### Option 2: Materialized View
**Approach**: Create a materialized view that aggregates session statistics.

**Pros**:
- Fast reads (precomputed)
- Can be refreshed periodically or on-demand

**Cons**:
- Requires refresh strategy (when to update?)
- Stale data risk if not refreshed after match edits
- Additional maintenance complexity

**Refresh Strategy Options**:
1. **On session completion**: Refresh when `status` changes to 'completed'
2. **Periodic**: Refresh every N minutes (risks stale data)
3. **On-demand**: Refresh via trigger or application logic

**SQL Complexity**: High (view definition + refresh logic)

**Implementation Effort**: Medium-High

### Option 3: Denormalized Columns on Sessions Table
**Approach**: Add columns to `sessions` table:
- `singles_match_count` (INTEGER)
- `doubles_match_count` (INTEGER)
- `best_player_id` (UUID, nullable)
- `worst_player_id` (UUID, nullable)

**Pros**:
- Fastest reads (single table query)
- Simple to query

**Cons**:
- Requires update logic on every match completion/edit
- Risk of inconsistency if updates fail
- Additional write overhead
- Requires migration for existing sessions

**Update Triggers Needed**:
- On `session_matches.status` change to 'completed'
- On `session_matches` score update (match edit)
- On session completion

**SQL Complexity**: Medium (triggers + update logic)

**Implementation Effort**: Medium-High

### Option 4: Separate Session Statistics Table
**Approach**: Create `session_statistics` table:
- `session_id` (UUID, PK, FK → sessions)
- `singles_match_count` (INTEGER)
- `doubles_match_count` (INTEGER)
- `best_player_id` (UUID, nullable)
- `worst_player_id` (UUID, nullable)
- `updated_at` (TIMESTAMPTZ)

**Pros**:
- Keeps `sessions` table clean
- Can be updated independently
- Can track update timestamps

**Cons**:
- Requires join for session list queries
- Same update complexity as Option 3
- Additional table to maintain

**SQL Complexity**: Medium (table + triggers)

**Implementation Effort**: Medium-High

## 4. Recommendation

### Phase 1: MVP (On-Demand Aggregation)
**Implement**: Option 1 (On-Demand SQL Aggregation)

**Rationale**:
1. **No schema changes required** - works with existing data
2. **No write overhead** - no triggers or update logic
3. **Always accurate** - no stale data risk
4. **Simple to implement** - straightforward SQL queries
5. **Performance acceptable** - 5-20ms per session is fine for paginated lists

**Implementation**:
- Add SQL aggregation queries to session list endpoint
- Compute match counts via simple COUNT
- Compute best/worst player via aggregation from `match_elo_history` + `session_matches`
- Cache results in React Query or similar (optional optimization)

**Performance Optimization**:
- Use existing indexes (already sufficient)
- Consider composite index: `(session_id, match_type, status)` if needed
- Batch queries for multiple sessions if loading many at once

### Phase 2: Optimization (If Needed)
**If performance becomes an issue**, consider Option 3 (Denormalized Columns) with:
- Database triggers to update on match completion/edit
- Background job to backfill existing sessions
- Validation queries to detect inconsistencies

## 5. What Is NOT Possible with Current Data Model

### 5.1 Best/Worst Player Without Aggregation
**Cannot**: Determine best/worst player without querying `match_elo_history` or `session_matches`.

**Why**: No precomputed player performance metrics per session.

**Workaround**: Aggregate from existing tables (feasible, see above).

### 5.2 Individual Doubles Player Deltas
**Cannot**: Directly get individual player Elo deltas for doubles matches from `match_elo_history`.

**Why**: `match_elo_history` only stores team deltas for doubles. Individual player deltas are not stored separately.

**Workaround**: 
- Use team delta (players on same team get same delta)
- Requires join with `double_teams` to map teams to players
- More complex but feasible

### 5.3 Historical Best/Worst (Before Session Start)
**Cannot**: Determine what "best" or "worst" means in absolute terms (e.g., "best player ever in this session").

**Why**: Would require comparing against all-time statistics, which is out of scope.

**Workaround**: Limit to session-scoped metrics (session-only performance).

## 6. Implementation Considerations

### 6.1 Mixed Sessions (Singles + Doubles)
**Challenge**: Sessions may contain both singles and doubles matches.

**Solution**: 
- Compute best/worst separately for singles and doubles
- Or combine metrics across both types (requires normalization)
- **Recommendation**: Show separate best/worst for singles and doubles, or use combined metric

### 6.2 Match Edits
**Challenge**: If a match is edited, statistics may change.

**Solution**:
- Option 1 (On-Demand): Automatically reflects edits (always accurate)
- Option 3/4 (Precomputed): Requires trigger to recalculate on edit

### 6.3 Incomplete Sessions
**Challenge**: Active sessions may have pending matches.

**Solution**:
- Only count completed matches (`status = 'completed'`)
- Only include players who have completed matches
- Show "N/A" or hide best/worst for active sessions with no completed matches

### 6.4 Ties (Multiple Best/Worst Players)
**Challenge**: Multiple players may have identical metrics.

**Solution**:
- Return first player (arbitrary but deterministic)
- Or return all tied players (requires UI change)
- **Recommendation**: Return single player (first by player_id for determinism)

## 7. SQL Query Examples

### 7.1 Singles Match Count
```sql
SELECT COUNT(*) as singles_count
FROM session_matches
WHERE session_id = $1
  AND match_type = 'singles'
  AND status = 'completed';
```

### 7.2 Doubles Match Count
```sql
SELECT COUNT(*) as doubles_count
FROM session_matches
WHERE session_id = $1
  AND match_type = 'doubles'
  AND status = 'completed';
```

### 7.3 Best Player (Singles) - By Elo Change
```sql
WITH player_deltas AS (
  SELECT 
    player1_id as player_id, 
    player1_elo_delta as elo_delta
  FROM match_elo_history meh
  JOIN session_matches sm ON sm.id = meh.match_id
  WHERE sm.session_id = $1 
    AND sm.match_type = 'singles'
    AND meh.player1_id IS NOT NULL
  UNION ALL
  SELECT 
    player2_id as player_id, 
    player2_elo_delta as elo_delta
  FROM match_elo_history meh
  JOIN session_matches sm ON sm.id = meh.match_id
  WHERE sm.session_id = $1 
    AND sm.match_type = 'singles'
    AND meh.player2_id IS NOT NULL
)
SELECT 
  player_id,
  SUM(elo_delta) as total_elo_change
FROM player_deltas
GROUP BY player_id
ORDER BY total_elo_change DESC
LIMIT 1;
```

### 7.4 Best Player (Doubles) - By Elo Change
```sql
WITH team_deltas AS (
  SELECT 
    meh.team1_id as team_id,
    meh.team1_elo_delta as elo_delta
  FROM match_elo_history meh
  JOIN session_matches sm ON sm.id = meh.match_id
  WHERE sm.session_id = $1 
    AND sm.match_type = 'doubles'
    AND meh.team1_id IS NOT NULL
  UNION ALL
  SELECT 
    meh.team2_id as team_id,
    meh.team2_elo_delta as elo_delta
  FROM match_elo_history meh
  JOIN session_matches sm ON sm.id = meh.match_id
  WHERE sm.session_id = $1 
    AND sm.match_type = 'doubles'
    AND meh.team2_id IS NOT NULL
),
player_deltas AS (
  SELECT 
    dt.player_1_id as player_id,
    td.elo_delta
  FROM team_deltas td
  JOIN double_teams dt ON dt.id = td.team_id
  UNION ALL
  SELECT 
    dt.player_2_id as player_id,
    td.elo_delta
  FROM team_deltas td
  JOIN double_teams dt ON dt.id = td.team_id
)
SELECT 
  player_id,
  SUM(elo_delta) as total_elo_change
FROM player_deltas
GROUP BY player_id
ORDER BY total_elo_change DESC
LIMIT 1;
```

### 7.5 Combined Query (All Stats for One Session)
```sql
WITH match_counts AS (
  SELECT 
    COUNT(*) FILTER (WHERE match_type = 'singles' AND status = 'completed') as singles_count,
    COUNT(*) FILTER (WHERE match_type = 'doubles' AND status = 'completed') as doubles_count
  FROM session_matches
  WHERE session_id = $1
),
singles_best AS (
  -- Singles best player query (from 7.3)
  ...
),
doubles_best AS (
  -- Doubles best player query (from 7.4)
  ...
)
SELECT 
  mc.singles_count,
  mc.doubles_count,
  sb.player_id as singles_best_player_id,
  db.player_id as doubles_best_player_id
FROM match_counts mc
LEFT JOIN singles_best sb ON true
LEFT JOIN doubles_best db ON true;
```

## 8. Performance Estimates

### 8.1 Single Session Query
- Match counts: **< 1ms** (indexed COUNT)
- Best/worst player (singles): **5-10ms** (aggregation with index)
- Best/worst player (doubles): **10-20ms** (joins + aggregation)
- **Total**: **15-30ms per session**

### 8.2 Session List (20 sessions)
- With pagination (5 per page): **75-150ms** (acceptable)
- Without pagination (all at once): **300-600ms** (may need optimization)

### 8.3 Optimization Strategies
1. **Batch queries**: Load all session stats in one query with CTEs
2. **Caching**: Cache results in React Query (5min TTL)
3. **Lazy loading**: Load stats on card hover/expand
4. **Background precomputation**: Precompute for completed sessions only

## 9. Conclusion

### Feasibility Summary
- ✅ **Match Counts**: Fully feasible, trivial implementation
- ⚠️ **Best/Worst Player**: Feasible but requires aggregation queries

### Recommended Approach
**Start with Option 1 (On-Demand Aggregation)**:
- No schema changes
- Always accurate
- Acceptable performance
- Simple to implement

**Optimize later if needed**:
- Add denormalized columns if performance becomes an issue
- Use triggers to maintain consistency

### Next Steps
1. Implement match count queries (trivial)
2. Implement best/worst player queries (moderate complexity)
3. Test performance with realistic data volumes
4. Add caching if needed
5. Consider precomputation only if performance is insufficient



