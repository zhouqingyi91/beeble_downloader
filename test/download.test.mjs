import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBaselineSet, filterCandidateItems, normalizeImageUrl, passNameForItem } from '../src/download.mjs';

test('normalizeImageUrl removes hash only for regular urls', () => {
  assert.equal(normalizeImageUrl('https://example.com/a.jpg#x'), 'https://example.com/a.jpg');
  assert.equal(normalizeImageUrl('blob:https://example.com/id#x'), 'blob:https://example.com/id#x');
});

test('buildBaselineSet stores normalized src urls', () => {
  const set = buildBaselineSet([{ src: 'https://x.test/a.png#hash' }]);
  assert.equal(set.has('https://x.test/a.png'), true);
});

test('filterCandidateItems excludes baseline and small ui images, sorts by area', () => {
  const baseline = new Set(['https://x.test/old.png']);
  const result = filterCandidateItems(
    [
      { src: 'https://x.test/old.png', filename: 'Specular_000001', width: 2000, height: 2000 },
      { src: 'https://x.test/logo.png', filename: 'Depth_000001', width: 64, height: 64 },
      { src: 'https://x.test/render-small.png', filename: 'Roughness_000001', width: 200, height: 200 },
      { src: 'https://x.test/render-large.png', filename: 'BaseColor_000001', width: 1000, height: 1000 },
      { src: 'https://x.test/image.png', filename: 'image', width: 1000, height: 1000 }
    ],
    baseline
  );
  assert.deepEqual(result.map((item) => item.src), ['https://x.test/render-large.png', 'https://x.test/render-small.png']);
});

test('passNameForItem detects only supported VFX pass names', () => {
  assert.equal(passNameForItem({ filename: '06-Roughness_000001' }), 'Roughness');
  assert.equal(passNameForItem({ filename: 'BaseColor_000001' }), 'BaseColor');
  assert.equal(passNameForItem({ filename: 'image' }), null);
});
