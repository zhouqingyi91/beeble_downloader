#!/usr/bin/env node
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { openBeebleHome } from './beeble-flow.mjs';
import { getExtensionServiceWorker, ImageAssistantNotInstalledError, launchBrowser, resolveImageAssistantExtension } from './browser.mjs';
import { ensureRuntimeDirs, projectPaths } from './files.mjs';
import { markInitialized } from './init-state.mjs';

if (isDirectRun()) {
  const exitCode = await main();
  process.exit(exitCode);
}

export async function main() {
  const paths = projectPaths();
  await ensureRuntimeDirs(paths);

  let extension;
  try {
    extension = await resolveImageAssistantExtension(paths);
  } catch (error) {
    if (error instanceof ImageAssistantNotInstalledError) {
      await guideImageAssistantInstall(paths, error.installUrl);
      return 1;
    }
    throw error;
  }
  console.log(formatExtensionStatus(extension));

  const context = await launchBrowserOrExit(paths, extension.extensionPath);
  let exitCode = 0;
  let closed = false;
  const closePromise = once(context, 'close').then(() => {
    closed = true;
  });

  try {
    const { extensionId } = await getExtensionServiceWorker(context);
    console.log(`插件已加载: ${extensionId}`);

    const beeblePage = await context.newPage();
    await openBeebleHome(beeblePage);
    await beeblePage.bringToFront().catch(() => {});

    console.log('图片助手插件已就绪。请在 Chromium 中手动登录 Google 和 Beeble。');
    console.log('登录完成后手动关闭 Chromium；关闭后 init 完成。');
    await closePromise;

    const state = await markInitialized(paths, {
      extensionId,
      extensionPath: extension.extensionPath,
      extensionSource: extension.source
    });
    console.log(`init 完成: ${state.completedAt}`);
  } catch (error) {
    exitCode = 1;
    console.error(`init 失败: ${error.message}`);
  } finally {
    if (!closed) await context.close().catch(() => {});
  }

  return exitCode;
}

export function formatExtensionStatus(extension) {
  return `ImageAssistant: ${extension.extensionPath}`;
}

async function guideImageAssistantInstall(paths, installUrl) {
  const context = await launchBrowserOrExit(paths);
  let closed = false;
  const closePromise = once(context, 'close').then(() => {
    closed = true;
  });

  try {
    const page = context.pages().find((item) => !item.url().startsWith('chrome-extension://')) || await context.newPage();
    await page.goto(installUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.bringToFront().catch(() => {});
    console.log('未检测到 ImageAssistant 图片助手插件。');
    console.log(`已打开安装页: ${installUrl}`);
    console.log('请在 Chromium 中安装插件；安装完成后关闭 Chromium，再重新运行 npm run init。');
    await closePromise;
  } finally {
    if (!closed) await context.close().catch(() => {});
  }
}

async function launchBrowserOrExit(paths, extensionPath) {
  try {
    return await launchBrowser(paths, extensionPath);
  } catch (error) {
    if (/ProcessSingleton|profile.*in use|SingletonLock/i.test(error.message || '')) {
      console.error('无法启动 Chromium：./chrome-profile 正被另一个自动化浏览器窗口占用。');
      console.error('请先关闭占用该 profile 的 Playwright Chromium 窗口，然后重新运行 npm run init。');
      process.exit(1);
    }
    throw error;
  }
}

function isDirectRun() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}
