# Design System — GroupTier

## Product Context
- **What this is:** Telegram Mini App for pairwise group ranking via single-elimination tournament + Borda count
- **Who it's for:** Telegram group members making collective decisions (restaurants, movies, options)
- **Space/industry:** Telegram bots / group games / social tools
- **Project type:** Mobile Mini App (Telegram WebView)

## Memorable Thing
**"Это TierMaker для группы — весело и честно"**

Every design decision serves this. If it doesn't feel like TierMaker, change it. If it doesn't feel social, reconsider.

## Aesthetic Direction
- **Direction:** TierMaker Classic — recognizable, bold, unpolished by design
- **Decoration level:** minimal — color does the work, no decorative noise
- **Mood:** The app should feel like a real tier ranking tool, not a generic Telegram bot. Users should recognize the S/A/B/C language immediately.
- **Reference:** `/Users/aray/Downloads/variation-a-export/variation-a.jsx`

## Typography
- **Display / tier letters:** `Impact, "Arial Black", "Helvetica Neue Condensed", system-ui, sans-serif`
  — This is the heart of TierMaker. Every device has Impact. No loading delay.
  — Use for: TierBlockLetter S/A/B/C labels only.
- **Body / UI:** `var(--font-primary)` → system font stack (Telegram Mini App runs in WebView; external fonts add render delay)
- **Data / numbers:** `font-variant-numeric: tabular-nums` on all score counters and progress
- **Code:** monospace (not applicable to UI)
- **Loading:** No external fonts. All fonts are system fonts + Impact.
- **Scale:** 10px labels, 11px small, 13px body, 14px UI, 18px title, 20-22px hero, 38px tier letter

## Color
- **Approach:** expressive — color is the primary visual tool (tier S/A/B/C rows)
- **Accent:** `#FF4D4D` — the TierMaker red. Used for S-tier, primary buttons, hero banner, progress spinner, header.
- **Tier S:** `#FF4D4D` text `#fff`
- **Tier A:** `#FF9F40` text `#fff`
- **Tier B:** `#FFD43A` text `#5a4400`
- **Tier C:** `#7ED957` text `#fff`
- **Progress / voting:** `#7ED957` — social signal (X of N voted)
- **Hero champion banner:** `linear-gradient(135deg, #FF4D4D 0%, #FF7A52 100%)`
- **bg / surface / text / hint:** `var(--tg-theme-bg-color)` / `var(--tg-theme-secondary-bg-color)` / `var(--tg-theme-text-color)` / `var(--tg-theme-hint-color)` — Telegram controls light/dark
- **Old accent `#5c7cfa`:** replaced by `#FF4D4D` everywhere

## Spacing
- **Base unit:** 8px
- **Density:** comfortable for duel cards (20-24px padding), compact for tier rows
- **Scale:** 2xs=2px xs=4px sm=8px md=12px lg=16px xl=24px 2xl=32px
- **Border radius:** sm=4px md=8px lg=12px xl=14px full=9999px
- **Tier row height:** 56px (TierBlockLetter size matches the Variation A spec)
- **Tap target minimum:** 48px (unchanged)

## Layout
- **Approach:** grid-disciplined — strict columns, Telegram-compatible padding
- **Content padding:** 14-16px horizontal
- **Max content width:** 400px (already enforced on duel cards)
- **Duel cards:** full-width, 20px padding, min-height 80px, lg border-radius

## Motion
- **Approach:** minimal-functional — only transitions that aid comprehension
- **Tap feedback:** `transform: scale(0.96)` on pressed card, `opacity: 0.5` on non-selected
- **Progress bars:** `transition: width 0.3s ease`
- **Easing:** ease-out for enter, ease-in for exit
- **Duration:** micro=100ms short=200ms

## Component Specs

### TierBlockLetter
```css
width: 56px; height: 56px;
font-family: Impact, "Arial Black", system-ui;
font-weight: 900;
font-size: 35px; /* 56 * 0.62 */
letter-spacing: -1.5px;
text-shadow: 0 2px 0 rgba(0,0,0,0.22), 0 4px 0 rgba(0,0,0,0.10); /* for light-text tiers */
```

### Hero Champion Banner (TierList, S-tier winner)
```css
background: linear-gradient(135deg, #FF4D4D 0%, #FF7A52 100%);
border-radius: 14px;
box-shadow: 0 8px 24px rgba(255,77,77,0.3);
padding: 14px;
```

### Primary Button
```css
background: #FF4D4D;
color: #fff;
border-radius: 10px;
height: 44px;
font-weight: 800;
box-shadow: 0 2px 8px rgba(255,77,77,0.3);
```

### Secondary Button
```css
background: var(--tg-theme-secondary-bg-color);
color: #FF4D4D;
border-radius: 10px;
height: 44px;
font-weight: 700;
```

### Progress / Voting Bar
```css
background: #7ED957; /* green = social signal */
border-radius: 3px;
height: 5px;
```

### Borda Score Bar (LiveResults rows)
```css
/* Bar fill uses tier color, not accent */
background: <tier.color>; /* S=#FF4D4D, A=#FF9F40, B=#FFD43A, C=#7ED957 */
height: 5px;
border-radius: 3px;
```

## Screens Covered (this refactor)
| Screen | Component | Template ref |
|--------|-----------|--------------|
| Duel | `Compare.tsx` | A3_Duel |
| Personal tier list | `TierList.tsx` | A5_PersonalTier |
| Group live ranking | `LiveResults.tsx` | A6_GroupTier |
| Create poll | `CreatePoll.tsx` | A1_Host |
| Bye screen | `ByeScreen.tsx` | A35_RoundDone |
| Loading skeleton | `App.tsx` | — |

## Backlog (not in this refactor)
- Welcome/splash screen (A0_Welcome)
- Bracket progress screen (A4_Bracket)
- Round complete transition (A35_RoundDone as separate screen)
- Group announcement card (A2_GroupAnnounce)

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-16 | Accent #FF4D4D instead of #5c7cfa | TierMaker identity. Moves away from generic Telegram blue. |
| 2026-05-16 | Impact for tier letters only | TierMaker heart. System font = no latency. Use nowhere else. |
| 2026-05-16 | Keep var(--tg-theme-*) for bg/surface | Telegram controls light/dark, no override needed. |
| 2026-05-16 | Hero champion banner on TierList | Champion deserves celebration. First-time impact. |
| 2026-05-16 | #7ED957 for voting progress bar | Social signal separate from tier colors. |
| 2026-05-16 | Design system created | /design-consultation based on Variation A export |
