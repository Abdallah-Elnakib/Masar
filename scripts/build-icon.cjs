const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const pngToIco = require("png-to-ico").default;

async function buildIcon() {
  const root = path.join(__dirname, "..");
  const sourceSvg = path.join(root, "quality-assurance.svg");
  const tempPng256 = path.join(root, "icon-256.png");
  const tempPng128 = path.join(root, "icon-128.png");
  const tempPng64 = path.join(root, "icon-64.png");
  const tempPng48 = path.join(root, "icon-48.png");
  const tempPng32 = path.join(root, "icon-32.png");
  const tempPng16 = path.join(root, "icon-16.png");
  const destination = path.join(root, "quality-assurance.ico");

  console.log("Converting SVG to PNG at multiple sizes...");

  // Generate PNG files at different sizes
  await sharp(sourceSvg)
    .resize(256, 256)
    .png()
    .toFile(tempPng256);

  await sharp(sourceSvg)
    .resize(128, 128)
    .png()
    .toFile(tempPng128);

  await sharp(sourceSvg)
    .resize(64, 64)
    .png()
    .toFile(tempPng64);

  await sharp(sourceSvg)
    .resize(48, 48)
    .png()
    .toFile(tempPng48);

  await sharp(sourceSvg)
    .resize(32, 32)
    .png()
    .toFile(tempPng32);

  await sharp(sourceSvg)
    .resize(16, 16)
    .png()
    .toFile(tempPng16);

  console.log("Creating ICO file from PNGs...");
  const icon = await pngToIco([
    tempPng256,
    tempPng128,
    tempPng64,
    tempPng48,
    tempPng32,
    tempPng16,
  ]);

  await fs.writeFile(destination, icon);

  // Clean up temporary PNG files
  await fs.unlink(tempPng256);
  await fs.unlink(tempPng128);
  await fs.unlink(tempPng64);
  await fs.unlink(tempPng48);
  await fs.unlink(tempPng32);
  await fs.unlink(tempPng16);

  console.log("Icon built successfully!");
}

buildIcon().catch((error) => {
  console.error("Could not generate the Windows application icon:", error.message);
  process.exitCode = 1;
});