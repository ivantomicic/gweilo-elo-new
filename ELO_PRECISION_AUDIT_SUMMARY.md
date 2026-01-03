# Elo Precision & Rounding Audit - Executive Summary

## Quick Status

✅ **Code Logic:** Consistent - All active code paths preserve decimal precision  
⚠️ **Database Schema:** Unknown - Migration status needs verification  
✅ **Display:** Consistent - Rounding only for display, never modifies stored values

---

## Key Findings

### ✅ What's Working

1. **Calculation Logic**
   - All paths use `calculateEloDelta()` which preserves decimal precision
   - No rounding happens before persistence
   - Singles, doubles teams, and doubles players follow identical rules

2. **Code Consistency**
   - Live submission: Uses `calculateEloDelta()` → RPC functions
   - Edit/replay: Uses `calculateEloDelta()` → In-memory accumulation → Direct upsert
   - Both paths preserve decimals identically

3. **Display Formatting**
   - `formatElo()` and `formatEloDelta()` are display-only
   - Optional rounding for UI (user-controlled)
   - Never modifies stored values

### ⚠️ What Needs Verification

1. **Database Schema**
   - Migration `supabase-complete-decimal-migration.sql` exists but status is unknown
   - If NOT run: Columns are `INTEGER` → Precision lost at DB level
   - If run: Columns are `NUMERIC(10,2)` → Precision preserved

2. **RPC Functions**
   - Must accept `NUMERIC(10,2)` parameters
   - Must use `NUMERIC` arithmetic (not `INTEGER`)

---

## Proposed Policy

**"Preserve Full Decimal Precision Internally, Round Only for Display"**

1. ✅ Calculation: Never round - use `calculateEloDelta()` (already done)
2. ⚠️ Storage: Store as `NUMERIC(10,2)` (needs verification)
3. ✅ Persistence: Never round before writing (already done)
4. ✅ Display: Round only for UI using `formatElo(elo, round=true)` (already done)

---

## Action Items

### Immediate (Critical)

1. **Run verification query:**
   ```sql
   -- See verify-elo-precision-consistency.sql
   ```
2. **If schema is INTEGER:** Run `supabase-complete-decimal-migration.sql`
3. **Verify RPC functions** accept `NUMERIC(10,2)`

### Short-term (Important)

4. **Run verification tests:**
   - New session vs edited session produces identical Elo
   - Replaying same session twice is idempotent
   - Singles and doubles follow same rounding behavior

5. **Clean up obsolete file:**
   - `app/api/sessions/[sessionId]/matches/[matchId]/edit-snapshot-based.ts` (has rounding, not used)

---

## Files Created

1. **`ELO_PRECISION_ROUNDING_AUDIT.md`** - Complete detailed audit
2. **`verify-elo-precision-consistency.sql`** - Verification script
3. **`ELO_PRECISION_AUDIT_SUMMARY.md`** - This summary

---

## Conclusion

The codebase is **architecturally sound** for decimal precision. All calculation paths preserve decimals, and no rounding happens before persistence. The only risk is **database schema status** - if the migration wasn't run, precision will be lost at the database level.

**Next Step:** Verify database schema and run migration if needed.

