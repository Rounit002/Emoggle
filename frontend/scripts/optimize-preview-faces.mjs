// Convert the raw AI face PNGs into optimized WebPs at preview size.
// One-shot build helper — safe to delete after running.

import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = resolve(__dirname, "..", "public", "preview-faces");

const inputs = [
  { in: "violet.png", out: "violet.webp", width: 720 },
  { in: "pink.png",   out: "pink.webp",   width: 720 },
];

for (const { in: name, out, width } of inputs) {
  const src = resolve(dir, name);
  const dst = resolve(dir, out);
  await sharp(src)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toFile(dst);
  console.log(`✓ ${name} -> ${out}`);
}
