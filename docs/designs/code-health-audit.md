<!-- /autoplan restore point: /Users/aray/.gstack/projects/test/main-autoplan-restore-20260518-133425.md -->
# Plan: Code Health Audit — GroupTier v1.1

**Feature:** `code-health-audit`
Branch: main | Author: aray

## Problem

All v1.0.x features shipped on schedule. The codebase grew fast under hackathon pressure.
Now it has correctness risks, duplicated logic, and a 995-line monster component that
will make every future feature take longer than it should.

This plan addresses the highest-priority issues found in a full read-through of all
source files. No new features. Only quality, correctness, and maintainability.

## Scope

### In scope

1. **tournament.ts divergence (critical correctness risk)** — `frontend/src/lib/tournament.ts`
   and `server/src/lib/tournament.ts` have diverged significantly. The server version is
   missing `currentRoundWinners` accumulation, uses a different bye-handling algorithm, and
   reconstructs round winners from matchup state instead of tracking them incrementally.
   The server library is used only in `server/src/lib/tournament.ts` (imported by nothing
   in server — dead code). The frontend version is correct and used. Fix: delete the server
   copy; it is unused.

2. **N+1 DB queries in GET /api/sessions/:id** — The hot polling path (called every 3s
   per active user) runs 6 sequential queries: `sessions`, `session_voters INSERT`,
   `options`, `COUNT(session_voters)`, `COUNT(user_results)`, `user_results`, `user_results`
   (my_result check). This can be reduced to 3 queries via CTEs or parallel execution.

3. **handlePreset / handleSavedPoll code duplication** — Two 60-line identical blocks in
   `CreatePoll.tsx` (lines 220-286). Same logic: clear existing options, create/name session,
   bulk-add from list, navigate to options step. Extract to `loadOptionSet(name, options)`.

4. **handlePollReady duplicates App.tsx initial load logic** — Lines 219-236 in `App.tsx`
   repeat the full fetchSession→screen-routing logic from lines 81-117. Extract to
   `loadSession(id: string)`.

5. **buildVoteUrl defined twice** — `server/src/bot/bot.ts:8` and
   `server/src/routes/sessions.ts:7` are identical. Move to a shared `server/src/lib/urls.ts`.

6. **Dynamic borda import in close route** — `server/src/routes/sessions.ts:453` uses
   `await import('../db/borda.js')` inside the handler despite `computeBorda` being
   statically imported at the top of the file (line 4). Remove the dynamic import.

7. **Dead `comparisons` table in schema.sql** — `scripts/schema.sql` defines and creates
   a `comparisons` table that is never queried anywhere. It adds confusion and migration
   surface. Drop it from the schema (IF NOT EXISTS makes this safe; no prod data stored there).

8. **CreatePoll.tsx 995 lines** — One file does 5 screens (home, presets, my-polls, options,
   starting). Split into sub-components: `HomeStep`, `PresetsStep`, `MyPollsStep`,
   `OptionsStep`. The parent `CreatePoll` becomes a thin router (~80 lines).

9. **LiveResults typo** — `LiveResults.tsx:59` has `'Мои опрос'` (grammatically incorrect).
   Should be `'Без названия'` (matching the waiting screen fallback).

10. **No option text length limit** — `POST /api/sessions/:id/options` accepts arbitrarily
    long text. Add a 100-character server-side limit with a 400 response. Frontend already
    has no explicit limit either.

### Out of scope

- CORS lockdown (needs prod domain finalized first)
- Rate limiting (needs infrastructure decision)
- CSS modules migration (large surface, separate PR)
- WebSocket upgrade (separate feature plan)
- Bot command cleanup (/startsession, /addoption, /vote legacy commands remain)

## Technical Plan

### Files to change

**`server/src/lib/tournament.ts`** — SYNC with frontend version (copy frontend → server). Do NOT delete: `server/src/__tests__/tournament.test.ts` imports it. The server version has a latent bye-tracking bug that doesn't surface in existing tests. Update tests after sync to cover the `currentRoundWinners` field.

