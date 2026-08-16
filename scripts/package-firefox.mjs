import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { deflateRawSync } from "node:zlib";

const distDir = resolve(process.cwd(), "dist-firefox");
const manifestPath = join(distDir, "manifest.json");

if (!existsSync(manifestPath)) {
  console.error(
    "Error: dist-firefox/manifest.json does not exist. Please run 'pnpm build:firefox' first.",
  );
  process.exit(1);
}

// 1. Validate manifest
const manifestRaw = readFileSync(manifestPath, "utf8");
let manifest;
try {
  manifest = JSON.parse(manifestRaw);
} catch (error) {
  console.error("Error: Failed to parse dist-firefox/manifest.json:", error);
  process.exit(1);
}

const errors = [];

if (manifest.manifest_version !== 3 && manifest.manifest_version !== 2) {
  errors.push("manifest_version must be 2 or 3");
}

const geckoId = manifest.browser_specific_settings?.gecko?.id;
if (!geckoId || typeof geckoId !== "string" || !geckoId.trim()) {
  errors.push("Missing browser_specific_settings.gecko.id in manifest.json (required for Firefox Add-ons)");
}

const popupPath = manifest.action?.default_popup;
if (popupPath && !existsSync(join(distDir, popupPath))) {
  errors.push(`Popup file not found at: ${popupPath}`);
}

const bgScripts = manifest.background?.scripts || [];
if (bgScripts.length === 0 && manifest.background?.service_worker) {
  bgScripts.push(manifest.background.service_worker);
}
for (const script of bgScripts) {
  if (!existsSync(join(distDir, script))) {
    errors.push(`Background script not found at: ${script}`);
  }
}

if (manifest.icons) {
  for (const [size, iconPath] of Object.entries(manifest.icons)) {
    if (!existsSync(join(distDir, iconPath))) {
      errors.push(`Icon (${size}px) not found at: ${iconPath}`);
    }
  }
}

if (errors.length > 0) {
  console.error("\n❌ Manifest validation failed for Firefox Add-on:");
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

// 2. Gather all files in dist-firefox (exclude existing zip/xpi)
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
      !entry.name.endsWith(".xpi")
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = collectFiles(distDir);

// 3. CRC32 implementation
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

// 4. Build standard ZIP archive
function createZip(filePaths, baseDir) {
  const localHeaders = [];
  const centralHeaders = [];
  let currentOffset = 0;

  // Fixed DOS timestamp: 2026-01-01 00:00:00
  const dosTime = (0 << 11) | (0 << 5) | (0 >> 1);
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const filePath of filePaths) {
    const relativePath = relative(baseDir, filePath).replace(/\\/g, "/");
    const nameBuffer = Buffer.from(relativePath, "utf8");
    const rawData = readFileSync(filePath);
    const checksum = crc32(rawData);
    const uncompressedSize = rawData.length;

    // Use deflate compression
    const compressedData = deflateRawSync(rawData);
    const compressedSize = compressedData.length;
    const compressionMethod = 8; // Deflate

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30 + nameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local header signature
    localHeader.writeUInt16LE(20, 4); // Version needed (2.0)
    localHeader.writeUInt16LE(0, 6); // General purpose bit flag
    localHeader.writeUInt16LE(compressionMethod, 8); // Compression method
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28); // Extra field length
    nameBuffer.copy(localHeader, 30);

    localHeaders.push(localHeader, compressedData);

    // Central directory header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46 + nameBuffer.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central directory signature
    centralHeader.writeUInt16LE(20, 4); // Version made by
    centralHeader.writeUInt16LE(20, 6); // Version needed
    centralHeader.writeUInt16LE(0, 8); // Bit flag
    centralHeader.writeUInt16LE(compressionMethod, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30); // Extra field length
    centralHeader.writeUInt16LE(0, 32); // File comment length
    centralHeader.writeUInt16LE(0, 34); // Disk number start
    centralHeader.writeUInt16LE(0, 36); // Internal file attributes
    centralHeader.writeUInt32LE(0x81a40000, 38); // External file attributes (regular file -rw-r--r--)
    centralHeader.writeUInt32LE(currentOffset, 42); // Relative offset of local header
    nameBuffer.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);
    currentOffset += localHeader.length + compressedData.length;
  }

  const centralDirOffset = currentOffset;
  const centralDirBuffer = Buffer.concat(centralHeaders);
  const centralDirSize = centralDirBuffer.length;

  // End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4); // Number of this disk
  eocd.writeUInt16LE(0, 6); // Disk where central directory starts
  eocd.writeUInt16LE(filePaths.length, 8); // Entries on this disk
  eocd.writeUInt16LE(filePaths.length, 10); // Total entries
  eocd.writeUInt32LE(centralDirSize, 12); // Size of central directory
  eocd.writeUInt32LE(centralDirOffset, 16); // Offset of central directory
  eocd.writeUInt16LE(0, 20); // ZIP comment length

  return Buffer.concat([...localHeaders, centralDirBuffer, eocd]);
}

const zipBuffer = createZip(files, distDir);

const zipPath = join(distDir, "supertunnel-firefox.zip");
const xpiPath = join(distDir, "supertunnel-firefox.xpi");

writeFileSync(zipPath, zipBuffer);
writeFileSync(xpiPath, zipBuffer);

const zipHash = createHash("sha256").update(zipBuffer).digest("hex");

console.log("\n========================================================");
console.log("🦊 SuperTunnel Firefox Add-on Package Created Successfully!");
console.log("========================================================");
console.log(`Add-on ID     : ${geckoId}`);
console.log(`Version       : ${manifest.version}`);
console.log(`Manifest Vers : MV${manifest.manifest_version}`);
console.log(`Files Included: ${files.length}`);
console.log(`Archive Size  : ${(zipBuffer.length / 1024).toFixed(2)} KB`);
console.log(`SHA-256       : ${zipHash}`);
console.log("--------------------------------------------------------");
console.log("Generated Packages:");
console.log(` 1. AMO Upload Package : ${zipPath}`);
console.log(` 2. Firefox Add-on XPI : ${xpiPath}`);
console.log("--------------------------------------------------------");
console.log("Included Files:");
for (const file of files) {
  const rel = relative(distDir, file).replace(/\\/g, "/");
  const sz = statSync(file).size;
  console.log(`  - ${rel.padEnd(35)} (${(sz / 1024).toFixed(2)} KB)`);
}
console.log("========================================================");
console.log("\nTo test locally in Firefox:");
console.log(" 1. Open Firefox and go to: about:debugging#/runtime/this-firefox");
console.log(" 2. Click 'Load Temporary Add-on...'");
console.log(` 3. Select: ${manifestPath}`);
console.log("    or select: dist-firefox/supertunnel-firefox.zip");
console.log("\nTo publish to Mozilla Add-ons (AMO):");
console.log(" 1. Go to https://addons.mozilla.org/developers/addon/submit/upload-listed");
console.log(` 2. Upload: ${zipPath}`);
console.log("========================================================\n");
