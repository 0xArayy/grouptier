# Changelog

All notable changes to GroupTier are documented here.

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
