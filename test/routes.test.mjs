import assert from 'node:assert/strict';
import test from 'node:test';
import { contentTypeFromMetadata, routeToBlobPath } from '../netlify/lib/routes.mjs';

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
