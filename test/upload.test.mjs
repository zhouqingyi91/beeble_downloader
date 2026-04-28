import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildUploadForm,
  collectDirectoryFiles,
  listOutputDirectories,
  uploadDirectory,
  waitForImportJob
} from '../src/upload.mjs';

test('listOutputDirectories returns sorted child directories only', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beeble-output-dirs-'));
  await mkdir(path.join(dir, '20260428-113208'));
  await mkdir(path.join(dir, '20260427-200946'));
  await writeFile(path.join(dir, 'note.txt'), 'x');

  const result = await listOutputDirectories(dir);
  assert.deepEqual(result.map((item) => path.basename(item)), ['20260427-200946', '20260428-113208']);
});

test('collectDirectoryFiles returns recursive relative paths and ignores .DS_Store', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beeble-collect-'));
  await mkdir(path.join(dir, 'Source'));
  await mkdir(path.join(dir, 'Normal'));
  await writeFile(path.join(dir, '.DS_Store'), 'metadata');
  await writeFile(path.join(dir, 'Source', 'Source_001.jpg'), 'source');
  await writeFile(path.join(dir, 'Normal', 'Normal_001.png'), 'normal');

  const files = await collectDirectoryFiles(dir);
  assert.deepEqual(files.map((file) => file.relativePath), [
    path.join('Normal', 'Normal_001.png'),
    path.join('Source', 'Source_001.jpg')
  ]);
});

test('buildUploadForm keeps selected directory name in multipart filenames', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'beeble-form-'));
  const dir = path.join(root, '20260428-113208');
  await mkdir(path.join(dir, 'BaseColor'), { recursive: true });
  await writeFile(path.join(dir, 'BaseColor', 'BaseColor_001.png'), 'base');

  const { form, files } = await buildUploadForm(dir, { batchName: 'custom', checkOssPath: true });
  const uploadedFiles = form.getAll('files');

  assert.equal(files.length, 1);
  assert.equal(form.get('batch_name'), 'custom');
  assert.equal(form.get('version'), 'SwitchLight 3.0');
  assert.equal(form.get('structure'), 'auto');
  assert.equal(form.get('check_oss_path'), 'true');
  assert.equal(uploadedFiles.length, 1);
  assert.equal(uploadedFiles[0].name, '20260428-113208/BaseColor/BaseColor_001.png');
});

test('uploadDirectory posts to upload endpoint and returns job id', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beeble-upload-'));
  await mkdir(path.join(dir, 'Source'));
  await writeFile(path.join(dir, 'Source', 'Source_001.jpg'), 'source');
  let seenUrl = null;
  let seenMethod = null;

  const result = await uploadDirectory(dir, {
    baseUrl: 'https://api.test/',
    fetchImpl: async (url, init) => {
      seenUrl = url;
      seenMethod = init.method;
      assert.equal(init.body.getAll('files')[0].name, `${path.basename(dir)}/Source/Source_001.jpg`);
      return Response.json({ code: 200, message: 'success', data: { job_id: 128, saved_count: 1 } });
    }
  });

  assert.equal(seenUrl, 'https://api.test/api/knowledge/lighting-lab/import-upload-jobs');
  assert.equal(seenMethod, 'POST');
  assert.equal(result.jobId, 128);
  assert.equal(result.fileCount, 1);
});

test('waitForImportJob resolves when status becomes completed', async () => {
  const statuses = [
    { id: 128, status: 'running', processed_count: 0, total_count: 1 },
    { id: 128, status: 'completed', processed_count: 1, total_count: 1 }
  ];

  const finalStatus = await waitForImportJob(128, {
    baseUrl: 'https://api.test',
    pollIntervalMs: 1,
    timeoutMs: 100,
    fetchImpl: async () => Response.json({ code: 200, message: 'success', data: statuses.shift() })
  });

  assert.equal(finalStatus.status, 'completed');
});
