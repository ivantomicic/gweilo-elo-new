# Private Gweilo Stats GPT

This read-only API lets a private custom GPT answer questions using current
Gweilo singles, doubles-player, player-summary, and singles head-to-head data.

## Server configuration

Add these environment variables to the deployed Gweilo application:

```text
GPT_STATS_API_KEY=<a long random secret>
GPT_STATS_PUBLIC_URL=https://your-gweilo-domain.example
```

`GPT_STATS_PUBLIC_URL` is optional when requests already reach the canonical
public domain. `GPT_STATS_API_KEY` is required and must never use the Supabase
service-role key.

The OpenAPI document is available at:

```text
https://your-gweilo-domain.example/api/gpt/openapi
```

## Custom GPT configuration

Create or edit the GPT on ChatGPT web. Keep its sharing level set to
**Invite-only**.

Suggested name: `Gweilo Stats`

Suggested instructions:

```text
You are the private Gweilo table-tennis statistics analyst. Use the Gweilo
Statistics API for every factual claim about players, ratings, rankings,
records, win rates, or head-to-head results. Never invent missing statistics.
State whether a result is singles or doubles. The head-to-head operation is
singles-only and reports the first named player's perspective. If a player name
is missing or ambiguous, ask one concise clarification question. Keep answers
friendly and concise, and explain notable patterns in plain language.
```

Under **Actions**, import the OpenAPI schema from the deployed `/api/gpt/openapi`
URL. Configure authentication as **API key**, authentication type **Bearer**, and
use the same `GPT_STATS_API_KEY` value configured on the server.

Test with:

- `Show me the current singles leaderboard.`
- `Give me the singles and doubles summary for <player name>.`
- `What is <player name>'s singles record against <opponent name>?`

## Security boundary

- All exposed operations are `GET` requests.
- The API does not accept SQL or table names from the caller.
- The Supabase service-role key remains server-side.
- Every statistics request requires the private bearer token.
- The OpenAPI document contains no secrets.
