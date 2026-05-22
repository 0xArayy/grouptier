/**
 * Bot card image generator — dark GroupTier design (v2)
 *
 * Font strategy:
 *   Display  — Montserrat 900 Black  (titles, metric numbers; full Cyrillic)
 *   Text     — Montserrat 400        (subtitle, small session name)
 *   Mono     — JetBrains Mono 400    (header, labels, badges; full Cyrillic)
 *   Bebas    — Bebas Neue 400        (tier S/A/B/C labels only — ASCII-only font)
 */

import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { createRequire } from 'module';

const _require = createRequire(import.meta.url);

// ── Design tokens ─────────────────────────────────────────────────────────────
const W   = 720;
const H   = 240;
const PAD = 28;

const BG         = '#111111';
const FG         = '#ffffff';
const MUTED      = '#a9b3bd';
const MUTED_DEEP = '#888888';
const MUTED_LBL  = '#7d8fa1';

const TIER_A = '#F77F00';   // orange — LIVE / metric-1
const TIER_B = '#FCBF49';   // gold   — winner / metric-2

// Stepped tier bars (100 / 78 / 56 / 34 %)
const BARS = [
  { color: '#E63946', label: 'S', w: 1.00 },
  { color: TIER_A,   label: 'A', w: 0.78 },
  { color: TIER_B,   label: 'B', w: 0.56 },
  { color: '#90BE6D', label: 'C', w: 0.34 },
] as const;

const TIER_BLOCK_W = 160;
const BAR_H        = 24;
const BAR_GAP      = 4.8;
const TIER_TOTAL_H = BARS.length * BAR_H + (BARS.length - 1) * BAR_GAP;  // ≈ 110 px

// Left column width (W minus padding minus tier block minus gap)
const LEFT_W = W - PAD * 2 - TIER_BLOCK_W - 16;   // 488 px

type Ctx = ReturnType<ReturnType<typeof createCanvas>['getContext']>;

// ── Font registration ─────────────────────────────────────────────────────────
let _fontsReady = false;
function ensureFonts() {
  if (_fontsReady) return;
  _fontsReady = true;
  const list: [string, string][] = [
    ['@expo-google-fonts/montserrat/900Black/Montserrat_900Black.ttf',              'Display'],
    ['@expo-google-fonts/montserrat/400Regular/Montserrat_400Regular.ttf',          'Text'],
    ['@expo-google-fonts/jetbrains-mono/400Regular/JetBrainsMono_400Regular.ttf',  'Mono'],
    ['@expo-google-fonts/bebas-neue/400Regular/BebasNeue_400Regular.ttf',          'Bebas'],
  ];
  for (const [pkg, name] of list) {
    try { GlobalFonts.registerFromPath(_require.resolve(pkg), name); }
    catch (err) { console.warn(`imageCard: font "${name}" failed:`, err); }
  }
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

function drawBg(ctx: Ctx) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
}

/** Stepped tier bars.  hl = 0 → S outlined, 1 → A outlined, −1 → none */
function drawTierBars(ctx: Ctx, hl = -1) {
  const bx = W - PAD - TIER_BLOCK_W;
  const by = (H - TIER_TOTAL_H) / 2;

  for (let i = 0; i < BARS.length; i++) {
    const { color, label, w } = BARS[i];
    const barW = Math.round(TIER_BLOCK_W * w);
    const y    = by + i * (BAR_H + BAR_GAP);

    ctx.fillStyle = color;
    ctx.fillRect(bx, y, barW, BAR_H);

    if (hl === i) {
      ctx.save();
      ctx.strokeStyle = FG;
      ctx.lineWidth   = 2;
      ctx.strokeRect(bx + 1, y + 1, barW - 2, BAR_H - 2);
      ctx.restore();
    }

    // S/A/B/C — Bebas Neue (ASCII only, safe)
    ctx.fillStyle = FG;
    ctx.font      = '21px Bebas';
    ctx.fillText(label, bx + 7, y + BAR_H - 4);
  }
}

