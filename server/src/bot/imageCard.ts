import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { createRequire } from 'module';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const _dirname = dirname(fileURLToPath(import.meta.url));

// Load logo PNG at module init. The logo has a dark background; we use 'screen'
// blend mode when drawing it so the dark background becomes transparent on
// any gradient card while the colored bars and text glow through cleanly.
const LOGO_SIZE = 160; // rendered size on the card (px)

type LoadedImage = Awaited<ReturnType<typeof loadImage>>;
const _logoImg: LoadedImage | null = await (async () => {
  try {
    return await loadImage(join(_dirname, 'assets', 'logo.png'));
  } catch {
    return null;
  }
})();

const _require = createRequire(import.meta.url);

let _fontsReady = false;
function ensureFonts() {
  if (_fontsReady) return;
  _fontsReady = true;
  try {
    GlobalFonts.registerFromPath(
      _require.resolve('@expo-google-fonts/montserrat/400Regular/Montserrat_400Regular.ttf'),
      'Montserrat',
    );
    GlobalFonts.registerFromPath(
      _require.resolve('@expo-google-fonts/montserrat/800ExtraBold/Montserrat_800ExtraBold.ttf'),
      'MontserratBold',
    );
  } catch (err) {
    console.warn('imageCard: failed to load Montserrat fonts, falling back to system fonts:', err);
    try {
      (GlobalFonts as unknown as { loadSystemFonts(): void }).loadSystemFonts();
    } catch { /* ignore */ }
  }
}

const W = 600;
const H = 220;
const PAD = 32;
const BRAND_LABEL = 'GROUPTIER  ·  TOURNAMENT';
const CARD_GRADIENT_RED: [string, string] = ['#FF4D4D', '#FF7A52'];

type Ctx = ReturnType<ReturnType<typeof createCanvas>['getContext']>;

// Mini tier-bar logomark — programmatic fallback only
const LOGO_BARS = [
  { color: '#E63946', w: 1.00, label: 'S' },
  { color: '#F77F00', w: 0.82, label: 'A' },
  { color: '#FCBF49', w: 0.64, label: 'B' },
  { color: '#90BE6D', w: 0.46, label: 'C' },
];

function drawLogoMark(ctx: Ctx, rightX: number, topY: number, opacity = 1) {
  ctx.save();
  ctx.globalAlpha = opacity;

  if (_logoImg) {
    // 'screen' blend: dark background pixels become invisible on any light gradient;
    // colored bars and white text shine through cleanly.
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(_logoImg, rightX - LOGO_SIZE, topY, LOGO_SIZE, LOGO_SIZE);
  } else {
    // Programmatic fallback
    const barH = 10;
    const gap = 2.5;
    const maxW = 46;
    for (let i = 0; i < LOGO_BARS.length; i++) {
      const { color, w, label } = LOGO_BARS[i];
      const barW = maxW * w;
      const barX = rightX - maxW;
      const barY = topY + i * (barH + gap);
      ctx.fillStyle = color;
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = `${barH - 1}px MontserratBold`;
      ctx.fillText(label, barX + 3, barY + barH - 1.5);
    }
  }

  ctx.restore();
}

function drawBase(ctx: Ctx, c1: string, c2: string) {
  // Gradient background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, c1);
  bg.addColorStop(1, c2);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Decorative circle — bottom-right
  ctx.beginPath();
  ctx.arc(W + 50, H + 60, 210, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fill();

  // Decorative circle — top-left
  ctx.beginPath();
  ctx.arc(-30, -20, 130, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fill();

  // Subtle top shadow strip
  const topFade = ctx.createLinearGradient(0, 0, 0, 54);
  topFade.addColorStop(0, 'rgba(0,0,0,0.20)');
  topFade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = topFade;
  ctx.fillRect(0, 0, W, 54);

}

function fitText(ctx: Ctx, text: string, maxW: number, maxPx: number): number {
  let sz = maxPx;
  ctx.font = `${sz}px MontserratBold`;
  while (ctx.measureText(text).width > maxW && sz > 18) {
    sz -= 2;
    ctx.font = `${sz}px MontserratBold`;
  }
  return sz;
}

function timeLabel(optionCount: number): string {
  const secs = Math.max((optionCount - 1) * 13, 10);
  return secs <= 90
    ? `~${Math.round(secs / 10) * 10} сек`
    : `~${Math.round(secs / 60)} мин`;
}

// Max text width leaving room for the 120px logo + gap in the right column
const TEXT_MAX_W = W - PAD - LOGO_SIZE - 16;

export function generateVotingCard(name: string, optionCount: number): Buffer {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawBase(ctx, ...CARD_GRADIENT_RED);
  drawLogoMark(ctx, W - PAD, (H - LOGO_SIZE) / 2, 0.92);

  // "GROUPTIER · TOURNAMENT" label
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '13px MontserratBold';
  ctx.fillText(BRAND_LABEL, PAD, PAD + 2);

  // Poll name — auto-shrinks if too long, respects logo column
  const display = name.toUpperCase();
  const sz = fitText(ctx, display, TEXT_MAX_W, 54);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(display, PAD, PAD + sz + 18);

  // Subtitle
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = '18px Montserrat';
  ctx.fillText(`${optionCount} вариантов  ·  ${timeLabel(optionCount)} на голос`, PAD, H - 20);

  return canvas.toBuffer('image/png');
}

export function generateSetupCard(): Buffer {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawBase(ctx, ...CARD_GRADIENT_RED);
  drawLogoMark(ctx, W - PAD, (H - LOGO_SIZE) / 2, 0.92);

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '13px MontserratBold';
  ctx.fillText(BRAND_LABEL, PAD, PAD + 2);

  ctx.fillStyle = '#ffffff';
  ctx.font = '54px MontserratBold';
  ctx.fillText('НОВЫЙ ОПРОС', PAD, 132);

  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = '18px Montserrat';
  ctx.fillText('Настройте варианты и запустите турнир', PAD, 178);

  return canvas.toBuffer('image/png');
}

export function generateWinnerCard(name: string, winner: string): Buffer {
  ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawBase(ctx, '#FF9F40', '#FFD43A');
  drawLogoMark(ctx, W - PAD, (H - LOGO_SIZE) / 2, 0.60);

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.font = '13px MontserratBold';
  ctx.fillText('GROUPTIER  ·  ИТОГИ', PAD, PAD + 2);

  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.font = '20px MontserratBold';
  const shortName = name.length > 35 ? name.slice(0, 34) + '…' : name;
  ctx.fillText(shortName.toUpperCase(), PAD, 72);

  const display = winner.toUpperCase();
  const sz = fitText(ctx, display, TEXT_MAX_W, 54);
  ctx.fillStyle = '#5a4400';
  ctx.fillText(display, PAD, 72 + sz + 14);

  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.font = '19px Montserrat';
  ctx.fillText('ПОБЕДИТЕЛЬ', PAD, H - 20);

  return canvas.toBuffer('image/png');
}
