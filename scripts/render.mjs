import { escapeHtml, slugify } from './notion-blocks.mjs';

const SITE_NAME = process.env.SITE_NAME || '云梯笔记';
const SITE_DESCRIPTION = '分享科学上网、工具教程与生活思考';

let navigationHtml = '';

export function configureNavigation(pages = []) {
  const linkPage = pages.find(
    (page) => page.type === 'Page' && page.slug === 'links'
  );

  const showLinks = linkPage
    ? linkPage.status === 'Published'
    : pages.some(
        (page) =>
          page.status === 'Published' &&
          ['/links/', 'links'].includes(page.slug)
      );

  const items = [
    ['/', '首页'],
    ['/archive/', '归档'],
    ['/tag/', '标签'],
    ['/category/', '分类'],
    ['/about/', '关于'],
    ...(showLinks ? [['/links/', '友链']] : []),
    [
      'https://u.pcloud.link/publink/show?code=kZ0cm15ZQ3rMAviOY5JjnO6zRl1DQftBMqiV',
      '网盘资源'
    ],
    ['https://github.com/batter688', 'GitHub']
  ];

  navigationHtml = items
    .map(
      ([href, label]) =>
        `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`
    )
    .join('');
}


export function postPath(post) { return `/posts/${encodeURIComponent(post.slug)}/`; }

function formatDate(value, long = false) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return long ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(date) : value;
}

function themeScript() {
  return `<script>(function(){var t=localStorage.getItem('theme')||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);})();</script>`;
}

function header() {
  return `<header class="site-header"><div class="site-header-inner">
    <a class="site-brand" href="/"><span class="site-brand-icon" aria-hidden="true">🌐</span><span class="site-brand-copy"><span class="site-brand-name">${escapeHtml(SITE_NAME)}</span><span class="site-brand-note">CYBER CLOUD NODE</span></span></a>
    <nav class="site-nav">${navigationHtml}</nav>
    <button class="mobile-menu-toggle" type="button" aria-label="打开导航" aria-expanded="false"><span></span></button>
    <div class="site-actions"><button class="theme-toggle" aria-label="切换主题" onclick="toggleTheme()"><svg class="icon-sun" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l1.41-1.41M19.07 4.93l-1.41 1.41"/></svg><svg class="icon-moon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></button><a class="search-btn" href="/search/" aria-label="搜索"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></a></div>
  </div></header>`;
}

function footer() {
  return `<footer class="site-footer"><div class="site-footer-inner"><div><div class="footer-brand">${escapeHtml(SITE_NAME)}</div><div class="footer-saying"><span class="cyber-tag">GLOBAL TUNNEL</span> 穿透信息迷雾 · 赋能数字自由</div></div><div class="footer-meta">© ${new Date().getFullYear()} · Notion Synced · <a href="/rss.xml">[RSS FEED]</a></div></div></footer>`;
}

export function layout({ title = SITE_NAME, description = SITE_DESCRIPTION, body, bodyClass = '' }) {
  return `<!DOCTYPE html><html lang="zh-CN" data-theme="dark"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0"><title>${escapeHtml(title)} · ${escapeHtml(SITE_NAME)}</title><meta name="description" content="${escapeHtml(description)}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:type" content="article"><link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌐</text></svg>"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/liquid.css?v=7"><link rel="alternate" type="application/rss+xml" title="${escapeHtml(SITE_NAME)}" href="/rss.xml">${themeScript()}</head><body class="${escapeHtml(bodyClass)}"><div class="glass-bg" aria-hidden="true"><span class="glass-blob blob-1"></span><span class="glass-blob blob-2"></span><span class="glass-blob blob-3"></span></div><div class="reading-progress"><div class="bar"></div></div>${header()}<main class="site-main">${body}</main>${footer()}<script src="/main.js"></script></body></html>`;
}

function tags(tags = []) { return tags.map((tag) => `<a class="tag" href="/tag/#tag-${encodeURIComponent(tag)}">#${escapeHtml(tag)}</a>`).join(''); }

export function postCard(post, { pinned = false } = {}) {
  const url = postPath(post);
  const cover = post.cover ? `<img src="${escapeHtml(post.cover)}" alt="" loading="lazy">` : '<span class="post-card-cover-media" aria-hidden="true"></span>';
  return `<article class="post-card${post.cover ? ' has-cover' : ''}${pinned ? ' is-pinned' : ''}"><div class="cyber-card-bar"><span class="cyber-badge-node">NODE SYSTEM</span><span class="cyber-badge-enc">AES-256</span></div>${pinned ? '<div class="post-card-pinned-badge">⚡ TOP NODE</div>' : ''}<a class="post-card-cover" href="${url}">${cover}</a><div class="post-card-body"><div class="post-card-meta"><time datetime="${escapeHtml(post.date || '')}">${escapeHtml(post.date || '')}</time>${post.category ? `<span class="post-category">${escapeHtml(post.category)}</span>` : ''}</div><h3 class="post-card-title"><a href="${url}">${escapeHtml(post.title)}</a></h3><p class="post-card-summary">${escapeHtml(post.summary || '')}</p><div class="post-card-tags">${tags(post.tags)}</div></div></article>`;
}

