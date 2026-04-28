#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import path from 'node:path';
import { openBeebleHome, needsManualLogin, waitForHomeReady, processOneImage } from './beeble-flow.mjs';
import { getExtensionServiceWorker, launchBrowser, resolveImageAssistantExtension } from './browser.mjs';
import { buildBaselineSet, downloadCandidates, filterCandidateItems } from './download.mjs';
import { ensureRuntimeDirs, listInputImages, moveToRendered, outputDirForImage, projectPaths } from './files.mjs';
import { closeExtractorPages, extractImagesFromPage } from './imageassistant.mjs';

const args = parseArgs(process.argv.slice(2));
const paths = projectPaths();
await ensureRuntimeDirs(paths);

const inputs = (await listInputImages(paths.inputDir)).slice(0, args.limit ?? undefined);
if (inputs.length === 0) {
  console.log('没有待处理图片。');
  process.exit(0);
}

console.log(`待处理: ${inputs.length} 张`);
const extension = await resolveImageAssistantExtension(paths);
console.log(`ImageAssistant: ${extension.extensionPath}${extension.degraded ? ' (trace 降级)' : ''}`);

const context = await launchBrowserOrExit(paths, extension.extensionPath);
let exitCode = 0;

try {
  const { worker, extensionId } = await getExtensionServiceWorker(context);
  const page = context.pages().find((item) => !item.url().startsWith('chrome-extension://')) || await context.newPage();
  await openBeebleHome(page);
  await ensureLoggedIn(page, args.loginTimeoutMs);

  if (args.dryRun) {
    console.log('dry-run：登录态可用；不会上传、下载、移动。');
    inputs.forEach((file) => console.log(`- ${path.basename(file)}`));
  } else for (const imagePath of inputs) {
    console.log(`开始: ${path.basename(imagePath)}`);
    try {
      await openBeebleHome(page);
      await ensureLoggedIn(page, args.loginTimeoutMs);

      const baseline = await extractImagesFromPage(context, worker, extensionId, page, { timeoutMs: 45000 });
      const baselineSet = buildBaselineSet(baseline.items);
      await baseline.extractorPage.close().catch(() => {});
      console.log(`baseline 图片数: ${baselineSet.size}`);

      const generateState = await processOneImage(page, imagePath, { renderTimeoutMs: args.renderTimeoutMs });
      console.log(`渲染完成信号: ${JSON.stringify(generateState)}; 未点击 Generate`);
      console.log(`等待 ${Math.round(args.postGenerateDelayMs / 1000)} 秒后提取图片...`);
      await page.waitForTimeout(args.postGenerateDelayMs);

      const extracted = await extractImagesFromPage(context, worker, extensionId, page, { timeoutMs: 60000, stableMs: 4000 });
      const candidates = filterCandidateItems(extracted.items, baselineSet);
      console.log(`候选图片: ${candidates.length}`);
      candidates.slice(0, 5).forEach((item, idx) => console.log(`  ${idx + 1}. ${item.width}x${item.height} ${item.src}`));

      const outDir = await outputDirForImage(paths.outputDir, imagePath);
      const downloaded = await downloadCandidates(extracted.extractorPage, candidates, outDir, imagePath);
      await extracted.extractorPage.close().catch(() => {});

      if (downloaded.length === 0) {
        throw new Error('没有成功下载的候选图片');
      }
      downloaded.forEach((item) => console.log(`下载: ${item.filePath}`));
      const renderedPath = await moveToRendered(imagePath, paths.renderedDir);
      console.log(`完成并移动源图: ${renderedPath}`);
    } catch (error) {
      exitCode = 1;
      console.error(`失败: ${path.basename(imagePath)}: ${error.message}`);
      await saveFailureScreenshot(page, paths.logDir, imagePath).catch(() => {});
    } finally {
      await closeExtractorPages(context, extensionId).catch(() => {});
    }
  }
} finally {
  await context.close().catch(() => {});
}

process.exit(exitCode);

async function launchBrowserOrExit(paths, extensionPath) {
  try {
    return await launchBrowser(paths, extensionPath);
  } catch (error) {
    if (/ProcessSingleton|profile.*in use|SingletonLock/i.test(error.message || '')) {
      console.error('无法启动 Chromium：./chrome-profile 正被另一个自动化浏览器窗口占用。');
      console.error('请先关闭刚才用于登录的 Playwright Chromium 窗口，然后重新运行命令；登录态会保留。');
      process.exit(1);
    }
    throw error;
  }
}

function parseArgs(argv) {
  const parsed = { dryRun: false, limit: null, renderTimeoutMs: 300000, loginTimeoutMs: 120000, postGenerateDelayMs: 10000 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--limit') parsed.limit = Number(argv[++i]);
    else if (arg.startsWith('--limit=')) parsed.limit = Number(arg.split('=')[1]);
    else if (arg === '--render-timeout-ms') parsed.renderTimeoutMs = Number(argv[++i]);
    else if (arg.startsWith('--render-timeout-ms=')) parsed.renderTimeoutMs = Number(arg.split('=')[1]);
    else if (arg === '--login-timeout-ms') parsed.loginTimeoutMs = Number(argv[++i]);
    else if (arg.startsWith('--login-timeout-ms=')) parsed.loginTimeoutMs = Number(arg.split('=')[1]);
    else if (arg === '--post-generate-delay-ms') parsed.postGenerateDelayMs = Number(argv[++i]);
    else if (arg.startsWith('--post-generate-delay-ms=')) parsed.postGenerateDelayMs = Number(arg.split('=')[1]);
  }
  if (parsed.limit !== null && (!Number.isInteger(parsed.limit) || parsed.limit < 1)) {
    throw new Error('--limit 必须是正整数');
  }
  return parsed;
}

async function ensureLoggedIn(page, loginTimeoutMs) {
  if (!(await needsManualLogin(page))) {
    try {
      await waitForHomeReady(page, loginTimeoutMs);
      return;
    } catch (error) {
      console.log(`首页尚未可用：${error.message}`);
    }
  }
  console.log(`需要手动登录：请在打开的 Chromium 中完成 Google/Beeble 登录，然后回到终端按回车；之后脚本最多等待 ${Math.round(loginTimeoutMs / 1000)} 秒确认首页。`);
  await waitForEnter();
  await openBeebleHome(page);
  await waitForHomeReady(page, loginTimeoutMs);
}

async function waitForEnter() {
  const rl = createInterface({ input, output });
  try {
    await rl.question('');
  } finally {
    rl.close();
  }
}

async function saveFailureScreenshot(page, logDir, imagePath) {
  const name = `${Date.now()}-${path.basename(imagePath, path.extname(imagePath))}.png`;
  const target = path.join(logDir, name);
  await page.screenshot({ path: target, fullPage: true });
  console.error(`截图: ${target}`);
}
