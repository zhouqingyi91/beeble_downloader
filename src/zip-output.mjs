import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { passNameForItem, sourceNumberNameSegment } from './download.mjs';
import { baseNameWithoutExt, safeSegment } from './files.mjs';

export async function extractZipToDirectory(zipPath, outputDir) {
  return await extractZipEntries(zipPath, outputDir, (name) => resolveZipTarget(outputDir, name));
}

export async function extractZipForSourceImage(zipPath, outputRoot, inputImagePath) {
  const outputDir = path.join(outputRoot, safeSegment(baseNameWithoutExt(inputImagePath)));
  const nameSegment = sourceNumberNameSegment(inputImagePath);
  return await extractZipEntries(zipPath, outputDir, (name) => targetForSourceImageZipEntry(outputDir, name, nameSegment));
}

async function extractZipEntries(zipPath, outputDir, targetForEntry) {
  const zip = await readFile(zipPath);
  const entries = unzipSync(new Uint8Array(zip));
  const files = Object.entries(entries)
    .filter(([name]) => !name.endsWith('/'))
    .map(([name, data]) => ({
      name,
      data: Buffer.from(data),
      target: targetForEntry(name)
    }));

  if (files.length === 0 || !files.some((item) => item.data.length > 0)) {
    throw new Error('zip 中没有非空文件');
  }

  for (const file of files) {
    if (await exists(file.target)) {
      throw new Error(`解压目标已存在: ${file.target}`);
    }
  }

  for (const file of files) {
    await mkdir(path.dirname(file.target), { recursive: true });
    await writeFile(file.target, file.data);
  }

  return files.map((file) => file.target);
}

export function targetForSourceImageZipEntry(outputDir, entryName, nameSegment) {
  const originalTarget = resolveZipTarget(outputDir, entryName);
  const relative = path.relative(path.resolve(outputDir), originalTarget);
  const parts = relative.split(path.sep);
  const filename = parts.at(-1);
  const ext = path.extname(filename);
  const passName = passNameForItem({ filename: entryName });

  if (passName && ext) {
    return path.join(outputDir, passName, `${passName}_${nameSegment}${ext}`);
  }
  if (/^Source$/i.test(parts.at(-2) || '') && ext) {
    return path.join(outputDir, 'Source', `Source_${nameSegment}${ext}`);
  }
  return originalTarget;
}

export function resolveZipTarget(outputDir, entryName) {
  if (!entryName || entryName.includes('\\')) {
    throw new Error(`非法 zip 路径: ${entryName}`);
  }
  if (path.posix.isAbsolute(entryName) || /^[a-zA-Z]:/.test(entryName)) {
    throw new Error(`非法 zip 路径: ${entryName}`);
  }
  if (entryName.split('/').includes('..')) {
    throw new Error(`非法 zip 路径: ${entryName}`);
  }

  const outputRoot = path.resolve(outputDir);
  const target = path.resolve(outputRoot, entryName);
  if (target !== outputRoot && !target.startsWith(`${outputRoot}${path.sep}`)) {
    throw new Error(`非法 zip 路径: ${entryName}`);
  }
  return target;
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
}
