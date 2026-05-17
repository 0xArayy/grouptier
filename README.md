# GroupTier

Telegram Mini App for pairwise group ranking. Each user taps through tournament brackets, gets a personal tier list, and the group sees a live Borda-count ranking.

## Day 0 Setup (~40 min)

### 1. Create your bot (5 min)

1. Open [@BotFather](https://t.me/BotFather) → `/newbot` → pick a name and username
2. Copy the `BOT_TOKEN`
3. `/setinline` → select your bot → set placeholder text (e.g. `Share my picks…`) — required for inline share button
4. `/setcommands` → paste:
   ```
   newpoll - Create a poll in the Mini App
   startsession - Start a session via bot commands
   addoption - Add an option to the current session
   vote - Lock options and open voting
   closesession - Close voting and announce winner
   ```

### 2. Local dev (15 min)

**Prerequisites:** Node.js 20+, Docker

```bash
# 1. Clone and install
git clone https://github.com/0xArayy/grouptier
cd grouptier
npm run install:all

# 2. Start local Postgres
docker-compose up -d

# 3. Copy env and fill in values
cp .env.example server/.env
# Edit server/.env:
#   BOT_TOKEN=your-token
#   DATABASE_URL=postgresql://grouptier:grouptier@localhost:5432/grouptier
#   MINI_APP_TGLINK=https://t.me/your_bot/vote  (set after step 4)
#   NODE_ENV=development

# 4. Expose local server with ngrok (Mini App requires HTTPS)
npx ngrok http 3000
# Copy the https://xxxxx.ngrok.io URL → set in BotFather as your Mini App URL
# BotFather then gives you a t.me link — set that as MINI_APP_TGLINK in server/.env

# 5. Build frontend
cd frontend && npm run build && cd ..

# 6. Start server (serves frontend + bot polling)
cd server && npm run dev
```

### 3. Deploy to Railway (~20 min)

1. Push to GitHub (already done if you forked this repo)
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub → select `grouptier`
3. Add **Postgres** addon (free tier)
4. Set environment variables:

| Variable | Value |
|----------|-------|
| `BOT_TOKEN` | From @BotFather |
| `DATABASE_URL` | Auto-set by Railway Postgres addon |
| `MINI_APP_TGLINK` | t.me link to your Mini App (e.g. `https://t.me/your_bot/vote`) |
| `NODE_ENV` | `production` |

5. Deploy — Railway uses `railway.toml` for build/start commands automatically. DB schema is auto-initialized on first start (idempotent `IF NOT EXISTS`).
6. Set **Railway plan to Hobby** ($5/month) — prevents cold starts during demo
7. Set up [UptimeRobot](https://uptimerobot.com) free ping every 5 min to `https://your-app.up.railway.app/health`

### 4. Register Mini App with BotFather (5 min)

```
/newapp → select your bot → set URL to your Railway deploy URL
```

Or set as Menu Button:
```
/mybots → select bot → Bot Settings → Menu Button → set URL
```

## Usage flows

### Flow A — fully in Mini App (recommended)

1. Admin sends `/newpoll` in group → bot sends **Set Up Poll →** button
2. Admin taps button → Mini App opens → sets poll name, adds options (or picks a preset 🍕🎮🎬), taps **Start Voting**
3. Bot posts **Cast your vote →** button in the group
4. Members tap → each goes through their personal tournament bracket → submits tier list
5. Admin taps **🔒 Close voting & announce winner** in the live results screen → bot posts winner announcement

### Flow B — bot commands only

```
/startsession [name]   → creates session
/addoption <text>      → add options (up to 12)
/vote                  → lock and send Mini App link
/closesession          → close and announce winner
```

Both flows can be mixed: create via `/newpoll`, manage options via Mini App, close via bot or Mini App.

## Architecture

```
Telegram Group
  /newpoll               → creates session, sends Set Up Poll → button
  /startsession [name]   → creates session via bot commands
  /addoption <text>      → adds option to active collecting session
  /vote                  → locks session, sends Cast your vote → button
  /closesession          → closes session, announces Borda winner

Fastify (port 3000)
  POST /api/sessions                  → create session (Mini App, needs chat context)
  GET  /api/sessions/active           → find collecting session for current chat
  GET  /api/sessions/:id              → session state + live Borda ranking
  PATCH /api/sessions/:id             → update session name
  POST /api/sessions/:id/options      → add option (dedup, max 12)
  POST /api/sessions/:id/vote         → flip to voting, send bot message
  POST /api/sessions/:id/results      → submit ranked list; bot edits vote count
  POST /api/sessions/:id/close        → close session, bot announces winner
  GET  /health                        → 200 (Railway health check)
  /*                                  → serves React Mini App (frontend/dist/)

React Mini App (Vite)
  No startapp param → fetchActiveSession → CreatePoll (5-step flow) or manage existing
    CreatePoll steps:
      home      → preset categories + "Мои опросы" button + create custom button
      presets   → 8 preset categories (Еда, Игры, Кино, Сериал, Музыка, Отдых, Досуг, Напитки)
      my-polls  → user's saved templates list + create button
      options   → add/remove options, save-as-template form with emoji picker, back button
      starting  → session being created
  startapp=<id>     → fetchSession → route by status:
    collecting      → CreatePoll manage mode (add options, rename, start voting)
    voting          → Compare screen (pairwise tournament) → Bye screen → TierList → LiveResults
    closed          → LiveResults (read-only)
```

## Bot Commands

| Command | Description |
|---------|-------------|
| `/newpoll` | Create a poll and open Mini App to set it up. |
| `/startsession [name]` | Start a new session via bot (name optional). |
| `/addoption <text>` | Add an option (up to 12, case-insensitive dedup). |
| `/vote` | Lock options (min 2) and send the Mini App vote link. |
| `/closesession` | Close voting and announce the Borda winner in chat. |

## API Reference

All endpoints require `x-init-data` header (Telegram WebApp initData, or `dev` in development).

| Method | Path | Auth needed | Description |
|--------|------|-------------|-------------|
| `POST` | `/api/sessions` | chat context | Create session |
| `GET` | `/api/sessions/active` | chat context | Active collecting session |
| `GET` | `/api/sessions/:id` | user | Session state + Borda |
| `PATCH` | `/api/sessions/:id` | — | Update name (collecting only) |
| `POST` | `/api/sessions/:id/options` | — | Add option |
| `DELETE` | `/api/sessions/:id/options/:text` | — | Remove an option (collecting only) |
| `POST` | `/api/sessions/:id/vote` | — | Start voting |
| `POST` | `/api/sessions/:id/results` | user | Submit ranked list |
| `POST` | `/api/sessions/:id/close` | — | Close + announce winner |
| `GET` | `/api/saved-polls` | user | List current user's saved poll templates |
| `POST` | `/api/saved-polls` | user | Create saved poll template (`{ name, options, emoji }`) |
| `PUT` | `/api/saved-polls/:id` | user | Update saved poll template |
| `DELETE` | `/api/saved-polls/:id` | user | Delete saved poll template |

> Chat context = `chat` field present in initData. Provided when Mini App is opened via `web_app` button or from group menu. Ownership is enforced when available; session UUID provides auth otherwise.

## Algorithm

**Tournament:** Single-elimination bracket, per-user random seed (`currentRoundWinners` tracks actual winners per round). Each user gets N-1 comparisons. Odd options get a bye (auto-advance, not recorded in eliminated list). Tier = round eliminated in: S = champion, A = final loser, B = semifinal losers, C = earlier losers.

**Aggregation:** Borda count. Each option gets N-rank points per user (1st place = N pts, last = 1 pt). Summed across all submitted results. Live-updated as each user submits.

## Database Schema

```sql
sessions       — id, chat_id, name, status, message_id, message_sent, created_at
options        — id, session_id, text, created_at
user_results   — id, session_id, user_id, ranked_list (JSONB), created_at
session_voters — session_id, user_id (tracks who opened the Mini App)
comparisons    — id, session_id, user_id, winner, loser, created_at (unused, reserved)
saved_polls    — id, user_id, name, options (JSONB), emoji, created_at, updated_at
```

Key constraints:
- `sessions_one_collecting_per_chat` — partial unique index prevents two active sessions per chat
- `user_results (session_id, user_id)` — unique, upserted on re-vote
- `message_sent` — crash-recovery flag: `voting + message_sent=false` → surfaced as `collecting`
- `saved_polls_user_id_idx` — index on `saved_polls(user_id)` for fast per-user lookups

## Tech Stack

- **Bot:** [grammY](https://grammy.dev) — Node.js Telegram bot framework
- **Server:** [Fastify](https://fastify.io) — REST API + static file serving
- **DB:** PostgreSQL (Railway addon), schema auto-applied on startup
- **Frontend:** React + TypeScript + Vite
- **Deploy:** Railway (single service, HTTPS automatic)
