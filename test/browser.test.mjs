import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { findInstalledImageAssistant, imageAssistantExtensionRoots, resolveImageAssistantExtension } from '../src/browser.mjs';

const IMAGE_ASSISTANT_ID = 'dbjbempljhcmhlfpfacalomonjpalpko';

test('imageAssistantExtensionRoots includes Windows Chrome extension directory', () => {
  const roots = imageAssistantExtensionRoots({
    LOCALAPPDATA: 'C:\\Users\\Luffy\\AppData\\Local'
  });

  assert.ok(roots.some((item) => item.includes(path.join('Google', 'Chrome', 'User Data', 'Default', 'Extensions', IMAGE_ASSISTANT_ID))));
});

test('imageAssistantExtensionRoots includes automation profile extension directory', () => {
  const roots = imageAssistantExtensionRoots({}, '/repo/chrome-profile');

  assert.equal(roots[0], path.join('/repo/chrome-profile', 'Default', 'Extensions', IMAGE_ASSISTANT_ID));
});

test('findInstalledImageAssistant prefers explicit extension path', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beeble-extension-env-'));
  await writeFile(path.join(dir, 'manifest.json'), '{}');

  const found = await findInstalledImageAssistant({ IMAGE_ASSISTANT_EXTENSION_PATH: dir });
  assert.equal(found, dir);
});

test('findInstalledImageAssistant selects latest installed version directory', async () => {
  const localAppData = await mkdtemp(path.join(os.tmpdir(), 'beeble-extension-win-'));
  const root = path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Extensions', IMAGE_ASSISTANT_ID);
  await mkdir(path.join(root, '1.2.0_0'), { recursive: true });
  await mkdir(path.join(root, '1.10.0_0'), { recursive: true });
  await writeFile(path.join(root, '1.2.0_0', 'manifest.json'), '{}');
  await writeFile(path.join(root, '1.10.0_0', 'manifest.json'), '{}');

  const found = await findInstalledImageAssistant({ LOCALAPPDATA: localAppData });
  assert.equal(found, path.join(root, '1.10.0_0'));
});

test('resolveImageAssistantExtension rejects when extension is not installed', async () => {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), 'beeble-extension-missing-'));
  await assert.rejects(
    () => resolveImageAssistantExtension({ env: {}, profileDir }),
    /未检测到 ImageAssistant 图片助手插件/
  );
});
