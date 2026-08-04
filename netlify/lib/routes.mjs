export function assetKeyFromRequest(inputUrl) {
  let url;
  try {
    url = inputUrl instanceof URL ? inputUrl : new URL(String(inputUrl));
  } catch {
    return null;
  }

  let candidate = url.searchParams.get('key') || '';
  if (!candidate) {
    const match = url.pathname.match(/(?:^|\/)media\/([^/]+)$/i);
    candidate = match?.[1] || '';
  }

  try {
    candidate = decodeURIComponent(candidate).replace(/^\/+/, '');
  } catch {
    return null;
  }

  if (!candidate || candidate.includes('..') || candidate.includes('/') || candidate.includes('\\')) {
    return null;
  }
  return candidate;
}
export function routeToBlobPath(inputPath) {
  const decoded = String(inputPath || '/').trim() || '/';
  const path = decoded.startsWith('/') ? decoded : `/${decoded}`;
  if (path.includes('..') || path.includes('\\')) return null;

  const withoutLeadingSlash = path.replace(/^\/+/, '');
  if (!withoutLeadingSlash) return 'index.html';
  if (/\.(?:html|json|xml)$/i.test(withoutLeadingSlash)) return withoutLeadingSlash;
  return `${withoutLeadingSlash.replace(/\/+$/, '')}/index.html`;
}

export function contentTypeFromMetadata(metadata, filePath) {
  if (metadata?.contentType) return String(metadata.contentType);
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.xml')) return 'application/rss+xml; charset=utf-8';
  return 'text/html; charset=utf-8';
}
