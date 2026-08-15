import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outputDirectory = join("extension", "icons");
mkdirSync(outputDirectory, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const [currentX, currentY] = points[index];
    const [previousX, previousY] = points[previous];
    const crosses = currentY > y !== previousY > y;
    if (crosses && x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToSegment(x, y, startX, startY, endX, endY) {
  const dx = endX - startX;
  const dy = endY - startY;
  const lengthSquared = dx * dx + dy * dy;
  const position = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((x - startX) * dx + (y - startY) * dy) / lengthSquared));
  return Math.hypot(x - (startX + position * dx), y - (startY + position * dy));
}

function colorAt(x, y) {
  const radius = 0.2;
  const outsideRoundedCorner =
    (x < radius && y < radius && Math.hypot(x - radius, y - radius) > radius) ||
    (x > 1 - radius && y < radius && Math.hypot(x - (1 - radius), y - radius) > radius) ||
    (x < radius && y > 1 - radius && Math.hypot(x - radius, y - (1 - radius)) > radius) ||
    (x > 1 - radius && y > 1 - radius && Math.hypot(x - (1 - radius), y - (1 - radius)) > radius);

  if (outsideRoundedCorner) {
    return [0, 0, 0, 0];
  }

  const background = [67, 74, 181, 255];
  const shield = [
    [0.5, 0.14],
    [0.78, 0.25],
    [0.73, 0.61],
    [0.65, 0.77],
    [0.5, 0.89],
    [0.35, 0.77],
    [0.27, 0.61],
    [0.22, 0.25],
  ];

  if (!pointInPolygon(x, y, shield)) {
    return background;
  }

  const onCheck =
    distanceToSegment(x, y, 0.36, 0.51, 0.47, 0.63) < 0.035 ||
    distanceToSegment(x, y, 0.47, 0.63, 0.67, 0.39) < 0.035;
  return onCheck ? background : [255, 255, 255, 255];
}

function createIcon(size) {
  const samples = 4;
  const scanlines = Buffer.alloc((size * 4 + 1) * size);

  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1);
    scanlines[rowOffset] = 0;
    for (let x = 0; x < size; x += 1) {
      const totals = [0, 0, 0, 0];
      for (let sampleY = 0; sampleY < samples; sampleY += 1) {
        for (let sampleX = 0; sampleX < samples; sampleX += 1) {
          const color = colorAt(
            (x + (sampleX + 0.5) / samples) / size,
            (y + (sampleY + 0.5) / samples) / size,
          );
          color.forEach((channel, index) => {
            totals[index] += channel;
          });
        }
      }

      const pixelOffset = rowOffset + 1 + x * 4;
      totals.forEach((total, index) => {
        scanlines[pixelOffset + index] = Math.round(total / (samples * samples));
      });
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(outputDirectory, `${size}.png`), createIcon(size));
}

console.log(`Generated SuperTunnel icons in ${outputDirectory}`);
