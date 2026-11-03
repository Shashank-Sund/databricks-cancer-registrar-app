import { test as base, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';

// Smoke test for the public, backend-less demo build. Every test fails on any
// console error, page error, failed request, HTTP error, request to /api or
// request to another origin. The demo must be fully self-contained.

const SHOTS = process.env.SCREENSHOT_DIR || path.join('test-results', 'screenshots');

const test = base.extend<{ issues: string[] }>({
  issues: [async ({ page, baseURL }, use) => {
    const origin = new URL(baseURL!).origin;
    const issues: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') issues.push(`console error: ${m.text()}`);
    });
    page.on('pageerror', (e) => issues.push(`page error: ${e.message}`));
    page.on('requestfailed', (r) => {
      issues.push(`request failed: ${r.url()} ${r.failure()?.errorText ?? ''}`);
    });
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (url.protocol === 'data:' || url.protocol === 'blob:') return;
      if (url.origin !== origin) issues.push(`off-origin request: ${r.url()}`);
      if (url.pathname.startsWith('/api')) issues.push(`api request: ${r.url()}`);
    });
    page.on('response', (r) => {
      if (r.status() >= 400) issues.push(`HTTP ${r.status()}: ${r.url()}`);
    });
    await use(issues);
    expect(issues, 'console, network and origin issues').toEqual([]);
  }, { auto: true }],
});

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByTestId('demo-banner')).toBeVisible();
}

async function expectToast(page: Page, title: RegExp | string) {
  await expect(page.getByTestId('toast').filter({ hasText: title }).first()).toBeVisible();
}

const queueRow = (page: Page, caseId: string) =>
  page.locator('tbody tr').filter({ hasText: caseId });

