<!-- /autoplan restore point: /Users/aray/.gstack/projects/test/main-autoplan-restore-20260517-172918.md -->
# Plan: Save Poll Template from Results Screen

**Feature:** `save-template-from-results`
Branch: main | Author: aray

## Problem

After any participant completes the tier list and submits their picks, they land on the LiveResults screen. At that point they have no way to save the poll's options as a reusable template in "Мои опросы". Only poll creators can currently save templates (via the CreatePoll flow's save button). Participants who enjoyed a poll and want to run it again in another group are stuck re-typing all the options.

## Solution

Add a "Сохранить шаблон" (Save template) button to the LiveResults screen footer. It appears only after the current user has submitted their tier list (`submitted === true` in App.tsx). On tap, an inline form expands with the session name pre-filled and a compact emoji picker. On confirm, calls `POST /api/saved-polls` with the session's name and options. The button then shows a "Сохранено ✓" success state.

## User Flow

1. Participant completes pairwise comparisons → TierList screen
2. Taps "Submit my picks" → LiveResults screen (`submitted = true`)
3. Footer shows: `[↗ Share]` `[💾 Сохранить]` `[🔒 Close & announce]`
4. Taps "💾 Сохранить" → inline form expands below footer:
   - Name input (pre-filled with `session.name`)
   - Compact emoji picker (reuse `EMOJI_PRESETS` from CreatePoll.tsx)
   - `[Сохранить шаблон]` + `[Отмена]`
5. Confirm → API call → button collapses, shows "Сохранено ✓" (disabled)
6. Error → brief inline error text, button re-enabled

## Scope

### In scope
- New "Save template" button on LiveResults, visible only when `submitted === true`
- Inline expand/collapse form with name field + emoji picker
- Calls existing `POST /api/saved-polls` endpoint (no backend changes)
- Success / error states
- Works for any participant including the creator

### Out of scope
- Checking for duplicate templates (let users save multiple copies)
- Editing name inline before saving (they can edit in Мои опросы)
- Showing the save button on TierList before submission
- Any backend changes

## Technical Plan

### Files to change

**`frontend/src/components/LiveResults.tsx`**
- Add props:
  - `onSaveTemplate?: (name: string, emoji: string) => Promise<void>`
  - `sessionId?: string` — for sessionStorage key
  - `initialSaved?: boolean` — App.tsx checks sessionStorage on mount, passes result here
- Add local state: `showSaveForm`, `saveName`, `saveEmoji`, `saving`, `saved` (init from `initialSaved`), `saveError`
- Inline EMOJI_PRESETS constant (32 emoji, same list as CreatePoll.tsx)
- Render save button in footer (only when `onSaveTemplate` is defined)
- Render save form as sibling div **above** footer (see Design Notes)
- Name input: `maxLength={100}`

**`frontend/src/App.tsx`**
- Compute `initialSaved` on mount:
  ```typescript
  const userId = getUserId();
  const initialSaved = sessionId
    ? sessionStorage.getItem(`saved-tmpl-${userId}-${sessionId}`) === '1'
    : false;
  ```
- Add handler:
  ```typescript
  async function handleSaveTemplate(name: string, emoji: string) {
    const opts = session?.options ?? []; // snapshot — prevents polling race
    await createSavedPoll(name, opts.map(o => o.trim()).filter(Boolean), emoji);
    sessionStorage.setItem(`saved-tmpl-${getUserId()}-${sessionId}`, '1');
  }
  ```
- Pass to LiveResults: `onSaveTemplate={submitted ? handleSaveTemplate : undefined}`, `sessionId={sessionId ?? undefined}`, `initialSaved={initialSaved}`

**`frontend/src/api/client.ts`**
- No changes needed — `createSavedPoll` already exists

**Backend**
- No changes needed — `POST /api/saved-polls` already validates 2-12 options and requires initData auth
- Note: individual option string length is not validated server-side; client-side trim/filter above is the mitigation

