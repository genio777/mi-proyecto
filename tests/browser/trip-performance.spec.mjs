import { test as base, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { routeResponse } from './helpers/osrm.mjs';

// A synthetic corridor with realistic connector powers. It never enters production data.
const stations = Array.from({ length: 20 }, (_, index) => ({
  id: 'performance-' + index, name: 'Fixture route station ' + (index + 1), city: 'Test corridor', country: 'FR',
  lat: 48.88 + index * 0.18, lng: 2.3, power: [350, 150, 250][index % 3], connector: 'CCS',
  connectors: [{ type: 'CCS', powerKw: [350, 150, 250][index % 3] }], price: null,
  source: 'Synthetic performance fixture', verified: 'No verificada', availability: 'Desconocida',
}));
const json = (route, body) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
const gates = new Set();
const deferred = () => {
  let done;
  const gate = { resolved: false, promise: new Promise(resolve => { done = resolve; }), resolve: value => { gate.resolved = true; done(value); } };
  gates.add(gate);
  return gate;
};
const waitForGate = gate => expect.poll(() => gate.resolved, { timeout: 10_000 }).toBe(true);
const nextPaints = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const calculation = page => page.getByRole('button', { name: 'Calcular ruta', exact: true });
const cancel = page => page.getByRole('button', { name: 'Cancelar cálculo', exact: true });

const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/data/chargers-spain.json*', route => json(route, { updated: '2026-11-13T12:00:00Z', chargers: stations }));
    await page.route('**/data/operator-tariffs.json*', route => json(route, { updated: '2026-11-13T12:00:00Z', operators: [] }));
    await page.route('**/data/international/index.json*', route => json(route, { schemaVersion: 1, countries: [] }));
    await page.route('**/tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') }));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: stations[0].name, exact: true })).toBeVisible();
    await use(page);
    expect(errors, 'Performance, cancellation and deadlines cause no uncaught browser errors').toEqual([]);
  },
});
test.afterEach(() => { for (const gate of gates) gate.resolve(); gates.clear(); });

async function enterTrip(page, destinations = ['50, 2.3', '51.2, 2.3', '52.4, 2.3']) {
  await page.locator('nav').getByRole('button', { name: 'viaje', exact: true }).click();
  await page.getByRole('button', { name: destinations.length === 3 ? '3 destinos' : 'Solo ida', exact: true }).click();
  await page.getByRole('button', { name: 'Más rápido', exact: true }).click();
  await page.getByLabel('Origen', { exact: true }).fill('48.8, 2.3');
  for (let index = 0; index < destinations.length; index++) await page.getByLabel('Destino ' + (index + 1), { exact: true }).fill(destinations[index]);
  await page.getByLabel('SOC salida (%)', { exact: true }).fill('20');
  await page.getByLabel('Reserva mínima (%)', { exact: true }).fill('15');
}

test('three destinations with charging finish within the road request budget', async ({ page }, testInfo) => {
  const requests = [];
  await page.route('https://router.project-osrm.org/**', route => {
    requests.push(new URL(route.request().url()));
    return json(route, routeResponse(route.request().url()));
  });
  await enterTrip(page);
  await calculation(page).click();
  const summary = page.getByLabel('Resumen visual del viaje', { exact: true });
  await expect(summary).toBeVisible({ timeout: 25_000 });
  await expect(summary.locator('.tripSocLine')).toHaveCount(3);
  await expect(page.locator('.routeStopCard').first()).toBeVisible();
  await expect(calculation(page)).toBeEnabled();
  const matrices = requests.filter(url => url.pathname.includes('/table/'));
  const multiLegPaths = requests.filter(url => url.pathname.includes('/route/') && decodeURIComponent(url.pathname.split('/driving/')[1]).split(';').length > 2);
  expect(requests.length).toBeLessThanOrEqual(20);
  expect(matrices.length).toBeGreaterThan(0);
  expect(matrices.some(url => url.searchParams.get('sources').split(';').length > 1)).toBe(true);
  expect(multiLegPaths).toHaveLength(1);
  const budgetReport = JSON.stringify({
    requests: requests.length, matrices: matrices.length, finalMultiLegPaths: multiLegPaths.length,
    chargingStops: await page.locator('.routeStopCard').count(), urls: requests.map(url => url.href),
  }, null, 2);
  const reportPath = testInfo.outputPath('road-request-budget.json');
  await writeFile(reportPath, budgetReport);
  await testInfo.attach('road-request-budget', { contentType: 'application/json', path: reportPath });
});

