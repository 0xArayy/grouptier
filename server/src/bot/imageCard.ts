/**
 * Bot card image generator — dark GroupTier design (v2)
 *
 * Font strategy:
 *   Display  — Montserrat 900 Black  (titles, metric numbers; full Cyrillic)
 *   Text     — Montserrat 400        (subtitle, small session name)
 *   Mono     — JetBrains Mono 400    (header, labels, badges; full Cyrillic)
 *   Bebas    — Bebas Neue 400        (tier S/A/B/C labels only — ASCII-only font)
 *
 * Quality improvements (v3):
 *   • 2× supersampling — draw at 1440×480, downscale via drawImage → sharp edges
 *   • safeTextWidth() — max(measured, char-count estimate) guards Cyrillic overflow
 *   • Real TextMetrics — actualBoundingBoxAscent/Descent for pixel-perfect centering
 */

import { createCanvas, GlobalFonts, type Canvas } from '@napi-rs/canvas';
import { createRequire } from 'module';
import Piscina from 'piscina';
import os from 'os';
import { fileURLToPath } from 'url';

const _require = createRequire(import.meta.url);

// ── Design tokens ─────────────────────────────────────────────────────────────
const W     = 720;
const H     = 240;
const PAD   = 28;
const SCALE = 2;   // supersampling factor

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
const TIER_TOTAL_H = BARS.length * BAR_H + (BARS.length - 1) * BAR_GAP;

// Left column width (W minus padding minus tier block minus gap)
const LEFT_W = W - PAD * 2 - TIER_BLOCK_W - 16;   // 488 px

type Ctx = ReturnType<ReturnType<typeof createCanvas>['getContext']>;

// ── Font registration ─────────────────────────────────────────────────────────
let _fontsReady = false;
function ensureFonts() {
  if (_fontsReady) return;
  _fontsReady = true;
  const list: [string, string][] = [
    ['@expo-google-fonts/montserrat/900Black/Montserrat_900Black.ttf',             'Display'],
    ['@expo-google-fonts/montserrat/400Regular/Montserrat_400Regular.ttf',         'Text'],
    ['@expo-google-fonts/jetbrains-mono/400Regular/JetBrainsMono_400Regular.ttf', 'Mono'],
    ['@expo-google-fonts/bebas-neue/400Regular/BebasNeue_400Regular.ttf',         'Bebas'],
  ];
  for (const [pkg, name] of list) {
    try { GlobalFonts.registerFromPath(_require.resolve(pkg), name); }
    catch (err) { console.warn(`imageCard: font "${name}" failed:`, err); }
  }
}

// ── Supersampling ─────────────────────────────────────────────────────────────

/** Create a 2× canvas. All drawing coordinates use original (1×) values. */
function createHires(): { canvas: Canvas; ctx: Ctx } {
  const canvas = createCanvas(W * SCALE, H * SCALE);
  const ctx    = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  return { canvas, ctx };
}

