# Changelog

All notable changes to GroupTier are documented here.

## [1.0.7.0] - 2026-05-28

### Added
- `server/src/routes/templates.ts` — 30 s in-process Map cache for `GET /api/templates`. Every app open no longer hits the DB; cache auto-refreshes after 30 s. Empty result sets are not cached (safe for a fresh deploy before seeds run).
- `server/src/routes/templates.ts` — `?limit` / `?offset` query params for `GET /api/templates`. Response shape changed from a raw array to `{ items: T[], nextOffset: number | null }`. Pagination is applied in-process from the cached full result set — no extra DB queries per page. `limit` clamped to `[1, 100]`, default 30.
- `server/src/bot/imageCard.ts` — `generateSetupCardAsync`, `generateVotingCardAsync`, `generateWinnerCardAsync` — async wrappers backed by a `piscina` worker pool in production, falling back to direct synchronous calls in dev/test (where compiled worker `.js` files are not present).
- `server/src/bot/imageCard.worker.ts` — New piscina worker entry-point. Dispatches `setup | voting | winner` tasks to the existing sync generators. Each task call protected by a 5 s `AbortSignal.timeout`.
- `server/src/bot/cards.ts` — `buildVotingCard`, `buildSetupCard`, `buildWinnerCard` promoted to `async` functions returning `Promise<...>`.
- `server/package.json` — `piscina ^5.1.4` dependency.

### Changed
- `server/src/bot/bot.ts`, `server/src/routes/sessions.ts` — All four card-builder call sites updated to `await`.

### Tests
- `server/src/__tests__/templates.test.ts` — 3 new tests: cache deduplication (DB called once for two back-to-back requests), `?limit` / `?offset` pagination across 3 pages with a single DB hit, `limit=999` clamped to 100. Existing tests updated for new `{ items, nextOffset }` response shape. `clearTemplateCache()` called in `beforeEach` to prevent cache bleed between tests; `vi.hoisted()` used to avoid TDZ error with static import of `clearTemplateCache`.
- `server/src/__tests__/cards.test.ts` — All card-builder tests updated to `async / await`.

## [1.0.6.0] - 2026-05-28

### Added
- `scripts/schema.sql` — `public_templates` table (emoji, name, options, author, official, category, created_at) and `template_uses` event-log table for the HOT metric. Seeded with 9 official GroupTier templates across food, games, movies, music, sport, and other categories. Composite covering index `(used_at DESC, template_id)` for the 7-day CTE.
- `server/src/routes/templates.ts` — `GET /api/templates` returns all templates with `uses_7d` count and `hot` flag (top-3 by 7-day use events). `POST /api/templates/:id/use` (authenticated) records a use event; validates UUID format before hitting the DB (returns 400 on bad input, 404 when not found).
- `server/src/index.ts` — `templateRoutes` registered alongside existing `publicPollRoutes`.
- `frontend/src/api/client.ts` — `PublicTemplate` interface; `fetchTemplates(signal?)` with AbortSignal support; `recordTemplateUse(id)` fire-and-forget (never blocks user flow).
- `frontend/src/components/create-poll/PresetsStep.tsx` — Live template browser replacing hardcoded presets array. HOT / OFFICIAL / category filter chips. Inline search across name and options. Skeleton loading state with shimmer animation, error/retry state. AbortController cancels in-flight requests on unmount.
- `frontend/src/components/create-poll/MyPollsStep.tsx` — Screen 08 redesign: 44×44 emoji avatar card, kebab ⋯ menu (delete), footer publish CTA with С именем / Анонимно choice flow, green dot / 🌍 badge for public templates, Снять (unpublish) button when already public.

### Fixed
- `frontend/src/components/create-poll/HomeStep.tsx` — Terminology updated: "Выбрать шаблон" (not "Выбрать тему"), "Мои шаблоны" (not "Мои тир-листы"), consistent with templates concept throughout.

### Tests
- `server/src/__tests__/templates.test.ts` — 5 tests: GET /api/templates (list with HOT/uses_7d, empty array), POST /api/templates/:id/use (400 invalid UUID, 404 not found, 200 ok + INSERT verified).

## [1.0.5.7] - 2026-05-24