test.describe('routes', () => {
  test('every route renders with the demo banner', async ({ page, issues }) => {
    await open(page, '/');
    await expect(page.getByRole('heading', { name: 'Triage queue' })).toBeVisible();
    const banner = page.getByTestId('demo-banner');
    await expect(banner).toContainText('Demo with synthetic data. No backend; changes reset on reload.');
    const source = banner.getByRole('link', { name: /View source/ });
    await expect(source).toHaveAttribute(
      'href',
      'https://github.com/Shashank-Sund/databricks-cancer-registrar-app',
    );
    await expect(source).toHaveAttribute('target', '_blank');
    await expect(page.getByText('registrar@example.org')).toBeVisible();

    await open(page, '/drafts');
    await expect(page.getByRole('heading', { name: 'My drafts' })).toBeVisible();

    await open(page, '/getting-started');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await open(page, '/cases/C-0002');
    await expect(page.getByRole('heading', { name: 'Maria Delgado' })).toBeVisible();
    expect(issues).toEqual([]);
  });

  test('deep link reload keeps working, unknown cases get a friendly state', async ({ page }) => {
    // Pre-seeded draft: survives a reload because the mock re-seeds it.
    await open(page, '/cases/C-0005');
    await expect(page.getByTestId('finish-button')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('demo-banner')).toBeVisible();
    await expect(page.getByTestId('finish-button')).toBeVisible();

    // A case opened in an earlier session is gone after reload.
    await open(page, '/cases/C-0001');
    const notice = page.getByTestId('case-not-in-session');
    await expect(notice).toContainText('This case is not in this demo session');
    await page.getByRole('link', { name: 'Back to queue' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Triage queue' })).toBeVisible();

    // Unknown path falls back to the queue (SPA rewrite + router catch-all).
    await open(page, '/no-such-page');
    await expect(page.getByRole('heading', { name: 'Triage queue' })).toBeVisible();
  });
});

test.describe('queue', () => {
  test('filter, sort, paginate and expand', async ({ page, issues }) => {
    await open(page, '/');
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    const initial = await rows.count();
    expect(initial).toBeGreaterThan(3);

    // Filter by label.
    // Column 5 holds the AI label badge (every row also has a "Not reportable" button).
    const labelCell = (i: number) => rows.nth(i).locator('td').nth(4);
    await page.getByTestId('filter-label').selectOption('not_reportable');
    await expect.poll(() => rows.count()).toBeLessThan(initial);
    const filtered = await rows.count();
    expect(filtered).toBeGreaterThan(0);
    for (let i = 0; i < filtered; i++) await expect(labelCell(i)).toContainText('Not reportable');
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(rows).toHaveCount(initial);

    // Minimum score filter.
    await page.getByTestId('filter-min-score').fill('0.9');
    await expect.poll(() => rows.count()).toBeLessThan(initial);
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(rows).toHaveCount(initial);

    // Sort toggles between descending and ascending score.
    const firstScore = () =>
      rows.first().getByLabel(/Reportability score \d+ percent/).getAttribute('aria-label');
    const desc = await firstScore();
    await page.getByTestId('queue-sort-score').click();
    await expect(page.getByTestId('queue-sort-score')).toHaveAttribute('aria-label', /ascending/);
    await expect.poll(firstScore).not.toBe(desc);
    const asc = Number((await firstScore())!.match(/\d+/)![0]);
    expect(asc).toBeLessThan(Number(desc!.match(/\d+/)![0]));
    await page.getByTestId('queue-sort-score').click();
    await expect.poll(firstScore).toBe(desc);

    // Pagination: the demo queue fits on one page, so both buttons are disabled.
    const indicator = page.getByTestId('queue-page-indicator');
    await expect(indicator).toContainText(`Page 1 of 1`);
    await expect(indicator).toContainText(`of ${initial}`);
    await expect(page.getByTestId('queue-prev-page')).toBeDisabled();
    await expect(page.getByTestId('queue-next-page')).toBeDisabled();

    // Expand a row to show the classifier rationale.
    const expander = page.getByTestId('queue-expand-C-0001');
    await expander.click();
    await expect(expander).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('Classifier rationale')).toBeVisible();
    await expander.click();
    await expect(page.getByText('Classifier rationale')).toHaveCount(0);
    expect(issues).toEqual([]);
  });

  test('triage reportable lands in drafts, not reportable leaves the queue', async ({ page }) => {
    await open(page, '/');
    await page.getByTestId('triage-reportable-C-0001').click();
    await expectToast(page, 'Case marked reportable');
    await expect(queueRow(page, 'C-0001')).toHaveCount(0);

    await page.getByTestId('triage-not-reportable-C-0012').click();
    await expectToast(page, 'Case marked not reportable');
    await expect(queueRow(page, 'C-0012')).toHaveCount(0);

    // In-app navigation keeps the in-memory session.
    await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: /My Drafts/ }).click();
    await expect(page.getByRole('heading', { name: 'My drafts' })).toBeVisible();
    const main = page.locator('main');
    await expect(main.getByRole('link', { name: /C-0001/ })).toBeVisible();
    await expect(main.getByRole('link', { name: /C-0012/ })).toHaveCount(0);

    await main.getByRole('link', { name: /C-0001/ }).click();
    await expect(page.getByRole('heading', { name: 'Jane Okafor' })).toBeVisible();
  });
});

