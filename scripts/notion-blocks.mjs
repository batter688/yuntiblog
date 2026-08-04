const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => escapeMap[char]);

export function slugify(value) {
  const normalized = String(value).trim().toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'section';
}

function richText(items = []) {
  return items.map((item) => {
    let content = escapeHtml(item.plain_text || item.text?.content || '');
    const annotations = item.annotations || {};
    if (annotations.code) content = `<code>${content}</code>`;
    if (annotations.bold) content = `<strong>${content}</strong>`;
    if (annotations.italic) content = `<em>${content}</em>`;
    if (annotations.strikethrough) content = `<del>${content}</del>`;
    if (annotations.underline) content = `<u>${content}</u>`;
    if (annotations.color && annotations.color !== 'default') {
      const color = annotations.color.replace('_background', '-background');
      content = `<span class="notion-text-color-${escapeHtml(color)}">${content}</span>`;
    }
    const href = item.href || item.text?.link?.url;
    if (href) content = `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${content}</a>`;
    return content;
  }).join('');
}

function blockText(block) {
  return richText(block[block.type]?.rich_text || []);
}

function blockPlainText(block) {
  return (block[block.type]?.rich_text || []).map((item) => item.plain_text || item.text?.content || '').join('');
}

function notionColorClass(prefix, color) {
  if (!color || color === 'default') return '';
  return ` ${prefix}-${String(color).replace('_background', '-background')}`;
}

function imageUrl(block) {
  const data = block.image || {};
  return data.type === 'external' ? data.external?.url : data.file?.url;
}

