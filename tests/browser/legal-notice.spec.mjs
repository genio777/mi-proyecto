import { test as base, expect } from '@playwright/test';

const json = (route, body) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Keep the legal flow independent of external services and their availability.
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue() : route.abort('internetdisconnected'));
    await page.route('**/data/chargers-spain.json*', route => json(route, {
      updated: '2026-11-13T12:00:00Z', chargers: [{ id: 'legal-test-madrid', name: 'Fixture legal Madrid',
        city: 'Madrid', country: 'ES', lat: 40.4168, lng: -3.7038, power: 22, connector: 'Tipo2',
        connectors: [{ type: 'Tipo2', powerKw: 22 }], price: null,
        source: 'Synthetic browser fixture', verified: 'No verificada', availability: 'Desconocida' }],
    }));
    await page.route('**/data/operator-tariffs.json*', route => json(route, { updated: '2026-11-13T12:00:00Z', operators: [] }));
    await page.route('**/data/international/index.json*', route => json(route, { schemaVersion: 1, countries: [] }));
    await page.route('**/tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') }));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Cargadores', exact: true })).toBeVisible();
    await use(page);
    expect(errors, 'Legal notices and local navigation cause no uncaught browser errors').toEqual([]);
  },
});

const noticeOnMap = page => page.getByRole('note').filter({ has: page.locator('#legal-notice-title') });
const selectTab = (page, name) => page.locator('nav').getByRole('button', { name, exact: true }).click();

test('the legal notice precedes the map and does not require consent to use the application', async ({ page }, testInfo) => {
  const notice = noticeOnMap(page);
  await expect(notice).toBeVisible();
  await expect(notice.getByRole('heading')).toBeVisible();
  await expect(page.locator('#map')).toBeVisible();
  expect(await notice.evaluate(element => Boolean(element.compareDocumentPosition(document.querySelector('#map')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  const positions = await Promise.all([notice.boundingBox(), page.locator('#map').boundingBox()]);
  expect(positions[0].y + positions[0].height).toBeLessThanOrEqual(positions[1].y);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(notice.getByRole('checkbox')).toHaveCount(0);
  await expect(notice.getByRole('button', { name: /aceptar|continuar|consentimiento/i })).toHaveCount(0);
  // Verify the essential limitations without locking the test to whole paragraphs.
  await expect(notice).toContainText(/no implica que las recargas sean gratuitas/i);
  await expect(notice).toContainText(/medida permitida por la legislación aplicable/i);
  await page.screenshot({ path: testInfo.outputPath('legal-home-desktop.png') });
  await selectTab(page, 'viaje');
  await expect(page.getByRole('button', { name: 'Calcular ruta', exact: true })).toBeVisible();
  await selectTab(page, 'mapa');
  await expect(noticeOnMap(page)).toBeVisible();
  await expect(page.locator('#map .leaflet-tile').first()).toBeVisible();
  await page.reload();
  await expect(noticeOnMap(page)).toBeVisible();
});

test('the footer opens accessible legal information locally from every other tab while offline', async ({ page }) => {
  await page.context().setOffline(true);
  for (const name of ['viaje', 'costes', 'favoritos', 'añadir gratis', 'vehículo', 'seguridad']) {
    await selectTab(page, name);
    const link = page.locator('footer').getByRole('link', { name: 'Aviso legal', exact: true });
    await expect(link).toHaveAttribute('href', '#aviso-legal');
    const previousUrl = page.url();
    await link.focus();
    await page.keyboard.press('Enter');
    const heading = page.getByRole('heading', { level: 1, name: 'Aviso legal', exact: true });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    expect(new URL(page.url()).origin).toBe(new URL(previousUrl).origin);
    expect(new URL(page.url()).pathname).toBe(new URL(previousUrl).pathname);
    await expect(page.getByRole('note').filter({ has: page.locator('#legal-notice-full-title') })).toBeVisible();
    await page.getByRole('button', { name: 'Volver al mapa', exact: true }).click();
    await expect(page.locator('nav').getByRole('button', { name: 'mapa', exact: true })).toBeFocused();
    await expect(noticeOnMap(page)).toBeVisible();
    await expect(page.locator('#map')).toBeVisible();
  }
});

test('the notice and legal detail remain readable and keyboard accessible at 360 pixels', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const notice = noticeOnMap(page);
  await expect(notice).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const dimensions = await notice.boundingBox();
  expect(dimensions.x).toBeGreaterThanOrEqual(0);
  expect(dimensions.x + dimensions.width).toBeLessThanOrEqual(360);
  expect(await notice.locator('p').first().evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('legal-home-mobile-360.png') });
  await notice.screenshot({ path: testInfo.outputPath('legal-notice-mobile-360.png') });
  await selectTab(page, 'seguridad');
  const link = page.locator('footer').getByRole('link', { name: 'Aviso legal', exact: true });
  await link.scrollIntoViewIfNeeded();
  const linkDimensions = await link.boundingBox();
  expect(linkDimensions.height).toBeGreaterThanOrEqual(44);
  await page.context().setOffline(true);
  await link.focus();
  await page.keyboard.press('Enter');
  const heading = page.getByRole('heading', { level: 1, name: 'Aviso legal', exact: true });
  await expect(heading).toBeFocused();
  await expect(heading).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const focusStyle = await heading.evaluate(element => ({ style: getComputedStyle(element).outlineStyle, width: Number.parseFloat(getComputedStyle(element).outlineWidth) }));
  expect(focusStyle.style).not.toBe('none');
  expect(focusStyle.width).toBeGreaterThanOrEqual(2);
  await page.screenshot({ path: testInfo.outputPath('legal-detail-mobile-360.png') });
  await page.getByRole('button', { name: 'Volver al mapa', exact: true }).click();
  await expect(page.locator('nav').getByRole('button', { name: 'mapa', exact: true })).toBeFocused();
  await expect(page.locator('#map')).toBeVisible();
});
