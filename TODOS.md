# GroupTier TODOs

## Remaining

### [canvas-worker] Offload PNG card generation to worker_threads
`generateVotingCard`, `generateSetupCard`, and `generateWinnerCard` in `imageCard.ts` call `canvas.toBuffer('image/png')` synchronously, blocking Node's event loop for ~5–30ms per card. Acceptable for single-group scale but will cause request queuing under multi-group load. Fix: use `piscina` or a manual `worker_threads` pool to keep the main thread free.

### ~~[rate-limiting]~~ ✅ Done — `@fastify/rate-limit` added (100 req/min global, 3 req/min AI endpoint), key by IP

### ~~[cors-lockdown]~~ ✅ Done — CORS locked to `ALLOWED_ORIGIN` env var in production; warns if unset

### [css-modules] Migrate inline styles to CSS modules
Every component uses `style={...}` objects. Large surface area — separate PR after code-health cleanup lands.

### [websocket] Replace polling with WebSocket for real-time results
REST polling at 3s is acceptable but will not scale. Upgrade path: WebSocket + Redis pub/sub. Week-2 infrastructure.

### ~~[contributing]~~ ✅ Done — `CONTRIBUTING.md` added: env setup, dev bypass, test runner, qMocks/mockClient patterns, project structure, architecture notes

### ~~[error-envelope]~~ ✅ Done — `ApiError` class in `frontend/src/api/client.ts` preserves status + parsed body; 409 session conflict redirects to existing session via `err.body.id`

### ~~[test-mocks]~~ ✅ Done — `qMocks()` helper added to `sessions.test.ts`: SQL-substring-matching mock router, order-independent; GET /sessions/:id, POST /vote, POST /results, POST /close migrated

### ~~[options-unknown-session]~~ ✅ Done — GET `/api/sessions/:id/options` now returns 404 for unknown session

### ~~[shared-constants]~~ ✅ Done — `server/src/lib/constants.ts` exports `MAX_NAME_LENGTH`, `MAX_OPTION_TEXT_LENGTH`, `MAX_OPTIONS`; used in sessions.ts and savedPolls.ts

### ~~[bot-legacy-cleanup]~~ ✅ Done — `/startsession`, `/addoption`, `/vote`, `/closesession` and `escapeMarkdown` deleted from `bot.ts`

### ~~[auth-ownership-checks]~~ ✅ Done — `creator_user_id` stored at session creation; PATCH, DELETE, POST /close, PUT /options, POST /options all 403 on non-creator

### ~~[auth-date-expiry]~~ ✅ Done — `auth_date` freshness check (24h window) added to `initData.ts`

### ~~[options-race]~~ ✅ Done — `POST /options` count check wrapped in `BEGIN … SELECT … FOR UPDATE … INSERT … COMMIT` transaction; concurrent inserts serialized at DB level

### ~~[markdown-injection]~~ ✅ Done — `escapeMarkdown()` added to `bot.ts`, applied in `/startsession` legacy command

### ~~[tier-assertions]~~ ✅ Done — S/A/B/C tier count assertions added to N=4, N=6, N=8, N=12, N=32 full-run tests in `tournament.test.ts`

### ~~[gtPulse-undefined]~~ ✅ Done — `@keyframes gtPulse` added to `frontend/src/index.css`

### ~~[saved-polls-item-validation]~~ ✅ Done — individual option validation added to POST and PUT in `savedPolls.ts`

---

## Completed

### [save-from-results] Save template from results screen
**Completed:** v1.0.3.0 (2026-05-17)
- Any poll participant can save the poll as a template from LiveResults after submitting their tier list.
- "💾 Сохранить" button on LiveResults expands inline name + emoji-picker form.
- sessionStorage guard (keyed by userId+sessionId) prevents duplicate saves on revisit.

### [saved-polls] Save and reuse custom poll templates
**Completed:** v1.0.2.0 (2026-05-17)
- Users can save a custom poll as a reusable template with a name, options list, and emoji icon.
- Templates are accessible from the "Мои опросы" screen (new step in the CreatePoll flow).
- Emoji picker grid (32 options) for choosing a template icon when saving.
- Full CRUD API: `GET/POST /api/saved-polls`, `PUT/DELETE /api/saved-polls/:id`, backed by `saved_polls` table.

### [drag-to-rearrange] Drag chips between tier rows on personal tier list
**Completed:** v1.0.1.0 (2026-05-16)
- Users can hold a chip and drag it between tier rows (A/B/C) on the TierList screen before submitting their picks.
- Works with both touch and mouse via pointer events.
- TierList passes the user's final reordered list to the server on submit.

### [in-app-poll-creation] Create and manage polls from Mini App
**Completed:** v1.2.0 (2026-05-16)
- `/newpoll` bot command creates session server-side, sends `Set Up Poll →` url button
- Mini App shows CreatePoll (name + options + presets) when no session exists
- Mini App shows manage UI (options step) when collecting session found
- Editable poll name via PATCH `/api/sessions/:id`
- `POST /api/sessions/:id/vote` starts voting from Mini App, sends bot message

### [close-from-mini-app] Close session from Mini App
**Completed:** v1.2.0 (2026-05-16)
- `POST /api/sessions/:id/close` closes voting and fires winner announcement via bot
- "🔒 Close voting & announce winner" button in LiveResults screen (hidden once closed)

### [presets] Session option presets for common decision types
**Completed:** v1.1.0 (2026-05-16)
- Quick-start chips (🍕 Food, 🎮 Games, 🎬 Movies) in CreatePoll name step
- Tapping a preset creates the session and bulk-adds 8 options in one action

### [ux-edge-states] Loading, empty, and offline state handling
**Completed:** v1.1.0 (2026-05-16)
- Loading skeleton (shimmer animation) replaces blank loading screen
- Empty state on waiting screen (📭 "No options added yet")
- Offline banner (red top bar) on all screens via `navigator.onLine` events

### [vote-rollback-safety] Harden vote start against sendMessage failure
**Completed:** v1.1.0 (2026-05-16)
- `message_sent BOOLEAN DEFAULT false` column added to sessions
- `status='voting' AND message_sent=false` surfaced as `collecting` (crash recovery)
- Startup cleanup deletes stranded voting+unsent sessions older than 24h

### [collecting-session-cleanup] Clean up stranded collecting sessions
**Completed:** v1.0.0 (2026-05-16)
- Startup cleanup: `DELETE FROM sessions WHERE status='collecting' AND created_at < NOW() - INTERVAL '24 hours'`
- Extended to also cover `status='voting' AND message_sent=false`