**`server/src/lib/urls.ts`** (NEW) — export `buildVoteUrl(sessionId: string): string`

**`server/src/bot/bot.ts`** — Remove local `buildVoteUrl`, import from `../lib/urls.js`

**`server/src/routes/sessions.ts`** — Remove local `buildVoteUrl`, import from `../lib/urls.js`.
Remove dynamic import of borda (line 453), use the static import already at line 4.

**`scripts/schema.sql`** — Remove `CREATE TABLE IF NOT EXISTS comparisons` block.

**`frontend/src/App.tsx`** — Extract `loadSession(id)` function. Deduplicate
`handlePollReady` vs initial load effect.

**`frontend/src/components/CreatePoll.tsx`** — Extract `loadOptionSet`, split into
`HomeStep`, `PresetsStep`, `MyPollsStep`, `OptionsStep` sub-components.

**`frontend/src/components/LiveResults.tsx:59`** — Fix typo `'Мои опрос'` → `'Без названия'`

**`server/src/routes/sessions.ts` GET /:id handler** — Reduce 6 sequential queries.
Combine voter registration + options + counts into fewer round trips using Promise.all
where queries are independent.

**`server/src/routes/sessions.ts` POST /:id/options** — Add `text.length > 100` guard.

**`frontend/src/components/CreatePoll.tsx` starting screen** — Add timeout (10s) + error state: if `startVoting` call hangs, show "Не удалось открыть голосование" with a retry button. Currently a permanent spinner with no recovery.

**`server/src/bot/bot.ts`** — Add `// Primary flow: /newpoll → Mini App` at top of file. Add `// LEGACY — superseded by /newpoll flow` comment block above /startsession, /addoption, /vote, /closesession. Fix /startsession to include the same 409 guard as /newpoll (check for existing collecting session, return its ID instead of inserting unconditionally).

**`server/src/routes/sessions.ts` POST /:id/results** — Use message `ranked_list must contain all ${n} options, got ${ranked_list.length}` (not generic 'incomplete') for completeness validation error.

**`server/src/__tests__/sessions.test.ts`** — Fix pre-existing failing test: `POST /api/sessions/:id/options > returns 422 on duplicate option` expects 422 but code intentionally returns 200 (silent duplicate handling, feat `1346bcf`). Update test assertion to expect 200 with current options list returned. Also update error body assertion on line 211 (no `error` key on 200 path).

**`server/src/routes/sessions.ts` GET /:id handler — Promise.all** — Keep voter INSERT sequential (dependency: INSERT before COUNT). Then parallelize the 4 independent queries: `options SELECT`, `voterCount COUNT`, `resultCount COUNT`, `user_results SELECT (for Borda)`, `user_results SELECT (my_result)`. Pattern: `await pool.query(INSERT...); const [opts, vCount, rCount, results, myResult] = await Promise.all([...])`.

**`server/src/routes/sessions.ts` POST /:id — add session name length guard** — `name.length > 100` → 400. Same for PATCH /:id.

**`server/src/routes/sessions.ts` POST /:id/results — add completeness validation** — Reject if `ranked_list.length !== validOptions.size` (partial submission skews Borda scores since position is the denominator). Return 400: 'ranked_list must include all session options'.

**`frontend/src/lib/tournament.ts` buildRankedList — fix champion duplicate** — Line 183: `if (champion && !result.includes(champion))`. The S-tier filter on line 175 already puts the champion in `result` via `eliminated`. The `unshift` guard `!result.includes(champion)` should prevent duplication but only works if champion IS in eliminated. Since champion is always added to eliminated as S-tier on line 157, the unshift path at 183 should never fire — but the dead branch adds confusion. Remove the unshift block; champion is always in eliminated.

