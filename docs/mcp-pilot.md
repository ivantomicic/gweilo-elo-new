# Gweilo read-only MCP pilot

This pilot exposes ten backend-only MCP tools at `/api/mcp`:

- `recent_matches`: the authenticated player's recent completed singles matches,
  including the committed Elo before, after, and change for each match
- `player_performance`: that player's all-time singles wins, losses, draws,
  sets, win rate, current Elo/rank, eligibility, recent form, and recent Elo
  movement
- `current_leaderboard`: the official current Elo leaderboard, its eligibility
  rules, and the authenticated player's own rank or eligibility status
- `head_to_head`: that player's singles record against a selected opponent,
  resolved by name or by an ID returned from `recent_matches`
- `my_elo_trend`: that player's Elo movement, high/low, and match-by-match
  committed Elo history over a rolling period
- `my_rivalries`: recurring-opponent summaries with record, sets, Elo movement,
  last meeting, and current result streak
- `general_statistics`: aggregate completed-singles rankings over a rolling
  period, sortable by match results, sets, activity, or committed Elo change
- `player_opponent_breakdown`: an all-time opponent-by-opponent singles summary
  for a named player, with explicit lists of who defeated that player in
  matches and who won sets against them
- `elo_rules`: the exact starting rating, formula, result scores, K-factors,
  precision, and leaderboard eligibility rules
- `elo_projection`: hypothetical Elo after a win, draw, or loss against a named
  past opponent, using both players' current ratings and K-factors

Every successful tool has a declared MCP output schema. Errors are also
machine-readable and use `{ "error": { "code", "message" } }`, which lets a
client distinguish invalid or ambiguous opponents, missing data, and temporary
backend failures.

The endpoint uses stateless Streamable HTTP so it fits the existing Next.js /
Vercel deployment. It accepts both current MCP requests and the stateless
2025-era MCP handshake used by existing clients.

## Security boundary

- Every request requires a current Supabase access token in
  `Authorization: Bearer <token>`.
- The token is verified server-side with Supabase before MCP dispatch.
- OAuth clients discover Supabase Auth through
  `/.well-known/oauth-protected-resource`. ChatGPT uses authorization code
  with PKCE and never receives the Supabase service-role key.
- The authenticated Supabase user ID is the player ID. Tools do not accept a
  different player ID, so a caller cannot request another player's summary.
- `head_to_head` resolves names only among opponents found in the authenticated
  player's completed singles history. It does not provide arbitrary profile
  search. If a first name matches multiple past opponents, it asks for a full
  name.
- `elo_projection` uses the same past-opponent boundary, so it cannot be used
  to enumerate arbitrary profiles or ratings.
- `current_leaderboard` is a deliberate public-within-the-app aggregate view.
  It exposes display names, current singles ratings, ranks, records, and sets,
  but never IDs, contact details, avatars, or authentication data.
- `my_elo_trend` and `my_rivalries` are strictly scoped to matches containing
  the verified user ID.
- `player_opponent_breakdown` is a deliberately broader aggregate view for
  questions about another player's results. It resolves a display name, then
  returns opponent display names and match/set/Elo totals only. It does not
  return profile IDs, contact details, avatars, authentication data, or raw
  match rows and dates.
- `general_statistics` is the deliberately broader aggregate tool. It returns
  player display names, completed-singles totals, and committed Elo aggregates
  only. It does not return player IDs, contact details, avatars, authentication
  data, or raw match rows.
- Database access uses the existing server-only service-role client. Queries
  for personal data are explicitly constrained by the verified user ID.
- Tools are annotated read-only and no insert, update, delete, or RPC write
  operations are registered.
- Responses are marked `Cache-Control: no-store`.

`SUPABASE_SERVICE_ROLE_KEY` must remain a server/Vercel environment variable.
Never prefix it with `NEXT_PUBLIC_` or put it in an MCP client configuration.

## Required configuration

The route reuses the app's existing deployment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

The public Supabase values are already used by the Gweilo web sign-in. The
service-role key remains server-only.

The official MCP server package requires Node.js 20 or later. Configure the
Vercel project to use Node.js 20+ if it is not already doing so.

## ChatGPT OAuth setup

Deploy this version before enabling the OAuth server so the consent page is
available.

In the Supabase dashboard:

1. Open **Authentication → OAuth Server** and enable OAuth 2.1.
2. Set the authorization path to `/oauth/consent`. With the production Site
   URL, Supabase will send users to
   `https://www.gweilo.lol/oauth/consent`.
3. Enable **Dynamic Client Registration** so ChatGPT can register itself.
4. Confirm the project Site URL is `https://www.gweilo.lol` and the existing
   Gweilo sign-in callback remains allowed.

Do not create a static access token or OAuth client secret in the browser.
ChatGPT discovers the Supabase authorization server from the public MCP
endpoint and uses the consent flow.

In ChatGPT:

1. Open **Settings → Security and login** and enable **Developer mode**.
2. Open the Plugins page, choose **Create**, and enter
   `https://www.gweilo.lol/api/mcp` as the MCP server URL.
3. Complete the Gweilo sign-in and approve the read-only connection.
4. Install the personal plugin. Start a **Work** chat and select Gweilo with
   `@Gweilo`.

The exact ChatGPT labels can evolve, but the server URL must include
`/api/mcp`. No bearer token should be pasted into ChatGPT.