### Added
- `server/src/routes/publicPolls.ts` — **Public polls catalog**: `GET /api/public-polls` searches public templates by name (ILIKE, up to 30 results, `pg_trgm` GIN index); `POST /api/public-polls/:id/use` clones a template into a new group session in a single atomic transaction (BEGIN → SELECT FOR UPDATE → createSession → INSERT options → uses_count++ → COMMIT).
- `server/src/routes/savedPolls.ts` — `POST /api/saved-polls/:id/publish` and `POST /api/saved-polls/:id/unpublish` let template owners toggle public visibility. Publish accepts `show_author` boolean; when false, `author_name` is stored as `NULL` and served via `CASE WHEN show_author THEN author_name ELSE NULL END` in the catalog query.
- `server/src/lib/sessions.ts` — `createSession` extracted into a shared helper; accepts an optional transactional `PoolClient` so the session INSERT participates in an outer transaction rather than committing independently via pool.
- `frontend/src/components/PublicPollsStep.tsx` — New step: search input (debounced 350 ms), scrollable template list, one-tap "Взять" button to clone and navigate to OptionsStep. Error message suppresses empty state when API call fails.
- `frontend/src/components/HomeStep.tsx` — "🌍 Публичные опросы" button navigates to PublicPollsStep.

### Security
- `server/src/routes/savedPolls.ts` — `show_author` now defaults to `false` (anonymous) via strict `=== true`; previously `!== false` would treat non-boolean values (e.g. string `"false"`) as `true`, leaking author names.
- Per-route rate limits: `GET /api/public-polls` (20/min), `POST /api/public-polls/:id/use` (10/min), `POST /api/saved-polls/:id/publish` (5/min), `POST /api/saved-polls/:id/unpublish` (5/min).
- `GET /api/public-polls` LIMIT clamped to `[1, 30]` to prevent negative values reaching PostgreSQL.

### Fixed
- `server/src/routes/publicPolls.ts` — Session INSERT now participates in the outer transaction; previously a DB error during options INSERT would leave an orphaned session with no options, blocking the group from starting new sessions.

### Tests
- `server/src/__tests__/publicPolls.test.ts` — 22 new tests covering: GET catalog (search, limit cap, `option_count`, author privacy), POST /use (success, 404, 409, DB error), publish/unpublish (show_author variants, 404, default), GET saved-polls `is_public` field, `createSession` 23505 race-condition fallback (3 scenarios).

## [1.0.5.6] - 2026-05-23

