import type { RevealPayload } from '../../shared/types.ts';

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3
) {
  const words = text.split(' ');
  let line = '';
  let linesDrawn = 0;

  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      linesDrawn++;
      if (linesDrawn >= maxLines) {
        ctx.fillText(line.trim() + '...', x, y);
        return;
      }
      ctx.fillText(line.trim(), x, y);
      line = words[i] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, y);
}

export async function downloadShareResultCard(reveal: RevealPayload): Promise<boolean> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  // Deep navy to violet gradient background
  const bg = ctx.createLinearGradient(0, 0, 1200, 630);
  bg.addColorStop(0, '#070B1A');
  bg.addColorStop(0.55, '#12133A');
  bg.addColorStop(1, '#0B1633');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1200, 630);

  // Subtle aurora glow orbs
  const glow1 = ctx.createRadialGradient(260, 140, 20, 260, 140, 380);
  glow1.addColorStop(0, 'rgba(124, 58, 237, 0.35)');
  glow1.addColorStop(1, 'rgba(124, 58, 237, 0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, 1200, 630);

  const glow2 = ctx.createRadialGradient(980, 480, 20, 980, 480, 420);
  glow2.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
  glow2.addColorStop(1, 'rgba(56, 189, 248, 0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, 1200, 630);

  // Card frame
  ctx.fillStyle = 'rgba(15, 22, 48, 0.78)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(56, 52, 1088, 526, 28);
  ctx.fill();
  ctx.stroke();

  // Brand header
  ctx.fillStyle = '#38BDF8';
  ctx.font = '700 22px Sora, sans-serif';
  ctx.fillText('MINDMYSTERY', 102, 114);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '500 18px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Your Thoughts. Our Intelligence. One Mysterious Game.', 296, 113);

  // Category & timeline metadata
  const metaParts = [reveal.industry || reveal.category.replace('_', ' '), reveal.timelineChip]
    .filter(Boolean)
    .join('  ·  ');
  ctx.fillStyle = '#E879F9';
  ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(metaParts, 102, 178);

  // Main predicted answer
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 58px Sora, sans-serif';
  ctx.fillText(reveal.topCandidate.name.slice(0, 28), 102, 248);

  ctx.fillStyle = '#CBD5E1';
  ctx.font = '500 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(reveal.topCandidate.subtitle.slice(0, 68), 102, 290);

  // Explanation
  ctx.fillStyle = '#94A3B8';
  ctx.font = '400 22px "Plus Jakarta Sans", sans-serif';
  wrapText(ctx, `"${reveal.explanation}"`, 102, 348, 990, 32, 3);

  // Confidence bar & stats
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.beginPath();
  ctx.roundRect(102, 468, 520, 14, 7);
  ctx.fill();

  const barGrad = ctx.createLinearGradient(102, 468, 622, 468);
  barGrad.addColorStop(0, '#7C3AED');
  barGrad.addColorStop(1, '#38BDF8');
  ctx.fillStyle = barGrad;
  ctx.beginPath();
  ctx.roundRect(102, 468, Math.max(24, (520 * reveal.confidencePct) / 100), 14, 7);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillText(`${reveal.confidencePct}% · ${reveal.confidenceLabel}`, 102, 524);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '500 20px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`${reveal.questionsAsked} questions asked`, 670, 524);

  // Trigger download
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `mindmystery-${reveal.topCandidate.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return true;
}