### Architecture diagram
```
App.tsx
  state: session (SessionData), submitted, sessionId
  │
  ├── mount: check sessionStorage → initialSaved bool
  │
  ├── handleSaveTemplate(name, emoji) → async
  │     const opts = session?.options ?? []  // snapshot before await
  │     createSavedPoll(name, opts.trimmed, emoji)
  │     sessionStorage.setItem('saved-tmpl-{userId}-{sessionId}', '1')
  │
  └── LiveResults
        props: sessionName, onSaveTemplate, sessionId, initialSaved
        state: showSaveForm, saveName, saveEmoji, saving, saved, saveError
        │
        ├── save form (sibling above footer, maxHeight transition)
        │     name input (maxLength=100)
        │     emoji grid (EMOJI_PRESETS 32 items)
        │     confirm → onSaveTemplate(name, emoji)
        │     cancel → reset saveName/saveEmoji to defaults
        │
        └── footer: [↗ Share] [💾 Сохранить|Сохранено ✓] [🔒 Close]
```

### Edge cases
| Case | Handling |
|------|----------|
| session.name is null/empty | Pre-fill with "Мои опрос" (fallback) |
| options.length < 2 | Can't happen — session must have ≥2 options to reach voting |
| options.length > 12 | Can't happen — API enforces max 12 on creation |
| Duplicate template | Allowed — API doesn't dedup, sessionStorage prevents same-user re-save |
| API error | Show inline error text, re-enable confirm button |
| User taps confirm twice | `saving` flag disables button during API call |
| Polling updates session mid-save | Options snapshotted before await — race-safe |
| Shared device / different Telegram user | sessionStorage key includes userId — safe |
| Name field XSS | Input is React-controlled string, rendered as text node — safe |
| Cancel after editing name | saveName/saveEmoji reset to defaults on cancel |

## Affected Tests

- `server/src/__tests__/sessions.test.ts` — no changes (no new routes)
- No new server tests needed (existing saved-polls coverage handles POST)
- Frontend: no automated tests currently exist; manual QA is the path

## Design Notes (updated after Phase 2 review)

### Viewport fix (CRITICAL)
LiveResults has no scroll container. The save form must render **above** the footer (as a sibling `<div>` inserted between `tierRows` and `footer`), not below it. The `container` style needs `overflow-y: auto` to handle tall content. Without this, the expanded form pushes off-screen with no scroll affordance.

### Save button in footer
Footer has three buttons when user has submitted: `[↗ Share]` `[💾 Сохранить]` `[🔒 Close]`. Each gets `flex: 1`. `Сохранить` uses Secondary Button spec (var(--surface) bg, var(--accent) text, border-radius: 10px, minHeight: 48px). When `saved === true`, replace with grayed-out "Сохранено ✓" (`opacity: 0.7`, no cursor pointer).

