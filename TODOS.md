# GroupTier TODOs

## Remaining

### [rate-limiting] Rate limiting on voting endpoints
Telegram bots are public surfaces — no rate limit means anyone with valid initData can hammer the tournament logic. Needs infrastructure decision (Redis token bucket or Fastify rate-limit plugin).

### [cors-lockdown] Restrict CORS to production domain
Currently `origin: true` (all origins). Lock down to `MINI_APP_TGLINK` domain once that's finalized.

### [css-modules] Migrate inline styles to CSS modules
Every component uses `style={...}` objects. Large surface area — separate PR after code-health cleanup lands.

### [websocket] Replace polling with WebSocket for real-time results
REST polling at 3s is acceptable but will not scale. Upgrade path: WebSocket + Redis pub/sub. Week-2 infrastructure.

### [contributing] Add CONTRIBUTING.md
No onboarding docs exist. Include: env setup, schema auto-init, dev mode bypass, test runner.

### [bot-legacy-cleanup] Delete legacy bot commands
/startsession, /addoption, /vote, /closesession are superseded by /newpoll + Mini App flow. Commented in code-health PR, deletion deferred.

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