## Local test

1. Install dependencies and start the existing app:

   ```bash
   npm install
   npm run dev
   ```

2. Sign in normally and obtain a short-lived Supabase access token from the
   local session. Keep it in a local shell variable rather than committing it:

   ```bash
   export GWEILO_ACCESS_TOKEN="<short-lived Supabase access token>"
   ```

3. Verify the MCP handshake:

   ```bash
   curl -i http://localhost:3000/api/mcp \
     -H "Authorization: Bearer $GWEILO_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     --data '{
       "jsonrpc": "2.0",
       "id": 1,
       "method": "initialize",
       "params": {
         "protocolVersion": "2025-11-25",
         "capabilities": {},
         "clientInfo": { "name": "curl", "version": "1.0.0" }
       }
     }'
   ```

4. List tools:

   ```bash
   curl http://localhost:3000/api/mcp \
     -H "Authorization: Bearer $GWEILO_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     --data '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
   ```

5. Call a tool:

   ```bash
   curl http://localhost:3000/api/mcp \
     -H "Authorization: Bearer $GWEILO_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     --data '{
       "jsonrpc": "2.0",
       "id": 3,
       "method": "tools/call",
       "params": {
         "name": "recent_matches",
         "arguments": { "limit": 5 }
       }
     }'
   ```

For a natural-language head-to-head lookup, call the tool with a name:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "head_to_head",
    "arguments": {
      "opponent_name": "Andrej",
      "recent_limit": 10
    }
  }
}
```

The lookup ignores capitalization and diacritics. A unique first name works;
ambiguous names return a prompt to use the full display name. Existing clients
can continue to use an `opponent.id` from `recent_matches` as `opponent_id`.

For general questions, use `general_statistics`. For example, “Who performed
best over the last month?” maps to `days: 30`, `sort_by: "win_rate"`;
“Who had the most draws?” maps to `sort_by: "draws"` and
`minimum_matches: 1`. The default `minimum_matches` is 3 so a single match does
not normally win a performance ranking. Count-based superlatives should lower
it to 1. The result describes a rolling-day window rather than a calendar month.
Each player row also includes positive Elo earned, Elo lost, signed net Elo
change, the number of matches with Elo history, and whether Elo history covers
every returned match. Use `sort_by: "elo_points_gained"` for “who earned the
most Elo?” and `sort_by: "net_elo_change"` for overall rating movement. These
figures are summed from `match_elo_history`; the MCP server does not recalculate
past Elo. Use `sort_by: "sets_won"` when the requested ordering is total sets
won.

Use `current_leaderboard` for questions about the current official table, such
as “Who is number one?”, “What is my current Elo?”, or “Why am I unranked?”.
The leaderboard applies the app's existing minimum-match and recent-activity
rules and reads the latest completed-session rating snapshot, matching the web
app rather than leaking changes from an in-progress session. The response's
`rating_as_of` timestamp identifies that snapshot; it is `null` only when the
server must fall back to the live ratings table. This is different from
`general_statistics`, which ranks activity inside a selected rolling time
window.

Use `my_elo_trend` for “How much Elo did I gain this month?”, “What was my
highest Elo?”, or “Show my Elo changes match by match.” The result indicates
whether committed Elo history covers every match, so ChatGPT should not invent
missing values. `recent_matches` and `head_to_head` also include committed
per-match `elo_before`, `elo_after`, and `elo_change` values when available.

Use `my_rivalries` for “Who is my biggest rival?”, “Which rivalry is closest?”,
or “Against whom did I gain the most Elo?”. It can sort by total meetings,
closest win-loss record, positive Elo earned, or signed net Elo movement.

Use `player_opponent_breakdown` for another named player's opponent results.
For example, “Who beat Milan in matches, and who won sets against him?” maps to
`player_name: "Milan"`. One response contains `opponents_who_won_matches`,
sorted by match wins over the selected player, and `opponents_who_won_sets`,
sorted by sets won against that player. It also returns a complete per-opponent
aggregate list up to the requested limit. A unique first or last name works;
ambiguous names produce a structured `AMBIGUOUS_PLAYER` error asking for the
full display name.

Use `elo_rules` for explanations of the actual rating formula and K-factor
bands. Use `elo_projection` for questions such as “How much Elo would I gain if
I beat Andrej?”. Projection is intentionally limited to a named opponent from
the authenticated player's own match history and clearly labels its result as
hypothetical.

For command-line testing, an MCP client can still use the deployed
`https://<deployment>/api/mcp` URL and a short-lived Supabase bearer token.
OAuth-capable clients should use discovery instead, so they can obtain and
refresh tokens through Supabase Auth.

## Deployment

Deploy through the existing Vercel workflow. No Supabase migration is needed.
Confirm the three required environment variables exist in the target environment
and that the runtime is Node.js 20 or newer. Then run the handshake and
`recent_matches` smoke tests against the deployed `/api/mcp` URL with a test
user's access token.

After deploying a changed tool list or schema, reconnect or refresh the Gweilo
plugin in ChatGPT so it fetches the latest `tools/list` response. No Supabase
migration or new environment variable is required for these tools.

This is intentionally singles-only. Expanding it to doubles, write operations,
raw global match data, or arbitrary profile lookup should be a separate
reviewed change.
