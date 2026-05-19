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
No onboarding docs exist. Include: env setup, schema auto-init, dev mode bypass, test runner. Also: Telegram stub mode (`TELEGRAM_STUB=true`) so TTHW doesn't require a real bot token.

### [error-envelope] Standardize API error response shape
Currently mixed: `{ error, id }` for 409 session conflict, bare string for other 409s, `{ error }` for 400s. Adopt `{ error: string, code?: string }` everywhere and document it.

### [test-mocks] Migrate sessions.test.ts from positional to query-text mocks
74 tests chain `mockResolvedValueOnce` by position — fragile when query order changes. Consider matching by SQL substring to decouple test assertions from query ordering.

### [options-unknown-session] GET /api/sessions/:id/options returns [] for unknown session
Should return 404 instead of empty array so callers can distinguish "no options" from "no session".

### [shared-constants] Export MAX_NAME_LENGTH / MAX_OPTION_TEXT_LENGTH from shared lib
Currently defined only in sessions.ts; frontend has no corresponding constant. Extract to a shared constants file so a limit change propagates everywhere.

### [bot-legacy-cleanup] Delete legacy bot commands
/startsession, /addoption, /vote, /closesession are superseded by /newpoll + Mini App flow. Commented in code-health PR, deletion deferred.

### [auth-ownership-checks] Add ownership checks to session mutation endpoints
`POST /close`, `PATCH /:id` (rename), `POST /:id/vote` have no chat_id/creator guard — any authenticated user who knows a session UUID can close or rename another group's session. `POST /vote` also bypasses the check when telegramChat is null (URL-button launches).

### [auth-date-expiry] Validate auth_date in Telegram initData
HMAC is verified but `auth_date` is never checked. Captured initData is a permanent API credential. Should reject initData older than 24h per Telegram docs.

### [options-race] Fix TOCTOU race in POST /options count check
Count check and insert are non-atomic — two concurrent requests at 31/32 options both pass the guard and yield 33. Needs a DB-level CHECK constraint or a SELECT...FOR UPDATE lock.

### [markdown-injection] Escape user content in bot Markdown messages
`session.name` and option text are inserted raw into `parse_mode: 'Markdown'` messages. Underscores trigger italic, asterisks break bold spans. Apply `escapeMarkdown()` to all user-provided strings in bot announcements.

### [tier-assertions] Add S/A/B/C tier assertions to tournament tests
All full-run tests (N=4, N=8, N=6) verify list length and uniqueness but never check which tier each option received. An `assignTier` regression would pass undetected. Add assertions like `expect(eliminated.find(e => e.option === loser).tier).toBe('B')` for each full-run test.

### [gtPulse-undefined] Define @keyframes gtPulse in index.css
`OptionsStep.tsx:113` and `LiveResults.tsx:280` use `animation: 'gtPulse 1.2s infinite'` but `@keyframes gtPulse` is never defined anywhere in CSS. Elements render static. Add `@keyframes gtPulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }` to `frontend/src/index.css`.

### [saved-polls-item-validation] Validate individual option items in saved-polls API
`POST /api/saved-polls` and `PUT /api/saved-polls/:id` check `options.length` (2–32) but never validate individual items: each option should be a non-empty string ≤ 100 characters. Currently an attacker can store 32 options of arbitrary length in the JSONB column. Add `options.every(o => typeof o === 'string' && o.trim().length > 0 && o.length <= 100)` on both routes.

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
