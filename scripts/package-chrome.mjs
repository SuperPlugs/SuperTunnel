import { createHash } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { deflateRawSync } from "node:zlib";

const distDir = resolve(process.cwd(), "dist-extension");
const manifestPath = join(distDir, "manifest.json");

if (!existsSync(manifestPath)) {
  console.error(
    "Error: dist-extension/manifest.json does not exist. Please run 'pnpm build:extension' first.",
  );
  process.exit(1);
}

const manifestRaw = readFileSync(manifestPath, "utf8");
let manifest;
try {
  manifest = JSON.parse(manifestRaw);
} catch (error) {
  console.error("Error: Failed to parse dist-extension/manifest.json:", error);
  process.exit(1);
}

function collectFiles(dir) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (
      entry.isFile() &&
      !entry.name.endsWith(".zip") &&
      !entry.name.endsWith(".crx")
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = collectFiles(distDir);

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

function createZip(filePaths, baseDir) {
  const localHeaders = [];
  const centralHeaders = [];
  let currentOffset = 0;

  const dosTime = (0 << 11) | (0 << 5) | (0 >> 1);
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const filePath of filePaths) {
    const relativePath = relative(baseDir, filePath).replace(/\\/g, "/");
    const nameBuffer = Buffer.from(relativePath, "utf8");
    const rawData = readFileSync(filePath);
    const checksum = crc32(rawData);
    const uncompressedSize = rawData.length;

    const compressedData = deflateRawSync(rawData);
    const compressedSize = compressedData.length;
    const compressionMethod = 8;

    const localHeader = Buffer.alloc(30 + nameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(compressionMethod, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuffer.copy(localHeader, 30);

    localHeaders.push(localHeader, compressedData);

    const centralHeader = Buffer.alloc(46 + nameBuffer.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(compressionMethod, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0x81a40000, 38);
    centralHeader.writeUInt32LE(currentOffset, 42);
    nameBuffer.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);
    currentOffset += localHeader.length + compressedData.length;
  }

  const centralDirOffset = currentOffset;
  const centralDirBuffer = Buffer.concat(centralHeaders);
  const centralDirSize = centralDirBuffer.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(filePaths.length, 8);
  eocd.writeUInt16LE(filePaths.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, centralDirBuffer, eocd]);
}

const zipBuffer = createZip(files, distDir);
const zipPath = join(distDir, "supertunnel-chrome.zip");
writeFileSync(zipPath, zipBuffer);

const zipHash = createHash("sha256").update(zipBuffer).digest("hex");

console.log("\n========================================================");
console.log("🌐 SuperTunnel Chrome Extension Package Created Successfully!");
console.log("========================================================");
console.log(`Version       : ${manifest.version}`);
console.log(`Manifest Vers : MV${manifest.manifest_version}`);
console.log(`Files Included: ${files.length}`);
console.log(`Archive Size  : ${(zipBuffer.length / 1024).toFixed(2)} KB`);
console.log(`SHA-256       : ${zipHash}`);
console.log("--------------------------------------------------------");
console.log(`Package Path  : ${zipPath}`);
console.log("========================================================\n");
