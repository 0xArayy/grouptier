# Contributing to GroupTier

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ (or Docker)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

## Local setup

```bash
# 1. Install dependencies
npm run install:all

# 2. Copy env and fill in your values
cp .env.example server/.env

# 3. Start PostgreSQL locally (or point DATABASE_URL at an existing instance)
#    Schema auto-initialises on server start — no manual migration needed.

# 4. Start server and frontend in separate terminals
npm run dev:server   # http://localhost:3000
npm run dev:client   # http://localhost:5173
```

### Required env vars (server/.env)

| Var | Where to get it |
|-----|----------------|
| `BOT_TOKEN` | @BotFather → your bot → API Token |
| `DATABASE_URL` | `postgresql://user:pass@localhost:5432/grouptier` |
| `MINI_APP_TGLINK` | @BotFather → /newapp → share link |
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) |

`PORT`, `NODE_ENV`, `SERVER_URL`, and `ALLOWED_ORIGIN` are optional for local dev.

## Dev bypass mode

The server accepts `x-init-data: dev` in non-production to skip Telegram signature
validation. The frontend sends this automatically when `import.meta.env.DEV` is true.
This means you can call any API endpoint from curl or Postman without a real Telegram
session:

```bash
curl -s -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -H "x-init-data: dev" \
  -d '{"name": "Test poll"}'
```

Use `x-init-data: dev-chatless` to simulate opening the Mini App outside a group
context (no `telegramChat` — useful for testing personal/chatless sessions).

## Running tests

```bash
cd server
npm test               # run all 252 tests once
npx vitest             # interactive watch mode
npx vitest run src/__tests__/sessions.test.ts  # single file
```

Tests use [Vitest](https://vitest.dev/) with in-process Fastify injection — no running
server or database needed. DB calls are mocked via `vi.mock('../db/client.js')`.

### Mock patterns

- **`mockQuery`** — intercepts `pool.query()` calls. Simple tests use
  `mockQuery.mockResolvedValueOnce({ rows: [...] })`. Complex multi-query flows use
  the `qMocks()` helper (defined in `sessions.test.ts`) which routes each call to the
  first pending expectation matching a SQL substring — order-independent and robust
  to query reordering.
- **`mockClient`** — intercepts `pool.connect()` for transaction-based endpoints
  (`PUT /options`, `POST /options`). Chain `mockClient.query.mockResolvedValueOnce`
  for each step: `BEGIN → SELECT → DELETE/INSERT → COMMIT`.

## DB schema

The schema lives in `scripts/schema.sql` and auto-applies on every server start via
idempotent `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE … ADD COLUMN IF NOT EXISTS`
statements. No migration tool needed for local development.

## Project structure

```
server/src/
  routes/       Fastify route handlers (sessions, savedPolls, ai)
  bot/          grammy bot commands + canvas card builders
  middleware/   initData Telegram auth middleware
  lib/          tournament engine, constants, URL helpers
  db/           pg pool client, borda score computation
  __tests__/    Vitest test suites

frontend/src/
  components/   React screens (CreatePoll, Compare, TierList, LiveResults…)
  api/          fetch client with typed ApiError
  lib/          tournament mirror, shared constants
```

## Architecture notes

- **Session lifecycle**: `collecting → voting → closed`. The transition to `voting`
  sends a Telegram bot message; if that fails the status rolls back to `collecting`.
- **Auth**: every API route (except card image endpoints) requires `x-init-data`
  header with a valid Telegram Web App initData string, validated by HMAC-SHA256.
  initData older than 24 hours is rejected.
- **Ownership**: mutation endpoints (rename, delete, close, replace options) 403 if
  `creator_user_id` is set and doesn't match the caller. Legacy sessions with
  `creator_user_id = NULL` are exempt.
- **TOCTOU safety**: `POST /options` option-count check runs inside a
  `SELECT … FOR UPDATE` transaction to prevent concurrent over-insertion.