test('cancel releases a pending road request and its late reply cannot overwrite a new trip', async ({ page }) => {
  const captured = deferred(), release = deferred(), delivered = deferred();
  let first = true;
  await page.route('https://router.project-osrm.org/**', async route => {
    if (first) {
      first = false; captured.resolve(); await release.promise;
      try { await json(route, routeResponse(route.request().url())); } catch { /* Client already cancelled this response. */ }
      delivered.resolve();
    } else await json(route, routeResponse(route.request().url()));
  });
  await enterTrip(page, ['50, 2.3']);
  await calculation(page).click();
  await waitForGate(captured);
  await expect(cancel(page)).toBeVisible();
  await expect(page.getByLabel('Tiempo transcurrido', { exact: true })).toBeVisible();
  await cancel(page).click();
  await expect(calculation(page)).toBeEnabled({ timeout: 2000 });
  await expect(page.locator('.routeResult')).toContainText(/cancelad/i);
  await page.getByLabel('Destino 1', { exact: true }).fill('48.9, 2.3');
  await calculation(page).click();
  const summary = page.getByLabel('Resumen visual del viaje', { exact: true });
  await expect(summary).toBeVisible();
  const currentTrip = await summary.innerText();
  release.resolve(); await delivered.promise; await nextPaints(page);
  await expect(summary).toHaveText(currentTrip, { useInnerText: true });
  await expect(calculation(page)).toBeEnabled();
  await expect(page.locator('.routeStopCard')).toHaveCount(0);
});

