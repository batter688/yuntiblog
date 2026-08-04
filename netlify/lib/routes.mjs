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
