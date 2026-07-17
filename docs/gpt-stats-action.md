# Private Gweilo Stats GPT

This read-only API lets a private custom GPT answer questions using current
Gweilo singles, doubles-player, player-summary, singles head-to-head, recent
form, Elo-trend, rivalry, official Elo-rule, and next-match scenario data.

## Server configuration

Add these environment variables to the deployed Gweilo application:

```text
GPT_STATS_API_KEY=<a long random secret>
```

`GPT_STATS_API_KEY` is required and must never use the Supabase service-role
key. The OpenAPI schema automatically uses the canonical hostname that served
the request.

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
Statistics API for every factual claim about Gweilo players, ratings, rankings,
records, win rates, form, rivalries, or head-to-head results. Do not use web
search or general knowledge for Gweilo statistics. If the API does not provide
the requested data, say that it is unavailable instead of guessing, inferring,
or searching elsewhere. Never invent players, matches, or statistics.

The owner's Gweilo display name is Ivan. Treat "me", "my", and "I" as Ivan
unless the user explicitly names another player.

State whether a result is singles or doubles. Head-to-head, trend, and rivalry
operations are singles-only. Head-to-head reports the first named player's
perspective. Use the trend operation for recent form or Elo-history questions,
and the rivalries operation for most-played-opponent questions. For any question
about how Elo works, first use the Elo-rules operation. For any next-match Elo
prediction, target, or ranking scenario, use the Elo-scenario operation and do
not perform the calculation yourself. If an opponent or target needed for the
scenario is missing, ask one concise clarification question. If a player name is
missing or ambiguous, ask one concise clarification question. Keep answers
friendly and concise, and explain notable patterns in plain language.
```

Under **Actions**, import the OpenAPI schema from the deployed `/api/gpt/openapi`
URL. Configure authentication as **API key**, authentication type **Bearer**, and
use the same `GPT_STATS_API_KEY` value configured on the server.

Under **Capabilities**, turn off **Web Search**. For the strictest data-only GPT,
also turn off Canvas, Image Generation, and Code Interpreter & Data Analysis so
the Action is the only enabled external-data capability.

Test with:

- `Show me the current singles leaderboard.`
- `Give me the singles and doubles summary for <player name>.`
- `What is <player name>'s singles record against <opponent name>?`
- `How has <player name> performed in their last 10 singles matches?`
- `Who are <player name>'s five biggest singles rivals?`
- `How exactly does Gweilo calculate Elo?`
- `If I play <opponent name> next, what will my Elo be after a win, draw, or loss?`
- `What needs to happen in my next match for me to reach 1750 Elo?`
- `Can I overtake <player name> if I beat <opponent name> next?`

## Security boundary

- All exposed operations are `GET` requests.
- The API does not accept SQL or table names from the caller.
- The Supabase service-role key remains server-side.
- Every statistics request requires the private bearer token.
- The OpenAPI document contains no secrets.