test('changing trip inputs cancels a pending catalog and discards its late stations', async ({ page }) => {
  const captured = deferred(), release = deferred(), delivered = deferred();
  const lateStation = { ...stations[0], id: 'late-cancelled-station', name: 'Fixture late cancelled station', country: 'RU', lat: 55.8, lng: 37.6,
    sourceUrl: 'https://example.org/charging/late', dataProvider: { name: 'Synthetic fixture', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' } };
  await page.route('**/data/international/index.json*', route => json(route, { schemaVersion: 1,
    countries: [{ code: 'RU', file: 'RU.json', count: 1, bbox: [37, 55, 38, 56] }] }));
  await page.route('**/data/international/RU.json', async route => {
    captured.resolve(); await release.promise;
    try { await json(route, { country: 'RU', chargers: [lateStation] }); } catch { /* Client already cancelled this response. */ }
    delivered.resolve();
  });
  await page.route('https://router.project-osrm.org/**', route => json(route, routeResponse(route.request().url())));
  await page.reload();
  await enterTrip(page, ['55.95, 37.6']);
  await page.getByLabel('Origen', { exact: true }).fill('55.75, 37.6');
  await calculation(page).click();
  await waitForGate(captured);
  await page.getByLabel('SOC salida (%)', { exact: true }).fill('30');
  await expect(calculation(page)).toBeEnabled({ timeout: 2000 });
  await expect(page.locator('.routeResult')).toContainText(/han cambiado|cancelad/i);
  release.resolve(); await delivered.promise; await nextPaints(page);
  await expect(page.getByLabel('Resumen visual del viaje', { exact: true })).toHaveCount(0);
  await page.locator('nav').getByRole('button', { name: 'mapa', exact: true }).click();
  await expect(page.getByRole('heading', { name: lateStation.name, exact: true })).toHaveCount(0);
});

test('the complete calculation stops at 45 seconds using virtual time', async ({ page }) => {
  const capturedFirst = deferred(), capturedSecond = deferred(), releaseFirst = deferred(), releaseSecond = deferred();
  let requests = 0;
  await page.route('https://router.project-osrm.org/**', async route => {
    const number = ++requests;
    if (number === 1) { capturedFirst.resolve(); await releaseFirst.promise; }
    if (number === 2) { capturedSecond.resolve(); await releaseSecond.promise; }
    try { await json(route, routeResponse(route.request().url())); } catch { /* The deadline cancels an in-flight response. */ }
  });
  await page.clock.install();
  await enterTrip(page, ['48.9, 2.3', '49, 2.3', '49.1, 2.3']);
  await calculation(page).click();
  await waitForGate(capturedFirst);
  await page.clock.fastForward(20_000);
  await expect(page.getByLabel('Tiempo transcurrido', { exact: true })).toContainText(/20\s*s/);
  releaseFirst.resolve();
  await waitForGate(capturedSecond);
  await page.clock.fastForward(25_100);
  await expect(calculation(page)).toBeEnabled({ timeout: 2000 });
  await expect(page.locator('.routeResult')).toContainText(/45 segundos|tiempo máximo/i);
  await expect(page.getByLabel('Resumen visual del viaje', { exact: true })).toHaveCount(0);
  await expect(cancel(page)).toHaveCount(0);
  releaseSecond.resolve();
});

for (const kilometres of [100, 500]) {
  test('searching a ' + kilometres + ' km route uses a ' + kilometres * 0.04 + ' second budget', async ({ page }) => {
    const baselineCaptured = deferred(), releaseBaseline = deferred(), matrixCaptured = deferred(), releaseMatrix = deferred();
    let firstBaseline = true;
    await page.route('https://router.project-osrm.org/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('/table/')) {
        matrixCaptured.resolve(); await releaseMatrix.promise;
      } else if (firstBaseline) {
        firstBaseline = false;
        if (kilometres === 100) { baselineCaptured.resolve(); await releaseBaseline.promise; }
      }
      try { await json(route, routeResponse(route.request().url())); } catch { /* The elapsed search budget cancels the request. */ }
    });
    await page.clock.install();
    await enterTrip(page, [(48.8 + kilometres / 111) + ', 2.3']);
    await calculation(page).click();
    if (kilometres === 100) {
      // Preparation is separate: ten seconds finding the base road must not
      // consume the four-second search allowance once distance becomes known.
      await waitForGate(baselineCaptured);
      await page.clock.fastForward(10_000);
      await expect(cancel(page)).toBeVisible();
      releaseBaseline.resolve();
    }
    await waitForGate(matrixCaptured);
    const budget = page.getByLabel('Presupuesto de búsqueda', { exact: true });
    await expect(budget).toContainText(kilometres + ' km');
    await expect(budget).toContainText('Límite de búsqueda: ' + kilometres * 0.04 + ' s');
    await page.clock.fastForward(kilometres === 100 ? 2000 : 5000);
    await expect(cancel(page)).toBeVisible();
    await expect(calculation(page)).toHaveCount(0);
    await page.clock.fastForward(kilometres === 100 ? 2100 : 15_500);
    await expect(calculation(page)).toBeEnabled({ timeout: 2000 });
    await expect(page.locator('.routeResult')).toContainText('límite de búsqueda de ' + kilometres * 0.04 + ' segundos');
    await expect(page.getByLabel('Resumen visual del viaje', { exact: true })).toHaveCount(0);
    releaseMatrix.resolve();
  });
}

test('a 100 km trip with three destinations and charging completes with one shared matrix', async ({ page }) => {
  const requests = [];
  await page.route('https://router.project-osrm.org/**', route => {
    requests.push(new URL(route.request().url()));
    return json(route, routeResponse(route.request().url()));
  });
  await enterTrip(page, ['49.1, 2.3', '49.4, 2.3', (48.8 + 100 / 111) + ', 2.3']);
  await calculation(page).click();
  const summary = page.getByLabel('Resumen visual del viaje', { exact: true });
  await expect(summary).toBeVisible({ timeout: 15_000 });
  await expect(summary.locator('.tripSocLine')).toHaveCount(3);
  await expect(page.locator('.routeStopCard').first()).toBeVisible();
  expect(requests.filter(url => url.pathname.includes('/table/'))).toHaveLength(1);
  expect(requests.length).toBeLessThanOrEqual(5); // Base legs, one shared matrix and the final itinerary.
  await expect(calculation(page)).toBeEnabled();
});
