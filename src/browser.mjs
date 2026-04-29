import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const IMAGE_ASSISTANT_ID = 'dbjbempljhcmhlfpfacalomonjpalpko';
const EXTENSION_ENV = 'IMAGE_ASSISTANT_EXTENSION_PATH';
export const IMAGE_ASSISTANT_INSTALL_URL = `https://chromewebstore.google.com/detail/imageassistant-batch-imag/${IMAGE_ASSISTANT_ID}`;

export class ImageAssistantNotInstalledError extends Error {
  constructor() {
    super(`未检测到 ImageAssistant 图片助手插件，请先安装: ${IMAGE_ASSISTANT_INSTALL_URL}`);
    this.name = 'ImageAssistantNotInstalledError';
    this.installUrl = IMAGE_ASSISTANT_INSTALL_URL;
  }
}

export async function resolveImageAssistantExtension(paths) {
  const realExtension = await findInstalledImageAssistant(paths.env ?? process.env, paths.profileDir);
  if (realExtension) {
    return { extensionPath: realExtension, degraded: false, source: 'installed' };
  }
  throw new ImageAssistantNotInstalledError();
}

export async function findInstalledImageAssistant(env = process.env, profileDir = null) {
  const override = await validExtensionDir(env[EXTENSION_ENV]);
  if (override) return override;

  for (const root of imageAssistantExtensionRoots(env, profileDir)) {
    const latest = await latestExtensionVersionDir(root);
    if (latest) return latest;
  }
  return null;
}

export function imageAssistantExtensionRoots(env = process.env, profileDir = null) {
  return uniquePaths([
    profileDir && path.join(profileDir, 'Default', 'Extensions', IMAGE_ASSISTANT_ID),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Extensions', IMAGE_ASSISTANT_ID),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Chromium', 'User Data', 'Default', 'Extensions', IMAGE_ASSISTANT_ID),
    env.HOME && path.join(env.HOME, 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Extensions', IMAGE_ASSISTANT_ID),
    env.HOME && path.join(env.HOME, '.config', 'google-chrome', 'Default', 'Extensions', IMAGE_ASSISTANT_ID),
    env.HOME && path.join(env.HOME, '.config', 'chromium', 'Default', 'Extensions', IMAGE_ASSISTANT_ID)
  ]);
}

export async function launchBrowser(paths, extensionPath = null) {
  const extensionArgs = extensionPath
    ? [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    : [];
  const context = await chromium.launchPersistentContext(paths.profileDir, {
    channel: 'chromium',
    headless: false,
    acceptDownloads: true,
    viewport: null,
    args: [
      ...extensionArgs,
      '--disable-blink-features=AutomationControlled'
    ]
  });
  return context;
}

export async function getExtensionServiceWorker(context) {
  let worker = context.serviceWorkers().find((item) => item.url().startsWith('chrome-extension://'));
  if (!worker) {
    worker = await context.waitForEvent('serviceworker', {
      predicate: (item) => item.url().startsWith('chrome-extension://'),
      timeout: 30000
    });
  }
  const extensionId = new URL(worker.url()).host;
  return { worker, extensionId };
}

async function latestExtensionVersionDir(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    dirs.sort((a, b) => versionSortKey(b).localeCompare(versionSortKey(a)));
    for (const dir of dirs) {
      const candidate = path.join(root, dir);
      try {
        await access(path.join(candidate, 'manifest.json'));
        return candidate;
      } catch {}
    }
  } catch {
    return null;
  }
  return null;
}

async function validExtensionDir(dir) {
  if (!dir) return null;
  try {
    await access(path.join(dir, 'manifest.json'));
    return dir;
  } catch {
    return null;
  }
}

function uniquePaths(values) {
  return [...new Set(values.filter(Boolean))];
}

function versionSortKey(value) {
  return value
    .replace(/_\d+$/, '')
    .split('.')
    .map((part) => part.padStart(6, '0'))
    .join('.');
}
