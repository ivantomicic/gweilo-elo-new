# Snapshot-Based Elo Recalculation Implementation

## Overview

Implemented snapshot-based Elo recalculation that ensures editing a historical match only affects that match and all matches after it, without touching anything before.

## Architecture

### Core Principle

**Given ordered matches:**
- Match 1
- Match 2 ← edited
- Match 3

**When editing Match 2:**
- Elo state before Match 2 is restored from snapshot
- Recalculate Match 2 and Match 3 only
- Match 1 remains untouched

---

## Database Schema

### `elo_snapshots` Table

Created via `supabase-create-elo-snapshots.sql`:

```sql
CREATE TABLE elo_snapshots (
    id UUID PRIMARY KEY,
    match_id UUID NOT NULL REFERENCES session_matches(id),
    player_id UUID NOT NULL REFERENCES players(id),
    elo INTEGER NOT NULL,
    matches_played INTEGER NOT NULL,
    wins INTEGER NOT NULL,
    losses INTEGER NOT NULL,
    draws INTEGER NOT NULL,
    sets_won INTEGER NOT NULL,
    sets_lost INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE(match_id, player_id)
);
```

**Key Features:**
- One snapshot per (match_id, player_id)
- Snapshots are immutable (created after each match)
- Indexed for fast lookups

### Helper Functions

1. **`get_snapshot_before_match(p_player_id, p_match_id)`**
   - Returns the most recent snapshot for a player before a given match
   - Used to restore baseline when editing

2. **`get_initial_baseline(p_player_id, p_session_id)`**
   - Returns player's rating state at session start
   - Used when editing the first match in a session

---

## Implementation Details

### 1️⃣ Snapshot Creation

**Location:** `lib/elo/snapshots.ts`

**When:** After each match completes (in round submit endpoint)

**Process:**
1. Match completes → Elo updated
2. Read current Elo state from `player_ratings` (singles) or `player_double_ratings` (doubles)
3. Create snapshot record with current state
4. Upsert to handle duplicates

**Code:**
```typescript
await createEloSnapshots(match.id, playerIds, "singles");
```

**Logging:**
```json
{
  "tag": "[SNAPSHOT_CREATED]",
  "match_id": "...",
  "match_type": "singles",
  "snapshots_created": 2,
  "players": ["player1", "player2"]
}
```

---

### 2️⃣ Edit Match Recalculation