### Save form (above footer)
```
┌─────────────────────────────────────────────┐
│ [name input, pre-filled with session.name]  │
│                                             │
│ [🍕][🍺][🎮][🎬][📺][🎵][🏖️][🎯]           │
│ [🎲][🏆][🎉][🔥][⭐][💡][🎭][🎨]           │
│ [🌍][🏅][🎸][🍜][🧩][🚀][💎][🎪]           │
│ [🍔][🥂][🎳][📸][🌮][🎤][🎺][🃏]           │
│                                             │
│ [Сохранить шаблон]  [Отмена]               │
└─────────────────────────────────────────────┘
```
- Background: var(--surface), border-radius: var(--radius-md), padding: 12px 14px
- Form renders with CSS `height` transition (0 → auto not animatable; use `maxHeight` transition: `0 → 400px`, `overflow: hidden`, `transition: max-height 0.2s ease`)
- Confirm button: Primary Button spec (bg: var(--accent), color: #fff, border-radius: 10px, minHeight: 48px)
- Cancel: Secondary Button (var(--surface), var(--accent), border-radius: 10px)
- Emoji cells: `~36px` each, 8/row, wrapped, no independent scroll
- Selected emoji cell: `background: var(--bg)`, outline: `2px solid var(--accent)`

### State machine
| State | saveBtn label | Form visible | Confirm disabled |
|-------|--------------|--------------|-----------------|
| idle | 💾 Сохранить | no | — |
| form-open | 💾 Сохранить | yes | no |
| saving | 💾 Сохранить | yes | yes (spinner or "Сохранение…") |
| saved | Сохранено ✓ (opacity 0.7) | no | — |
| error | 💾 Сохранить | yes (error text shown) | no |
| already-saved (sessionStorage) | Сохранено ✓ (opacity 0.7) | no | — |

### Missing states resolved
- **Cancel-then-reopen:** `saveName` and `saveEmoji` reset to defaults on cancel (session.name + '📝')
- **Already saved (sessionStorage):** on mount, check `sessionStorage.getItem('saved-template-{sessionId}')`. If present, start in `saved` state
- **API 400 error:** treat same as 500 — show inline error, re-enable confirm button
- **Form entrance:** `maxHeight` CSS transition (200ms ease), no JS animation needed

### Design system alignment
- Confirm button: `border-radius: 10px` (Primary Button spec), not `var(--radius-md)` (8px)
- "Сохранено ✓": `opacity: 0.7` (not 0.5 — avoids WCAG contrast failure on dark Telegram themes)

---

## GSTACK REVIEW REPORT

<!-- /autoplan review — auto-generated, do not edit by hand -->

### Phase 1: CEO Review

**Dual voices:** Claude subagent ✓ | Codex [codex-unavailable: binary not found]

**CEO DUAL VOICES — CONSENSUS TABLE:**
```
═══════════════════════════════════════════════════════════════
  Dimension                           Claude   Codex  Consensus
  ─────────────────────────────────── ──────── ────── ──────────
  1. Premises valid?                   ✓ YES    N/A   PARTIAL
  2. Right problem to solve?           ✓ YES    N/A   YES
  3. Scope calibration correct?        ✓ YES    N/A   YES
  4. Alternatives sufficiently explored? ✓ YES  N/A   YES
  5. Competitive/market risks covered? N/A      N/A   N/A
  6. 6-month trajectory sound?         ✓ YES    N/A   YES
═══════════════════════════════════════════════════════════════
```

**Premise Challenge (0A):**
- P1 ✓ — Only poll creators can currently save templates (frontend-gated; verified in CreatePoll.tsx flow)
- P2 ✓ — Participants land on LiveResults after submitting (confirmed in App.tsx screen flow)
- P3 CONFIRMED by user — Button on LiveResults (post-submit), not TierList
- P4 ✓ — No backend changes needed; POST /api/saved-polls accepts any authenticated user
- P5 AMENDED — Add sessionStorage guard to prevent duplicate saves on component remount

**Existing Code Leverage Map (0B):**
| Sub-problem | Existing code |
|-------------|---------------|
| Save API call | `createSavedPoll()` in `client.ts:85` |
| Emoji picker data | `EMOJI_PRESETS[]` in `CreatePoll.tsx:22` |
| Session name+options | `session.name` + `session.options` in `App.tsx` state |
| Submit state tracking | `submitted` boolean in `App.tsx:53` |
| Button pattern in footer | `onShare` / `onClose` props in `LiveResults.tsx` |

**Dream State Delta (0C):**
```
CURRENT     → participants finish voting, can't save the poll
THIS PLAN   → any participant can save the poll as a template after submitting
12M IDEAL   → personal template libraries, shared/discovered templates between users
```
This plan covers ~60% of the stickiness goal. Remaining 40%: template discovery, sharing, ratings — all 12-month items.

**Scope Decisions (0D):**
| # | Proposal | Decision | Principle |
|---|----------|----------|-----------|
| CEO-1 | Button on TierList (pre-submit) instead of LiveResults | REJECTED — user confirmed LiveResults | User gate |
| CEO-2 | sessionStorage guard to prevent re-saves on revisit | ACCEPTED | P1 completeness |
| CEO-3 | Footer state machine design before landing | DEFERRED to TODOS.md | P3 pragmatic |

**Error & Rescue Registry:**
| Error | Trigger | User sees | Fix |
|-------|---------|-----------|-----|
| API 500 | DB down | Inline error text | Retry button (re-enable save) |
| Network error | No connection | Offline banner already shown | Inline error text also |
| API 401 | Opened outside Telegram | "Open from Telegram" message | N/A for this feature |

**Failure Modes Registry:**
| Mode | Severity | Mitigation |
|------|----------|------------|
| User saves duplicate on revisit | Low | sessionStorage key by session ID |
| Footer gets too crowded with 3 buttons + form | Medium | TASTE DECISION → flagged for design phase |
| session.name is null | Low | Fallback to "Мои опрос" |

**NOT in scope (deferred):**
- Template deduplication logic
- Button on TierList (pre-submit)
- Showing templates in a bottom sheet (vs inline expand)
- Footer state machine design
- Template sharing between users

**CEO Completion Summary:**
| Dimension | Status |
|-----------|--------|
| Premises | ✓ Valid (P3 confirmed by user, P5 amended) |
| Right problem | ✓ Yes — clear gap, zero backend risk |
| Scope | ✓ Tight and right |
| Alternatives | ✓ Placement confirmed; inline vs sheet = taste |
| 6-month trajectory | ✓ Builds template-library stickiness |
| Overall | **CLEAN** — 2 frontend files, no migrations |

---

### Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|---------|
| 1 | CEO | Button on LiveResults (not TierList) | Mechanical | User gate | User confirmed explicitly | TierList |
| 2 | CEO | Add sessionStorage guard vs no dedup | Mechanical | P1 completeness | 2 lines, prevents silent duplicates on revisit | No dedup |
| 3 | CEO | Inline expand vs bottom sheet | Taste | — | Surfaced at final gate | Bottom sheet |
| 4 | CEO | Footer state machine | Mechanical | P3 pragmatic | Out of scope, deferred | Blocking |

---

### Phase 2: Design Review

**Dual voices:** Claude subagent ✓ | Codex [codex-unavailable]

**DESIGN LITMUS SCORECARD:**
```
═══════════════════════════════════════════════════════════════
  Dimension                           Claude   Codex  Consensus
  ─────────────────────────────────── ──────── ────── ──────────
  1. Info hierarchy clear?             ⚠ MED    N/A   FLAGGED
  2. All interaction states specified? ✗ HIGH   N/A   FLAGGED
  3. Viewport/layout constraints ok?  ✗ CRIT   N/A   FLAGGED
  4. Design system aligned?           ⚠ MED    N/A   FLAGGED
  5. Implementer ambiguities resolved? ✗ HIGH  N/A   FLAGGED
  6. Motion/transitions defined?       ⚠ MED    N/A   PARTIAL
  7. Accessibility ok?                ⚠ MED    N/A   PARTIAL
═══════════════════════════════════════════════════════════════
All flags resolved by auto-decisions below. Phase 3 findings updated plan accordingly.
```

**Auto-decisions (Phase 2):**
| # | Finding | Severity | Decision | Principle |
|---|---------|----------|----------|-----------|
| D-5 | Form below footer → pushes off viewport | CRITICAL | Form renders above footer as sibling div | P5 explicit |
| D-6 | No scroll container in LiveResults | CRITICAL | Add `overflow-y: auto` to container | P5 |
| D-7 | Missing states (already-saved, cancel-reopen, 400 error, entrance anim) | HIGH | All states specified in Design Notes | P1 completeness |
| D-8 | Footer button flex ratio unspecified | HIGH | Save gets `flex: 1` (same as shareBtn) | P5 |
| D-9 | Form direction (sibling vs inside footer) | HIGH | Sibling div above footer | P5 |
| D-10 | border-radius 8px vs 10px conflict | MEDIUM | Confirm button uses Primary spec: 10px | P5 |
| D-11 | opacity 0.5 → contrast failure dark theme | MEDIUM | opacity: 0.7 | P5 |
| D-12 | Emoji picker scroll? | MEDIUM | 4 rows, free-wrap, no independent scroll | P5 simple |
| D-13 | Form entrance animation type | MEDIUM | maxHeight CSS transition 200ms | P5 |

**Design Completion Summary: 7/10** (pre-fix was 4/10)
All critical and high issues resolved by explicit spec additions in Design Notes.

---

### Phase 3: Eng Review

**Dual voices:** Claude subagent ✓ | Codex [codex-unavailable]

**ENG DUAL VOICES — CONSENSUS TABLE:**
```
═══════════════════════════════════════════════════════════════
  Dimension                           Claude   Codex  Consensus
  ─────────────────────────────────── ──────── ────── ──────────
  1. Architecture sound?               ⚠ CRIT   N/A   FLAGGED→FIXED
  2. Test coverage sufficient?         ✗ LOW    N/A   CONCERN
  3. Performance risks addressed?      ✓ YES    N/A   YES
  4. Security threats covered?         ✓ YES    N/A   YES
  5. Error paths handled?              ✓ YES    N/A   YES
  6. Deployment risk manageable?       ✓ YES    N/A   YES
═══════════════════════════════════════════════════════════════
```

**Architecture diagram:** See Technical Plan → Architecture diagram (added after eng review)

**Test diagram:**
```
New UX flows            Test type       Coverage
─────────────────────── ─────────────── ────────────────
Happy path (save)       Integration     MANUAL QA
Error path (API 500)    Component       MANUAL QA
Already-saved revisit   Component       MANUAL QA
Cancel + reopen reset   Component       MANUAL QA
Save hidden pre-submit  Component       MANUAL QA
Polling race (snapshot) Unit            MANUAL QA (hard)
```

**Test plan artifact:** `~/.gstack/projects/test/aray-main-test-plan-save-template-20260517-173849.md`

**Auto-decisions (Phase 3):**
| # | Finding | Severity | Decision | Principle |
|---|---------|----------|----------|-----------|
| E-1 | session.options closure could be stale under polling | CRITICAL | Snapshot opts before await in handleSaveTemplate | P5 explicit |
| E-2 | sessionStorage key collision across users on shared device | MEDIUM | Key = `saved-tmpl-{userId}-{sessionId}` | P5 explicit |
| E-3 | sessionId not passed to LiveResults for storage key | MEDIUM | Add `sessionId` + `initialSaved` props; App.tsx checks storage on mount | P5 |
| E-4 | Name field no length cap | MEDIUM | `maxLength={100}` on input; client-side trim in handler | P1 |
| E-5 | Option strings not validated/trimmed client-side | HIGH | `.map(trim).filter(Boolean)` before API call | P1 |
| E-6 | No test coverage for 6-state machine | LOW | Manual QA path; noted as concern | P3 pragmatic |

**Failure Modes Registry (final):**
| Mode | Severity | Status | Mitigation |
|------|----------|--------|------------|
| Polling race replaces session.options mid-save | Medium | FIXED | Snapshot pattern |
| Shared device sees wrong saved state | Medium | FIXED | userId in storage key |
| Silent duplicate save on revisit | Low | FIXED | sessionStorage guard |
| API 500 leaves form open with error | Low | FIXED | saveError state + re-enable |
| Name > 100 chars | Low | FIXED | maxLength input |
| Footer viewport overflow | Critical | FIXED (Phase 2) | Form above footer + overflow-y: auto |

**NOT in scope:**
- Server-side option string length cap (separate backend PR if needed)
- Frontend unit/integration tests (no test framework in repo)

**Eng Completion Summary:**
| Dimension | Status |
|-----------|--------|
| Architecture | ✓ Clean (3 props added, snapshot pattern, no new components) |
| Security | ✓ XSS: React text nodes; Auth: initData; Storage: userId-scoped |
| Edge cases | ✓ All 9 cases in plan table covered |
| Tests | ⚠ Manual QA only — 6 flows documented in test plan artifact |
| Performance | ✓ No N+1, no new polling, maxHeight CSS transition |
| Deployment risk | ✓ Frontend-only, no migration, no new routes |
| Overall | **DONE_WITH_CONCERNS** — test coverage gap noted |