test.describe('case form', () => {
  test('edit, fill unknowns, code lookup, jump to edit, finish blocked then success', async ({ page }) => {
    await open(page, '/drafts');
    await page.locator('main').getByRole('link', { name: /C-0002/ }).click();
    await expect(page.getByRole('heading', { name: 'Maria Delgado' })).toBeVisible();

    const finish = page.getByTestId('finish-button');
    // Blocked: edit errors keep Finish disabled and say why.
    await expect(finish).toBeDisabled();
    await expect(finish).toHaveAttribute('title', /Resolve \d+ edit error/);

    // Jump to an edit from the edits panel focuses the field.
    await page.getByRole('button', { name: /Diagnostic Confirmation is required/ }).click();
    await expect(page.getByTestId('field-input-545')).toBeFocused();

    // Code lookup (FIPS county typeahead).
    const county = page.getByTestId('field-input-90');
    await county.click();
    await county.fill('San Diego');
    await page.getByRole('option', { name: /San Diego County/ }).click();
    await expectToast(page, /Saved at/);
    await expect(county).toHaveValue(/073/);

    // Edit a free-text field inline.
    const examined = page.getByTestId('field-input-830');
    await examined.fill('12');
    await examined.press('Enter');
    await expectToast(page, /Saved at/);
    await expect(examined).toHaveValue('12');

    // Fill unknowns for one section.
    await page.getByTestId('fill-unknown-section-tumor-identification').click();
    await expectToast(page, /Filled \d+ field/);
    await expect(page.getByTestId('field-input-545')).not.toHaveValue('');

    // Fill unknowns for the whole form (nothing left or more filled, both fine).
    await page.getByTestId('fill-unknowns-all').click();
    await expectToast(page, /Filled \d+ field|Nothing to fill/);

    // All edits pass now: Finish succeeds and returns to the queue.
    await expect(page.getByRole('button', { name: /is required/ })).toHaveCount(0);
    await expect(finish).toBeEnabled();
    await finish.click();
    await expectToast(page, 'Case finalized');
    await expect(page.getByRole('heading', { name: 'Triage queue' })).toBeVisible();
    await expect(page.locator('main').getByText('C-0002')).toHaveCount(0);
  });

  test('fill all unknowns on a fresh draft', async ({ page }) => {
    await open(page, '/cases/C-0009');
    await page.getByTestId('fill-unknowns-all').click();
    await expectToast(page, /Filled \d+ field/);
  });
});

