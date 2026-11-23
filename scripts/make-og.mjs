// Builds landing/og.png, the preview image shown when jobthread.ca is shared.
// Run with: node scripts/make-og.mjs
import sharp from 'sharp';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#1B1F1D"/>
  <text x="232" y="182" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="64" fill="#fff">JobThread</text>
  <text x="96" y="340" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="66" fill="#fff">Every change on the job,</text>
  <text x="96" y="420" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="66" fill="#fff">priced and approved in writing.</text>
  <text x="96" y="520" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="#C9CFCB">For small residential contractors · jobthread.ca</text>
  <rect x="96" y="556" width="140" height="8" rx="4" fill="#1F4FD1"/>
</svg>`;

const logo = await sharp(new URL('../assets/logo-1024.png', import.meta.url).pathname).resize(112, 112).png().toBuffer();
await sharp(Buffer.from(svg))
  .composite([{ input: logo, left: 96, top: 92 }])
  .png()
  .toFile(new URL('../landing/og.png', import.meta.url).pathname);
console.log('Wrote landing/og.png');
