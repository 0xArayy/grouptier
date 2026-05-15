# GroupTier

Telegram Mini App for pairwise group ranking. Each user taps through tournament brackets, gets a personal tier list, and the group sees a live Borda-count ranking.

## Day 0 Setup (~40 min)

### 1. Create your bot (5 min)

1. Open [@BotFather](https://t.me/BotFather) → `/newbot` → pick a name and username
2. Copy the `BOT_TOKEN`
3. `/setinline` → select your bot → set placeholder text (e.g. `Share my picks…`) — required for CP4 share button
4. `/setcommands` → paste:
   ```
   startsession - Start a new ranking session
   addoption - Add an option to vote on
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

# 3. Copy env and fill in BOT_TOKEN
cp .env.example server/.env
# Edit server/.env — set BOT_TOKEN, leave DATABASE_URL as below

# Local DATABASE_URL for docker-compose:
# DATABASE_URL=postgresql://grouptier:grouptier@localhost:5432/grouptier
# MINI_APP_URL=https://your-ngrok-url  (see step 4)
# NODE_ENV=development

# 4. Expose local server with ngrok (Mini App requires HTTPS)
npx ngrok http 3000
# Copy the https://xxxxx.ngrok.io URL → set as MINI_APP_URL in server/.env

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
| `MINI_APP_URL` | Your Railway deploy URL (e.g. `https://grouptier-production.up.railway.app`) |
| `NODE_ENV` | `production` |

5. Set **Start Command**: `npm run build && node server/dist/index.js`
6. First deploy: Railway will build and start. Run DB init:
   ```
   # In Railway shell (or via Railway CLI):
   DATABASE_URL=$DATABASE_URL node --input-type=module < server/scripts/init-db.js
   ```
7. Set **Railway plan to Hobby** ($5/month) — prevents cold starts during demo
8. Set up [UptimeRobot](https://uptimerobot.com) free ping every 5 min to `https://your-app.up.railway.app/health`

### 4. Register Mini App with BotFather (5 min)

```
/newapp → select your bot → set URL to your Railway deploy URL
```

Or set as Menu Button:
```
/mybots → select bot → Bot Settings → Menu Button → set URL
```

## Architecture

```
Telegram Group
  /startsession [name]   → creates session in Postgres
  /addoption <text>      → adds option to session
  /vote                  → locks session, sends Mini App link (CP5 inline button)
  /closesession          → closes session, announces winner (CP6)

Fastify (port 3000)
  GET  /api/sessions/:id      → session state + live Borda ranking
  POST /api/sessions/:id/results → submit ranked list; triggers CP1 bot edit
  GET  /health                → 200 (Railway health check)
  /*                          → serves React Mini App (frontend/dist/)

React Mini App (Vite)
  ?session_id=<uuid>
  → Compare screen (pairwise tournament brackets)
  → Bye screen (auto-advance with 1s animation)
  → TierList (personal S/A/B/C result, submit button)
  → LiveResults (Borda ranking, 3s poll, share button)
```

## Bot Commands

| Command | Description |
|---------|-------------|
| `/startsession [name]` | Start a new session in this group. Name is optional. |
| `/addoption <text>` | Add an option (up to 12, case-insensitive dedup). |
| `/vote` | Lock options (min 2 required) and send the Mini App link. |
| `/closesession` | Close voting and announce the Borda winner in chat. |

## Algorithm

**Tournament:** Single-elimination bracket, per-user random seed. Each user gets N-1 comparisons. Odd options get a bye (auto-advance). Tier = round in which option is eliminated (S = champion, A = final loser, B = semifinal losers, C = rest).

**Aggregation:** Borda count. Each option gets N-rank points per user. Summed across all submitted results. Live-updated as each user submits.

## Tech Stack

- **Bot:** [grammY](https://grammy.dev) — Node.js Telegram bot framework
- **Server:** [Fastify](https://fastify.io) — serves REST API + static Mini App files
- **DB:** PostgreSQL (Railway addon)
- **Frontend:** React + TypeScript + Vite + [@tma.js/sdk-react](https://docs.tma.js/packages/typescript/tma-js-sdk-react)
- **Deploy:** Railway (single service, HTTPS automatic)
