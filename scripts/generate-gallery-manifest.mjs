import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const GALLERY_DIR = path.join(ROOT, 'public', 'static', 'assets', 'images', 'wedding-snaps');
const MANIFEST_PATH = path.join(GALLERY_DIR, 'manifest.json');

const IMAGE_EXTENSIONS = new Set(['.webp', '.jpg', '.jpeg', '.png', '.gif', '.avif']);

function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

async function main() {
  const entries = await fs.readdir(GALLERY_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort(naturalSort);

  const manifest = {
    generated_at: new Date().toISOString(),
    count: files.length,
    files,
  };

  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`[gallery-manifest] ${files.length} files -> ${MANIFEST_PATH}`);
}

main().catch((error) => {
  console.error('[gallery-manifest] Failed:', error);
  process.exit(1);
});
