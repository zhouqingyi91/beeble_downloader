import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { clickTextInteractive, findTextInteractive, processOneImage } from './beeble-flow.mjs';
import { safeSegment } from './files.mjs';
import { extractZipForSourceImage } from './zip-output.mjs';

const DOWNLOAD_RE = /^Download$/i;
const ALL_PASSES_RE = /^All Passes \(PNG\)/i;
const DOWNLOAD_ANYWAY_RE = /^Download Anyway$/i;

export async function generateAndDownloadPasses(page, imagePath, paths, options = {}) {
  const renderTimeoutMs = options.renderTimeoutMs ?? 300000;
  const uploadTimeoutMs = options.uploadTimeoutMs ?? 120000;

  await processOneImage(page, imagePath, {
    uploadTimeoutMs,
    renderTimeoutMs,
    blockGenerate: false
  });
  await clickTextInteractive(page, /^Generate$/i, 'Generate', 15000);

  const downloadPage = await waitForPageWithControl(page.context(), DOWNLOAD_RE, renderTimeoutMs);
  await clickTextInteractive(downloadPage, DOWNLOAD_RE, 'Download', 30000);

  const download = await clickAllPassesAndWaitForDownload(downloadPage, renderTimeoutMs);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'beeble-generate-'));
  const zipPath = path.join(tempDir, safeSegment(download.suggestedFilename() || 'beeble-passes.zip'));

  try {
    await download.saveAs(zipPath);
    const extractedFiles = await extractZipForSourceImage(zipPath, paths.outputDir, imagePath);
    return {
      page: downloadPage,
      zipName: download.suggestedFilename(),
      extractedFiles
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function clickAllPassesAndWaitForDownload(page, timeoutMs) {
  const downloadPromise = page.waitForEvent('download', { timeout: timeoutMs });
  await clickTextInteractive(page, ALL_PASSES_RE, 'All Passes (PNG)', 30000);

  const anyway = await findTextInteractive(page, DOWNLOAD_ANYWAY_RE, 5000);
  if (anyway) await anyway.click({ timeout: 15000 });

  return await downloadPromise;
}

async function waitForPageWithControl(context, textRe, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const page of [...context.pages()].reverse()) {
      const locator = await findTextInteractive(page, textRe, 1000);
      if (locator) {
        await page.bringToFront().catch(() => {});
        return page;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`cannot find enabled control: ${textRe}`);
}