/** Downscale hi-res canvas → 720×240 PNG via a second canvas drawImage pass. */
function exportBuffer(hires: Canvas): Buffer {
  const out    = createCanvas(W, H);
  const outCtx = out.getContext('2d');
  // drawImage with explicit src/dst dimensions applies bilinear downsampling
  outCtx.drawImage(hires, 0, 0, W * SCALE, H * SCALE, 0, 0, W, H);
  return out.toBuffer('image/png');
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

// ── Text measurement helpers ──────────────────────────────────────────────────

/**
 * Safe text width: returns max(measured, character-count estimate).
 * Guards against @napi-rs/canvas returning implausibly small values for
 * Cyrillic text when custom fonts aren't fully loaded at measure time.
 *
 * Coefficient 0.56 is conservative for Montserrat Black uppercase
 * (real average ≈ 0.60 em) — avoids false positives on short words.
 */
function safeTextWidth(ctx: Ctx, text: string, fontSize: number): number {
  const measured  = ctx.measureText(text).width;
  const estimated = text.length * fontSize * 0.56;
  return Math.max(measured, estimated);
}

/** Auto-shrink font size so text fits maxW. Returns chosen px size. */
function fitFont(
  ctx: Ctx,
  text: string,
  maxW: number,
  startPx: number,
  font: string,
  minPx = 22,
): number {
  ctx.letterSpacing = '0px';
  let sz = startPx;
  ctx.font = `${sz}px ${font}`;
  while (safeTextWidth(ctx, text, sz) > maxW && sz > minPx) {
    sz -= 1;
    ctx.font = `${sz}px ${font}`;
  }
  return sz;
}

// ── Title layout helpers ──────────────────────────────────────────────────────

interface TitleLayout { lines: string[]; fontSize: number; }

/**
 * Find the best 1- or 2-line layout for `text` within `maxW`.
 * Chooses 2 lines when they give a ≥15 % larger font than squeezing to 1.
 */
function layoutTitle(
  ctx: Ctx,
  text: string,
  maxW: number,
  startPx: number,
  font: string,
): TitleLayout {
  ctx.letterSpacing = '0px';

  // Option A — single line
  const sz1 = fitFont(ctx, text, maxW, startPx, font, 26);
  ctx.font = `${sz1}px ${font}`;
  const fits1 = safeTextWidth(ctx, text, sz1) <= maxW;

  // Option B — two lines (only useful with ≥ 2 words)
  const words = text.split(/\s+/);
  let bestSplit = -1;
  let bestSz2 = 0;
  if (words.length >= 2) {
    for (let i = 1; i < words.length; i++) {
      const l1 = words.slice(0, i).join(' ');
      const l2 = words.slice(i).join(' ');
      const longer = l1.length >= l2.length ? l1 : l2;
      const sz = fitFont(ctx, longer, maxW, startPx, font, 20);
      if (sz > bestSz2) { bestSz2 = sz; bestSplit = i; }
    }
  }

  // Choose 2 lines when single line overflows OR 2-line gives ≥15 % bigger font
  if (bestSplit >= 1 && (!fits1 || bestSz2 >= sz1 * 1.15)) {
    return {
      lines: [words.slice(0, bestSplit).join(' '), words.slice(bestSplit).join(' ')],
      fontSize: bestSz2,
    };
  }
  return { lines: [text], fontSize: sz1 };
}

/**
 * Draw a 1- or 2-line title block vertically centred inside [zoneTop, zoneBot].
 *
 * Uses real TextMetrics (actualBoundingBoxAscent / Descent) for pixel-perfect
 * vertical placement instead of hardcoded ascent ratio estimates.
 */
function drawTitleBlock(
  ctx: Ctx,
  layout: TitleLayout,
  x: number,
  zoneTop: number,
  zoneBot: number,
  color: string,
  font: string,
  letterSpacing = '-1px',
) {
  const { lines, fontSize: sz } = layout;
  const LH = Math.round(sz * 0.92);  // line advance

  // Measure real ascent/descent for this font + size
  ctx.font          = `${sz}px ${font}`;
  ctx.letterSpacing = '0px';
  const m      = ctx.measureText(lines[0]);
  const ASCENT = Math.round(
    (m.actualBoundingBoxAscent  != null && m.actualBoundingBoxAscent  > 0)
      ? m.actualBoundingBoxAscent
      : sz * 0.75
  );
  const DESC   = Math.round(
    (m.actualBoundingBoxDescent != null && m.actualBoundingBoxDescent >= 0)
      ? m.actualBoundingBoxDescent
      : sz * 0.18
  );

  const blockH    = ASCENT + (lines.length - 1) * LH + DESC;
  const blockTop  = zoneTop + Math.round((zoneBot - zoneTop - blockH) / 2);
  const baseline0 = blockTop + ASCENT;

  ctx.fillStyle     = color;
  ctx.font          = `${sz}px ${font}`;
  ctx.letterSpacing = letterSpacing;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, baseline0 + i * LH);
  }
  ctx.letterSpacing = '0px';
}

// ── Utility ───────────────────────────────────────────────────────────────────

function timeLabel(n: number): string {
  const secs = Math.max((n - 1) * 13, 10);
  return secs <= 90
    ? `~${Math.round(secs / 10) * 10}с`
    : `~${Math.round(secs / 60)}мин`;
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
  const { canvas, ctx } = createHires();
  drawBg(ctx);
  drawTierBars(ctx, -1);

  // Header
  ctx.fillStyle     = MUTED_DEEP;
  ctx.font          = '13px Mono';
  ctx.letterSpacing = '2.9px';
  ctx.fillText('GROUPTIER  //  TOURNAMENT', PAD, 42);
  ctx.letterSpacing = '0px';

  // "НОВЫЙ / ОПРОС" — two-line Montserrat Black 64px
  const SZ   = 64;
  const LINE = Math.round(SZ * 0.92);
  ctx.fillStyle     = FG;
  ctx.font          = `${SZ}px Display`;
  ctx.letterSpacing = '-1.5px';
  ctx.fillText('НОВЫЙ', PAD, 42 + 14 + SZ);
  ctx.fillText('ОПРОС', PAD, 42 + 14 + SZ + LINE);
  ctx.letterSpacing = '0px';

  // Subtitle
  ctx.fillStyle = MUTED;
  ctx.font      = '16px Text';
  ctx.fillText('Настройте варианты и запустите турнир', PAD, H - PAD + 4);

  return exportBuffer(canvas);
}

