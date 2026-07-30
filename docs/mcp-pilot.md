# Gweilo read-only MCP pilot

This pilot exposes three backend-only MCP tools at `/api/mcp`:

- `recent_matches`: the authenticated player's recent completed singles matches
- `player_performance`: that player's all-time singles wins, losses, draws,
  win rate, and recent form
- `head_to_head`: that player's singles record against a selected opponent

The endpoint uses stateless Streamable HTTP so it fits the existing Next.js /
Vercel deployment. It accepts both current MCP requests and the stateless
2025-era MCP handshake used by existing clients.

## Security boundary

- Every request requires a current Supabase access token in
  `Authorization: Bearer <token>`.
- The token is verified server-side with Supabase before MCP dispatch.
- The authenticated Supabase user ID is the player ID. Tools do not accept a
  different player ID, so a caller cannot request another player's summary.
- `head_to_head` only returns an opponent profile after finding a completed
  singles match between that opponent and the authenticated player.
- Database access uses the existing server-only service-role client. Queries
  are explicitly constrained by the verified user ID.
- Tools are annotated read-only and no insert, update, delete, or RPC write
  operations are registered.
- Responses are marked `Cache-Control: no-store`.

`SUPABASE_SERVICE_ROLE_KEY` must remain a server/Vercel environment variable.
Never prefix it with `NEXT_PUBLIC_` or put it in an MCP client configuration.

## Required configuration

The route reuses the app's existing deployment variables:

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

The official MCP server package requires Node.js 20 or later. Configure the
Vercel project to use Node.js 20+ if it is not already doing so.

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

Use an `opponent.id` from `recent_matches` as the `opponent_id` argument to
`head_to_head`.

An MCP client should be configured with the deployed
`https://<deployment>/api/mcp` URL and the same Supabase bearer token header.
Because user access tokens expire, this pilot is best suited to a small test
with a client that can refresh or easily replace the token.

## Deployment

Deploy through the existing Vercel workflow. No Supabase migration is needed.
Confirm the two required environment variables exist in the target environment
and that the runtime is Node.js 20 or newer. Then run the handshake and
`recent_matches` smoke tests against the deployed `/api/mcp` URL with a test
user's access token.

This is intentionally singles-only. Expanding it to doubles, OAuth discovery,
or long-lived MCP sessions should be a separate reviewed change.
