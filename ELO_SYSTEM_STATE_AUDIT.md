# Elo System State Audit

## 1. Authoritative Rules (Code Implementation)

### Initial Elo Values

-   **Singles players**: 1500 (default fallback when no rating exists)
-   **Doubles players** (`player_double_ratings`): 1500 (default fallback)
-   **Doubles teams** (`double_team_ratings`): 1500 (default fallback)
-   Source: `lib/elo/updates.ts` lines 48-49, 188-189; `supabase-setup-elo-ratings.sql` lines 18, 31, 53

### K-Factor Rules

-   **Matches 0-9**: K = 40
-   **Matches 10-39**: K = 32
-   **Matches 40+**: K = 24
-   Based on total matches played (wins + losses + draws)
-   Source: `lib/elo/calculation.ts` lines 21-29
-   K-factor calculated per entity (player for singles, team for doubles teams)

### Draw Handling

-   Actual score: 0.5 for draws
-   Expected score: Standard Elo formula `1 / (1 + 10^((opponentElo - playerElo) / 400))`
-   Delta: `K * (0.5 - expectedScore)`
-   Source: `lib/elo/calculation.ts` lines 40-42, 50-59, 73-84

### Player Doubles Elo Derivation

-   Team delta calculated using team Elo and team match count
-   Both players on same team receive identical delta (same as team delta)
-   Player doubles Elo updated via RPC with team delta value
-   Source: `lib/elo/updates.ts` lines 220-231 (team delta), 360-451 (player updates use team delta)

## 2. Recalculation vs Persistence

### Normal Match Submission

-   **Route**: `/api/sessions/[sessionId]/rounds/[roundNumber]/submit`
-   **Process**: Sequential processing by `round_number`, `match_order`
-   **Persisted**:
    -   Ratings updated via RPC functions (`upsert_player_rating`, `upsert_double_team_rating`, `upsert_player_double_rating`)
    -   Elo history recorded in `match_elo_history`
    -   Match status/scores updated
-   **Recalculated**: Nothing - direct update based on current DB state
-   Source: `app/api/sessions/[sessionId]/rounds/[roundNumber]/submit/route.ts` lines 236-491

### Edit Match (Singles)

-   **Route**: `/api/sessions/[sessionId]/matches/[matchId]/edit`
-   **Process**:
    1. Load baseline (session snapshot or initial baseline)
    2. Recalculate all matches of same type in session from baseline forward
    3. Use in-memory state during replay (not DB reads)
    4. Persist final state via direct upsert
-   **Recalculated**: All matches of same type (singles) in session, from edited match forward
-   **Persisted**: Final state written to `player_ratings` via upsert
-   Source: `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts` lines 906-1613

### Edit Match (Doubles)

-   **Route**: `/api/sessions/[sessionId]/matches/[matchId]/edit`
-   **Process**: Same as singles, but only recalculates doubles matches
-   **Recalculated**: All matches of same type (doubles) in session, from edited match forward
    -   Teams recalculated via in-memory state
    -   Player doubles Elo recalculated (receives team delta)
-   **Persisted**: Final state written to `double_team_ratings` and `player_double_ratings` via upsert
-   Source: `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts` lines 1373-1613

## 3. Match Order and Determinism

### Match Order

-   **Ordering**: `ORDER BY round_number ASC, match_order ASC`
-   **Critical**: Matches processed sequentially (no parallel processing)
-   **Scope**: Session-scoped (only matches within same session)
-   Source: `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts` lines 193-194, 906-911

### Determinism

-   **Deterministic given same inputs**: Yes
    -   Same baseline + same match order + same scores = same final Elo
    -   Uses snapshot-based baseline (session start state or previous session snapshot)
    -   In-memory state tracking during replay ensures sequential consistency
-   **Match order matters**: Yes
    -   Sequential processing means earlier matches affect later match calculations
    -   Changing match order would produce different results
-   Source: `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts` (replay logic), `lib/elo/snapshots.ts` (baseline loading)

## 4. Precision and Rounding Behavior

### Decimal Precision Status

-   **Code intent**: Decimals preserved (no `Math.round()` in calculation path)
-   **Database schema status**: Unclear
    -   Original schema: `INTEGER` (`supabase-setup-elo-ratings.sql`)
    -   Migration available: `NUMERIC(10,2)` (`supabase-complete-decimal-migration.sql`)
    -   Migration status unknown (may or may not have been run)
-   **RPC functions**:
    -   Original: `p_elo_delta INTEGER`
    -   Migration: `p_elo_delta NUMERIC(10,2)`
    -   Active version unknown
-   **Calculation function**: Returns decimal (no rounding) - `lib/elo/calculation.ts` line 84
-   **Live submission**: Passes decimal delta to RPC (no code-level rounding) - `lib/elo/updates.ts` lines 57-68, 220-231
-   **Edit/replay**: Uses direct upsert with decimal values - `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts` (upsert calls)

### Known Non-Determinism/Rounding

-   **If schema is INTEGER**: Decimals truncated at database level
-   **If RPC is INTEGER**: Decimals lost in delta parameter even if schema is NUMERIC
-   **If schema is NUMERIC(10,2) + RPC is NUMERIC(10,2)**: Decimals preserved
-   **JavaScript floating-point**: Standard IEEE 754 precision (not a known issue in practice)
-   **Uncertainty**: Actual database state (INTEGER vs NUMERIC) is unknown without verification query

Source: `DECIMAL_PRECISION_FIX_COMPLETE.md`, `ELO_DECIMAL_PRECISION_AUDIT.md`, `lib/elo/calculation.ts`, `lib/elo/updates.ts`


