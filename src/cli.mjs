#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openBeebleHome, needsManualLogin, waitForHomeReady, processOneImage } from './beeble-flow.mjs';
import { getExtensionServiceWorker, ImageAssistantNotInstalledError, launchBrowser, resolveImageAssistantExtension } from './browser.mjs';
import { buildBaselineSet, downloadCandidates, filterCandidateItems, missingRequiredPasses, sourceNameSegment, sourceNumberNameSegment } from './download.mjs';
import { ensureRuntimeDirs, listInputImages, moveDirectoryToMissing, moveToRendered, outputDirForImage, projectPaths } from './files.mjs';
import { generateAndDownloadPasses } from './generate-download.mjs';
import { closeExtractorPages, extractImagesFromPage } from './imageassistant.mjs';
import { assertInitialized } from './init-state.mjs';

if (isDirectRun()) {
  const exitCode = await main();
  process.exit(exitCode);
}

export async function main(argv = process.argv.slice(2), root = process.cwd()) {
  const args = parseArgs(argv);
  const paths = projectPaths(root);
  await ensureRuntimeDirs(paths);

  const inputs = (await listInputImages(paths.inputDir)).slice(0, args.limit ?? undefined);
  if (inputs.length === 0) {
    console.log('没有待处理图片。');
    return 0;
  }

  if (args.useGenerateDownload) {
    return await runGenerateDownload(args, paths, inputs);
  }
  return await runLegacyExtractor(args, paths, inputs);
}

async function runGenerateDownload(args, paths, inputs) {
  console.log(`待处理: ${inputs.length} 张`);
  console.log('模式: Generate 下载 zip');

  const context = await launchBrowserOrExit(paths);
  let exitCode = 0;
  let page = context.pages().find((item) => !item.url().startsWith('chrome-extension://')) || await context.newPage();

  try {
    await openBeebleHome(page, { blockGenerate: false });
    await ensureLoggedIn(page, args.loginTimeoutMs, { blockGenerate: false });

    if (args.dryRun) {
      console.log('dry-run：登录态可用；不会上传、下载、移动。');
      inputs.forEach((file) => console.log(`- ${path.basename(file)}`));
      return 0;
    }

    for (const imagePath of inputs) {
      console.log(`开始: ${path.basename(imagePath)}`);
      try {
        await openBeebleHome(page, { blockGenerate: false });
        await ensureLoggedIn(page, args.loginTimeoutMs, { blockGenerate: false });

        const result = await generateAndDownloadPasses(page, imagePath, paths, {
          renderTimeoutMs: args.renderTimeoutMs,
          ...downloadNameSegmentOption(args, imagePath)
        });
        page = result.page;
        console.log(`下载 zip: ${result.zipName || '(unknown)'}`);
        console.log(`解压文件数: ${result.extractedFiles.length}`);

        const renderedPath = await moveToRendered(imagePath, paths.renderedDir);
        console.log(`完成并移动源图: ${renderedPath}`);
      } catch (error) {
        exitCode = 1;
        console.error(`失败: ${path.basename(imagePath)}: ${error.message}`);
        await saveFailureScreenshot(page, paths.logDir, imagePath).catch(() => {});
      }
    }
  } finally {
    await context.close().catch(() => {});
  }

  return exitCode;
}

async function runLegacyExtractor(args, paths, inputs) {
  try {
    await assertInitialized(paths);
  } catch (error) {
    console.error(error.message);
    return 1;
  }

  console.log(`待处理: ${inputs.length} 张`);
  let extension;
  try {
    extension = await resolveImageAssistantExtension(paths);
  } catch (error) {
    if (error instanceof ImageAssistantNotInstalledError) {
      console.error(error.message);
      console.error('请先运行 npm run init 打开安装页，安装插件后再运行下载命令。');
      return 1;
    }
    throw error;
  }
  console.log(`ImageAssistant: ${extension.extensionPath}`);

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
      return 0;
    }

    for (const imagePath of inputs) {
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
        const downloadOptions = downloadNameSegmentOption(args, imagePath);
        const downloaded = await downloadCandidates(extracted.extractorPage, candidates, outDir, imagePath, downloadOptions);
        await extracted.extractorPage.close().catch(() => {});

        if (downloaded.length === 0) {
          throw new Error('没有成功下载的候选图片');
        }
        downloaded.forEach((item) => console.log(`下载: ${item.filePath}`));
        const missingPasses = await missingRequiredPasses(outDir);
        if (missingPasses.length > 0) {
          const missingPath = await moveDirectoryToMissing(outDir, paths.missingDir);
          console.log(`缺少 pass: ${missingPasses.join(', ')}; 已移动输出目录: ${missingPath}`);
        }
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

  return exitCode;
}

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

export function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    limit: null,
    renderTimeoutMs: 300000,
    loginTimeoutMs: 120000,
    postGenerateDelayMs: 10000,
    useGenerateDownload: false,
    useSourceName: false,
    useSourceNumber: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--use-generate-download') parsed.useGenerateDownload = true;
    else if (arg === '--use-source-name') parsed.useSourceName = true;
    else if (arg === '--use-source-number') parsed.useSourceNumber = true;
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

function downloadNameSegmentOption(args, imagePath) {
  if (args.useSourceName) return { nameSegment: sourceNameSegment(imagePath) };
  if (args.useSourceNumber) return { nameSegment: sourceNumberNameSegment(imagePath) };
  return {};
}

async function ensureLoggedIn(page, loginTimeoutMs, homeOptions = {}) {
  if (!(await needsManualLogin(page))) {
    try {
      await waitForHomeReady(page, loginTimeoutMs, homeOptions);
      return;
    } catch (error) {
      console.log(`首页尚未可用：${error.message}`);
    }
  }
  console.log(`需要手动登录：请在打开的 Chromium 中完成 Google/Beeble 登录，然后回到终端按回车；之后脚本最多等待 ${Math.round(loginTimeoutMs / 1000)} 秒确认首页。`);
  await waitForEnter();
  await openBeebleHome(page, homeOptions);
  await waitForHomeReady(page, loginTimeoutMs, homeOptions);
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

function isDirectRun() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}