async function renderImage(block, context) {
  const url = imageUrl(block);
  if (!url) return '';
  if (!context.firstImageSrc) context.firstImageSrc = url;
  let src = url;
  if (context.downloadAsset) {
    try { src = await context.downloadAsset(url, block.image?.caption?.[0]?.plain_text || 'notion-image'); }
    catch (error) { context.warnings?.push(error.message); }
  }
  const caption = richText(block.image?.caption || []);
  return `<figure class="notion-image"><img src="${escapeHtml(src)}" alt="${escapeHtml(caption.replace(/<[^>]+>/g, ''))}" loading="lazy">${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
}

async function renderTable(block, context) {
  const rows = block.children || (context.getChildren ? await context.getChildren(block.id) : []);
  const renderedRows = rows.filter((row) => row.type === 'table_row').map((row) => {
    const cells = row.table_row?.cells || [];
    return `<tr>${cells.map((cell) => `<td>${richText(cell)}</td>`).join('')}</tr>`;
  });
  if (!renderedRows.length) return '';
  const hasHeader = block.table?.has_column_header;
  const first = renderedRows[0];
  const rest = renderedRows.slice(1);
  const header = hasHeader ? `<thead>${first.replaceAll('<td>', '<th>').replaceAll('</td>', '</th>')}</thead>` : '';
  const body = `<tbody>${(hasHeader ? rest : renderedRows).join('')}</tbody>`;
  return `<div class="notion-table-wrap"><table>${header}${body}</table></div>`;
}

function renderListItem(block, tag, inner) {
  const content = blockText(block);
  return `<${tag}><li>${content}${inner ? `<div class="notion-list-nested">${inner}</div>` : ''}</li></${tag}>`;
}

async function renderChildren(block, context) {
  if (!block.has_children || !context.getChildren) return '';
  const children = await context.getChildren(block.id);
  return renderBlocks(children, context);
}

export async function renderBlocks(blocks, context = {}) {
  const output = [];
  let index = 0;
  while (index < blocks.length) {
    const block = blocks[index];
    const type = block.type;
    if (type === 'bulleted_list_item' || type === 'numbered_list_item') {
      const tag = type === 'numbered_list_item' ? 'ol' : 'ul';
      const items = [];
      while (index < blocks.length && blocks[index].type === type) {
        const current = blocks[index];
        const nested = await renderChildren(current, context);
        items.push(`<li>${blockText(current)}${nested ? `<div class="notion-list-nested">${nested}</div>` : ''}</li>`);
        index += 1;
      }
      output.push(`<${tag} class="notion-list-${tag === 'ol' ? 'numbered' : 'bulleted'}">${items.join('')}</${tag}>`);
      continue;
    }
    if (type === 'heading_1' || type === 'heading_2' || type === 'heading_3') {
      const level = Number(type.slice(-1));
      const text = blockText(block);
      const plain = (block[type]?.rich_text || []).map((item) => item.plain_text || '').join('');
      const id = slugify(plain);
      context.headings?.push({ level, id, text: plain });
      output.push(`<h${level} id="${escapeHtml(id)}"><a class="anchor" href="#${escapeHtml(id)}">#</a>${text}</h${level}>`);
      index += 1;
      continue;
    }
    if (type === 'paragraph') {
      const text = blockText(block);
      if (text) output.push(`<p>${text}</p>`);
      index += 1;
      continue;
    }
    if (type === 'quote') {
      const color = notionColorClass('notion-text-color', block.quote?.color);
      output.push(`<blockquote class="notion-quote${color}">${blockText(block).replace(/\n/g, '<br>')}</blockquote>`);
      index += 1;
      continue;
    }
    if (type === 'callout') {
      const data = block.callout || {};
      const color = notionColorClass('notion-color', data.color);
      const icon = data.icon?.type === 'emoji' ? data.icon.emoji : '';
      const ownContent = blockText(block);
      const children = await renderChildren(block, context);
      const iconHtml = icon ? `<span class="notion-callout-icon">${escapeHtml(icon)}</span>` : '';
      const content = `${ownContent ? `<p>${ownContent}</p>` : ''}${children}`;
      output.push(`<div class="notion-callout${color}">${iconHtml}<div class="notion-callout-content">${content}</div></div>`);
      index += 1;
      continue;
    }
    if (type === 'divider') {
      output.push('<hr>');
      index += 1;
      continue;
    }
    if (type === 'code') {
      const code = block.code?.rich_text?.map((item) => item.plain_text || '').join('') || '';
      const language = block.code?.language || 'plain text';
      output.push(`<div class="notion-code-block"><div class="notion-code-header"><span class="mac-dot close"></span><span class="mac-dot minimize"></span><span class="mac-dot maximize"></span><span class="notion-code-lang">${escapeHtml(language)}</span></div><pre><code class="language-${escapeHtml(language)}">${escapeHtml(code)}</code></pre></div>`);
      index += 1;
      continue;
    }
    if (type === 'image') {
      output.push(await renderImage(block, context));
      index += 1;
      continue;
    }
    if (type === 'bookmark' || type === 'embed' || type === 'link_preview') {
      const data = block[type] || {};
      const url = data.url || data.caption?.[0]?.href;
      if (url) output.push(`<p class="notion-bookmark"><a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a></p>`);
      index += 1;
      continue;
    }
    if (type === 'table') {
      output.push(await renderTable(block, context));
      index += 1;
      continue;
    }
    if (type === 'toggle') {
      const title = blockText(block);
      const children = await renderChildren(block, context);
      output.push(`<details class="notion-toggle"><summary>${title}</summary><div class="notion-toggle-content">${children}</div></details>`);
      index += 1;
      continue;
    }
    if (type === 'to_do') {
      const data = block.to_do || {};
      output.push(`<p class="notion-todo"><input type="checkbox" disabled ${data.checked ? 'checked' : ''}> ${blockText(block)}</p>`);
      index += 1;
      continue;
    }
    if (type === 'child_page') {
      output.push(`<p>${escapeHtml(block.child_page?.title || '')}</p>`);
      index += 1;
      continue;
    }
    if (block.has_children) {
      const children = await renderChildren(block, context);
      if (children) output.push(children);
    }
    index += 1;
  }
  return output.join('\n');
}
