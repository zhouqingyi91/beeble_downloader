import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assertNonEmptyFile, safeSegment } from './files.mjs';

const MIN_AREA = 128 * 128;
const UI_RE = /(favicon|logo|icon|avatar|spinner|loading|empty|overlay|thumb|placeholder|sprite)/i;
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tif', '.tiff']);
export const REQUIRED_PASS_NAMES = ['Alpha', 'BaseColor', 'Depth', 'Normal', 'Roughness', 'Specular'];
export const PASS_NAMES = ['Specular', 'Depth', 'Alpha', 'Roughness', 'Metallic', 'Normal', 'BaseColor'];
const PASS_RE = new RegExp(`(?:^|[^a-z])(${PASS_NAMES.join('|')})(?:[^a-z]|$)`, 'i');

export function normalizeImageUrl(url) {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return url.trim();
  }
}

export function filterCandidateItems(items, baselineUrls = new Set()) {
  return items
    .filter((item) => {
      const src = normalizeImageUrl(item.src);
      if (!passNameForItem(item)) return false;
      if (!src || baselineUrls.has(src)) return false;
      if (/^data:image\/svg/i.test(src) || src.startsWith('chrome-extension://')) return false;
      if (/pullywood\.com|cxyz\.info/i.test(src)) return false;
      if (UI_RE.test(src) && Number(item.size || item.width * item.height) < 512 * 512) return false;
      return Number(item.size || item.width * item.height) >= MIN_AREA;
    })
    .sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
}

export function buildBaselineSet(items) {
  return new Set(items.map((item) => normalizeImageUrl(item.src)).filter(Boolean));
}

export async function downloadCandidates(extractorPage, candidates, outputDir, inputImagePath) {
  await mkdir(outputDir, { recursive: true });
  const sourceHash = await sha256File(inputImagePath);
  const selected = uniqueByPass(candidates);
  await copySourceImage(inputImagePath, outputDir);

  const downloaded = [];
  for (const item of selected) {
    const passName = passNameForItem(item);
    if (!passName) continue;
    const payload = await fetchBytesInPage(extractorPage, item.href || item.src);
    const hash = sha256Buffer(payload.buffer);
    if (hash === sourceHash) continue;
    const ext = extensionFor(item, payload.contentType);
    const name = `${passName}_${safeSegment(path.basename(inputImagePath, path.extname(inputImagePath)))}${ext}`;
    const passDir = path.join(outputDir, passName);
    await mkdir(passDir, { recursive: true });
    const filePath = path.join(passDir, name);
    await writeFile(filePath, payload.buffer);
    await assertNonEmptyFile(filePath);
    downloaded.push({ filePath, source: item.src, width: item.width, height: item.height, passName });
  }
  return downloaded;
}

export async function copySourceImage(inputImagePath, outputDir) {
  const sourceDir = path.join(outputDir, 'Source');
  await mkdir(sourceDir, { recursive: true });
  const sourceExt = path.extname(inputImagePath);
  const sourceName = safeSegment(path.basename(inputImagePath, sourceExt));
  const target = path.join(sourceDir, `Source_${sourceName}${sourceExt}`);
  await copyFile(inputImagePath, target);
  await assertNonEmptyFile(target);
  return target;
}

export async function missingRequiredPasses(outputDir) {
  const results = await Promise.all(
    REQUIRED_PASS_NAMES.map(async (passName) => ({
      passName,
      exists: await hasNonEmptyImage(path.join(outputDir, passName))
    }))
  );
  return results.filter((item) => !item.exists).map((item) => item.passName);
}

export function passNameForItem(item) {
  const haystack = [item.filename, item.src, item.href, item.title, item.alt].filter(Boolean).join(' ');
  const match = PASS_RE.exec(haystack);
  if (!match) return null;
  return PASS_NAMES.find((name) => name.toLowerCase() === match[1].toLowerCase()) || null;
}

async function hasNonEmptyImage(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    const info = await stat(path.join(dir, entry.name));
    if (info.size > 0) return true;
  }
  return false;
}

function scoreCandidate(item) {
  const area = Number(item.size || item.width * item.height);
  return area * 1000 + Number(item.timestamp || 0);
}

function uniqueByPass(candidates) {
  const byPass = new Map();
  for (const item of candidates) {
    const passName = passNameForItem(item);
    if (!passName) continue;
    const previous = byPass.get(passName);
    if (!previous || scoreCandidate(item) > scoreCandidate(previous)) {
      byPass.set(passName, item);
    }
  }
  return PASS_NAMES.map((name) => byPass.get(name)).filter(Boolean);
}

function extensionFor(item, contentType) {
  const suffix = normalizeSuffix(item.suffix);
  if (suffix) return suffix;
  if (/png/i.test(contentType)) return '.png';
  if (/webp/i.test(contentType)) return '.webp';
  if (/gif/i.test(contentType)) return '.gif';
  if (/jpeg|jpg/i.test(contentType)) return '.jpg';
  return '.jpg';
}

function normalizeSuffix(value) {
  if (!value) return '';
  const suffix = value.startsWith('.') ? value.toLowerCase() : `.${value.toLowerCase()}`;
  return /^\.(jpg|jpeg|png|webp|gif|bmp|tif|tiff)$/.test(suffix) ? suffix : '';
}

async function fetchBytesInPage(page, url) {
  if (!url) throw new Error('missing image url');
  const result = await page.evaluate(async (targetUrl) => {
    const response = await fetch(targetUrl);
    if (!response.ok && response.status !== 0) {
      throw new Error(`fetch image failed: ${response.status} ${response.statusText}`);
    }
    const blob = await response.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return { dataUrl, contentType: blob.type || response.headers.get('content-type') || '' };
  }, url);
  const base64 = String(result.dataUrl).replace(/^data:.*?;base64,/, '');
  return { buffer: Buffer.from(base64, 'base64'), contentType: result.contentType || '' };
}

async function sha256File(filePath) {
  return sha256Buffer(await readFile(filePath));
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}
