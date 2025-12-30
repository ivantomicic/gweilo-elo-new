# Recalculation Logging Documentation

## Overview

Comprehensive structured logging has been added to the match edit recalculation flow to enable full observability and debugging of Elo calculation issues.

## Log Tags

All logs are JSON-formatted with a `tag` field for easy filtering. Use `grep` or log aggregation tools to filter by tag.

### 1️⃣ `[RECALC_START]` - Recalculation Entry

**When:** At the very start of recalculation, after lock acquired

**Contains:**
- `session_id`
- `edited_match_id`
- `total_matches`
- `singles_count` / `doubles_count`
- Full match list with order, type, players, scores
- New scores for edited match

**Example:**
```json
{
  "tag": "[RECALC_START]",
  "session_id": "123",
  "edited_match_id": "456",
  "total_matches": 3,
  "singles_count": 3,
  "doubles_count": 0,
  "matches": [...],
  "new_scores": { "team1Score": 2, "team2Score": 1 }
}
```

---

### 2️⃣ `[BASELINE]` - Baseline State

**When:** After restoring Elo state from snapshots or calculating from history, BEFORE replay begins

**Contains:**
- `source`: Either `"session_rating_snapshots"` or `"calculated_from_history"`
- `baseline_state`: Array of all entities (players/teams) with:
  - `entity_type`: `"player_singles"`, `"player_doubles"`, or `"double_team"`
  - `entity_id`
  - `elo`
  - `matches_played`
  - `wins`, `losses`, `draws`

**Critical:** This confirms baseline is NOT already mutated before replay.

**Example:**
```json
{
  "tag": "[BASELINE]",
  "session_id": "123",
  "source": "session_rating_snapshots",
  "baseline_state": [
    {
      "entity_type": "player_singles",
      "entity_id": "player-1",
      "elo": 1500,
      "matches_played": 0,
      "wins": 0,
      "losses": 0,
      "draws": 0
    }
  ]
}
```

---

### 3️⃣ `[RESET]` - Reset Confirmation

**When:** After deleting Elo history and resetting match statuses

**Contains:**
- `cleared_elo_history`: `true`
- `history_rows_before` / `history_rows_after`
- `matches_reset`: Count
- `match_ids_reset`: Array of match IDs

**Example:**
```json
{
  "tag": "[RESET]",
  "session_id": "123",
  "cleared_elo_history": true,
  "history_rows_before": 3,
  "history_rows_after": 0,
  "matches_reset": 2,
  "match_ids_reset": ["match-1", "match-2"]
}
```

---

### 4️⃣ `[MATCH_REPLAY]` - Per-Match Replay

**When:** For EACH match replayed, logged TWICE (before and after update)

**Contains:**

**Before update:**
- `match_index`, `match_id`, `match_type`
- `players`: Array of player IDs
- `scores`: `{ team1, team2 }`
- `pre`: Full state for both players:
  - `id`, `elo`, `matches_played`, `wins`, `losses`, `draws`
- `calculation`: Expected calculations:
  - `K`: K-factor used
  - `expected_score`: Expected score (0-1)
  - `actual_score`: Actual score (0, 0.5, or 1)
  - `result`: `"win"`, `"loss"`, or `"draw"`
  - `delta_expected`: Expected Elo delta

**After update:**
- `post`: Full state for both players after update:
  - `id`, `elo`, `matches_played`, `wins`, `losses`, `draws`
  - `delta_actual`: Actual Elo delta applied
  - `delta_expected`: Expected Elo delta
  - `delta_match`: `"match"` or `"MISMATCH"` (flags calculation errors)

**Example:**
```json
{
  "tag": "[MATCH_REPLAY]",
  "session_id": "123",
  "match_index": 1,
  "match_id": "match-2",
  "match_type": "singles",
  "players": ["player-1", "player-2"],
  "scores": { "team1": 2, "team2": 1 },
  "pre": {
    "player1": { "id": "player-1", "elo": 1500, "matches_played": 0, ... },
    "player2": { "id": "player-2", "elo": 1500, "matches_played": 0, ... }
  },
  "calculation": {
    "player1": { "K": 40, "expected_score": 0.5, "actual_score": 1, "delta_expected": 20 },
    "player2": { "K": 40, "expected_score": 0.5, "actual_score": 0, "delta_expected": -20 }
  }
}
```

```json
{
  "tag": "[MATCH_REPLAY]",
  "session_id": "123",
  "match_index": 1,
  "match_id": "match-2",
  "post": {
    "player1": { "elo": 1520, "matches_played": 1, "delta_actual": 20, "delta_expected": 20, "delta_match": "match" },
    "player2": { "elo": 1480, "matches_played": 1, "delta_actual": -20, "delta_expected": -20, "delta_match": "match" }
  }
}
```

---

