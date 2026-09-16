# Round submission deployment

The round-submit API now commits scores, any six-player Round 6/7 matchup
changes, the response receipt, and a durable effects record in one database
transaction. The web and iOS clients advance from that receipt. Notifications,
Live Activities, and final-session metadata run after the response, with a
scheduled retry if the first attempt fails.

## Deployment order

1. Apply `supabase/migrations/20260916095239_atomic_round_schedule_and_effects.sql`
   to the production Supabase project before deploying the updated server.
2. Set `CRON_SECRET` on the Vercel project to a random value of at least 16
   characters. Do not expose it to either client. Vercel supplies it in the
   scheduled request's `Authorization: Bearer` header.
3. Deploy the Next.js server and web app together, then ship the iOS build.

The `vercel.json` job runs daily as a safety net compatible with Vercel Hobby.
Normal post-response processing starts immediately through Next.js `after()`.
On Vercel Pro or Enterprise, the cron expression may be changed to `* * * * *`
for a one-minute retry interval. If the effects route returns 401, verify
`CRON_SECRET`; if it returns 500, inspect the function log and the ledger row's
`effects_error`, `effects_attempt_count`, and `effects_next_attempt_at` fields.

## Smoke test

Submit a nonfinal round in both clients and confirm that the next round appears
immediately. In a six-player mixed session, submit Round 5 and confirm both
Round 6 and Round 7 matchups agree in iOS, web, and the database. Finish a
session, then confirm the completion notification, Live Activity dismissal,
and best/worst metadata arrive after the save response. Retry the same submit
request: it should return the stored success receipt without changing scores.
