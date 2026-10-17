const fs = require("node:fs/promises");
const path = require("node:path");
const pngToIco = require("png-to-ico").default;

async function buildIcon() {
  const root = path.join(__dirname, "..");
  const source = path.join(root, "quality-assurance.png");
  const destination = path.join(root, "quality-assurance.ico");
  const icon = await pngToIco(source);

  await fs.writeFile(destination, icon);
}

buildIcon().catch((error) => {
  console.error("Could not generate the Windows application icon:", error.message);
  process.exitCode = 1;
});