**`server/src/__tests__/sessions.test.ts` — add effectiveStatus test** — Add test: session with status='voting' and message_sent=false should return effectiveStatus='collecting'.

---

## GSTACK REVIEW REPORT

<!-- AUTO-GENERATED by /autoplan — do not edit manually -->

### Phase 1: CEO Review

#### 0A — Premise Challenge

| Premise | Verdict |
|---------|---------|
| Codebase grew under hackathon pressure | CONFIRMED |
| tournament.ts diverged (correctness risk) | CONFIRMED — fix is sync, not delete |
| Right time for cleanup (TODOs empty) | CONFIRMED |
| Dynamic borda import is a bug | CONFIRMED |
| Dead comparisons table | CONFIRMED |
| handlePreset/handleSavedPoll identical | CONFIRMED |
| Pre-existing failing test | NEW FINDING — added to scope |

#### 0B — Existing Code Leverage Map

| Sub-problem | Existing code | Action |
|-------------|--------------|--------|
| tournament sync | server/src/lib/tournament.ts (copy frontend over) | UPDATE |
| N+1 queries | sessions.ts GET /:id handler | REFACTOR |
| option loading duplication | CreatePoll.tsx handlePreset + handleSavedPoll | EXTRACT |
| session load duplication | App.tsx initial effect + handlePollReady | EXTRACT |
| buildVoteUrl | bot.ts + sessions.ts | CONSOLIDATE → lib/urls.ts |
| dynamic borda import | sessions.ts:453 | REMOVE |
| comparisons table | scripts/schema.sql | REMOVE |
| CreatePoll split | CreatePoll.tsx | SPLIT |
| typo | LiveResults.tsx:59 | FIX |
| option length guard | sessions.ts POST /:id/options | ADD |
| failing test | sessions.test.ts:210 | FIX |

#### 0C — Dream State

```
CURRENT:
  App.tsx (441L) — two copies of fetchSession routing logic
  CreatePoll.tsx (995L) — 5 screens, 2 duplicate 60-line handlers
  sessions.ts — 6 sequential DB queries on hot path, dead dynamic import
  bot.ts + sessions.ts — duplicate buildVoteUrl
  server/lib/tournament.ts — diverged from frontend, latent bug
  schema.sql — dead comparisons table
  tests: 1 always-failing (duplicate option)

THIS PLAN:
  App.tsx (~380L) — single loadSession() function, no duplication
  CreatePoll.tsx split: CreatePoll.tsx (~80L) + HomeStep + PresetsStep + MyPollsStep + OptionsStep
  sessions.ts — 3-4 DB queries via Promise.all, no dynamic import
  lib/urls.ts — single buildVoteUrl
  server/lib/tournament.ts — synced with frontend, tests updated
  schema.sql — clean (no comparisons table)
  tests: all passing

12-MONTH IDEAL:
  + WebSocket for real-time (no polling)
  + Rate limiting on voting endpoints
  + CSS design tokens extracted
  + E2E tests for the full voting flow
```

#### 0C-bis — Implementation Alternatives

| Approach | Effort | Risk | Notes |
|----------|--------|------|-------|
| A) Fix all 11 items in one PR (this plan) | CC: ~1h, Human: 30min | Low | Clear checklist, verifiable |
| B) Fix critical only (1,2,9,10,11) now, defer rest | CC: ~30min | Low | Faster, leaves duplication rot |
| C) Fix nothing — ship features instead | 0 | Medium | Regret scenario per CEO voice |

**Auto-decision: A.** Completeness principle. All items are in blast radius and <1d CC. P1 wins.

#### 0D — Mode: SELECTIVE EXPANSION

Staying exactly within the 11 identified items. Rate limiting deferred (infrastructure decision needed — out of scope per original plan). CORS lockdown deferred (needs prod domain).

#### 0E — Temporal Interrogation