// Accessibility: no serious or critical axe violations, light and dark.
const A11Y_PAGES = [
  { name: 'queue', url: '/', ready: 'Triage queue' },
  { name: 'drafts', url: '/drafts', ready: 'My drafts' },
  { name: 'getting-started', url: '/getting-started', ready: null },
  { name: 'case', url: '/cases/C-0002', ready: 'Maria Delgado' },
  { name: 'case-not-in-session', url: '/cases/C-0001', ready: null },
] as const;

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`axe ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    for (const p of A11Y_PAGES) {
      test(`${p.name}`, async ({ page }) => {
        await open(page, p.url);
        if (p.ready) await expect(page.getByRole('heading', { name: p.ready })).toBeVisible();
        else await expect(page.locator('main h1, main [role=status]').first()).toBeVisible();
        await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /dark/ : /^(?!.*dark)/);
        await page.waitForTimeout(300);
        const results = await new AxeBuilder({ page }).analyze();
        const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(
          bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
        ).toEqual([]);
      });
    }
  });
}

// Phone layout: no page-level horizontal scroll on any route, the banner covers
// no controls, and the key controls sit fully inside the viewport.
const PHONE = { width: 390, height: 844 };

async function controlsOutsideViewport(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((els) =>
    els
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.left < 0 || r.right > window.innerWidth + 0.5;
      })
      .map((el) => el.outerHTML.slice(0, 100)),
  );
}

test.describe('phone 390x844', () => {
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

  const PHONE_PAGES = [
    ...A11Y_PAGES,
    { name: 'unknown-route', url: '/no-such-page', ready: 'Triage queue' },
  ] as const;

  for (const scheme of ['light', 'dark'] as const) {
    for (const p of PHONE_PAGES) {
      test(`${p.name} ${scheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await open(page, p.url);
        if (p.ready) await expect(page.getByRole('heading', { name: p.ready })).toBeVisible();
        else await expect(page.locator('main h1, main [role=status]').first()).toBeVisible();
        await page.waitForTimeout(300);

        const overflow = await page.evaluate(() => ({
          inner: window.innerWidth,
          doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          body: document.body.scrollWidth - document.body.clientWidth,
          main: (() => {
            const m = document.querySelector('main')!;
            return m.scrollWidth - m.clientWidth;
          })(),
        }));
        expect(overflow.inner, 'layout viewport width').toBe(PHONE.width);
        expect(overflow.doc, 'document horizontal overflow (px)').toBeLessThanOrEqual(0);
        expect(overflow.body, 'body horizontal overflow (px)').toBeLessThanOrEqual(0);
        expect(overflow.main, 'main horizontal overflow (px)').toBeLessThanOrEqual(0);

        // Top bar controls stay on screen.
        await expect(page.getByRole('button', { name: 'Open navigation' })).toBeInViewport({ ratio: 1 });
        await expect(page.getByRole('button', { name: /Switch to (light|dark) theme/ })).toBeInViewport({ ratio: 1 });
        await expect(page.getByTestId('demo-banner').getByRole('link', { name: /View source/ })).toBeInViewport({ ratio: 1 });

        // No visible control anywhere on the page extends past the right edge.
        expect(
          await controlsOutsideViewport(page, 'button, a[href], input, select, textarea'),
          'controls outside the viewport horizontally',
        ).toEqual([]);

        if (p.name === 'queue' || p.name === 'unknown-route') {
          const card = page.getByTestId('queue-card-C-0001');
          await card.scrollIntoViewIfNeeded();
          await expect(page.getByTestId('triage-reportable-C-0001')).toBeInViewport({ ratio: 1 });
          await expect(page.getByTestId('triage-not-reportable-C-0001')).toBeInViewport({ ratio: 1 });
        }
        if (p.name === 'case') {
          await expect(page.getByTestId('finish-button')).toBeInViewport({ ratio: 1 });
          await expect(page.getByTestId('fill-unknowns-all')).toBeInViewport({ ratio: 1 });
        }

        const covered = await page.evaluate(() => {
          const banner = document.querySelector('[data-testid="demo-banner"]')!;
          const style = getComputedStyle(banner);
          const out: string[] = [];
          if (style.position === 'fixed' || style.position === 'absolute') out.push(`banner is ${style.position}`);
          for (const el of document.querySelectorAll('button, a[href], input, select, textarea')) {
            if (banner.contains(el)) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            const x = r.left + r.width / 2;
            const y = r.top + r.height / 2;
            if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
            const hit = document.elementFromPoint(x, y);
            if (hit && banner.contains(hit)) out.push(el.outerHTML.slice(0, 80));
          }
          return out;
        });
        expect(covered, 'controls covered by the demo banner').toEqual([]);

        fs.mkdirSync(SHOTS, { recursive: true });
        await page.evaluate(() => document.querySelector('main')!.scrollTo(0, 0));
        await page.screenshot({ path: path.join(SHOTS, `phone-${p.name}-${scheme}.png`) });
      });
    }
  }

  test('navigation drawer: open, Escape, backdrop, closes on navigation', async ({ page }) => {
    await open(page, '/');
    const menu = page.getByRole('button', { name: 'Open navigation' });
    const drawer = page.locator('#mobile-nav');
    await expect(menu).toHaveAttribute('aria-controls', 'mobile-nav');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(drawer).toHaveCount(0);

    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'Queue' })).toBeFocused();
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, 'phone-drawer-open.png') });
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(menu).toBeFocused();

    await menu.click();
    await page.mouse.click(370, 600); // backdrop, right of the 256px drawer
    await expect(drawer).toHaveCount(0);

    await menu.click();
    await drawer.getByRole('link', { name: 'Getting Started' }).click();
    await expect(page).toHaveURL(/\/getting-started$/);
    await expect(drawer).toHaveCount(0);
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  test('phone triage from a card', async ({ page }) => {
    await open(page, '/');
    await page.getByTestId('queue-expand-C-0003').click();
    await expect(page.getByTestId('queue-card-C-0003')).toContainText('Classifier rationale');
    await page.getByTestId('triage-reportable-C-0003').click();
    await expectToast(page, 'Case marked reportable');
    await expect(page.getByTestId('queue-card-C-0003')).toHaveCount(0);
  });
});
