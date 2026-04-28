#!/usr/bin/env node
import path from 'node:path';
import { ensureRuntimeDirs, moveDirectoryToUploaded, projectPaths } from './files.mjs';
import { DEFAULT_BASE_URL, listOutputDirectories, uploadDirectory, waitForImportJob } from './upload.mjs';

const args = parseArgs(process.argv.slice(2));
const paths = projectPaths();
await ensureRuntimeDirs(paths);

const directories = (await listOutputDirectories(paths.outputDir)).slice(0, args.limit ?? undefined);
if (directories.length === 0) {
  console.log('没有待上传目录。');
  process.exit(0);
}

console.log(`待上传: ${directories.length} 个目录`);
console.log(`接口: ${args.baseUrl}`);
console.log(`batch_name: ${args.batchName}`);

let exitCode = 0;
for (const directoryPath of directories) {
  const directoryName = path.basename(directoryPath);
  console.log(`开始: ${directoryName}`);

  try {
    if (args.dryRun) {
      console.log(`dry-run: 跳过上传和移动 ${directoryPath}`);
      continue;
    }

    const upload = await uploadDirectory(directoryPath, {
      baseUrl: args.baseUrl,
      batchName: args.batchName,
      version: args.version,
      structure: args.structure,
      checkOssPath: args.checkOssPath,
      codeRangeStart: args.codeRangeStart,
      codeRangeEnd: args.codeRangeEnd
    });
    console.log(`已创建导入任务: job_id=${upload.jobId}; 文件数=${upload.fileCount}; 服务端保存=${upload.data.saved_count}`);

    const finalStatus = await waitForImportJob(upload.jobId, {
      baseUrl: args.baseUrl,
      pollIntervalMs: args.pollIntervalMs,
      timeoutMs: args.timeoutMs,
      onStatus: (job) => {
        const progress = `${job.processed_count ?? 0}/${job.total_count ?? 0}`;
        const current = job.current_file ? `; 当前=${job.current_file}` : '';
        console.log(`状态: job_id=${job.id}; ${job.status}; ${progress}${current}`);
      }
    });

    console.log(`导入完成: job_id=${finalStatus.id}`);
    const movedPath = await moveDirectoryToUploaded(directoryPath, paths.uploadedDir);
    console.log(`已移动: ${movedPath}`);
  } catch (error) {
    exitCode = 1;
    console.error(`失败: ${directoryName}: ${error.message}`);
    break;
  }
}

process.exit(exitCode);

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    limit: null,
    baseUrl: process.env.LIGHTING_LAB_BASE_URL || DEFAULT_BASE_URL,
    batchName: '周通0422-1',
    version: 'SwitchLight 3.0',
    structure: 'auto',
    checkOssPath: false,
    codeRangeStart: null,
    codeRangeEnd: null,
    pollIntervalMs: 3000,
    timeoutMs: 30 * 60 * 1000
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--limit') parsed.limit = Number(argv[++i]);
    else if (arg.startsWith('--limit=')) parsed.limit = Number(arg.split('=')[1]);
    else if (arg === '--base-url') parsed.baseUrl = argv[++i];
    else if (arg.startsWith('--base-url=')) parsed.baseUrl = valueAfterEquals(arg);
    else if (arg === '--batch-name') parsed.batchName = argv[++i];
    else if (arg.startsWith('--batch-name=')) parsed.batchName = valueAfterEquals(arg);
    else if (arg === '--version') parsed.version = argv[++i];
    else if (arg.startsWith('--version=')) parsed.version = valueAfterEquals(arg);
    else if (arg === '--structure') parsed.structure = argv[++i];
    else if (arg.startsWith('--structure=')) parsed.structure = valueAfterEquals(arg);
    else if (arg === '--check-oss-path') parsed.checkOssPath = true;
    else if (arg === '--code-range-start') parsed.codeRangeStart = Number(argv[++i]);
    else if (arg.startsWith('--code-range-start=')) parsed.codeRangeStart = Number(valueAfterEquals(arg));
    else if (arg === '--code-range-end') parsed.codeRangeEnd = Number(argv[++i]);
    else if (arg.startsWith('--code-range-end=')) parsed.codeRangeEnd = Number(valueAfterEquals(arg));
    else if (arg === '--poll-interval-ms') parsed.pollIntervalMs = Number(argv[++i]);
    else if (arg.startsWith('--poll-interval-ms=')) parsed.pollIntervalMs = Number(valueAfterEquals(arg));
    else if (arg === '--timeout-ms') parsed.timeoutMs = Number(argv[++i]);
    else if (arg.startsWith('--timeout-ms=')) parsed.timeoutMs = Number(valueAfterEquals(arg));
    else {
      throw new Error(`未知参数: ${arg}`);
    }
  }

  assertPositiveInteger(parsed.limit, '--limit', true);
  assertPositiveInteger(parsed.pollIntervalMs, '--poll-interval-ms');
  assertPositiveInteger(parsed.timeoutMs, '--timeout-ms');
  assertOptionalInteger(parsed.codeRangeStart, '--code-range-start');
  assertOptionalInteger(parsed.codeRangeEnd, '--code-range-end');

  return parsed;
}

function valueAfterEquals(arg) {
  return arg.slice(arg.indexOf('=') + 1);
}

function assertPositiveInteger(value, name, nullable = false) {
  if (nullable && value === null) return;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} 必须是正整数`);
  }
}

function assertOptionalInteger(value, name) {
  if (value === null) return;
  if (!Number.isInteger(value)) {
    throw new Error(`${name} 必须是整数`);
  }
}
