import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_BASE_URL = 'http://pre-pp.lightmeta.com:3001';
export const TERMINAL_STATUSES = new Set(['completed', 'failed']);

export async function listOutputDirectories(outputDir) {
  const entries = await readdir(outputDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(outputDir, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

export async function collectDirectoryFiles(rootDir) {
  const rootInfo = await stat(rootDir);
  if (!rootInfo.isDirectory()) {
    throw new Error(`不是目录: ${rootDir}`);
  }
  const files = [];
  await collectFiles(rootDir, rootDir, files);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return files;
}

export async function buildUploadForm(directoryPath, options = {}) {
  const files = await collectDirectoryFiles(directoryPath);
  if (files.length === 0) {
    throw new Error(`目录没有可上传文件: ${directoryPath}`);
  }

  const form = new FormData();
  form.append('batch_name', options.batchName || path.basename(directoryPath));
  form.append('version', options.version || 'SwitchLight 3.0');
  form.append('structure', options.structure || 'auto');
  form.append('check_oss_path', options.checkOssPath ? 'true' : 'false');
  appendOptionalNumber(form, 'code_range_start', options.codeRangeStart);
  appendOptionalNumber(form, 'code_range_end', options.codeRangeEnd);

  const directoryName = path.basename(directoryPath);
  for (const file of files) {
    const data = await readFile(file.absolutePath);
    const filename = path.posix.join(directoryName, toPosixPath(file.relativePath));
    form.append('files', new File([data], filename), filename);
  }

  return { form, files };
}

export async function uploadDirectory(directoryPath, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('当前 Node 环境没有 fetch');
  }

  const { form, files } = await buildUploadForm(directoryPath, options);
  const url = `${trimTrailingSlash(options.baseUrl || DEFAULT_BASE_URL)}/api/knowledge/lighting-lab/import-upload-jobs`;
  const response = await fetchImpl(url, { method: 'POST', body: form });
  const payload = await readJsonResponse(response);

  if (!response.ok || payload?.code !== 200 || !payload?.data?.job_id) {
    throw new Error(`上传失败: HTTP ${response.status} ${stringifyPayload(payload)}`);
  }

  return { jobId: payload.data.job_id, data: payload.data, fileCount: files.length };
}

export async function getImportJobStatus(jobId, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('当前 Node 环境没有 fetch');
  }

  const url = `${trimTrailingSlash(options.baseUrl || DEFAULT_BASE_URL)}/api/knowledge/lighting-lab/import-jobs/${jobId}`;
  const response = await fetchImpl(url, { method: 'GET' });
  const payload = await readJsonResponse(response);

  if (!response.ok || payload?.code !== 200 || !payload?.data) {
    throw new Error(`查询任务失败: HTTP ${response.status} ${stringifyPayload(payload)}`);
  }

  return payload.data;
}

export async function waitForImportJob(jobId, options = {}) {
  const intervalMs = options.pollIntervalMs ?? 3000;
  const timeoutMs = options.timeoutMs ?? 30 * 60 * 1000;
  const startedAt = Date.now();
  let lastStatus = null;

  while (Date.now() - startedAt <= timeoutMs) {
    lastStatus = await getImportJobStatus(jobId, options);
    options.onStatus?.(lastStatus);

    if (TERMINAL_STATUSES.has(lastStatus.status)) {
      if (lastStatus.status === 'failed') {
        throw new Error(`导入任务失败: ${lastStatus.last_error || 'unknown error'}`);
      }
      return lastStatus;
    }

    await sleep(intervalMs);
  }

  const suffix = lastStatus ? `最后状态: ${lastStatus.status}` : '未获取到状态';
  throw new Error(`等待导入任务超时: job_id=${jobId}; ${suffix}`);
}

async function collectFiles(currentDir, rootDir, files) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (entry.name === '.DS_Store') continue;
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(absolutePath, rootDir, files);
    } else if (entry.isFile()) {
      files.push({
        absolutePath,
        relativePath: path.relative(rootDir, absolutePath)
      });
    }
  }
}

function appendOptionalNumber(form, name, value) {
  if (value === null || value === undefined) return;
  form.append(name, String(value));
}

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function toPosixPath(value) {
  return value.split(path.sep).join(path.posix.sep);
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch (error) {
    return { code: response.status, message: `响应不是 JSON: ${error.message}` };
  }
}

function stringifyPayload(payload) {
  return JSON.stringify(payload ?? null);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
