import { mkdir, readdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tif', '.tiff']);

export function projectPaths(root = process.cwd()) {
  return {
    root,
    inputDir: path.join(root, 'images', 'input'),
    outputDir: path.join(root, 'images', 'output'),
    missingDir: path.join(root, 'images', 'missing'),
    renderedDir: path.join(root, 'images', 'rendered'),
    uploadedDir: path.join(root, 'images', 'uploaded'),
    profileDir: path.join(root, 'chrome-profile'),
    traceExtensionDir: path.join(root, 'imageassistant_extraction_trace', 'source'),
    logDir: path.join(root, 'logs')
  };
}

export async function ensureRuntimeDirs(paths) {
  await Promise.all([
    mkdir(paths.inputDir, { recursive: true }),
    mkdir(paths.outputDir, { recursive: true }),
    mkdir(paths.missingDir, { recursive: true }),
    mkdir(paths.renderedDir, { recursive: true }),
    mkdir(paths.uploadedDir, { recursive: true }),
    mkdir(paths.logDir, { recursive: true })
  ]);
}

export async function listInputImages(inputDir) {
  const entries = await readdir(inputDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(inputDir, entry.name))
    .filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  return files;
}

export function safeSegment(value) {
  return String(value)
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+$/, '_')
    .slice(0, 120) || 'image';
}

export function baseNameWithoutExt(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

export async function outputDirForImage(outputRoot, inputImagePath) {
  const dir = path.join(outputRoot, safeSegment(baseNameWithoutExt(inputImagePath)));
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function moveToRendered(inputImagePath, renderedDir) {
  await mkdir(renderedDir, { recursive: true });
  const parsed = path.parse(inputImagePath);
  let destination = path.join(renderedDir, parsed.base);
  let index = 1;
  while (await exists(destination)) {
    destination = path.join(renderedDir, `${parsed.name}-${index}${parsed.ext}`);
    index += 1;
  }
  await rename(inputImagePath, destination);
  return destination;
}

export async function moveDirectoryToUploaded(sourceDir, uploadedDir) {
  return moveDirectoryTo(sourceDir, uploadedDir);
}

export async function moveDirectoryToMissing(sourceDir, missingDir) {
  return moveDirectoryTo(sourceDir, missingDir);
}

async function moveDirectoryTo(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  const parsed = path.parse(sourceDir);
  let destination = path.join(targetDir, parsed.base);
  let index = 1;
  while (await exists(destination)) {
    destination = path.join(targetDir, `${parsed.name}-${index}`);
    index += 1;
  }
  await rename(sourceDir, destination);
  return destination;
}

export async function assertNonEmptyFile(filePath) {
  const info = await stat(filePath);
  if (!info.isFile() || info.size <= 0) {
    throw new Error(`downloaded file is empty: ${filePath}`);
  }
  return info.size;
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
