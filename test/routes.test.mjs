import assert from 'node:assert/strict';
import test from 'node:test';
import { assetKeyFromRequest, contentTypeFromMetadata, routeToBlobPath } from '../netlify/lib/routes.mjs';

test('routeToBlobPath maps public routes to generated files', () => {
  assert.equal(routeToBlobPath('/'), 'index.html');
  assert.equal(routeToBlobPath('/posts/hello/'), 'posts/hello/index.html');
  assert.equal(routeToBlobPath('/posts/hello'), 'posts/hello/index.html');
  assert.equal(routeToBlobPath('/search.json'), 'search.json');
  assert.equal(routeToBlobPath('/rss.xml'), 'rss.xml');
  assert.equal(routeToBlobPath('/category/科学上网/'), 'category/科学上网/index.html');
});

test('routeToBlobPath rejects traversal attempts', () => {
  assert.equal(routeToBlobPath('/../secret'), null);
  assert.equal(routeToBlobPath('/foo\\bar'), null);
});

test('contentTypeFromMetadata prefers stored metadata and has safe fallbacks', () => {
  assert.equal(contentTypeFromMetadata({ contentType: 'image/webp' }, 'asset.bin'), 'image/webp');
  assert.equal(contentTypeFromMetadata({}, 'search.json'), 'application/json; charset=utf-8');
  assert.equal(contentTypeFromMetadata({}, 'index.html'), 'text/html; charset=utf-8');
});

test('assetKeyFromRequest supports Netlify rewritten and original media URLs', () => {
  assert.equal(
    assetKeyFromRequest('https://example.netlify.app/.netlify/functions/media?key=abc123.png'),
    'abc123.png'
  );
  assert.equal(
    assetKeyFromRequest('https://example.com/media/abc123.png'),
    'abc123.png'
  );
  assert.equal(
    assetKeyFromRequest('https://example.com/.netlify/functions/media/abc123.png'),
    'abc123.png'
  );
});

test('assetKeyFromRequest rejects missing or unsafe asset keys', () => {
  assert.equal(assetKeyFromRequest('https://example.com/media/'), null);
  assert.equal(assetKeyFromRequest('https://example.com/media/..%2Fsecret'), null);
  assert.equal(assetKeyFromRequest('https://example.com/media/folder%2Fimage.png'), null);
});
