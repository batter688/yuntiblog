import { getBlockChildren, normalizePage, prepareEnvironment, queryAllPages, queryPosts } from './notion-client.mjs';
import { escapeHtml, renderBlocks, slugify } from './notion-blocks.mjs';
import {
  archivePage,
  categoryDetailPage,
  categoryPage,
  configureNavigation,
  homePage,
  layout,
  plainPage,
  postPage,
  postPath,
  searchPage,
  tagPage
} from './render.mjs';

export function contentTypeForPath(filePath) {
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.xml')) return 'application/rss+xml; charset=utf-8';
  return 'text/html; charset=utf-8';
}

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
  return String(value).replace(/[<>&'\"]/g, (char) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;'
  })[char]);
}

function rss(posts) {
  const siteUrl = (process.env.SITE_URL || 'http://localhost:8888').replace(/\/$/, '');
  const items = posts.map((post) => `<item><title>${xmlEscape(post.title)}</title><link>${xmlEscape(siteUrl + postPath(post))}</link><guid isPermaLink="true">${xmlEscape(siteUrl + postPath(post))}</guid><pubDate>${new Date(`${post.date || '1970-01-01'}T00:00:00Z`).toUTCString()}</pubDate><description>${xmlEscape(post.summary || '')}</description></item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xmlEscape(process.env.SITE_NAME || 'YUNTI NOTES')}</title><link>${xmlEscape(siteUrl)}</link><description>${xmlEscape('YUNTI NOTES blog')}</description>${items}</channel></rss>`;
}

function notFoundPage() {
  return layout({
    title: '404',
    description: '页面不存在',
    body: '<section class="not-found"><div class="error-code">404</div><h1>页面不存在</h1><p>你访问的页面可能已移动、删除，或者尚未发布。</p><p><a class="tag" href="/">← 返回首页</a></p></section>'
  });
}

export async function generateSite({ writePage, downloadAsset }) {
  if (typeof writePage !== 'function') throw new TypeError('writePage must be a function');
  if (typeof downloadAsset !== 'function') throw new TypeError('downloadAsset must be a function');

  const { token, dataSourceId } = await prepareEnvironment();
  console.log(`Reading Notion data source ${dataSourceId}...`);

  const allPages = (await queryAllPages(token, dataSourceId)).map(normalizePage);
  const publishedPages = allPages.filter((page) => page.status === 'Published');
  configureNavigation(allPages);

  const pages = (await queryPosts(token, dataSourceId)).map(normalizePage);
  if (!pages.length) console.warn('No published Post pages found in Notion.');

  const childCache = new Map();
  const warnings = [];
  const assetCache = new Map();
  const writtenPaths = [];

  const write = async (filePath, content) => {
    const normalizedPath = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    await writePage(normalizedPath, content, contentTypeForPath(normalizedPath));
    writtenPaths.push(normalizedPath);
  };

  const cachedDownloadAsset = async (url, name) => {
    if (assetCache.has(url)) return assetCache.get(url);
    const result = await downloadAsset(url, name);
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
    const renderContext = { getChildren, downloadAsset: cachedDownloadAsset, headings, warnings };
    const contentHtml = await renderBlocks(blocks, renderContext);
    const coverSource = page.coverSource || renderContext.firstImageSrc || findFirstImage(blocks);
    let cover = null;
    if (coverSource) {
      try {
        cover = await cachedDownloadAsset(coverSource, slug);
      } catch (error) {
        warnings.push(error.message);
      }
    }
    posts.push({ ...page, slug, contentHtml, headings, cover });
  }

  for (const page of publishedPages.filter((item) => item.type === 'Page' && ['about', 'links', 'update'].includes(item.slug))) {
    const blocks = await getChildren(page.id);
    const headings = [];
    const contentHtml = await renderBlocks(blocks, {
      getChildren,
      downloadAsset: cachedDownloadAsset,
      headings,
      warnings
    });
    await write(`${page.slug}/index.html`, plainPage({ ...page, contentHtml }));
  }

  const stats = {
    posts: posts.length,
    tags: new Set(posts.flatMap((post) => post.tags || [])).size,
    categories: new Set(posts.map((post) => post.category).filter(Boolean)).size
  };

  await write('index.html', homePage(posts, stats));
  await write('archive/index.html', archivePage(posts));
  await write('category/index.html', categoryPage(posts));

  const categoryNames = [...new Set(posts.map((post) => post.category).filter(Boolean))];
  for (const category of categoryNames) {
    await write(`category/${slugify(category)}/index.html`, categoryDetailPage(category, posts));
  }

  await write('tag/index.html', tagPage(posts));
  await write('search/index.html', searchPage());

  for (let index = 0; index < posts.length; index += 1) {
    const post = posts[index];
    const previous = posts[index + 1] || null;
    const next = posts[index - 1] || null;
    await write(`posts/${post.slug}/index.html`, postPage(post, previous, next));
  }

  const searchData = posts.map((post) => ({
    title: post.title,
    url: postPath(post),
    date: post.date,
    summary: post.summary,
    tags: post.tags,
    category: post.category
  }));
  await write('search.json', JSON.stringify(searchData, null, 2));
  await write('rss.xml', rss(posts));
  await write('404.html', notFoundPage());

  if (warnings.length) {
    console.warn(`Generation completed with ${warnings.length} warning(s):`);
    for (const warning of warnings.slice(0, 20)) console.warn(`- ${warning}`);
  }

  return {
    stats,
    warnings,
    paths: writtenPaths,
    generatedAt: new Date().toISOString()
  };
}