- **Hour 1:** Fix typo, failing test, dynamic import, buildVoteUrl consolidation — low-risk, zero logic change
- **Hour 2:** schema.sql cleanup, option text length limit, N+1 refactor
- **Hour 3:** tournament.ts sync + test update, App.tsx dedup, CreatePoll split
- **Hour 4+:** Testing, verification, PR

#### 0F — Mode Confirmed: SELECTIVE EXPANSION

All 11 items accepted. No cherry-picks added. Rate limiting noted as TODOS.md entry.

---

#### CEO Dual Voices

**CLAUDE SUBAGENT (CEO — strategic independence) `[subagent-only]`:**

- N+1 (#2) and tournament sync (#1): CRITICAL — fix before next feature sprint
- Typo (#9), text length (#10), failing test (#11): HIGH — user-visible or security
- Duplication items (#3, #4): LOW — defer within this PR is fine
- Rate limiting: MISSING from plan — flag for TODOS.md
- Scope verdict: right-sized, don't expand

**CEO DUAL VOICES — CONSENSUS TABLE `[subagent-only]`:**
```
  Dimension                           Claude  Codex  Consensus
  ─────────────────────────────────── ─────── ─────── ─────────
  1. Premises valid?                   YES    N/A    CONFIRMED
  2. Right problem to solve?           YES    N/A    CONFIRMED
  3. Scope calibration correct?        YES    N/A    CONFIRMED
  4. Alternatives sufficiently explored?YES   N/A    CONFIRMED
  5. Security/input risk covered?       YES   N/A    CONFIRMED (#10)
  6. 6-month trajectory sound?         YES    N/A    CONFIRMED
```
Codex: N/A (unavailable). Single model.

---

#### CEO Sections 1–10

**Section 1 — Strategic Alignment:** Pure cleanup after feature sprint. Correct timing. Every future feature (real-time, rate limiting, new vote types) will touch CreatePoll.tsx and sessions.ts. Cleaning now is 3x cheaper than cleaning later under a deadline. ✅ No issues.

**Section 2 — Error & Rescue Registry:**

| Error | Current behavior | Fix |
|-------|-----------------|-----|
| Duplicate option submitted | Returns 200 (silent), but test expects 422 | Fix test to match behavior |
| Option text > 100 chars | Accepted silently — DB stores it, UI may overflow | Add 400 guard |
| Tournament bye-advance bug | Latent — server version wrong, not called in prod | Sync files |
| Dynamic borda import | Re-imports on every close — wasteful, confusing | Remove |

**Section 3 — Scope Creep Check:** No scope additions. Rate limiting noted but explicitly deferred.

**Section 4 — User Impact:** Items 9 (typo), 10 (text limit), 11 (test) are user-visible or attack-surface. Items 1-8 are internal quality. No user-visible regressions expected.

**Section 5 — Risk Assessment:** Low. Every change is mechanical (find/replace or move logic). The CreatePoll split is highest risk — mitigated by keeping the same props interface.

**Section 6 — Competitive / Market Risks:** None for a refactor. No feature risk.

**Section 7 — Failure Modes Registry:**

| Mode | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| CreatePoll split breaks routing | Low | High — users can't create polls | Test all 5 steps manually |
| sessions.ts Promise.all changes response shape | Low | High — frontend breaks | Keep exact same response shape |
| schema.sql IF NOT EXISTS drop safe? | No drop — just removal from create script | Safe — won't affect prod | Idempotent |

**Section 8 — What Already Exists:** All endpoints, business logic, and DB schema are in place. This plan reuses 100% of existing infrastructure.

**Section 9 — NOT in scope:**
- Rate limiting → TODOS.md
- CORS lockdown → TODOS.md  
- CSS modules migration → TODOS.md
- WebSocket → TODOS.md
- Bot legacy command cleanup → TODOS.md

**Section 10 — What We're NOT Doing (and why):** Not splitting into microservices, not adding Redis, not WebSocket yet. Those are week-2 decisions. This is week-1 cleanup.

---

#### CEO Completion Summary

| Item | Priority | Verdict |
|------|----------|---------|
| tournament.ts sync | P1-critical | ACCEPTED |
| N+1 query reduction | P1-critical | ACCEPTED |
| handlePreset/handleSavedPoll extract | P2 | ACCEPTED |
| handlePollReady dedup | P2 | ACCEPTED |
| buildVoteUrl consolidation | P2 | ACCEPTED |
| dynamic borda import removal | P3 | ACCEPTED |
| comparisons table removal | P2 | ACCEPTED |
| CreatePoll.tsx split | P2 | ACCEPTED |
| LiveResults typo fix | P1 (user-visible) | ACCEPTED |
| option text length limit | P1 (security) | ACCEPTED |
| failing test fix | P1 | ACCEPTED |

CEO PHASE COMPLETE. 11 items accepted, 5 deferred to TODOS.md. No user challenges.

---

### Phase 2: Design Review

**CLAUDE SUBAGENT (Design — independent review) `[subagent-only]`:**
- CreatePoll split: APPROVED — shared state in parent is correct architecture
- Typo fix: APPROVED — 'Без названия' is semantically correct
- New finding: `starting` screen has no timeout/error path — added to scope
- Text length: add inline error on exceed (not silent rejection, not counter)

**Design Litmus Scorecard:**
```
  Dimension                   Score  Notes
  ─────────────────────────── ─────  ──────────────────────────────
  Information hierarchy       8/10   Split preserves hierarchy
  Missing states              5/10   starting screen has no error path
  User journey continuity     9/10   Shared state in parent
  Plan specificity            9/10   Files and line numbers named
  Mobile/touch first          9/10   Telegram WebView compat
  Inline errors               7/10   Added text-limit inline error
  Design system alignment     9/10   CSS vars throughout
```

**Design Completion Summary:** 7 dimensions evaluated. 1 new item added to scope (starting screen timeout). 2 auto-decisions (flat props, inline error). 0 user challenges.

---

### Phase 3: Eng Review

**CLAUDE SUBAGENT (Eng — independent review) `[subagent-only]`:**

- Promise.all for GET /:id: PARTIAL safe only. Voter INSERT → voter COUNT has ordering dependency. Correct fix: INSERT first, then Promise.all for 4 independent queries.
- tournament.ts sync: Riskiest change. Server pick() lines 113-127 have specific bye-tracking reconstruction bug. Syncing frontend→server is correct but must update tests.
- buildRankedList line 183: Dead code unshift branch — champion always in eliminated, the `!result.includes(champion)` guard is technically correct but confusing. Remove dead branch.
- Partial ranked_list: DATA INTEGRITY — user can submit 1 option for a 12-option session, skewing Borda. Add completeness validation.
- Session name unbounded: Same attack vector as option text. Add 100-char limit to PATCH/:id and POST/api/sessions.
- effectiveStatus path: No test coverage. Add it.

**Architecture ASCII diagram:**

```
Telegram WebApp (React)
  │
  ├─ App.tsx ──► loadSession(id) [extracted]
  │               ├─ fetchSession()
  │               └─ screen routing logic
  │
  ├─ CreatePoll ──► HomeStep
  │              ├─ PresetsStep
  │              ├─ MyPollsStep
  │              └─ OptionsStep ← [starting timeout added]
  │
  └─ api/client.ts ──► /api/sessions/:id (GET, 3s poll)
                           │
                           └─ sessions.ts handler
                                ├─ await INSERT voter (sequential)
                                └─ Promise.all([
                                     options SELECT,
                                     voterCount,
                                     resultCount,
                                     results (Borda),
                                     myResult
                                   ])

server/
  ├─ lib/urls.ts [NEW] ── buildVoteUrl()
  │     ↑ imported by bot.ts + sessions.ts
  ├─ lib/tournament.ts [SYNCED from frontend]
  └─ routes/sessions.ts [6→4 DB round trips]
```

**Test diagram:**

| Code path | Current test | Gap | Action |
|-----------|-------------|-----|--------|
| duplicate option → 200 | sessions.test.ts:210 (broken — expects 422) | Wrong assertion | Fix test |
| option text > 100 chars | None | New | Add test |
| session name > 100 chars | None | New | Add test |
| partial ranked_list | None | New | Add test |
| effectiveStatus recovery | None | Gap | Add test |
| tournament pick with byes | tournament.test.ts (server copy, all pass) | Sync risk | Verify after sync |
| buildRankedList odd N | None | Potential duplicate | Test N=3,5,7 |

**Eng consensus table `[subagent-only]`:**
```
  Dimension                           Claude  Codex  Consensus
  ─────────────────────────────────── ─────── ─────── ─────────
  1. Architecture sound?               YES    N/A    CONFIRMED
  2. Test coverage sufficient?         NO     N/A    GAPS FOUND
  3. Performance risks addressed?      YES    N/A    CONFIRMED (Promise.all)
  4. Security threats covered?         PARTIAL N/A   PARTIAL (name limits added)
  5. Error paths handled?              NO     N/A    GAPS FOUND (starting screen, effectiveStatus)
  6. Deployment risk manageable?       YES    N/A    CONFIRMED (no migrations needed)
```

**Failure modes registry:**

| Mode | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Promise.all races voter COUNT | Medium (if done naively) | Wrong voter count shown | Keep INSERT sequential, parallelize rest |
| tournament sync breaks odd-N sessions | Low | Champion in wrong tier | Add N=5,7 tests; run both test suites |
| CreatePoll split breaks step state | Low | Create flow broken | Test all 5 steps manually post-split |
| ranked_list completeness breaks existing voters | Low | 400 for partial results | Only applies to new submissions |
| buildRankedList unshift removal | Very low | Champion missing from list | Champion is always in eliminated — verify with tests |

**Eng Completion Summary:** 12 items reviewed, 6 new items added (Promise.all ordering, buildRankedList dead code, partial ranked_list validation, session name limits, effectiveStatus test, sessions.test.ts body assertion). All accepted.

---

### Phase 3.5: DX Review

**CLAUDE SUBAGENT (DX — independent review) `[subagent-only]`:**

- Error messages: `ranked_list must contain all N options, got M` is better than generic — accepted
- /startsession race guard: MISSING from plan — actual bug (unconditional INSERT), added to scope
- Legacy command comment: cheap, high onboarding value, added
- bot.ts entry point comment: 1 line, added
- CreatePoll split: net positive — EMOJI_PRESETS already shared from lib/constants.ts, no issue

**DX Scorecard `[subagent-only]`:**
```
  Dimension                     Score  Notes
  ─────────────────────────────  ─────  ──────────────────────────────
  1. Getting started < 5 min?    6/10   Dual command sets confusing; now fixed with comments
  2. API/CLI naming guessable?   8/10   REST paths are clear, bot commands now labeled
  3. Error messages actionable?  7→9/10 Specificity improvement applied
  4. Docs findable?              5/10   No CONTRIBUTING.md — deferred (out of scope)
  5. Upgrade path safe?          9/10   No schema migrations; IF NOT EXISTS everywhere
  6. Dev env friction-free?      8/10   .env.example present, schema auto-inits
  7. Codebase navigable?         6→9/10 CreatePoll split + entry point comments
  8. Error recovery patterns?    6→8/10 starting screen timeout + effectiveStatus test
```

**TTHW (Time to Hello World) assessment:**
- Current: ~15 min (find /newpoll, read bot.ts confused by 4 legacy commands, find correct flow)
- After this plan: ~8 min (entry point comment + legacy labels make the flow obvious)

**DX Implementation Checklist:**
- [x] Error messages: specific N/M format for incomplete ranked_list
- [x] /startsession 409 guard added to scope
- [x] Legacy command comments added to scope
- [x] bot.ts entry point comment added
- [x] EMOJI_PRESETS already shared — no action needed
- [x] CreatePoll split makes largest file navigable

**Developer journey map (9 stages):**

| Stage | Current | After plan |
|-------|---------|-----------|
| 1. Clone & run | ✅ docker-compose | ✅ same |
| 2. Understand bot flow | ❌ /newpoll vs /startsession unclear | ✅ entry point comment |
| 3. Create a session | ✅ works | ✅ /startsession now safe |
| 4. Add options | ✅ works | ✅ same |
| 5. Vote | ✅ works | ✅ same |
| 6. See results | ✅ works | ✅ same |
| 7. Modify CreatePoll | ❌ 995-line file | ✅ split into 4 sub-files |
| 8. Add a new API endpoint | ✅ sessions.ts pattern clear | ✅ same |
| 9. Run tests | ❌ 1 always-failing test | ✅ all green |

**Phase 3.5 complete.** TTHW: 15 min → ~8 min. Codex: N/A. Claude subagent: 4 concerns (3 added to scope). Consensus: 6/8 confirmed, 2 improved.

---

### Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|---------------|-----------|-----------|---------|
| 1 | CEO | Fix all 11 items in one PR vs critical-only | Mechanical | P1 Completeness | All in blast radius, <1d CC | B: fix-critical-only |
| 2 | CEO | Sync tournament.ts (not delete) | Mechanical | P5 Explicit | Tests import it — delete breaks CI | A: delete |
| 3 | CEO | Add failing test fix to scope | Mechanical | P1 Completeness | Pre-existing failure, easy fix | — |
| 4 | CEO | Rate limiting → TODOS.md (not this PR) | Mechanical | P3 Pragmatic | Infrastructure decision needed | expand scope |
| 5 | Design | Flat props vs ctx object for OptionsStep | Taste | P5 Explicit | Flat props more readable for component readers | ctx object |
| 6 | Design | Starting screen timeout → in scope | Mechanical | P2 Boil Lake | In blast radius of CreatePoll split | defer |
| 7 | Design | Text length feedback: inline error vs counter | Mechanical | P5 Explicit | Error on exceed, not live counter | counter |
| 8 | Eng | Promise.all — partial vs full parallelization | Mechanical | P5 Explicit | INSERT before COUNT dependency; parallelize rest | naive Promise.all(all 6) |
| 9 | Eng | buildRankedList unshift dead branch → remove | Mechanical | P5 Explicit | Champion always in eliminated; dead code confuses readers | keep |
| 10 | Eng | Partial ranked_list validation → add to scope | Mechanical | P2 Boil Lake | Data integrity — Borda skew is real | defer |
| 11 | Eng | Session name length limits → add to scope | Mechanical | P2 Boil Lake | Same attack surface as option text; same fix | defer |
| 12 | Eng | effectiveStatus test → add to scope | Mechanical | P1 Completeness | Critical path with no coverage | defer |
| 13 | DX | ranked_list error → specific N/M format | Mechanical | P5 Explicit | Developer knows exact mismatch immediately | generic msg |
| 14 | DX | /startsession 409 guard → add to scope | Mechanical | P2 Boil Lake | Actual bug: unconditional INSERT races concurrent users | defer |
| 15 | DX | Legacy command comments + entry point → add | Mechanical | P5 Explicit | One comment block, high onboarding ROI | defer |

---

## Success Criteria

- `grep -r "buildVoteUrl" server/src` → one definition, two imports
- `grep -r "tournament" server/src --include="*.ts"` → zero results outside `__tests__`
- `wc -l frontend/src/components/CreatePoll.tsx` → under 300 lines (logic in sub-files)
- GET /api/sessions/:id: at most 4 DB round trips (down from 6)
- All existing `__tests__` pass
- No new functionality