/** Rectangular badge: LIVE (orange) / WINNER (gold). Returns x of left edge. */
function drawBadge(ctx: Ctx, text: string, bg: string): number {
  const PX = 10, PY = 5, FS = 12;
  ctx.font          = `${FS}px Mono`;
  ctx.letterSpacing = '1.8px';
  const tw = ctx.measureText(text).width;
  ctx.letterSpacing = '0px';

  const bW = tw + PX * 2;
  const bH = FS + PY * 2;
  const bX = W - PAD - bW;
  const bY = PAD;

  ctx.fillStyle = bg;
  ctx.fillRect(bX, bY, bW, bH);

  ctx.fillStyle     = '#111111';
  ctx.font          = `${FS}px Mono`;
  ctx.letterSpacing = '1.8px';
  ctx.fillText(text, bX + PX, bY + bH - PY - 1);
  ctx.letterSpacing = '0px';
  return bX;
}

/** Auto-shrink font size so text fits maxW. Returns chosen px size. */
function fitFont(ctx: Ctx, text: string, maxW: number, startPx: number, font: string, minPx = 22): number {
  let sz = startPx;
  ctx.font = `${sz}px ${font}`;
  while (ctx.measureText(text).width > maxW && sz > minPx) {
    sz -= 2;
    ctx.font = `${sz}px ${font}`;
  }
  return sz;
}

function timeLabel(n: number): string {
  const secs = Math.max((n - 1) * 13, 10);
  return secs <= 90 ? `~${Math.round(secs / 10) * 10}с` : `~${Math.round(secs / 60)}мин`;
}

function variantLabel(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 14) return 'ВАРИАНТОВ';
  const t = n % 10;
  if (t === 1) return 'ВАРИАНТ';
  if (t >= 2 && t <= 4) return 'ВАРИАНТА';
  return 'ВАРИАНТОВ';
}

// ── Card 1: New Poll ──────────────────────────────────────────────────────────
export function generateSetupCard(): Buffer {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');
  drawBg(ctx);
  drawTierBars(ctx, -1);  // no highlight

  // Header line
  ctx.fillStyle     = MUTED_DEEP;
  ctx.font          = '13px Mono';
  ctx.letterSpacing = '2.9px';
  ctx.fillText('GROUPTIER  //  TOURNAMENT', PAD, 42);
  ctx.letterSpacing = '0px';

  // "НОВЫЙ / ОПРОС" — two-line Montserrat Black 64px
  const SZ   = 64;
  const LINE = Math.round(SZ * 0.92);  // ≈ 59
  ctx.fillStyle     = FG;
  ctx.font          = `${SZ}px Display`;
  ctx.letterSpacing = '-1.5px';
  ctx.fillText('НОВЫЙ', PAD, 42 + 14 + SZ);          // baseline ≈ 120
  ctx.fillText('ОПРОС', PAD, 42 + 14 + SZ + LINE);   // baseline ≈ 179
  ctx.letterSpacing = '0px';

  // Subtitle
  ctx.fillStyle = MUTED;
  ctx.font      = '16px Text';
  ctx.fillText('Настройте варианты и запустите турнир', PAD, H - PAD + 4);

  return canvas.toBuffer('image/png');
}

