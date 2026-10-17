// Builds landing/og.png, the preview image shown when jobthread.ca is shared.
// Run with: node scripts/make-og.mjs
import sharp from 'sharp';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#1B1F1D"/>
  <g transform="translate(90 92) scale(1.25)">
    <path d="M 33 12 H 67 Q 73 12 73 18 V 30 Q 73 36 67 36 H 45 L 36 43 L 37 36 H 33 Q 27 36 27 30 V 18 Q 27 12 33 12 Z" fill="#fff"/>
    <path d="M 54 45 V 71 Q 54 87 38 87 H 34" fill="none" stroke="#fff" stroke-width="14"/>
    <circle cx="34" cy="87" r="7" fill="#fff"/>
  </g>
  <text x="210" y="182" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="64" fill="#fff">JobThread</text>
  <text x="96" y="340" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="66" fill="#fff">Every change on the job,</text>
  <text x="96" y="420" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="66" fill="#fff">priced and approved in writing.</text>
  <text x="96" y="520" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="#C9CFCB">For small residential contractors · jobthread.ca</text>
  <rect x="96" y="556" width="140" height="8" rx="4" fill="#1F4FD1"/>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(new URL('../landing/og.png', import.meta.url).pathname);
console.log('Wrote landing/og.png');
