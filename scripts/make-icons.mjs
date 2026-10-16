// Builds the favicon and PWA icons in public/icons from the JobThread mark.
// Run with: npm run icons
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const INK = '#1B1F1D';
const MARK_PATH = 'M -30 35 V -5 L 0 -35 L 16 -19 V -30 H 24 V -11 L 30 -5 V 35 H 22 V 50 L 8 35 Z';

/**
 * White mark on an ink square. `scale` is how much of the square the mark's
 * 92-unit viewBox fills; maskable icons need the mark inside the middle 80%.
 */
function iconSvg({ size, scale, radius }) {
  const box = 92 / scale;
  const offset = (box - 92) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-46 - offset} ${-39 - offset} ${box} ${box}">
  <rect x="${-46 - offset}" y="${-39 - offset}" width="${box}" height="${box}" rx="${box * radius}" fill="${INK}"/>
  <path d="${MARK_PATH}" fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

const out = new URL('../public/icons/', import.meta.url);
await mkdir(out, { recursive: true });

await writeFile(new URL('favicon.svg', out), iconSvg({ size: 64, scale: 0.78, radius: 0.22 }));

const pngs = [
  { name: 'favicon-32.png', size: 32, scale: 0.8, radius: 0.22 },
  { name: 'apple-touch-icon.png', size: 180, scale: 0.66, radius: 0 },
  { name: 'icon-192.png', size: 192, scale: 0.66, radius: 0 },
  { name: 'icon-512.png', size: 512, scale: 0.66, radius: 0 },
  { name: 'icon-maskable-512.png', size: 512, scale: 0.5, radius: 0 },
];
for (const p of pngs) {
  await sharp(Buffer.from(iconSvg(p))).png().toFile(new URL(p.name, out).pathname);
}
console.log('Icons written to public/icons');
