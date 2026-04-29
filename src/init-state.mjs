import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function initStatePath(paths) {
  return paths.initStateFile || path.join(paths.profileDir, 'beeble-init.json');
}

export async function readInitState(paths) {
  try {
    const raw = await readFile(initStatePath(paths), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function markInitialized(paths, state = {}) {
  const target = initStatePath(paths);
  await mkdir(path.dirname(target), { recursive: true });
  const payload = {
    completedAt: new Date().toISOString(),
    ...state
  };
  await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

export async function assertInitialized(paths) {
  const state = await readInitState(paths);
  if (!state || !state.completedAt) {
    throw new Error('尚未初始化：请先运行 npm run init，完成 Google/Beeble 登录和 ImageAssistant 插件加载后手动关闭 Chromium。');
  }
  return state;
}
