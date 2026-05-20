# Changelog

All notable changes to GroupTier are documented here.

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
