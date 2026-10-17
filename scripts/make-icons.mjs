// Builds the favicon and PWA icons in public/icons from the JobThread mark.
// The full mark (src/components/Mark.tsx) is a handsaw whose blade is a text
// message; it's too wide for a square, so icons use the blade on its own: a
// message bubble with saw teeth. Run with: npm run icons
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const YELLOW = '#FFD21F';
const INK = '#111111';

// Glyph drawn in a 0..120 box.
const glyph = (color) => `
  <g fill="${color}">
    <path fill-rule="evenodd" d="M22 16 H98 Q110 16 110 28 V74 Q110 86 98 86 H40 L14 108 L20 86 H22 Q10 86 10 74 V28 Q10 16 22 16 Z M25 27 H95 Q99 27 99 31 V71 Q99 75 95 75 H25 Q21 75 21 71 V31 Q21 27 25 27 Z"/>
    <rect x="31" y="35" width="58" height="9" rx="4.5"/>
    <rect x="31" y="48" width="58" height="9" rx="4.5"/>
    <rect x="31" y="61" width="32" height="9" rx="4.5"/>
    <path d="M46 85 l5 14 l12 -14 Z M64 85 l5 14 l12 -14 Z M82 85 l5 14 l12 -14 Z"/>
  </g>`;

/** Ink glyph on a safety-yellow tile. `pad` is extra room around the glyph box, in glyph units. */
function iconSvg({ size, pad, radius }) {
  const box = 120 + 2 * pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-pad} ${-pad} ${box} ${box}">
  <rect x="${-pad}" y="${-pad}" width="${box}" height="${box}" rx="${box * radius}" fill="${YELLOW}"/>${glyph(INK)}
</svg>`;
}

const out = new URL('../public/icons/', import.meta.url);
await mkdir(out, { recursive: true });

await writeFile(new URL('favicon.svg', out), iconSvg({ size: 64, pad: 4, radius: 0.22 }));

// iOS and Android round the corners themselves, so the big icons are square.
const pngs = [
  { name: 'favicon-32.png', size: 32, pad: 2, radius: 0.22 },
  { name: 'apple-touch-icon.png', size: 180, pad: 20, radius: 0 },
  { name: 'icon-192.png', size: 192, pad: 20, radius: 0 },
  { name: 'icon-512.png', size: 512, pad: 20, radius: 0 },
  // Maskable icons get cropped to a circle; keep the glyph in the middle 60%.
  { name: 'icon-maskable-512.png', size: 512, pad: 44, radius: 0 },
];
for (const p of pngs) {
  await sharp(Buffer.from(iconSvg(p))).png().toFile(new URL(p.name, out).pathname);
}
console.log('Icons written to public/icons');
