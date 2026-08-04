import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const API_ROOT = 'https://api.notion.com/v1';
const NOTION_VERSION = '2025-09-03';

function loadDotEnv(file = '.env') {
  return fs.readFile(file, 'utf8').then((text) => {
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const index = line.indexOf('=');
      if (index < 0) continue;
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  }).catch(() => undefined);
}

export async function prepareEnvironment() {
  await loadDotEnv();
  const token = process.env.NOTION_TOKEN?.trim();
  const dataSourceId = (process.env.NOTION_DATA_SOURCE_ID || '268b4eb6-c211-8193-96cd-000b1cfb7b9a').trim();
  if (!token) {
    throw new Error('缺少 NOTION_TOKEN。请复制 .env.example 为 .env，并填入 Notion Integration Token。');
  }
  return { token, dataSourceId };
}

async function notionRequest(token, pathname, options = {}) {
  const response = await fetch(`${API_ROOT}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.text();
  let payload;
  try { payload = body ? JSON.parse(body) : {}; } catch { payload = { raw: body }; }
  if (!response.ok) {
    const detail = payload?.message || payload?.code || body || response.statusText;
    throw new Error(`Notion API ${response.status}: ${detail}`);
  }
  return payload;
}

async function queryDataSource(token, dataSourceId, filter, sorts) {
  const rows = [];
  let startCursor;
  do {
    const payload = await notionRequest(token, `/data_sources/${encodeURIComponent(dataSourceId)}/query`, {
      method: 'POST',
      body: JSON.stringify({ page_size: 100, start_cursor: startCursor, filter, ...(sorts?.length ? { sorts } : {}) })
    });
    rows.push(...(payload.results || []));
    startCursor = payload.has_more ? payload.next_cursor : undefined;
  } while (startCursor);
  return rows;
}

export async function queryPosts(token, dataSourceId) {
  return queryDataSource(token, dataSourceId, {
    and: [
      { property: 'type', select: { equals: 'Post' } },
      { property: 'status', select: { equals: 'Published' } }
    ]
  }, [
    // The published Post rows in the main database table are ordered by their article date.
    { property: 'date', direction: 'ascending' }
  ]);
}

export async function queryPublishedPages(token, dataSourceId) {
  return queryDataSource(token, dataSourceId, { property: 'status', select: { equals: 'Published' } });
}

export async function queryAllPages(token, dataSourceId) {
  return queryDataSource(token, dataSourceId);
}

export async function getBlockChildren(token, blockId) {
  const blocks = [];
  let startCursor;
  do {
    const query = new URLSearchParams({ page_size: '100' });
    if (startCursor) query.set('start_cursor', startCursor);
    const payload = await notionRequest(token, `/blocks/${encodeURIComponent(blockId)}/children?${query}`, { method: 'GET' });
    blocks.push(...(payload.results || []));
    startCursor = payload.has_more ? payload.next_cursor : undefined;
  } while (startCursor);
  return blocks;
}

export async function downloadFile(url, outputDir, preferredName = 'image') {
  if (!url) return null;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载 Notion 文件失败 ${response.status}: ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);
  const contentType = response.headers.get('content-type') || '';
  const extFromType = contentType.split('/')[1]?.split(';')[0]?.replace(/[^a-z0-9]/gi, '');
  const extFromUrl = path.extname(new URL(url).pathname).replace(/[^a-z0-9.]/gi, '').slice(0, 8);
  const ext = extFromUrl || (extFromType ? `.${extFromType}` : '.bin');
  const safeName = String(preferredName).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'file';
  const filename = `${safeName}-${hash}${ext}`;
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, filename), buffer);
  return `/assets/${filename}`;
}

function fileObjectUrl(fileObject) {
  if (!fileObject) return null;
  if (fileObject.type === 'external') return fileObject.external?.url || null;
  if (fileObject.type === 'file') return fileObject.file?.url || null;
  return null;
}

export function propertyValue(property) {
  if (!property) return null;
  switch (property.type) {
    case 'title': return property.title?.map((item) => item.plain_text || item.text?.content || '').join('') || '';
    case 'rich_text': return property.rich_text?.map((item) => item.plain_text || item.text?.content || '').join('') || '';
    case 'select': return property.select?.name || null;
    case 'multi_select': return (property.multi_select || []).map((item) => item.name);
    case 'date': return property.date?.start || null;
    case 'checkbox': return Boolean(property.checkbox);
    case 'url': return property.url || null;
    case 'number': return property.number ?? null;
    case 'files': return (property.files || []).map(fileObjectUrl).filter(Boolean);
    case 'email': return property.email || null;
    case 'phone_number': return property.phone_number || null;
    case 'created_time': return property.created_time || null;
    case 'last_edited_time': return property.last_edited_time || null;
    default: return null;
  }
}

export function normalizePage(page) {
  const values = Object.fromEntries(Object.entries(page.properties || {}).map(([name, property]) => [name, propertyValue(property)]));
  let tags = values.tags;
  if (typeof tags === 'string') {
    try { tags = JSON.parse(tags); } catch { tags = tags ? [tags] : []; }
  }
  return {
    id: page.id,
    url: page.url,
    title: values.title || '未命名文章',
    date: values.date || values['date:date:start'] || null,
    type: values.type || null,
    status: values.status || null,
    category: values.category || null,
    slug: values.slug || null,
    summary: values.summary || '',
    tags: Array.isArray(tags) ? tags : [],
    comment: values.comment || 'Hide',
    icon: values.icon || null,
    notionIcon: page.icon || null,
    coverSource: fileObjectUrl(page.cover),
    password: values.password || null,
    lastEditedTime: page.last_edited_time || null,
    createdTime: page.created_time || null
  };
}
