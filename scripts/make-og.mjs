// Builds landing/og.png, the preview image shown when jobthread.ca is shared.
// Run with: node scripts/make-og.mjs
import sharp from 'sharp';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#1B1F1D"/>
  <g transform="translate(96 104) scale(0.62)" fill="#FFD21F">
    <path fill-rule="evenodd" d="M66 8 V114 H38 Q4 114 4 80 V42 Q4 8 38 8 Z M51 27 V95 H38 Q21 95 21 78 V44 Q21 27 38 27 Z"/>
    <path fill-rule="evenodd" d="M64 18 L218 28 Q231 29 231 42 V80 Q231 93 218 93 H102 L76 118 L80 93 H64 Z M79 29.3 L215 38.6 Q220 39 220 44 V77 Q220 82 215 82 H79 Q75 82 75 78 V33 Q75 29 79 29.3 Z"/>
    <rect x="84" y="42" width="120" height="9" rx="4.5"/>
    <rect x="84" y="55" width="120" height="9" rx="4.5"/>
    <rect x="84" y="68" width="66" height="9" rx="4.5"/>
    <path d="M104 92 l5 15 l14 -15 Z M123 92 l5 15 l14 -15 Z M142 92 l5 15 l14 -15 Z M161 92 l5 15 l14 -15 Z M180 92 l5 15 l14 -15 Z M199 92 l5 15 l14 -15 Z"/>
  </g>
  <text x="262" y="166" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="64" fill="#fff">JobThread</text>
  <text x="96" y="340" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="66" fill="#fff">Every change on the job,</text>
  <text x="96" y="420" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="66" fill="#fff">priced and approved in writing.</text>
  <text x="96" y="520" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="#C9CFCB">For small residential contractors · jobthread.ca</text>
  <rect x="96" y="556" width="140" height="8" rx="4" fill="#FFD21F"/>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(new URL('../landing/og.png', import.meta.url).pathname);
console.log('Wrote landing/og.png');
