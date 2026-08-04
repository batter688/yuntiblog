import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadFile } from './notion-client.mjs';
import { generateSite } from './site-generator.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DIST_DIR = path.join(ROOT, 'dist');
const ASSET_DIR = path.join(DIST_DIR, 'assets');

async function writePage(filePath, content) {
  const destination = path.join(DIST_DIR, ...filePath.split('/'));
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, content, 'utf8');
}

async function build() {
  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await fs.mkdir(DIST_DIR, { recursive: true });
  await fs.cp(PUBLIC_DIR, DIST_DIR, { recursive: true, force: true });
  await fs.mkdir(ASSET_DIR, { recursive: true });

  const result = await generateSite({
    writePage,
    downloadAsset: (url, name) => downloadFile(url, ASSET_DIR, name)
  });

  await fs.writeFile(path.join(DIST_DIR, '_redirects'), '/* /404.html 404\n', 'utf8');
  console.log(`Build complete: ${result.stats.posts} posts, ${result.stats.tags} tags, ${result.stats.categories} categories. Output: ${DIST_DIR}`);
}

build().catch((error) => {
  console.error(`Build failed: ${error.message}`);
  process.exitCode = 1;
});