export function homePage(posts, stats) {
  const cards = posts.map((post, index) => postCard(post, { pinned: index === 0 && post.featured })).join('');
  const body = `<section class="hero cyber-hero"><div class="cyber-hero-inner"><div class="cyber-copy"><p class="cyber-status-badge"><span class="pulse-dot"></span> GLOBAL NODE CONNECTED · 加密路由传输中</p><h1 class="cyber-title">穿透迷雾，<span class="cyber-gradient-text">连接全球网络与认知。</span></h1><p class="cyber-desc">探索科学上网、网络节点评测、全球实用工具与跨国信息差思考。构建属于你的无界数字工作流。</p><div class="cyber-actions"><a class="hero-btn primary" href="#posts">探索节点文章 <span>⚡</span></a><a class="hero-btn" href="/archive/">分类归档 <span>→</span></a></div><div class="cyber-stats"><div><strong class="cyber-stat-val">${String(stats.posts).padStart(2, '0')}</strong><span class="cyber-stat-label">已建节点</span></div><div><strong class="cyber-stat-val">${String(stats.tags).padStart(2, '0')}</strong><span class="cyber-stat-label">网络标签</span></div><div><strong class="cyber-stat-val">${String(stats.categories).padStart(2, '0')}</strong><span class="cyber-stat-label">技术分类</span></div></div></div><div class="cyber-visual" aria-hidden="true"><div class="cyber-node-card"><div class="node-header"><span class="node-signal"><span class="pulse-dot green"></span> TUNNEL ONLINE</span><span class="node-protocol">ANYCAST ROUTE</span></div><div class="node-metrics"><div class="metric"><span class="m-label">LATENCY</span><span class="m-val green">12 ms</span></div><div class="metric"><span class="m-label">BANDWIDTH</span><span class="m-val cyan">10 Gbps</span></div><div class="metric"><span class="m-label">BYPASS</span><span class="m-val purple">ACTIVE</span></div></div><div class="node-radar"><div class="radar-circle"></div><div class="radar-sweep"></div><div class="node-chip c1">HK-01</div><div class="node-chip c2">US-04</div><div class="node-chip c3">SG-02</div></div></div></div></div></section><section class="post-list" id="posts"><div class="section-header"><div class="section-heading"><span class="section-index">⚡</span><div><h2>网络与文章节点</h2><span class="section-subtitle">GLOBAL ARTICLES &amp; INSIGHTS</span></div></div><a class="section-more" href="/archive/">查看全部 <span>→</span></a></div><div class="post-grid">${cards || '<div class="empty">暂无数据</div>'}</div></section>`;
  return layout({ title: SITE_NAME, description: SITE_DESCRIPTION, body, bodyClass: 'is-home' });
}

export function postPage(post, previous, next) {
  const toc = post.headings?.length ? `<aside class="post-toc"><div class="post-toc-inner"><p class="post-toc-title">目录</p><ul class="post-toc-list">${post.headings.map((h) => `<li><a class="toc-h${h.level}" href="#${escapeHtml(h.id)}">${escapeHtml(h.text)}</a></li>`).join('')}</ul></div></aside>` : '';
  const cover = post.cover ? `<div class="post-cover"><img src="${escapeHtml(post.cover)}" alt=""></div>` : '';
  const nav = `<footer class="post-footer"><div class="post-nav">${previous ? `<a class="post-nav-link prev" href="${postPath(previous)}"><div class="label">← 上一篇</div><div class="title">${escapeHtml(previous.title)}</div></a>` : '<span class="post-nav-link disabled prev"><div class="label">← 上一篇</div><div class="title">没有了</div></span>'}${next ? `<a class="post-nav-link next" href="${postPath(next)}"><div class="label">下一篇 →</div><div class="title">${escapeHtml(next.title)}</div></a>` : '<span class="post-nav-link disabled next"><div class="label">下一篇 →</div><div class="title">没有了</div></span>'}</div></footer>`;
  const body = `<article class="post-article">${cover}<header class="post-header"><div class="post-meta"><time datetime="${escapeHtml(post.date || '')}">${escapeHtml(formatDate(post.date, true))}</time>${post.category ? `<span class="post-category">${escapeHtml(post.category)}</span>` : ''}</div><h1 class="post-title">${escapeHtml(post.title)}</h1>${post.summary ? `<p class="post-summary">${escapeHtml(post.summary)}</p>` : ''}<div class="post-tags">${tags(post.tags)}</div></header><div class="post-layout">${toc}<div class="notion-content post-content">${post.contentHtml || '<p>本文暂无正文。</p>'}</div></div>${nav}</article>`;
  return layout({ title: post.title, description: post.summary || SITE_DESCRIPTION, body });
}