### Fixed
- `frontend/src/App.tsx` — **Mini App blank screen / "No active session" error** for users opening the app directly from the bot without an active session. Root cause: `fetchActiveSession()` 404 was detected with `String(err).includes('404')`, which matched old plain-string errors but never matches `ApiError.message` (which is the server's `body.error` value, e.g. `"No active session"`). Fix: replaced both status-string checks in App.tsx with `err instanceof ApiError && err.status === 404/403`.
- Same regression applied to `handleSubmit`: a 403 "session closed" response during tier-list submission was not caught and fell through to the generic error display instead of redirecting to live results.

### Tests
- `server/src/__tests__/sessions.test.ts` — strengthened `GET /api/sessions/active` 404 test to assert `body.error === 'No active session'`, with a regression comment explaining the `ApiError.message` vs status code contract.

## [1.0.5.5] - 2026-05-23

### Added
- `frontend/src/components/create-poll/OptionsStep.tsx` — **Share button** in the nav row of the OptionsStep screen. When a session is in `collecting` status, a "Поделиться" button appears; tapping it copies the session link to the clipboard so other participants can add their own options before voting starts. Button turns green with a "✓ Скопировано" label for 2.5 s after a successful copy.
- `frontend/src/components/CreatePoll.tsx` — `shareUrl` state threaded from every session-creation path (`handleCreateCustom`, `loadOptionSet`, `handleAiConfirmBlankCanvas`) through to `OptionsStep`.
- `server/src/routes/sessions.ts` — `POST /api/sessions` now returns `share_url` alongside `id` in both 201 and 409 responses so the client can display the share button immediately without an extra round-trip.

### Fixed
- `frontend/src/components/CreatePoll.tsx` (`handleAiConfirmBlankCanvas`) — missing 409 catch caused `shareUrl` to remain null when an existing session was re-used via the AI blank-canvas path, hiding the share button. Now mirrors the guard used by the other create paths.

## [1.0.5.4] - 2026-05-23

### Refactor
- `frontend/src/` — migrated all components from inline `style={{}}` objects to co-located CSS Modules (`*.module.css`). 11 new module files created; 11 TSX files updated. Only truly dynamic values (progress widths, tier colors from JS variables, drag ghost pixel coordinates, state-driven opacity) remain as inline styles. Static layout, spacing, typography, and color are now in CSS classes.

## [1.0.5.3] - 2026-05-23

### Fixed
- `frontend/src/api/client.ts` — structured `ApiError` class preserves HTTP status and parsed JSON body (including `id` field from 409 responses); all fetch helpers use a shared `throwOnError()` instead of ad-hoc `if (!res.ok)` text throws.
- `frontend/src/components/CreatePoll.tsx` — 409 "session already exists" responses now redirect to the existing session (using `err.body.id`) instead of showing a raw error string. Affects both `handleCreateCustom` and `loadOptionSet`.
- `server/package.json` — downgraded `@fastify/rate-limit` from `^10.3.0` to `^9.1.0`; v10 requires Fastify 5.x but the server runs Fastify 4.28.1 (`FST_ERR_PLUGIN_VERSION_MISMATCH` on Railway deployment).

### Tests
- `server/src/__tests__/sessions.test.ts` — added `qMocks()` helper: SQL-substring-matching mock router that routes each `pool.query()` call to the first pending expectation whose `match` string appears in the SQL, then splices it out. Order-independent and robust to query reordering. Migrated GET /sessions/:id, POST /vote, POST /results, POST /close to use `qMocks()` instead of fragile positional `mockResolvedValueOnce` chains (252 tests, all passing).

### Docs
- `CONTRIBUTING.md` — new file covering: env setup, schema auto-init, dev bypass (`x-init-data: dev` / `dev-chatless`), test runner, `qMocks` / `mockClient` mock patterns, project structure, architecture notes (session lifecycle, auth, ownership, TOCTOU safety).

## [1.0.5.2] - 2026-05-23

### Security
- `index.ts` — rate limiting added via `@fastify/rate-limit`: 100 req/min global (keyed by IP), 3 req/min on `POST /api/ai/generate-options`. Rate-limit key is IP-only; never derived from unvalidated `x-init-data` header.
- `index.ts` — CORS restricted to `ALLOWED_ORIGIN` env var in production; server warns on startup when unset. Previously `origin: true` allowed any origin.
- `sessions.ts` — `creator_user_id` ownership checks added to all session mutation endpoints: `PATCH /:id`, `DELETE /:id`, `POST /:id/close`, `POST /:id/options`, `PUT /:id/options`. Non-creators receive 403. Sessions without a `creator_user_id` (legacy rows) are exempt.
- `sessions.ts` — `POST /options` option-count check and insert wrapped in a `BEGIN … SELECT … FOR UPDATE … INSERT … COMMIT` transaction to eliminate TOCTOU race. Previously two concurrent requests at 31/32 options could both pass the count guard and yield 33 options.
- `sessions.ts` — `PATCH /:id` UPDATE query restored `AND status = 'collecting'` guard that was silently dropped when the endpoint was refactored from a single atomic UPDATE to a SELECT + UPDATE pattern.
- `schema.sql` — `creator_user_id BIGINT` column added (idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS`); indexes on `options(session_id)` and `user_results(session_id)` added.
- `bot.ts` — `creator_user_id` now stored at session creation via `/newpoll` command (`ctx.from?.id ?? null`).

### Removed
- `bot.ts` — legacy bot commands `/startsession`, `/addoption`, `/vote`, `/closesession` and helper `escapeMarkdown` deleted; all superseded by `/newpoll` + Mini App flow.

### Refactored
- `lib/constants.ts` — new shared constants file exports `MAX_NAME_LENGTH` (100), `MAX_OPTION_TEXT_LENGTH` (100), `MAX_OPTIONS` (32); imported by `sessions.ts` and `savedPolls.ts` to replace scattered magic numbers.

### Tests
- `sessions.test.ts` — 4 new 403 tests covering ownership checks on PATCH, DELETE, POST /close, PUT /options; `POST /options` tests updated to mock `pool.connect()` transaction pattern (252 tests total).
- `tournament.test.ts` — S/A/B/C tier count assertions added to N=4, N=6, N=8, N=12, N=32 full-run tests.

## [1.0.5.1] - 2026-05-23

### Security
- `initData.ts` — `auth_date` freshness now validated: initData older than 24 hours is rejected with 401 per Telegram docs. Previously captured initData tokens were permanent credentials.
- `savedPolls.ts` — individual option content validated on `POST /api/saved-polls` and `PUT /api/saved-polls/:id`: each option must be a non-empty string ≤ 100 characters. Previously oversized strings could be stored in the JSONB column without limit.
- `bot.ts` — session names in legacy `/startsession` command are now passed through `escapeMarkdown()` before insertion into `parse_mode:'Markdown'` messages. Names containing `_` or `*` no longer break Telegram formatting.

### Fixed
- `GET /api/sessions/:id/options` now returns 404 for unknown session IDs instead of an empty array. Callers can now distinguish "session has no options" from "session doesn't exist".
- `@keyframes gtPulse` added to `frontend/src/index.css` — the "someone is editing" pulse animation in `OptionsStep` and `LiveResults` was rendering static (keyframe was referenced but never defined).

### Tests
- New test: `GET /api/sessions/:id/options` returns 404 for unknown session (248 tests total).

## [1.0.5.0] - 2026-05-20

### Added
- **Bot card images** — all bot messages are now 600×220 PNG photo cards generated with `@napi-rs/canvas` instead of plain text.
  - `generateVotingCard(name, optionCount)` — red-gradient card with poll name, option count, and estimated voting time.
  - `generateSetupCard()` — red-gradient card for the `/newpoll` setup flow.
  - `generateWinnerCard(name, winner)` — gold-gradient card announcing the poll winner.
- `server/src/bot/imageCard.ts` — all canvas drawing logic isolated in one file; calls `GlobalFonts.loadSystemFonts()` at first use with a non-fatal warn on failure.
- `server/src/bot/cards.ts` — message builders (`buildVotingCard`, `buildSetupCard`, `buildWinnerCard`, `buildVotingCaption`, `optionEmoji`) that compose image + caption + `reply_markup` into a single return value consumed by both bot commands and REST routes.
- `nixpacks.toml` — adds `freefont_ttf` and `fontconfig` Nix packages for Railway Nixpacks deployments so system fonts are available for canvas text rendering.
- 25 new unit tests in `cards.test.ts` covering captions, winner card logic, emoji mapping, and keyboard grid layout (135 tests total).

### Changed
- `/newpoll` bot command: replies with `sendPhoto` (setup card + "⚙️ НАСТРОИТЬ ГОЛОС" URL button) instead of plain text.
- `/vote` legacy command: replies with `sendPhoto` (voting card + options grid + vote URL button) instead of plain text.
- `/closesession` legacy command: replies with `sendPhoto` (winner card) instead of plain text.
- `POST /api/sessions/:id/vote`: sends voting card photo via `bot.api.sendPhoto`; `message_id` stored from photo message for caption updates.
- `POST /api/sessions/:id/results`: updates live progress via `editMessageCaption` (vote count + %) instead of `editMessageText`.
- `POST /api/sessions/:id/close`: sends winner card photo via `bot.api.sendPhoto`.
- Inline option grid buttons (callback_data `_`) now always answer immediately via a catch-all `callback_query:data` handler, preventing Telegram's 30-second spinner.

### Fixed
- `buildVotingCaption` guards against NaN from malformed DB values using `Math.trunc() || 0`.
- `buildWinnerCard` throws immediately on empty borda array instead of crashing at `borda[0]`.

## [1.0.4.3] - 2026-05-19

### Changed
- Maximum options per session increased from **12 to 32** across all enforcement points: `POST /api/sessions/:id/options`, `PUT /api/sessions/:id/options`, `POST /api/saved-polls`, `PUT /api/saved-polls/:id`, the Telegram bot `/addoption` command, and the frontend add-option button.
- Error messages and bot replies updated to reflect the new limit ("Max 32 options reached", "Up to 32 options").

### Fixed
- Tier distribution now scales proportionally with option count. Previously, 87.5% of 32 options landed in C tier (only the final and semifinal losers escaped it). The new formula gives A to the top `ceil(N/4)` rounds from the final and B to the next `ceil(N/2)` rounds, keeping ≈75% in C regardless of N — the same proportion as at N=12. Backward-compatible for N≤16.

### Added
- 12 new tests: 10 for `savedPolls` routes (create, update, max-32 boundary) and 2 for tier distribution at N=12 (backward compat) and N=32 (proportional bucketing). 110 tests total.

## [1.0.4.2] - 2026-05-19

### Performance
- Selecting a preset or saved poll now loads options in **one server round-trip** instead of up to 22 sequential requests (≤12 DELETE + ≤8 POST). New `PUT /api/sessions/:id/options` endpoint replaces all options atomically in a single PostgreSQL transaction, eliminating the 3–6 second blocking overlay on slow Telegram connections.

### Added
- `PUT /api/sessions/:id/options` bulk-replace endpoint: accepts an options array and optional name, deletes existing options and inserts the new set in one transaction. Validates option count (≤12), text length (≤100 chars), name length (≤100 chars), and deduplicates case-insensitively.
- 10 new tests for the PUT endpoint covering: atomic replace, name update, empty array, case-insensitive dedup, max-options 422, option text 400, name-too-long 400, not-collecting 403, session-not-found 404, and transaction rollback (98 tests total).

### Fixed
- Selecting a preset while options were loading no longer shows a raw `Error: 422: {"error":"Max 12 options reached"}` — the UI navigates to the options screen immediately on tap, so errors appear there with a friendlier message.
- Race condition when two group members select presets simultaneously: the client now syncs the current server option list before clearing, avoiding stale-read conflicts that left 13+ options on the server.
- Session closed mid-vote: tapping "Submit my picks" on a closed session now silently redirects to the group results screen instead of showing `Error: 403: {"error":"Session is closed"}`.
- `busyRef` is now set synchronously when loading a preset, closing a render-gap race where the 2.5-second options poller could fire and overwrite `setOptions([])` mid-load.
- Preset/saved-poll selection restores the originating step (presets or my-polls) on error instead of stranding the user on an empty options screen.
- Bulk-inserted options now use `clock_timestamp()` per row, preserving insertion order under `ORDER BY created_at` (previously all rows in a batch shared the same transaction-level timestamp).

## [1.0.4.1] - 2026-05-19

### Fixed
- CHANGELOG button label corrected: "Вернуться к вариантам" (not "Попробовать снова") — the button navigates back to options, not auto-retries.
- Error message for maximum options now uses the `MAX_OPTIONS` constant rather than a hardcoded `'12'`, ensuring message and limit stay in sync.

### Added
- Test coverage expanded from 76 → 87 tests: `buildVoteUrl` unit tests, `POST /results` validation paths (non-array, invalid option, duplicates, session-not-found), `PATCH /sessions` empty-name guard, `POST /vote` and `DELETE /options` 404 paths.
- [saved-polls-item-validation] logged to TODOS.md: saved-polls API needs per-item option validation.

## [1.0.4.0] - 2026-05-19

### Fixed
- Tournament bracket bug: multi-round tournaments (5+ options) were assigning wrong winners in rounds 2+ due to a stale round-winner reconstruction approach. Server `tournament.ts` is now synced with the frontend version using an explicit `currentRoundWinners` accumulator. Verified with N=8 (3 rounds) and N=6 (3 rounds with byes) regression tests.
- Tournament tier assignments were wrong for odd-N polls (N=3, N=7): the `numRounds` formula used `+` instead of `−` when accounting for bye slots, shifting all loser tiers one level lower than intended. Fixed in both server and frontend copies.
- Voting start retry screen: clicking "Вернуться к вариантам" now correctly resets the busy state, re-enabling all option controls. Previously, `busy` stayed `true` while the original request was still in-flight, leaving the options step with every button disabled until the server responded.
- `my_result` lookup in GET `/api/sessions/:id` now uses strict string comparison (`String(r.user_id) === String(userId)`) instead of loose `==`. PostgreSQL returns BIGINT columns as strings; the old loose equality could produce wrong results for large Telegram user IDs approaching 2^53.

### Changed
- "Мои опросы" button on the create-poll home screen is now hidden for users with no saved polls, eliminating a dead button for new users. Preset selection is now the primary call-to-action.
- Option text input on the poll setup screen now enforces the 100-character server-side limit in the browser, with a character counter that appears at 80 characters and turns red at the limit.
- Retry button on the voting-start timeout screen relabeled from "Назад к вариантам" to "Вернуться к вариантам" (navigates back to the options step rather than retrying automatically, avoiding a 409 if voting is already in-flight).

### Added
- Regression tests for multi-round tournament bracket traversal (N=8: pure power-of-2; N=6: with byes).
- Security and correctness findings from adversarial review logged to TODOS.md (auth ownership checks, auth_date expiry, options TOCTOU race, Markdown injection).

## [1.0.3.2] - 2026-05-18

### Fixed
- Option numbers (1, 2, 3…) no longer disappear on the poll setup screen — map index was missing from the options list renderer.
- Test suite mock queue isolation: switched to `vi.resetAllMocks()` so queued mock return values from one test cannot bleed into the next.

### Changed
- Poll setup UI split into focused sub-components (`HomeStep`, `PresetsStep`, `MyPollsStep`, `OptionsStep`) — same UX, easier to maintain.
- `buildVoteUrl` extracted into a shared `server/src/lib/urls.ts` module, eliminating duplicate implementations in the route handler and bot.
- `DEFAULT_SAVE_EMOJI` and `EMOJI_PRESETS` now come from a single `constants.ts` — removed duplicate local declarations.
- `MAX_NAME_LENGTH` (100), `MAX_OPTION_TEXT_LENGTH` (100), and `MAX_OPTIONS` (12) extracted as named constants in the session routes.
- GET `/api/sessions/:id` parallelizes 4 DB queries instead of 5; POST `/api/sessions/:id/results` parallelizes Borda fetch and voter count; bot inline query parallelizes user result and session lookups.

### Added
- Test coverage expanded from 58 → 74 tests: all session routes now covered including DELETE options, POST close, GET options, PATCH name, and POST results success/error paths. Also covers the pg BIGINT→string loose equality path for `my_result`.

## [1.0.3.1] - 2026-05-18

### Changed
- Shared `EMOJI_PRESETS` constant between CreatePoll and LiveResults (removed duplication).
- Frontend polls options at 3 s instead of 2 s to reduce server load.
- GET `/api/sessions/:id` no longer issues a redundant separate query for the current user's result — fetched in the same parallel batch.

## [1.0.3.0] - 2026-05-17

### Added
- Any poll participant can now save the poll as a reusable template directly from the results screen, after submitting their tier list.
- "💾 Сохранить" button on LiveResults screen expands an inline form with a name input and 32-emoji icon picker.
- sessionStorage dedup guard: re-visiting the results screen shows "Сохранено ✓" if the template was already saved this session.

## [1.0.2.0] - 2026-05-17

### Added
- Saved poll templates: save any custom poll with a name, options list, and emoji icon for reuse via "Мои опросы".
- Emoji picker grid (32 options) for choosing a template icon when saving a poll.
- 5 new preset categories: Сериал, Музыка, Отдых, Досуг, Напитки (8 presets total).
- Back button on the options step to return to the home screen.
- `DELETE /api/sessions/:id/options/:text` endpoint to remove options while collecting.
- Full saved-polls CRUD API: `GET/POST /api/saved-polls`, `PUT/DELETE /api/saved-polls/:id`.

### Changed
- CreatePoll home screen now shows "Мои опросы" button alongside preset categories.
- CreatePoll now has a 5-step flow: home → presets / my-polls → options → starting.

## [1.0.1.0] - 2026-05-16

### Added
- Drag chips between tier rows (A/B/C) on the TierList screen before submitting your picks. Hold a chip and drag it to a different tier to rearrange. Works with touch and mouse via pointer events.

### Changed
- TierList now passes the user's final (potentially reordered) list to the server on submit, rather than the raw tournament output.
- TierBlockLetter updated to 56×56px / 35px font per design spec.

## [1.0.0.0] - 2026-05-15

### Added
- Initial release: pairwise tournament voting, single-elimination bracket, S/A/B/C tier list, Borda count group results, Telegram Mini App integration.
