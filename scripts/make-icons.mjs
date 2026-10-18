// Builds the favicon and PWA icons in public/icons from the JobThread mark:
// a "j" whose dot is a speech bubble. Keep the paths in sync with
// src/components/Mark.tsx. Run with: npm run icons
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const BLUE = '#1F4FD1';

// Glyph drawn in a 0..100 box.
const glyph = (color) => `
  <path d="M 33 12 H 67 Q 73 12 73 18 V 30 Q 73 36 67 36 H 45 L 36 43 L 37 36 H 33 Q 27 36 27 30 V 18 Q 27 12 33 12 Z" fill="${color}"/>
  <path d="M 54 45 V 71 Q 54 87 38 87 H 34" fill="none" stroke="${color}" stroke-width="14"/>
  <circle cx="34" cy="87" r="7" fill="${color}"/>`;

/** White glyph on a blue tile. `pad` is extra room around the glyph box, in glyph units. */
function iconSvg({ size, pad, radius }) {
  const box = 100 + 2 * pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-pad} ${-pad} ${box} ${box}">
  <rect x="${-pad}" y="${-pad}" width="${box}" height="${box}" rx="${box * radius}" fill="${BLUE}"/>${glyph('#FFFFFF')}
</svg>`;
}

const out = new URL('../public/icons/', import.meta.url);
await mkdir(out, { recursive: true });

await writeFile(new URL('favicon.svg', out), iconSvg({ size: 64, pad: 10, radius: 0.22 }));

// iOS and Android round the corners themselves, so the big icons are square.
const pngs = [
  { name: 'favicon-32.png', size: 32, pad: 8, radius: 0.22 },
  { name: 'apple-touch-icon.png', size: 180, pad: 22, radius: 0 },
  { name: 'icon-192.png', size: 192, pad: 22, radius: 0 },
  { name: 'icon-512.png', size: 512, pad: 22, radius: 0 },
  // Maskable icons get cropped to a circle; keep the glyph in the middle 60%.
  { name: 'icon-maskable-512.png', size: 512, pad: 40, radius: 0 },
];
for (const p of pngs) {
  await sharp(Buffer.from(iconSvg(p))).png().toFile(new URL(p.name, out).pathname);
}
console.log('Icons written to public/icons');
