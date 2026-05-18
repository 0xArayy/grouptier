# Changelog

All notable changes to GroupTier are documented here.

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
