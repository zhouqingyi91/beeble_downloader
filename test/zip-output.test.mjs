import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { zipSync } from 'fflate';
import { extractZipForSourceImage, extractZipToDirectory, resolveZipTarget } from '../src/zip-output.mjs';

test('extractZipToDirectory preserves nested zip layout', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beeble-zip-'));
  const zipPath = path.join(dir, 'passes.zip');
  const outputDir = path.join(dir, 'output');
  const zip = zipSync({
    'beeble-result/Alpha/Alpha.png': Buffer.from('alpha'),
    'beeble-result/Depth/Depth.png': Buffer.from('depth')
  });
  await writeFile(zipPath, zip);

  const extracted = await extractZipToDirectory(zipPath, outputDir);

  assert.deepEqual(extracted.sort(), [
    path.join(outputDir, 'beeble-result', 'Alpha', 'Alpha.png'),
    path.join(outputDir, 'beeble-result', 'Depth', 'Depth.png')
  ].sort());
  assert.equal(await readFile(path.join(outputDir, 'beeble-result', 'Alpha', 'Alpha.png'), 'utf8'), 'alpha');
});

test('resolveZipTarget rejects zip slip paths', () => {
  assert.throws(() => resolveZipTarget('/tmp/out', '../evil.png'), /非法 zip 路径/);
  assert.throws(() => resolveZipTarget('/tmp/out', '/evil.png'), /非法 zip 路径/);
  assert.throws(() => resolveZipTarget('/tmp/out', 'C:/evil.png'), /非法 zip 路径/);
  assert.throws(() => resolveZipTarget('/tmp/out', 'safe\\evil.png'), /非法 zip 路径/);
});

test('extractZipToDirectory rejects existing targets', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beeble-zip-existing-'));
  const zipPath = path.join(dir, 'passes.zip');
  const outputDir = path.join(dir, 'output');
  await writeFile(path.join(dir, 'passes.zip'), zipSync({ 'result/Alpha.png': Buffer.from('new') }));
  await mkdir(path.join(outputDir, 'result'), { recursive: true });
  await writeFile(path.join(outputDir, 'result', 'Alpha.png'), 'old');

  await assert.rejects(() => extractZipToDirectory(zipPath, outputDir), /解压目标已存在/);
});

test('extractZipToDirectory rejects empty zips', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beeble-zip-empty-'));
  const zipPath = path.join(dir, 'empty.zip');
  await writeFile(zipPath, zipSync({}));

  await assert.rejects(() => extractZipToDirectory(zipPath, path.join(dir, 'output')), /zip 中没有非空文件/);
});

test('extractZipForSourceImage nests passes under source image name and renames suffix number', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beeble-zip-source-'));
  const zipPath = path.join(dir, 'passes.zip');
  const outputDir = path.join(dir, 'output');
  await writeFile(zipPath, zipSync({
    'Alpha/Alpha_000001.png': Buffer.from('alpha'),
    'BaseColor/BaseColor_000001.png': Buffer.from('base'),
    'Source/Source_000001.png': Buffer.from('source'),
    'Camera.json': Buffer.from('{}')
  }));

  const extracted = await extractZipForSourceImage(zipPath, outputDir, '/tmp/Source_000004.png');

  assert.deepEqual(extracted.sort(), [
    path.join(outputDir, 'Source_000004', 'Alpha', 'Alpha_000004.png'),
    path.join(outputDir, 'Source_000004', 'BaseColor', 'BaseColor_000004.png'),
    path.join(outputDir, 'Source_000004', 'Source', 'Source_000004.png'),
    path.join(outputDir, 'Source_000004', 'Camera.json')
  ].sort());
  assert.equal(await readFile(path.join(outputDir, 'Source_000004', 'Alpha', 'Alpha_000004.png'), 'utf8'), 'alpha');
});

test('extractZipForSourceImage renames passes with source name segment', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beeble-zip-source-name-'));
  const zipPath = path.join(dir, 'passes.zip');
  const outputDir = path.join(dir, 'output');
  await writeFile(zipPath, zipSync({
    'Alpha/Alpha_000001.png': Buffer.from('alpha'),
    'Source/Source_000001.png': Buffer.from('source')
  }));

  const extracted = await extractZipForSourceImage(zipPath, outputDir, '/tmp/Wood Floor.png', 'Wood Floor');

  assert.deepEqual(extracted.sort(), [
    path.join(outputDir, 'Wood Floor', 'Alpha', 'Alpha_Wood Floor.png'),
    path.join(outputDir, 'Wood Floor', 'Source', 'Source_Wood Floor.png')
  ].sort());
  assert.equal(await readFile(path.join(outputDir, 'Wood Floor', 'Alpha', 'Alpha_Wood Floor.png'), 'utf8'), 'alpha');
});