function pageHeading(emoji, title, description) { return `<header class="page-header"><div class="page-kicker"><span>${emoji}</span> YUNTI NOTES</div><h1 class="page-title">${escapeHtml(title)}</h1><p class="page-desc">${escapeHtml(description)}</p></header>`; }

function archiveItem(post, includeTags = true) {
  return `<div class="archive-item"><div class="archive-date">${escapeHtml((post.date || '').slice(5) || post.date || '')}</div><a class="archive-title" href="${postPath(post)}">${escapeHtml(post.title)}</a>${includeTags ? `<div class="archive-tags">${tags(post.tags)}</div>` : ''}</div>`;
}

export function archivePage(posts) {
  const years = new Map();
  for (const post of posts) { const year = String(post.date || '').slice(0, 4) || '未分类'; if (!years.has(year)) years.set(year, []); years.get(year).push(post); }
  const groups = [...years.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([year, items]) => `<div class="archive-year-header">${escapeHtml(year)}</div>${items.map((post) => archiveItem(post)).join('')}`).join('');
  return layout({ title: '归档', body: `<section class="archive-section">${pageHeading('📚', '归档', `共 ${posts.length} 篇文章`)}<div class="archive-list">${groups || '<div class="empty">暂无文章</div>'}</div></section>` });
}

export function categoryPath(category) {
  return `/category/${encodeURIComponent(slugify(category))}/`;
}

export function categoryPage(posts) {
  const categories = [...new Set(posts.map((post) => post.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const cards = categories.map((category) => {
    const items = posts.filter((post) => post.category === category);
    return `<a class="category-card" href="${categoryPath(category)}"><div class="category-card-title">${escapeHtml(category)}</div><div class="category-card-count">${items.length} 篇文章</div></a>`;
  }).join('');
  return layout({ title: '分类', body: `<section class="categories-section">${pageHeading('📂', '分类', `共 ${categories.length} 个分类`)}<div class="category-grid">${cards || '<div class="empty">暂无分类</div>'}</div></section>` });
}

export function categoryDetailPage(category, posts) {
  const items = posts.filter((post) => post.category === category);
  const list = items.map((post) => archiveItem(post)).join('');
  return layout({ title: category, body: `<section class="category-detail-section">${pageHeading('📂', category, `共 ${items.length} 篇文章`)}<div class="archive-list category-post-list">${list || '<div class="empty">暂无文章</div>'}</div></section>` });
}

export function tagPage(posts) {
  const tagNames = [...new Set(posts.flatMap((post) => post.tags || []))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const cloud = tagNames.map((tag) => { const count = posts.filter((post) => post.tags.includes(tag)).length; return `<a class="tag" href="#tag-${encodeURIComponent(tag)}">${escapeHtml(tag)}<span class="tag-count">(${count})</span></a>`; }).join('');
  const groups = tagNames.map((tag) => { const items = posts.filter((post) => post.tags.includes(tag)); return `<div class="tag-group" id="tag-${encodeURIComponent(tag)}"><h3 class="tag-group-title"># ${escapeHtml(tag)}<span class="tag-group-count">${items.length} 篇</span></h3><div class="tag-group-list">${items.map((post) => archiveItem(post, false)).join('')}</div></div>`; }).join('');
  return layout({ title: '标签', body: `<section class="tags-section">${pageHeading('🏷', '标签', `共 ${tagNames.length} 个标签`)}<div class="tag-cloud">${cloud || '<span class="empty">暂无标签</span>'}</div><div class="tag-posts-section">${groups}</div></section>` });
}

export function searchPage() {
  const body = `<section class="search-section">${pageHeading('🔍', '搜索', '输入关键词搜索文章...')}<div class="search-box"><input type="text" id="search-input" placeholder="输入关键词搜索文章..." autocomplete="off" autofocus></div><div id="search-results"></div></section>`;
  return layout({ title: '搜索', body });
}
export function plainPage(page) {
  const body = `<article class="plain-article"><header class="page-header"><div class="page-kicker"><span>卷</span> YUNTI NOTES</div><h1 class="page-title">${escapeHtml(page.title)}</h1>${page.summary ? `<p class="page-desc">${escapeHtml(page.summary)}</p>` : ''}</header><div class="notion-content plain-content">${page.contentHtml || '<p>本文暂无正文。</p>'}</div></article>`;
  return layout({ title: page.title, description: page.summary || SITE_DESCRIPTION, body });
}

