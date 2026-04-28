import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const IMAGE_ASSISTANT_ID = 'dbjbempljhcmhlfpfacalomonjpalpko';
const CHROME_EXTENSION_ROOT = path.join(
  process.env.HOME || '',
  'Library',
  'Application Support',
  'Google',
  'Chrome',
  'Default',
  'Extensions',
  IMAGE_ASSISTANT_ID
);

export async function resolveImageAssistantExtension(paths) {
  const realExtension = await latestExtensionVersionDir(CHROME_EXTENSION_ROOT);
  if (realExtension) {
    return { extensionPath: realExtension, degraded: false, source: 'installed' };
  }
  await access(paths.traceExtensionDir);
  return { extensionPath: paths.traceExtensionDir, degraded: true, source: 'trace' };
}

export async function launchBrowser(paths, extensionPath) {
  const context = await chromium.launchPersistentContext(paths.profileDir, {
    channel: 'chromium',
    headless: false,
    acceptDownloads: true,
    viewport: null,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
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

function versionSortKey(value) {
  return value
    .replace(/_\d+$/, '')
    .split('.')
    .map((part) => part.padStart(6, '0'))
    .join('.');
}
