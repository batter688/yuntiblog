import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DIST_DIR = path.join(ROOT, 'dist');
const STATIC_FILES = ['styles.css', 'liquid.css', 'main.js', '404.html'];

async function buildRuntime() {
  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await fs.mkdir(DIST_DIR, { recursive: true });

  for (const file of STATIC_FILES) {
    await fs.copyFile(path.join(PUBLIC_DIR, file), path.join(DIST_DIR, file));
  }

  console.log(`Runtime build complete. Static assets copied to ${DIST_DIR}`);
}

buildRuntime().catch((error) => {
  console.error(`Runtime build failed: ${error.message}`);
  process.exitCode = 1;
});
