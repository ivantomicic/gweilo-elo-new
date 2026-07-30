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
- OAuth clients discover Supabase Auth through
  `/.well-known/oauth-protected-resource`. ChatGPT uses authorization code
  with PKCE and never receives the Supabase service-role key.
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

Use an `opponent.id` from `recent_matches` as the `opponent_id` argument to
`head_to_head`.

For command-line testing, an MCP client can still use the deployed
`https://<deployment>/api/mcp` URL and a short-lived Supabase bearer token.
OAuth-capable clients should use discovery instead, so they can obtain and
refresh tokens through Supabase Auth.

## Deployment

Deploy through the existing Vercel workflow. No Supabase migration is needed.
Confirm the two required environment variables exist in the target environment
and that the runtime is Node.js 20 or newer. Then run the handshake and
`recent_matches` smoke tests against the deployed `/api/mcp` URL with a test
user's access token.

This is intentionally singles-only. Expanding it to doubles, write operations,
or broader player lookup should be a separate reviewed change.
