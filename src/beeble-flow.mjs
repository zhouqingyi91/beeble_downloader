const HOME_URL = 'https://app.beeble.ai/home';
const GENERATE_RE = /^Generate$/i;

export async function openBeebleHome(page) {
  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await installGenerateGuard(page);
}

export async function needsManualLogin(page) {
  if (/accounts\.google\.com|login|signin/i.test(page.url())) return true;
  if (await hasVisibleLoginSurface(page)) return true;
  const vfx = await findTextInteractive(page, /^VFX Pass Generator$/i, 7000);
  return !vfx;
}

export async function waitForHomeReady(page, timeoutMs = 120000) {
  await installGenerateGuard(page);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await hasVisibleLoginSurface(page))) {
      const remaining = Math.max(1000, deadline - Date.now());
      const vfx = await findTextInteractive(page, /^VFX Pass Generator$/i, Math.min(remaining, 3000));
      if (vfx) return;
    }
    await page.waitForTimeout(500);
  }
  throw new Error('home is not ready or login dialog is still visible');
}

export async function processOneImage(page, imagePath, options = {}) {
  const uploadTimeoutMs = options.uploadTimeoutMs ?? 120000;
  const renderTimeoutMs = options.renderTimeoutMs ?? 300000;

  await installGenerateGuard(page);
  await clickAllowed(page, /^VFX Pass Generator$/i, 'VFX Pass Generator', 45000);
  await chooseImageRadio(page);
  await uploadImage(page, imagePath);
  await clickAllowed(page, /^Review VFX Passes$/i, 'Review VFX Passes', uploadTimeoutMs);
  return await waitForGenerateReady(page, renderTimeoutMs);
}

export async function installGenerateGuard(page) {
  await page.evaluate(() => {
    if (window.__beebleGenerateGuardInstalled) return;
    window.__beebleGenerateGuardInstalled = true;
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target && event.target.closest ? event.target.closest('button,[role="button"],a') : null;
        const text = target ? (target.innerText || target.textContent || '').trim() : '';
        if (/^Generate$/i.test(text)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          console.warn('[beeble-downloader] blocked Generate click');
        }
      },
      true
    );
  }).catch(() => {});
}

async function chooseImageRadio(page) {
  const radio = page.getByRole('radio', { name: /^Image$/i }).first();
  if (await radio.count()) {
    await radio.check({ timeout: 15000 }).catch(async () => radio.click({ timeout: 15000 }));
    return;
  }
  await clickAllowed(page, /^Image$/i, 'Image', 15000);
}

async function uploadImage(page, imagePath) {
  const chooserPromise = page.waitForEvent('filechooser', { timeout: 30000 });
  await clickAllowed(page, /^Choose Files to Upload$/i, 'Choose Files to Upload', 30000);
  const chooser = await chooserPromise;
  await chooser.setFiles(imagePath);
}

async function waitForGenerateReady(page, timeoutMs) {
  const result = await page.waitForFunction(
    (source) => {
      const controls = [...document.querySelectorAll('button,[role="button"],a')];
      const button = controls.find((item) => new RegExp(source, 'i').test((item.innerText || item.textContent || '').trim()));
      if (!button) return null;
      const disabled = button.disabled || button.getAttribute('aria-disabled') === 'true';
      const rect = button.getBoundingClientRect();
      const visible = !!(rect.width && rect.height);
      return { visible, disabled, text: (button.innerText || button.textContent || '').trim() };
    },
    GENERATE_RE.source,
    { timeout: timeoutMs, polling: 1000 }
  );
  const state = await result.jsonValue();
  if (!state.visible || state.disabled) {
    throw new Error(`Generate appeared but is not ready: ${JSON.stringify(state)}`);
  }
  return state;
}

async function clickAllowed(page, textRe, label, timeoutMs) {
  if (GENERATE_RE.test(label)) {
    throw new Error('refusing to click Generate');
  }
  const locator = await findTextInteractive(page, textRe, timeoutMs, true);
  await locator.click({ timeout: timeoutMs });
}

async function findTextInteractive(page, textRe, timeoutMs, required = false) {
  const selectors = [
    page.getByRole('button', { name: textRe }).first(),
    page.getByRole('link', { name: textRe }).first(),
    page.getByText(textRe).first()
  ];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const locator of selectors) {
      try {
        if ((await locator.count()) > 0 && (await locator.isVisible())) {
          const disabled = await locator.evaluate((node) => node.disabled || node.getAttribute('aria-disabled') === 'true').catch(() => false);
          if (!disabled) return locator;
        }
      } catch {}
    }
    await page.waitForTimeout(500);
  }
  if (required) throw new Error(`cannot find enabled control: ${textRe}`);
  return null;
}

async function hasVisibleLoginSurface(page) {
  return await page.evaluate(() => {
    const textOf = (node) => (node.innerText || node.textContent || '').trim();
    const visible = (node) => {
      if (!node || !node.getBoundingClientRect) return false;
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const controls = [...document.querySelectorAll('button,[role="button"],input,a')].filter(visible);
    const hasAuthControl = controls.some((node) => {
      const text = textOf(node);
      const aria = node.getAttribute('aria-label') || '';
      const placeholder = node.getAttribute('placeholder') || '';
      const value = node.getAttribute('value') || '';
      return /^(Sign In|Login|Continue with Google|Continue with Apple)$/i.test(text)
        || /^(Sign In|Login)$/i.test(value)
        || /^(Email|Password)$/i.test(placeholder)
        || /sign in|login|continue with google/i.test(aria);
    });
    const modalText = [...document.querySelectorAll('[role="dialog"],[aria-modal="true"],div')]
      .filter(visible)
      .slice(0, 200)
      .some((node) => /beeble[\s\S]{0,400}(Email|Password|Login|Sign In|Continue with)/i.test(textOf(node)));
    return hasAuthControl && modalText;
  }).catch(() => false);
}
