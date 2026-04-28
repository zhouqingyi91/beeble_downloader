import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ensureRuntimeDirs,
  listInputImages,
  moveDirectoryToMissing,
  moveDirectoryToUploaded,
  moveToRendered,
  outputDirForImage,
  projectPaths,
  safeSegment
} from '../src/files.mjs';

test('safeSegment removes unsafe path characters', () => {
  assert.equal(safeSegment(' a/b:c*?.jpg '), 'a_b_c__.jpg');
});

test('listInputImages returns supported images sorted', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beeble-files-'));
  await writeFile(path.join(dir, 'b.txt'), 'x');
  await writeFile(path.join(dir, 'c.webp'), 'x');
  await writeFile(path.join(dir, 'a.jpg'), 'x');
  const files = await listInputImages(dir);
  assert.deepEqual(files.map((item) => path.basename(item)), ['a.jpg', 'c.webp']);
});

test('outputDirForImage uses basename without extension', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beeble-output-'));
  const out = await outputDirForImage(dir, '/tmp/source image.png');
  assert.equal(path.basename(out), 'source image');
  await access(out);
});

test('ensureRuntimeDirs creates missing directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'beeble-runtime-'));
  const paths = projectPaths(root);
  await ensureRuntimeDirs(paths);
  await access(paths.missingDir);
});

test('moveToRendered preserves existing files with suffix', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beeble-rendered-'));
  const inputDir = path.join(dir, 'input');
  const renderedDir = path.join(dir, 'rendered');
  await mkdir(inputDir);
  await mkdir(renderedDir);
  await writeFile(path.join(renderedDir, 'image.jpg'), 'old');
  const source = path.join(inputDir, 'image.jpg');
  await writeFile(source, 'new');
  const moved = await moveToRendered(source, renderedDir);
  assert.equal(path.basename(moved), 'image-1.jpg');
});

test('moveDirectoryToUploaded preserves existing directories with suffix', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beeble-uploaded-'));
  const outputDir = path.join(dir, 'output');
  const uploadedDir = path.join(dir, 'uploaded');
  await mkdir(path.join(outputDir, 'batch'), { recursive: true });
  await mkdir(path.join(uploadedDir, 'batch'), { recursive: true });

  const moved = await moveDirectoryToUploaded(path.join(outputDir, 'batch'), uploadedDir);
  assert.equal(path.basename(moved), 'batch-1');
  await access(moved);
});

test('moveDirectoryToMissing preserves existing directories with suffix', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beeble-missing-'));
  const outputDir = path.join(dir, 'output');
  const missingDir = path.join(dir, 'missing');
  await mkdir(path.join(outputDir, 'batch'), { recursive: true });
  await mkdir(path.join(missingDir, 'batch'), { recursive: true });

  const moved = await moveDirectoryToMissing(path.join(outputDir, 'batch'), missingDir);
  assert.equal(path.basename(moved), 'batch-1');
  await access(moved);
});
