const fs = require('fs');
const zlib = require('zlib');

// CRC32 table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xFF];
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const typeAndData = buf.subarray(4, 8 + len);
  const crc = crc32(typeAndData);
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

function generateIcon(size) {
  const scanlines = [];
  const w = size;
  const h = size;

  // Colors
  // Dark green: #16231D -> 22, 35, 29, 255
  // Cream: #F6F1E7 -> 246, 241, 231, 255
  // Amber: #E8A33D -> 232, 163, 61, 255

  const cx = w / 2;
  const cy = h / 2;
  const cornerR = w * 0.22;
  const tableR = w * 0.24;
  const dotR = w * 0.065;
  const dotDist = tableR + dotR * 1.6;

  for (let y = 0; y < h; y++) {
    const line = Buffer.alloc(1 + w * 4);
    line[0] = 0; // Filter None
    for (let x = 0; x < w; x++) {
      const idx = 1 + x * 4;

      // Rounded rect check
      const dxBox = Math.max(0, Math.abs(x - cx) - (cx - cornerR));
      const dyBox = Math.max(0, Math.abs(y - cy) - (cy - cornerR));
      const inBox = (dxBox * dxBox + dyBox * dyBox <= cornerR * cornerR);

      if (!inBox) {
        line[idx] = 0; line[idx + 1] = 0; line[idx + 2] = 0; line[idx + 3] = 0;
        continue;
      }

      // Default dark green
      let r = 22, g = 35, b = 29, a = 255;

      // Table circle check
      const distTable = Math.hypot(x - cx, y - cy);
      if (distTable <= tableR) {
        r = 246; g = 241; b = 231;
      }

      // 4 amber dots (guests at top, bottom, left, right)
      const dots = [
        [cx, cy - dotDist],
        [cx, cy + dotDist],
        [cx - dotDist, cy],
        [cx + dotDist, cy]
      ];
      for (const [dotX, dotY] of dots) {
        if (Math.hypot(x - dotX, y - dotY) <= dotR) {
          r = 232; g = 163; b = 61;
          break;
        }
      }

      line[idx] = r; line[idx + 1] = g; line[idx + 2] = b; line[idx + 3] = a;
    }
    scanlines.push(line);
  }

  const rawData = Buffer.concat(scanlines);
  const compressed = zlib.deflateSync(rawData);

  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // Bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // Deflate
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

if (!fs.existsSync('icons')) {
  fs.mkdirSync('icons', { recursive: true });
}

fs.writeFileSync('icons/icon-192.png', generateIcon(192));
fs.writeFileSync('icons/icon-512.png', generateIcon(512));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <rect width="512" height="512" rx="112" fill="#16231D"/>
  <!-- Table -->
  <circle cx="256" cy="256" r="124" fill="#F6F1E7" stroke="#E8A33D" stroke-width="6"/>
  <!-- 4 Guest dots -->
  <circle cx="256" cy="80" r="34" fill="#E8A33D"/>
  <circle cx="256" cy="432" r="34" fill="#E8A33D"/>
  <circle cx="80" cy="256" r="34" fill="#E8A33D"/>
  <circle cx="432" cy="256" r="34" fill="#E8A33D"/>
</svg>`;
fs.writeFileSync('icons/icon.svg', svg);
console.log('Icons generated successfully!');

