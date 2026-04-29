import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildBaselineSet,
  downloadCandidates,
  filterCandidateItems,
  missingRequiredPasses,
  normalizeImageUrl,
  passNameForItem,
  timestampNameSegment
} from '../src/download.mjs';

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

test('timestampNameSegment formats local date as yyyymmdd_hhmmss', () => {
  assert.equal(timestampNameSegment(new Date(2026, 3, 29, 13, 45, 59)), '20260429_134559');
});

test('downloadCandidates names source and pass images with timestamp segment', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beeble-download-'));
  const inputImagePath = path.join(dir, 'Original Product Name.jpg');
  await writeFile(inputImagePath, 'source-image');

  const page = {
    async evaluate() {
      return {
        dataUrl: `data:image/png;base64,${Buffer.from('rendered-pass').toString('base64')}`,
        contentType: 'image/png'
      };
    }
  };

  const downloaded = await downloadCandidates(
    page,
    [{ src: 'https://x.test/specular.png', filename: 'Specular_000001', width: 1000, height: 1000 }],
    dir,
    inputImagePath,
    { nameSegment: '20260429_134559' }
  );

  const sourcePath = path.join(dir, 'Source', 'Source_20260429_134559.jpg');
  const passPath = path.join(dir, 'Specular', 'Specular_20260429_134559.png');
  assert.equal(await readFile(sourcePath, 'utf8'), 'source-image');
  assert.equal(await readFile(passPath, 'utf8'), 'rendered-pass');
  assert.deepEqual(downloaded.map((item) => item.filePath), [passPath]);
});

test('missingRequiredPasses passes when all required passes have non-empty images', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beeble-passes-'));
  for (const passName of ['Alpha', 'BaseColor', 'Depth', 'Normal', 'Roughness', 'Specular']) {
    await mkdir(path.join(dir, passName));
    await writeFile(path.join(dir, passName, `${passName}.png`), 'image');
  }

  assert.deepEqual(await missingRequiredPasses(dir), []);
});

test('missingRequiredPasses reports missing required passes', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beeble-passes-'));
  for (const passName of ['Alpha', 'BaseColor', 'Depth', 'Normal', 'Roughness']) {
    await mkdir(path.join(dir, passName));
    await writeFile(path.join(dir, passName, `${passName}.png`), 'image');
  }

  assert.deepEqual(await missingRequiredPasses(dir), ['Specular']);
});

test('missingRequiredPasses ignores empty files and non-image files', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beeble-passes-'));
  for (const passName of ['Alpha', 'BaseColor', 'Depth', 'Normal', 'Roughness', 'Specular']) {
    await mkdir(path.join(dir, passName));
    await writeFile(path.join(dir, passName, `${passName}.png`), passName === 'Depth' ? '' : 'image');
  }
  await writeFile(path.join(dir, 'Depth', 'Depth.txt'), 'not-image');

  assert.deepEqual(await missingRequiredPasses(dir), ['Depth']);
});

test('missingRequiredPasses ignores Metallic for required pass coverage', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beeble-passes-'));
  for (const passName of ['Alpha', 'BaseColor', 'Depth', 'Metallic', 'Normal', 'Roughness']) {
    await mkdir(path.join(dir, passName));
    await writeFile(path.join(dir, passName, `${passName}.png`), 'image');
  }

  assert.deepEqual(await missingRequiredPasses(dir), ['Specular']);
});