// ── Card 2: Active / Voting ───────────────────────────────────────────────────
export function generateVotingCard(name: string, optionCount: number): Buffer {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');
  drawBg(ctx);
  drawTierBars(ctx, 1);  // A highlighted

  // Badge
  drawBadge(ctx, 'LIVE', TIER_A);

  // Header — two lines so badge stays readable
  ctx.fillStyle     = MUTED_DEEP;
  ctx.font          = '13px Mono';
  ctx.letterSpacing = '2.9px';
  ctx.fillText('GROUPTIER  //', PAD, 42);
  ctx.fillText('TOURNAMENT',   PAD, 57);
  ctx.letterSpacing = '0px';

  // Poll name — auto-shrinks to fit LEFT_W
  const display = name.toUpperCase();
  const titleSz = fitFont(ctx, display, LEFT_W, 76, 'Display');
  // Center baseline vertically between header bottom (≈70) and metrics top (≈155)
  const titleY  = Math.round(70 + (155 - 70) / 2 + titleSz * 0.37);
  ctx.fillStyle     = FG;
  ctx.font          = `${titleSz}px Display`;
  ctx.letterSpacing = '-1px';
  ctx.fillText(display, PAD, titleY);
  ctx.letterSpacing = '0px';

  // Bottom metrics
  const numY = H - PAD - 12;  // Montserrat Black 40px baseline ≈ 200
  const lblY = H - PAD + 4;   // small label baseline ≈ 216

  // Col 1: option count
  ctx.fillStyle = TIER_A;
  ctx.font      = '40px Display';
  ctx.fillText(String(optionCount), PAD, numY);
  const col1NumW = ctx.measureText(String(optionCount)).width;

  ctx.fillStyle     = MUTED_LBL;
  ctx.font          = '11px Mono';
  ctx.letterSpacing = '0.5px';
  ctx.fillText(variantLabel(optionCount), PAD, lblY);
  const col1LblW = ctx.measureText(variantLabel(optionCount)).width;
  ctx.letterSpacing = '0px';

  // Vertical divider
  const divX = PAD + Math.max(col1NumW, col1LblW) + 12;
  ctx.strokeStyle = '#333333';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(divX, numY - 32);
  ctx.lineTo(divX, numY + 4);
  ctx.stroke();

  // Col 2: time estimate
  const c2x = divX + 12;
  ctx.fillStyle = TIER_B;
  ctx.font      = '40px Display';
  ctx.fillText(timeLabel(optionCount), c2x, numY);

  ctx.fillStyle     = MUTED_LBL;
  ctx.font          = '11px Mono';
  ctx.letterSpacing = '0.5px';
  ctx.fillText('НА ГОЛОС', c2x, lblY);
  ctx.letterSpacing = '0px';

  return canvas.toBuffer('image/png');
}

// ── Card 3: Winner / Results ──────────────────────────────────────────────────
export function generateWinnerCard(name: string, winner: string): Buffer {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');
  drawBg(ctx);
  drawTierBars(ctx, 0);  // S highlighted

  // Badge
  drawBadge(ctx, 'WINNER', TIER_B);

  // Header
  ctx.fillStyle     = MUTED_DEEP;
  ctx.font          = '13px Mono';
  ctx.letterSpacing = '2.9px';
  ctx.fillText('GROUPTIER  //  ИТОГИ', PAD, 42);
  ctx.letterSpacing = '0px';

  // Session name — small, muted
  const shortName = name.length > 40 ? name.slice(0, 39) + '…' : name;
  ctx.fillStyle     = MUTED;
  ctx.font          = '16px Text';
  ctx.letterSpacing = '1.5px';
  ctx.fillText(shortName.toUpperCase(), PAD, 42 + 10 + 16);  // baseline ≈ 68
  ctx.letterSpacing = '0px';

  // Winner name — large gold, auto-shrinks
  const sessionY = 68;
  const footerY  = H - PAD + 4;   // ≈ 216
  const display  = winner.toUpperCase();
  const winnerSz = fitFont(ctx, display, LEFT_W, 88, 'Display');
  // Place baseline at ≈ 55% of the remaining space below session name
  const winnerY  = Math.round(sessionY + 14 + winnerSz * 0.76);
  ctx.fillStyle     = TIER_B;
  ctx.font          = `${winnerSz}px Display`;
  ctx.letterSpacing = '-2px';
  ctx.fillText(display, PAD, winnerY);
  ctx.letterSpacing = '0px';

  // Footer
  ctx.fillStyle     = MUTED_LBL;
  ctx.font          = '11px Mono';
  ctx.letterSpacing = '2.5px';
  ctx.fillText('ПОБЕДИТЕЛЬ  ·  #1', PAD, footerY);
  ctx.letterSpacing = '0px';

  return canvas.toBuffer('image/png');
}