**Location:** `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

**Flow:**

#### Step 1: Acquire Lock
- Prevents concurrent recalculations
- Sets `recalc_status = 'running'`

#### Step 2: Fetch All Matches
- Get all matches in session, ordered by `round_number`, `match_order`
- Validate match types

#### Step 3: Delete Forward Snapshots
- Delete snapshots for:
  - Edited match
  - All matches after edited match
- Delete Elo history for same matches

**Logging:**
```json
{
  "tag": "[RESET]",
  "cleared_snapshots": true,
  "snapshots_before": 6,
  "snapshots_after": 0,
  "matches_to_replay": 2
}
```

#### Step 4: Load Baseline

For each player in matches to replay:

**If editing first match:**
- Use `getInitialBaseline()` → player's state before session

**If editing later match:**
- Use `getSnapshotBeforeMatch()` → snapshot from match before edited match

**Logging:**
```json
{
  "tag": "[BASELINE_LOADED]",
  "player_id": "...",
  "source": "snapshot",
  "snapshot_match_id": "...",
  "baseline": { "elo": 1500, "matches_played": 0, ... }
}
```

```json
{
  "tag": "[BASELINE]",
  "baseline_state": [
    { "player_id": "...", "elo": 1500, "matches_played": 0, ... }
  ]
}
```

#### Step 5: Replay Matches Forward

**Critical:** Elo is tracked **in memory** during replay. DO NOT read from `player_ratings`.

**Process:**
1. Initialize `currentState` Map from baseline
2. For each match to replay:
   - Get current state from memory (not DB)
   - Calculate Elo delta using K-factor based on `matches_played` from memory
   - Update state in memory
   - Create snapshot after match
   - Update match status

**Key Guarantees:**
- ✅ K-factor uses `matches_played` from snapshot + replay count
- ✅ No reads from `player_ratings` during replay
- ✅ Each match replayed exactly once
- ✅ Snapshots created after each replayed match

**Logging:**
```json
{
  "tag": "[MATCH_REPLAY]",
  "match_index": 1,
  "match_id": "...",
  "pre": {
    "player1": { "elo": 1500, "matches_played": 0, ... },
    "player2": { "elo": 1500, "matches_played": 0, ... }
  },
  "calculation": {
    "player1": { "K": 40, "expected_score": 0.5, "delta": 20 },
    "player2": { "K": 40, "expected_score": 0.5, "delta": -20 }
  }
}
```

```json
{
  "tag": "[MATCH_REPLAY]",
  "post": {
    "player1": { "elo": 1520, "matches_played": 1, "delta": 20 },
    "player2": { "elo": 1480, "matches_played": 1, "delta": -20 }
  }
}
```

#### Step 6: Persist Final State

1. Update `player_ratings` with final computed state
2. Insert Elo history records
3. Compare computed vs persisted (logs mismatch if any)

**Logging:**
```json
{
  "tag": "[FINAL_COMPUTED]",
  "state": [
    { "player_id": "...", "elo": 1520, "matches_played": 3, ... }
  ]
}
```

```json
{
  "tag": "[DB_PERSISTED]",
  "state": [
    { "player_id": "...", "elo": 1520, "matches_played": 3, ... }
  ]
}
```

---

## Strict Guarantees

### ✅ Do NOT Read from player_ratings During Replay

**Implementation:**
- Elo state tracked in `currentState` Map (in memory)
- All calculations use values from `currentState`
- Only read from DB to load baseline
- Only write to DB at the end

### ✅ K-Factor Uses Correct matches_played

**Implementation:**
- `matches_played` initialized from baseline snapshot
- Incremented in memory during replay
- K-factor calculated using `matches_played` from memory: `calculateKFactor(player1MatchesPlayedBefore)`

### ✅ Each Match Replayed Exactly Once

**Implementation:**
- `replayedMatchIds` Set tracks replayed matches
- Error logged if duplicate detected

### ✅ No Doubles Logic for Singles Matches

**Implementation:**
- Explicit check: `if (matchToEdit.match_type !== "singles")` → return error
- Only singles matches supported currently

---

## Files Created/Modified

### New Files

1. **`supabase-create-elo-snapshots.sql`**
   - Creates `elo_snapshots` table
   - Creates helper functions

2. **`lib/elo/snapshots.ts`**
   - `createEloSnapshots()` - Create snapshots after match
   - `getSnapshotBeforeMatch()` - Get baseline snapshot
   - `getInitialBaseline()` - Get initial baseline

### Modified Files

1. **`app/api/sessions/[sessionId]/rounds/[roundNumber]/submit/route.ts`**
   - Added snapshot creation after each match completes

2. **`app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`**
   - Completely rewritten to use snapshot-based approach
   - Removed history reversal logic
   - Added in-memory Elo tracking during replay

---

## Testing Checklist

### Test 1: Edit Middle Match (3-match session)

**Setup:**
- Match 1: Ivan 2-1 Andrej
- Match 2: Gara 1-2 Ivan ← edit to: Gara 2-1 Ivan
- Match 3: Andrej 2-1 Ivan

**Expected:**
- ✅ Match 1 Elo unchanged
- ✅ Match 2 Elo recalculated
- ✅ Match 3 Elo recalculated
- ✅ Final Elo matches full replay from scratch

### Test 2: Edit First Match

**Setup:**
- Match 1: Ivan 2-1 Andrej ← edit to: Ivan 1-2 Andrej
- Match 2: Gara 1-2 Ivan
- Match 3: Andrej 2-1 Ivan

**Expected:**
- ✅ Baseline from initial state (not snapshot)
- ✅ All matches recalculated
- ✅ Deterministic results

### Test 3: Edit Last Match

**Setup:**
- Match 1: Ivan 2-1 Andrej
- Match 2: Gara 1-2 Ivan
- Match 3: Andrej 2-1 Ivan ← edit to: Andrej 1-2 Ivan

**Expected:**
- ✅ Match 1 & 2 Elo unchanged
- ✅ Match 3 Elo recalculated
- ✅ Only one match replayed

### Test 4: Repeated Edits

**Setup:**
- Edit same match twice with same result

**Expected:**
- ✅ Identical final Elo both times
- ✅ Deterministic results

---

## Migration Steps

1. **Run SQL migration:**
   ```bash
   # Apply supabase-create-elo-snapshots.sql to your database
   ```

2. **Backfill snapshots for existing sessions:**
   - For existing completed matches, snapshots need to be backfilled
   - Create a migration script to generate snapshots from current `player_ratings` state
   - Or: Only new matches will have snapshots (existing matches can't be edited until backfilled)

3. **Deploy code changes:**
   - New snapshot creation in round submit
   - New edit endpoint using snapshots

---

## Success Criteria

✅ Editing Match 2:
- Does NOT change Elo produced by Match 1
- Changes Elo produced by Match 2
- Changes Elo produced by Match 3
- Produces identical results to a full replay from history

✅ Deterministic:
- Same edit → same result every time
- No race conditions
- No duplicate applications

✅ Scalable:
- Works for sessions of any size
- Efficient snapshot lookups
- No performance degradation

---

## Logging

All logging from previous implementation is preserved:
- `[RECALC_START]` - Entry point
- `[BASELINE]` - Baseline state
- `[RESET]` - Reset confirmation
- `[MATCH_REPLAY]` - Per-match replay
- `[FINAL_COMPUTED]` / `[DB_PERSISTED]` - Final state
- `[ERROR]` - Errors and mismatches

Additional logs:
- `[BASELINE_LOADED]` - Individual baseline loads
- `[SNAPSHOT_CREATED]` - Snapshot creation

---

## Next Steps

1. **Run migration** - Apply `supabase-create-elo-snapshots.sql`
2. **Backfill snapshots** - For existing sessions (optional, only needed to edit old matches)
3. **Test** - Run test cases above
4. **Monitor logs** - Verify correct behavior
5. **Add doubles support** - Extend to doubles matches (currently singles-only)

