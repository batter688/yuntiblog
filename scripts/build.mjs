import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBlockChildren, downloadFile, normalizePage, prepareEnvironment, queryAllPages, queryPosts } from './notion-client.mjs';
import { renderBlocks, slugify } from './notion-blocks.mjs';
import { archivePage, categoryDetailPage, categoryPage, configureNavigation, homePage, plainPage, postPage, postPath, searchPage, tagPage } from './render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DIST_DIR = path.join(ROOT, 'dist');
const ASSET_DIR = path.join(DIST_DIR, 'assets');

const write = async (file, content) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, 'utf8');
};

function safeSlug(value, fallbackTitle) {
  const raw = String(value || '').trim();
  if (/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(raw)) return raw;
  return slugify(raw || fallbackTitle);
}

function findFirstImage(blocks = []) {
  for (const block of blocks) {
    if (block.type === 'image') {
      const data = block.image || {};
      return data.type === 'external' ? data.external?.url : data.file?.url;
    }
    if (block.children) {
      const nested = findFirstImage(block.children);
      if (nested) return nested;
    }
  }
  return null;
}

function xmlEscape(value = '') {
  return String(value).replace(/[<>&'\"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char]);
}

function rss(posts) {
  const siteUrl = (process.env.SITE_URL || 'http://localhost:8888').replace(/\/$/, '');
  const items = posts.map((post) => `<item><title>${xmlEscape(post.title)}</title><link>${xmlEscape(siteUrl + postPath(post))}</link><guid isPermaLink="true">${xmlEscape(siteUrl + postPath(post))}</guid><pubDate>${new Date(`${post.date || '1970-01-01'}T00:00:00Z`).toUTCString()}</pubDate><description>${xmlEscape(post.summary || '')}</description></item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xmlEscape(process.env.SITE_NAME || 'YUNTI NOTES')}</title><link>${xmlEscape(siteUrl)}</link><description>${xmlEscape('YUNTI NOTES blog')}</description>${items}</channel></rss>`;
}

async function copyPublic() {
  await fs.cp(PUBLIC_DIR, DIST_DIR, { recursive: true, force: true });
}

async function build() {
  const { token, dataSourceId } = await prepareEnvironment();
  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await fs.mkdir(DIST_DIR, { recursive: true });
  await copyPublic();
  await fs.mkdir(ASSET_DIR, { recursive: true });

  console.log(`Reading Notion data source ${dataSourceId}...`);
  const allPages = (await queryAllPages(token, dataSourceId)).map(normalizePage);
  const publishedPages = allPages.filter((page) => page.status === 'Published');
  configureNavigation(allPages);
  // Query published Post rows using the main database table ordering rule.
  const pages = (await queryPosts(token, dataSourceId)).map(normalizePage);
  if (!pages.length) console.warn('No published Post pages found in Notion.');

  const childCache = new Map();
  const warnings = [];
  const assetCache = new Map();
  const downloadAsset = async (url, name) => {
    if (assetCache.has(url)) return assetCache.get(url);
    const result = await downloadFile(url, ASSET_DIR, name);
    assetCache.set(url, result);
    return result;
  };
  const getChildren = async (blockId) => {
    if (!childCache.has(blockId)) childCache.set(blockId, getBlockChildren(token, blockId));
    return childCache.get(blockId);
  };

  const posts = [];
  for (const page of pages) {
    const slug = safeSlug(page.slug, page.title);
    if (!page.slug) warnings.push(`Post "${page.title}" is missing slug; using ${slug}`);
    const blocks = await getChildren(page.id);
    const headings = [];
    const renderContext = { getChildren, downloadAsset, headings, warnings };
    const contentHtml = await renderBlocks(blocks, renderContext);
    // ???? Notion ??????? Cover??? Cover ????????????
    const coverSource = page.coverSource || renderContext.firstImageSrc || findFirstImage(blocks);
    let cover = null;
    if (coverSource) {
      try { cover = await downloadAsset(coverSource, slug); }
      catch (error) { warnings.push(error.message); }
    }
    posts.push({ ...page, slug, contentHtml, headings, cover });
  }


  for (const page of publishedPages.filter((item) => item.type === 'Page' && ['about', 'links', 'update'].includes(item.slug))) {
    const blocks = await getChildren(page.id);
    const headings = [];
    const contentHtml = await renderBlocks(blocks, { getChildren, downloadAsset, headings, warnings });
    await write(path.join(DIST_DIR, page.slug, 'index.html'), plainPage({ ...page, contentHtml }));
  }

  const stats = {
    posts: posts.length,
    tags: new Set(posts.flatMap((post) => post.tags || [])).size,
    categories: new Set(posts.map((post) => post.category).filter(Boolean)).size
  };

  await write(path.join(DIST_DIR, 'index.html'), homePage(posts, stats));
  await write(path.join(DIST_DIR, 'archive', 'index.html'), archivePage(posts));
  await write(path.join(DIST_DIR, 'category', 'index.html'), categoryPage(posts));
  const categoryNames = [...new Set(posts.map((post) => post.category).filter(Boolean))];
  for (const category of categoryNames) {
    await write(path.join(DIST_DIR, 'category', slugify(category), 'index.html'), categoryDetailPage(category, posts));
  }
  await write(path.join(DIST_DIR, 'tag', 'index.html'), tagPage(posts));
  await write(path.join(DIST_DIR, 'search', 'index.html'), searchPage());

  for (let index = 0; index < posts.length; index += 1) {
    const post = posts[index];
    const previous = posts[index + 1] || null;
    const next = posts[index - 1] || null;
    await write(path.join(DIST_DIR, 'posts', post.slug, 'index.html'), postPage(post, previous, next));
  }

  const searchData = posts.map((post) => ({ title: post.title, url: postPath(post), date: post.date, summary: post.summary, tags: post.tags, category: post.category }));
  await write(path.join(DIST_DIR, 'search.json'), JSON.stringify(searchData, null, 2));
  await write(path.join(DIST_DIR, 'rss.xml'), rss(posts));

  const oldPostDirs = await fs.readdir(path.join(ROOT, 'posts'), { withFileTypes: true }).catch(() => []);
  const titleToPost = new Map(posts.map((post) => [post.title, post]));
  const redirectLines = ['/* /404.html 404'];
  for (const entry of oldPostDirs.filter((item) => item.isDirectory())) {
    const match = [...titleToPost.entries()].find(([title]) => slugify(title) === slugify(entry.name) || title.replace(/[锛屻€侊紵銆傦紒锛燂細锛涳紙锛夈€愩€戔€溾€濃€樷€橽s]/g, '') === entry.name);
    if (match) redirectLines.push(`/posts/${entry.name}/ ${postPath(match[1])} 301`);
  }
  await write(path.join(DIST_DIR, '_redirects'), `${redirectLines.join('\n')}\n`);

  if (warnings.length) {
    console.warn(`Build completed with ${warnings.length} warning(s):`);
    for (const warning of warnings.slice(0, 20)) console.warn(`- ${warning}`);
  }
  console.log(`Build complete: ${posts.length} posts, ${stats.tags} tags, ${stats.categories} categories. Output: ${DIST_DIR}`);
}

build().catch((error) => {
  console.error(`Build failed: ${error.message}`);
  process.exitCode = 1;
});