// ── Card 2: Active / Voting ───────────────────────────────────────────────────
export function generateVotingCard(name: string, optionCount: number): Buffer {
  ensureFonts();
  const { canvas, ctx } = createHires();
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

  // Poll name — auto-shrinks and wraps; zone between header (≈65) and metrics (≈190)
  const display     = name.toUpperCase();
  const titleLayout = layoutTitle(ctx, display, LEFT_W, 76, 'Display');
  drawTitleBlock(ctx, titleLayout, PAD, 65, 190, FG, 'Display', '-1px');

  // Bottom metrics
  const numY = H - PAD - 12;  // ≈ 200
  const lblY = H - PAD + 4;   // ≈ 216

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

  return exportBuffer(canvas);
}

// ── Card 3: Winner / Results ──────────────────────────────────────────────────
export function generateWinnerCard(name: string, winner: string): Buffer {
  ensureFonts();
  const { canvas, ctx } = createHires();
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

  // Session name — small, muted; truncate long names
  const shortName = name.length > 40 ? name.slice(0, 39) + '…' : name;
  ctx.fillStyle     = MUTED;
  ctx.font          = '16px Text';
  ctx.letterSpacing = '1.5px';
  ctx.fillText(shortName.toUpperCase(), PAD, 42 + 10 + 16);  // baseline ≈ 68
  ctx.letterSpacing = '0px';

  // Winner name — auto-shrinks and wraps; zone between session line (≈80) and footer (≈202)
  const display      = winner.toUpperCase();
  const winnerLayout = layoutTitle(ctx, display, LEFT_W, 88, 'Display');
  drawTitleBlock(ctx, winnerLayout, PAD, 80, 202, TIER_B, 'Display', '-2px');

  // Footer
  ctx.fillStyle     = MUTED_LBL;
  ctx.font          = '11px Mono';
  ctx.letterSpacing = '2.5px';
  ctx.fillText('ПОБЕДИТЕЛЬ  ·  #1', PAD, H - PAD + 4);
  ctx.letterSpacing = '0px';

  return exportBuffer(canvas);
}

// ── Piscina async pool ────────────────────────────────────────────────────────

let _pool: Piscina | null = null;

function getPool(): Piscina {
  if (_pool) return _pool;
  const isProd = process.env.NODE_ENV === 'production';
  const filename = fileURLToPath(
    isProd
      ? new URL('./imageCard.worker.js', import.meta.url)
      : new URL('./imageCard.worker.ts', import.meta.url),
  );
  _pool = new Piscina({
    filename,
    execArgv: isProd ? [] : ['--import', 'tsx/esm'],
    maxThreads: Math.max(1, os.cpus().length - 1),
    maxQueue: 20,
  });
  return _pool;
}

// In non-production environments (dev, test) skip piscina and call sync functions directly.
// Piscina worker threads require compiled .js output that isn't available in dev/test.
const USE_POOL = process.env.NODE_ENV === 'production';

const TASK_TIMEOUT_MS = 5_000;

export async function generateSetupCardAsync(): Promise<Buffer> {
  if (!USE_POOL) return Promise.resolve(generateSetupCard());
  return getPool().run({ task: 'setup', args: [] }, { signal: AbortSignal.timeout(TASK_TIMEOUT_MS) });
}

export async function generateVotingCardAsync(name: string, optionCount: number): Promise<Buffer> {
  if (!USE_POOL) return Promise.resolve(generateVotingCard(name, optionCount));
  return getPool().run({ task: 'voting', args: [name, optionCount] }, { signal: AbortSignal.timeout(TASK_TIMEOUT_MS) });
}

export async function generateWinnerCardAsync(name: string, winner: string): Promise<Buffer> {
  if (!USE_POOL) return Promise.resolve(generateWinnerCard(name, winner));
  return getPool().run({ task: 'winner', args: [name, winner] }, { signal: AbortSignal.timeout(TASK_TIMEOUT_MS) });
}

export function closeCardPool(): Promise<void> | undefined {
  return _pool?.destroy();
}
