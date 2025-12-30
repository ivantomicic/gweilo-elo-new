# Replay Type Filter Fix

## Problem

When editing a match, the system was replaying ALL matches in the session, regardless of type. This caused:
1. Editing a singles match would recalculate doubles matches (unnecessary)
2. Editing a doubles match would recalculate singles matches (unnecessary)
3. The three Elo systems are independent, so this was incorrect

## Root Cause

The replay loop at line 636 was processing all matches:
```typescript
for (let i = 0; i < allMatches.length; i++) {
    // Processed ALL matches, regardless of type
}
```

## Solution

Added type filtering so only matches of the same type as the edited match are replayed:

1. **Determine edited match type** (line ~637):
   ```typescript
   const editedMatchType = (matchToEdit as any).match_type as "singles" | "doubles";
   ```

2. **Filter matches in replay loop** (line ~664):
   ```typescript
   // Skip matches of a different type than the edited match
   if (matchType !== editedMatchType) {
       console.log({
           tag: "[REPLAY_SKIPPED]",
           reason: "Match type does not match edited match type"
       });
       continue;
   }
   ```

3. **Updated matchIdsToReplay** (line ~294):
   - Now filters to only include matches of the same type
   - Used for snapshot/history deletion

4. **Removed restriction** (line ~279):
   - Previously only allowed editing singles matches
   - Now both singles and doubles can be edited

## Result

- ✅ Editing a singles match → Only replays other singles matches
- ✅ Editing a doubles match → Only replays other doubles matches
- ✅ No unnecessary recalculation of unrelated Elo systems
- ✅ Logs show `[REPLAY_SKIPPED]` for filtered matches

## Files Changed

- `app/api/sessions/[sessionId]/matches/[matchId]/edit/route.ts`

