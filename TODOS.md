# GroupTier TODOs

## Post-Hackathon

### [drag-to-rearrange] Implement drag-to-rearrange on personal tier list
**What:** After the tournament completes, let users drag items between tiers before submitting.
**Why:** The TierMaker format is viral specifically because of the drag-and-arrange moment — static display is less shareable. This was Approach B's core differentiator.
**Context:** Cut from MVP because dnd-kit on Telegram's WebView has known vertical-drag vs swipe-to-close conflicts. Needs mobile-specific testing in Telegram's WebView (not just a browser). Start with `@dnd-kit/core` and test drag direction carefully.
**Depends on:** Core comparison + results flow stable. Deploy to Railway and test on real mobile first.

### [ux-edge-states] Loading, empty, and offline state handling
**What:** Three P2 UX states currently return a blank screen: (1) loading skeleton between comparison taps while the next pair fetches, (2) empty state if a user opens the Mini App before any options have been added, (3) offline banner if network is unavailable when the user taps a comparison choice.
**Why:** These states will be encountered by real users immediately post-hackathon. They're not demo-blocking but will look unfinished and cause user confusion in production.
**Context:** Error state (API timeout on comparison submit) is P1 — must be in MVP: catch fetch rejection, show toast "Failed to save — tap to retry", re-enable the tapped card. The three P2 states here are quick CSS/JSX additions: skeleton = gray placeholder card, empty = centered text, offline = top banner.
**Effort:** S (human: ~1h / CC: ~15min for all three)
**Priority:** P2 (P1 for Error state — ship with MVP)
**Depends on:** Comparison flow stable.

### [presets] Session option presets for common decision types
**What:** `/startsession --food` pre-loads 8 food options. Similar presets for games, music, etc.
**Why:** Typing `/addoption` 6-8 times is tedious in demos and real use. Presets reduce setup friction to zero for common decision types. Makes the demo even faster.
**Context:** Bot command needs argument parsing (`grammy` supports this via filters). Presets are just hardcoded option arrays in the bot file. Start with 3 presets (food, games, movies). Can also be added to the Mini App CreatePoll screen as quick-fill buttons (front-end only, no API cost).
**Depends on:** Bot command handling stable. In-app poll creation shipped.

### [vote-rollback-safety] Harden POST /api/sessions/:id/vote rollback on sendMessage failure
**What:** The /vote route flips session status to 'voting', then calls `bot.api.sendMessage`. On failure, it does a second UPDATE to roll back to 'collecting'. If the rollback UPDATE also fails (transient DB error), the session is stuck in 'voting' with no vote message in the group.
**Why:** Low probability but non-zero. A stuck 'voting' session is recoverable only via `/closesession` manually.
**Context:** Fix options: (a) add a `message_sent BOOLEAN DEFAULT false` column — flip to true only after sendMessage succeeds; on load, treat `status='voting' AND message_sent=false` as effectively 'collecting'. Or (b) retry the rollback 3x with backoff. Option (a) requires a schema migration. Option (b) is a simpler code change.
**Priority:** P3 (post-MVP hardening)
**Depends on:** In-app poll creation shipped.

### [collecting-session-cleanup] Clean up stranded 'collecting' sessions
**What:** Sessions created via Mini App but abandoned before "Start Voting" stay in 'collecting' status forever. No user sees them; they just accumulate in the DB.
**Why:** Unbounded growth over time. Also: if the 409 guard (one active session per chat) is in place, a stranded session blocks new session creation in that chat.
**Context:** Simple cron or startup cleanup: `DELETE FROM sessions WHERE status='collecting' AND created_at < NOW() - INTERVAL '24 hours'`. No schema change needed. Could run on server startup (idempotent) or as a scheduled job.
**Priority:** P3
**Depends on:** In-app poll creation shipped.