### 5️⃣ `[ERROR]` - Duplicate Detection & Errors

**When:** 
- If a match is replayed more than once
- If doubles code executes in singles-only session
- If computed vs persisted values mismatch

**Contains:**
- `message`: Error description
- Relevant context (match_id, player_id, etc.)

**Example:**
```json
{
  "tag": "[ERROR]",
  "session_id": "123",
  "message": "Match 456 replayed more than once",
  "match_id": "456"
}
```

---

### 6️⃣ `[FINAL_COMPUTED]` & `[DB_PERSISTED]` - Final State

**When:** 
- `[FINAL_COMPUTED]`: After all matches replayed, before writing to DB
- `[DB_PERSISTED]`: After writing to DB, re-querying to verify

**Contains:**
- `state`: Array of all players with:
  - `player_id`
  - `elo`
  - `matches_played`
  - `wins`, `losses`, `draws`

**Critical:** Compare these two to detect if DB writes are overwriting correct values.

**Example:**
```json
{
  "tag": "[FINAL_COMPUTED]",
  "session_id": "123",
  "state": [
    { "player_id": "player-1", "elo": 1520, "matches_played": 3, ... }
  ]
}
```

```json
{
  "tag": "[DB_PERSISTED]",
  "session_id": "123",
  "state": [
    { "player_id": "player-1", "elo": 1500, "matches_played": 3, ... }
  ]
}
```

If `[FINAL_COMPUTED]` shows `elo: 1520` but `[DB_PERSISTED]` shows `elo: 1500`, there's a DB write issue.

---

### 7️⃣ `[DOUBLES_GUARD]` - Doubles Code Guard

**When:** 
- At start: If session is singles-only
- During replay: If doubles code path is entered

**Contains:**
- `message`: Warning/error message
- `singles_count` / `doubles_count`

**Example:**
```json
{
  "tag": "[DOUBLES_GUARD]",
  "session_id": "123",
  "message": "Singles-only session detected - doubles code should NOT execute",
  "singles_count": 3,
  "doubles_count": 0
}
```

```json
{
  "tag": "[ERROR]",
  "session_id": "123",
  "message": "Doubles logic executed",
  "match_id": "match-1",
  "match_type": "doubles",
  "singles_count": 3,
  "doubles_count": 0
}
```

---

## How to Use

### Filter by Session

```bash
# Get all logs for a specific session
grep '"session_id":"YOUR_SESSION_ID"' logs.txt
```

### Filter by Tag

```bash
# Get all baseline logs
grep '"tag":"\[BASELINE\]"' logs.txt

# Get all match replay logs
grep '"tag":"\[MATCH_REPLAY\]"' logs.txt

# Get all errors
grep '"tag":"\[ERROR\]"' logs.txt
```

### Find Mismatches

```bash
# Find delta mismatches
grep '"delta_match":"MISMATCH"' logs.txt

# Find computed vs persisted mismatches
grep '"message":"Computed vs persisted mismatch"' logs.txt
```

### Trace a Specific Match

```bash
# Get all logs for a specific match
grep '"match_id":"YOUR_MATCH_ID"' logs.txt
```

### Trace a Specific Player

```bash
# Get all logs mentioning a player
grep '"player_id":"YOUR_PLAYER_ID"' logs.txt
```

---

## Expected Flow

For a 3-match session edit:

1. `[RECALC_START]` - Session info
2. `[RESET]` - History cleared
3. `[BASELINE]` - Baseline restored
4. `[MATCH_REPLAY]` (pre) - Match 1 before
5. `[MATCH_REPLAY]` (post) - Match 1 after
6. `[MATCH_REPLAY]` (pre) - Match 2 before
7. `[MATCH_REPLAY]` (post) - Match 2 after
8. `[MATCH_REPLAY]` (pre) - Match 3 before
9. `[MATCH_REPLAY]` (post) - Match 3 after
10. `[FINAL_COMPUTED]` - Final computed state
11. `[DB_PERSISTED]` - DB persisted state

---

## Debugging Checklist

When investigating incorrect Elo:

1. ✅ Check `[BASELINE]` - Is baseline correct?
2. ✅ Check `[MATCH_REPLAY]` - Are deltas correct?
3. ✅ Check `delta_match` - Any mismatches?
4. ✅ Check `[FINAL_COMPUTED]` vs `[DB_PERSISTED]` - Do they match?
5. ✅ Check `[ERROR]` logs - Any duplicate replays or doubles code execution?
6. ✅ Check `matches_played` - Does it increment correctly?

---

## Notes

- All logs are JSON-formatted for easy parsing
- All logs include `session_id` for correlation
- Logs are written to `console.log` (server-side)
- In production, these will appear in your server logs
- Consider using a log aggregation tool (e.g., Datadog, CloudWatch) for better analysis

