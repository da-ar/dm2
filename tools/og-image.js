/* Renders og-image.png, the 1200x630 picture chat apps show in link previews.
   Uses the game's own renderer, so re-run it after changing the stages or roster:
     node tools/og-image.js
   Needs Playwright with a Chromium browser (npm i -D playwright && npx playwright install chromium). */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const LINEUP = ['lich', 'skull', 'septi', 'sorta', 'chief', 'ganon', 'clara', 'megatrom'];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.join(root, 'index.html'));
  const dataUrl = await page.evaluate((lineup) => {
    const A = window.DM2.Arena;
    const src = document.createElement('canvas');
    src.width = A.W; src.height = A.H;
    const arena = new A(src);
    arena.setStage(3); // Neon Grid 1987
    arena.time = 2000;
    arena._draw();
    const ctx = src.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // fighters line up facing the middle
    const feet = 160, step = 37, x0 = 160 - step * (lineup.length - 1) / 2;
    lineup.forEach((id, i) => {
      const x = Math.round(x0 + i * step);
      arena._drawShadow(ctx, x, 0);
      const sprite = document.createElement('canvas');
      sprite.width = 24; sprite.height = 32;
      const sc = sprite.getContext('2d');
      window.DM2.sprites.pixels(id).forEach((p) => { sc.fillStyle = p.c; sc.fillRect(p.x, p.y, 1, 1); });
      ctx.save();
      ctx.translate(x, feet);
      if (x > 160) ctx.scale(-1, 1);
      ctx.drawImage(sprite, -24, -64, 48, 64);
      ctx.restore();
    });

    // logo in a 5x7 pixel font (the game's 3x5 M reads as H at this size), with stepped 8-bit depth
    const LOGO = {
      D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
      M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
      2: ['01110', '10001', '00001', '00110', '01000', '10000', '11111']
    };
    const px = 7, gap = 2, word = 'DM2';
    const logoW = word.length * 5 * px + (word.length - 1) * gap * px;
    const drawLogo = (x0, y0, color) => {
      ctx.fillStyle = color;
      [...word].forEach((ch, i) => LOGO[ch].forEach((row, y) => [...row].forEach((bit, x) => {
        if (bit === '1') ctx.fillRect(x0 + i * (5 + gap) * px + x * px, y0 + y * px, px, px);
      })));
    };
    const lx = Math.round(160 - logoW / 2), ly = 10;
    [['#140c1c', 3], ['#a0123c', 2], ['#ff3a6e', 1]].forEach(([c, d]) => drawLogo(lx + d, ly + d, c));
    drawLogo(lx, ly, '#ffd840');
    A.drawText(ctx, 'DEATH MATCH DECISION MAKER', 160, 72, '#4ad8ff', 2, '#140c1c');

    // scale 4x with hard pixels and crop to 1200x630
    const out = document.createElement('canvas');
    out.width = 1200; out.height = 630;
    const o = out.getContext('2d');
    o.imageSmoothingEnabled = false;
    o.drawImage(src, 10, 6, 300, 158, 0, 0, 1200, 632);
    return out.toDataURL('image/png');
  }, LINEUP);
  fs.writeFileSync(path.join(root, 'og-image.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
  await browser.close();
  console.log('wrote og-image.png');
})();
