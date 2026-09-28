const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const assets = path.join(root, "assets");
const output = path.join(assets, "signalerfassung-share-preview.png");

const width = 1200;
const height = 630;

const overlay = Buffer.from(`
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#001b38" stop-opacity="0.98"/>
      <stop offset="0.53" stop-color="#003f7c" stop-opacity="0.91"/>
      <stop offset="1" stop-color="#001f42" stop-opacity="0.72"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.98"/>
      <stop offset="1" stop-color="#eaf4fb" stop-opacity="0.95"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#00142b" flood-opacity="0.36"/>
    </filter>
  </defs>

  <rect width="1200" height="630" fill="url(#shade)"/>
  <rect width="1200" height="8" fill="#f2a900"/>
  <path d="M0 520 L540 0 L760 0 L185 630 L0 630 Z" fill="#0f6fc6" opacity="0.13"/>
  <path d="M175 630 L805 0" stroke="#7fc3ff" stroke-opacity="0.15" stroke-width="1"/>
  <path d="M250 630 L880 0" stroke="#7fc3ff" stroke-opacity="0.10" stroke-width="1"/>

  <rect x="64" y="64" width="256" height="44" rx="22" fill="#ffffff" fill-opacity="0.10" stroke="#9bd3ff" stroke-opacity="0.50"/>
  <circle cx="88" cy="86" r="6" fill="#f2a900"/>
  <text x="108" y="93" font-family="Bahnschrift, Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="2" fill="#eaf4fb">SWS / SDP3</text>

  <text x="64" y="188" font-family="Bahnschrift, Arial, sans-serif" font-size="68" font-weight="800" fill="#ffffff">Messdaten</text>
  <text x="64" y="266" font-family="Bahnschrift, Arial, sans-serif" font-size="68" font-weight="800" fill="#ffd27a">schneller</text>
  <text x="64" y="344" font-family="Bahnschrift, Arial, sans-serif" font-size="68" font-weight="800" fill="#ffffff">verstehen.</text>

  <text x="68" y="402" font-family="Bahnschrift, Arial, sans-serif" font-size="25" font-weight="400" fill="#d8e9f7">Signalerfassungen lokal analysieren.</text>
  <text x="68" y="440" font-family="Bahnschrift, Arial, sans-serif" font-size="25" font-weight="400" fill="#d8e9f7">Auff&#228;lligkeiten markieren. Excel &amp; PDF exportieren.</text>

  <g filter="url(#shadow)">
    <rect x="770" y="58" width="366" height="500" rx="34" fill="url(#panel)" stroke="#ffffff" stroke-opacity="0.95" stroke-width="2"/>
  </g>
  <rect x="810" y="491" width="286" height="2" fill="#d4e5f3"/>
  <text x="953" y="528" text-anchor="middle" font-family="Bahnschrift, Arial, sans-serif" font-size="16" font-weight="700" letter-spacing="4" fill="#0054a6">DIAGNOSE TOOL</text>

  <rect x="64" y="510" width="310" height="58" rx="29" fill="#f2a900"/>
  <text x="219" y="547" text-anchor="middle" font-family="Bahnschrift, Arial, sans-serif" font-size="22" font-weight="800" fill="#06172d">signalerfassung.com</text>
</svg>
`);

async function createPreview() {
  const symbol = await sharp(path.join(assets, "signalerfassung-symbol.png"))
    .resize({ width: 300 })
    .png()
    .toBuffer();

  const wordmark = await sharp(path.join(assets, "signalerfassung-wordmark.png"))
    .resize({ width: 292 })
    .png()
    .toBuffer();

  await sharp(path.join(assets, "diagnosetechniker-team-blauer-lkw-20260912.png"))
    .resize(width, height, { fit: "cover", position: "attention" })
    .composite([
      { input: overlay, left: 0, top: 0 },
      { input: symbol, left: 803, top: 125 },
      { input: wordmark, left: 807, top: 395 },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(output);

  const metadata = await sharp(output).metadata();
  process.stdout.write(`${output}\n${metadata.width}x${metadata.height}\n`);
}

createPreview().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
