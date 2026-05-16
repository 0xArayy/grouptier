# GroupTier TODOs

## Remaining

### [drag-to-rearrange] Implement drag-to-rearrange on personal tier list
**What:** After the tournament completes, let users drag items between tiers before submitting.
**Why:** The TierMaker format is viral specifically because of the drag-and-arrange moment — static display is less shareable.
**Context:** Cut from MVP because dnd-kit on Telegram's WebView has known vertical-drag vs swipe-to-close conflicts. Needs mobile-specific testing in Telegram's WebView (not just a browser). Start with `@dnd-kit/core` and test drag direction carefully.
**Depends on:** Deploy to Railway and test on real mobile first.

---

## Completed

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
