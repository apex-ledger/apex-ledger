import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const size = 512;
const png = new PNG({ width: size, height: size });

function insideRoundedRect(x, y, left, top, width, height, radius) {
  const cx = Math.max(left + radius, Math.min(x, left + width - radius));
  const cy = Math.max(top + radius, Math.min(y, top + height - radius));
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function blendPixel(x, y, color, alpha = 1) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (Math.floor(y) * size + Math.floor(x)) * 4;
  const a = Math.max(0, Math.min(1, alpha));
  png.data[i] = Math.round(png.data[i] * (1 - a) + color[0] * a);
  png.data[i + 1] = Math.round(png.data[i + 1] * (1 - a) + color[1] * a);
  png.data[i + 2] = Math.round(png.data[i + 2] * (1 - a) + color[2] * a);
  png.data[i + 3] = Math.round(255 * (a + (png.data[i + 3] / 255) * (1 - a)));
}

for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    if (!insideRoundedRect(x + 0.5, y + 0.5, 18, 18, 476, 476, 132)) continue;
    const t = (y - 18) / 476;
    blendPixel(x, y, [Math.round(30 - 18 * t), Math.round(112 - 56 * t), Math.round(80 - 39 * t)]);
  }
}

for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const outer = insideRoundedRect(x + 0.5, y + 0.5, 18, 18, 476, 476, 132);
    const inner = insideRoundedRect(x + 0.5, y + 0.5, 25, 25, 462, 462, 125);
    if (outer && !inner) blendPixel(x, y, [218, 177, 74], 0.75);
  }
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const star = [[256, 88], [283, 197], [365, 224], [283, 251], [256, 360], [229, 251], [147, 224], [229, 197]];
for (let y = 80; y <= 365; y++) {
  for (let x = 140; x <= 370; x++) if (pointInPolygon(x + 0.5, y + 0.5, star)) blendPixel(x, y, [240, 202, 103]);
}
for (let y = 382; y < 402; y++) for (let x = 138; x < 374; x++) blendPixel(x, y, [255, 255, 255], 0.9);
for (let y = 424; y < 444; y++) for (let x = 138; x < 286; x++) blendPixel(x, y, [255, 255, 255], 0.58);

const outDir = path.resolve('build');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'north-ledger-icon.png'), PNG.sync.write(png));
console.log(path.join(outDir, 'north-ledger-icon.png'));
