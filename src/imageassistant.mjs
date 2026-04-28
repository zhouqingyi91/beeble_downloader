export async function extractImagesFromPage(context, worker, extensionId, sourcePage, options = {}) {
  await closeExtractorPages(context, extensionId);
  await sourcePage.bringToFront();
  await triggerCurrentPageExtract(worker, options.level ?? 0);
  const extractorPage = await waitForExtractorPage(context, extensionId, options.timeoutMs ?? 45000);
  await extractorPage.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await waitForStableImageItems(extractorPage, options.stableMs ?? 3000, options.timeoutMs ?? 45000);
  const items = await collectImageItems(extractorPage);
  return { extractorPage, items };
}

export async function closeExtractorPages(context, extensionId) {
  const prefix = `chrome-extension://${extensionId}/imageExtractor.html`;
  await Promise.all(
    context
      .pages()
      .filter((page) => page.url().startsWith(prefix))
      .map((page) => page.close().catch(() => {}))
  );
}

export async function collectImageItems(page) {
  return await page.$$eval('a.imageItem', (links) =>
    links.map((link) => ({
      src: link.dataset.src || '',
      href: link.href || '',
      width: Number(link.dataset.width || 0),
      height: Number(link.dataset.height || 0),
      size: Number(link.dataset.size || 0),
      filename: link.dataset.filename || '',
      suffix: link.dataset.suffix || '',
      type: link.dataset.type || '',
      referer: link.dataset.referer || '',
      serial: Number(link.dataset.serial || 0),
      timestamp: Number(link.dataset.timestamp || 0),
      title: link.dataset.title || '',
      alt: link.dataset.alt || ''
    }))
  );
}

async function triggerCurrentPageExtract(worker, level) {
  await worker.evaluate(async (fetchLevel) => {
    if (typeof _o_extractImageFromSelectedPage === 'function') {
      await _o_extractImageFromSelectedPage(fetchLevel);
      return;
    }
    await chrome.runtime.sendMessage(chrome.runtime.id, {
      type: '_o_extractImageFromSelectedPage',
      level: String(fetchLevel)
    });
  }, level);
}

async function waitForExtractorPage(context, extensionId, timeoutMs) {
  const prefix = `chrome-extension://${extensionId}/imageExtractor.html`;
  const existing = context.pages().find((page) => page.url().startsWith(prefix));
  if (existing) return existing;
  return await context.waitForEvent('page', {
    predicate: (page) => page.url().startsWith(prefix),
    timeout: timeoutMs
  });
}

async function waitForStableImageItems(page, stableMs, timeoutMs) {
  const started = Date.now();
  let lastCount = -1;
  let stableSince = Date.now();
  while (Date.now() - started < timeoutMs) {
    const count = await page.locator('a.imageItem').count().catch(() => 0);
    if (count !== lastCount) {
      lastCount = count;
      stableSince = Date.now();
    }
    const pending = await page.evaluate(() => Number(window._o_loading || 0) + Object.keys(window._o_img_load_failed_set || {}).length).catch(() => 0);
    if (Date.now() - stableSince >= stableMs && pending === 0) return;
    await page.waitForTimeout(500);
  }
}
