// Builds the favicons, PWA icons and header marks from the JobThread logo in
// assets/ (a white "J" on a rounded blue tile). Run with: npm run icons
//
// assets/logo-1024.png is the master. The 16, 32 and 48 px files are
// hand-tuned small sizes and are copied as they are.
import { copyFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const asset = (name) => new URL(`../assets/${name}`, import.meta.url).pathname;
const MASTER = asset('logo-1024.png');
// The tile's blue, for icons that need a full square behind the logo.
const BLUE = { r: 26, g: 94, b: 220, alpha: 1 };

/** The logo with its rounded corners, scaled to `size`. */
const tile = (size) => sharp(MASTER).resize(size, size, { kernel: 'lanczos3' }).png();

/**
 * The logo on a full blue square, for iOS and Android, which round the
 * corners themselves. `scale` shrinks the logo to keep the J inside the
 * maskable safe zone.
 */
async function fullBleed(size, scale = 1) {
  const inner = Math.round(size * scale);
  const logo = await sharp(MASTER).resize(inner, inner, { kernel: 'lanczos3' }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: BLUE } })
    .composite([{ input: logo, gravity: 'center' }])
    .png();
}

async function write(img, dir, name) {
  await mkdir(new URL(dir, import.meta.url), { recursive: true });
  await img.toFile(new URL(`${dir}${name}`, import.meta.url).pathname);
}

for (const dir of ['../public/icons/', '../landing/']) {
  await mkdir(new URL(dir, import.meta.url), { recursive: true });
  for (const s of [16, 32, 48]) {
    await copyFile(asset(`logo-${s}.png`), new URL(`${dir}favicon-${s}.png`, import.meta.url).pathname);
  }
  await write(await fullBleed(180), dir, 'apple-touch-icon.png');
  // The mark shown in headers, at up to 3x for a 32 px slot.
  await write(tile(96), dir, 'mark-96.png');
}
await write(tile(192), '../public/icons/', 'icon-192.png');
await write(tile(512), '../public/icons/', 'icon-512.png');
// Maskable icons get cropped to a circle; keep the J in the middle 80%.
await write(await fullBleed(512, 0.86), '../public/icons/', 'icon-maskable-512.png');
console.log('Icons written to public/icons and landing');
