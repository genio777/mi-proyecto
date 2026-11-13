import { test as base, expect } from '@playwright/test';

// Synthetic fixtures exercise UI contracts. They are never distributed as real chargers.
const chargers = [
  { id: 'test-paris', name: 'Fixture Paris CCS', city: 'Paris', lat: 48.8566, lng: 2.3522,
    power: 400, connector: 'CCS,Tipo2', connectors: [{ type: 'CCS', powerKw: 400 }, { type: 'Tipo2', powerKw: 22 }],
    price: null, operator: 'Tesla', source: 'Synthetic browser fixture', verified: 'No verificada', availability: 'Desconocida',
    sourceUrl: 'https://openchargemap.org/site/poi/details/1', country: 'FR', declaredUsageCost: 'Free', access: 'Public',
    dataProvider: { id: 1, name: 'Open Charge Map Contributors', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', url: 'https://openchargemap.org/' } },
  { id: 'test-moscow', name: 'Fixture Moscow AC', city: 'Москва', lat: 55.7558, lng: 37.6173,
    power: 22, connector: 'Tipo2', connectors: [{ type: 'Tipo2', powerKw: 22 }],
    price: null, source: 'Synthetic browser fixture', verified: 'No verificada', availability: 'Desconocida' },
  { id: 'test-free', name: 'Fixture documented free', city: 'Madrid', lat: 40.4168, lng: -3.7038,
    power: 22, connector: 'Tipo2', connectors: [{ type: 'Tipo2', powerKw: 22 }],
    price: 0, source: 'Synthetic browser fixture', verified: 'Fixture only', availability: 'Desconocida' },
];
const tariffs = {
  updated: '2026-11-13T12:00:00Z',
  operators: [{ id: 'fixture', name: 'Fixture operator', source: 'https://example.org/tariff', status: 'unverified',
    tiers: [{ label: 'Reference only', price: 0.5 }] }],
};
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/data/chargers-spain.json*', route => json(route, {
      updated: '2026-11-13T12:00:00Z', chargers, reveApi: { records: 0 },
    }));
    await page.route('**/data/operator-tariffs.json*', route => json(route, tariffs));
    await page.route('**/data/international/index.json*', route => json(route, { schemaVersion: 1, countries: [] }));
    await page.route('**/geocoding-config.json', route => json(route, { photonEndpoint: 'https://photon.komoot.io/api/' }));
    await page.route('**/tile.openstreetmap.org/**', route => route.fulfill({ status: 200, contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') }));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Fixture Paris CCS' })).toBeVisible();
    await use(page);
    expect(errors, 'No uncaught browser errors').toEqual([]);
  },
});

const tab = (page, name) => page.locator('nav').getByRole('button', { name, exact: true }).click();

test('map, unknown prices, free filter and favorites survive reload', async ({ page }) => {
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('#map .leaflet-tile').first()).toBeVisible();
  const paris = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Fixture Paris CCS' }) });
  await expect(paris).toContainText('Precio no disponible');
  await expect(paris).not.toContainText('0.41 €/kWh');
  await expect(paris.getByRole('link', { name: 'Licencia del proveedor', exact: true })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
  await expect(paris.getByRole('link', { name: 'Registro de la fuente', exact: true })).toHaveAttribute('href', 'https://openchargemap.org/site/poi/details/1');
  await paris.getByRole('button', { name: '☆ Favorito' }).click();
  await page.getByLabel('Solo gratis', { exact: true }).check();
  await expect(page.getByRole('heading', { name: 'Fixture documented free' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fixture Paris CCS' })).toHaveCount(0);
  await tab(page, 'favoritos');
  await expect(page.getByRole('heading', { name: 'Fixture Paris CCS' })).toBeVisible();
  await page.reload();
  await tab(page, 'favoritos');
  await expect(page.getByRole('heading', { name: 'Fixture Paris CCS' })).toBeVisible();
  await page.getByRole('button', { name: 'Quitar favorito' }).click();
  await expect(page.getByText('0 cargadores guardados')).toBeVisible();
});

test('Tesla and Zoe keep independent battery and AC power profiles', async ({ page }) => {
  await tab(page, 'vehículo');
  await expect(page.getByLabel('Batería útil (kWh)', { exact: true })).toHaveValue('57.5');
  await page.getByLabel('Batería útil (kWh)', { exact: true }).fill('58');
  await page.getByLabel('Potencia máxima AC del vehículo (kW)', { exact: false }).fill('10');
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await page.getByRole('button', { name: 'Renault Zoe R90', exact: true }).click();
  await expect(page.getByLabel('Batería útil (kWh)', { exact: true })).toHaveValue('41');
  await expect(page.getByLabel('Potencia máxima AC del vehículo (kW)', { exact: false })).toHaveValue('22');
  const connectors = page.getByRole('group', { name: 'Conectores del vehículo', exact: true });
  await expect(connectors.getByRole('button', { name: 'Tipo 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(connectors.getByRole('button', { name: 'CCS', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByLabel('Batería útil (kWh)', { exact: true }).fill('40');
  await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click();
  await page.getByRole('button', { name: 'Tesla Model Y Standard Range', exact: true }).click();
  await expect(page.getByLabel('Batería útil (kWh)', { exact: true })).toHaveValue('58');
  await expect(page.getByLabel('Potencia máxima AC del vehículo (kW)', { exact: false })).toHaveValue('10');
  await page.reload();
  await tab(page, 'vehículo');
  await expect(page.getByLabel('Batería útil (kWh)', { exact: true })).toHaveValue('58');
  await page.getByRole('button', { name: 'Renault Zoe R90', exact: true }).click();
  await expect(page.getByLabel('Batería útil (kWh)', { exact: true })).toHaveValue('40');
});

test('cost simulation calculates extras, restores values and exports CSV', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await tab(page, 'costes');
  await page.getByLabel('Energía (kWh)', { exact: true }).fill('20');
  await page.getByLabel('Coste fijo por sesión (€)', { exact: true }).fill('2');
  await page.getByLabel('Duración (min)', { exact: true }).fill('10');
  await page.getByLabel('Coste por minuto (€)', { exact: true }).fill('0.1');
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Fixture operator · Reference only' }) });
  await expect(card.locator('strong')).toHaveText('13.00 €');
  await page.getByRole('button', { name: 'Guardar simulación', exact: true }).click();
  await page.getByLabel('Energía (kWh)', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Recuperar simulación', exact: true }).click();
  await expect(page.getByLabel('Energía (kWh)', { exact: true })).toHaveValue('20');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('cargagratis-comparativa-costes.csv');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain('"Total_EUR"');
  expect(csv).toContain('"13.00"');
  expect(csv).toContain('"unverified"');
  await page.getByLabel('Energía (kWh)', { exact: true }).fill('-1');
  await expect(page.getByRole('button', { name: 'Exportar CSV', exact: true })).toBeDisabled();
});

test('international searches require submission and respect France and Russia', async ({ page }) => {
  const requests = [];
  await page.route('https://photon.komoot.io/api/**', route => {
    const url = new URL(route.request().url());
    requests.push(url);
    const russian = url.searchParams.get('countrycode') === 'RU';
    return json(route, { features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: russian ? [37.6173, 55.7558] : [2.3522, 48.8566] },
      properties: { countrycode: russian ? 'RU' : 'FR', name: russian ? 'Москва' : 'Paris', postcode: russian ? '101000' : '75001' } }] });
  });
  await page.getByLabel('Buscar cargadores', { exact: true }).fill('75001, Paris, Francia');
  await expect(page.getByRole('button', { name: 'Buscar zona', exact: true })).toBeEnabled();
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Buscar zona', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fixture Paris CCS' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fixture Moscow AC' })).toHaveCount(0);
  expect(requests[0].searchParams.get('countrycode')).toBe('FR');
  expect(requests[0].searchParams.get('q')).toContain('75001');
  await page.getByLabel('Buscar cargadores', { exact: true }).fill('Москва, Россия');
  await page.getByLabel('Buscar cargadores', { exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Fixture Moscow AC' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fixture Paris CCS' })).toHaveCount(0);
  expect(requests[1].searchParams.get('countrycode')).toBe('RU');
});

test('international city search loads a published country shard with visible source licensing', async ({ page }) => {
  const station = { ...chargers[0], id: 'test-fr-shard', name: 'Fixture France from published shard' };
  await page.route('**/data/international/index.json*', route => json(route, {
    schemaVersion: 1, countries: [{ code: 'FR', file: 'FR.json', count: 1, bbox: [2, 48, 3, 49] }],
  }));
  await page.route('**/data/international/FR.json', route => json(route, { country: 'FR', chargers: [station] }));
  await page.route('https://photon.komoot.io/api/**', route => json(route, { features: [{
    type: 'Feature', geometry: { type: 'Point', coordinates: [2.3522, 48.8566] }, properties: { countrycode: 'FR', name: 'Paris' },
  }] }));
  // Reload resets the catalog module's manifest cache before this test's index is read.
  await page.reload();
  await page.getByLabel('Buscar cargadores', { exact: true }).fill('Paris, Francia');
  await page.getByRole('button', { name: 'Buscar zona', exact: true }).click();
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: station.name }) });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Precio no disponible');
  await expect(card).toContainText('Tarifa declarada por la fuente (sin verificar)');
  await expect(card.getByRole('link', { name: 'Licencia del proveedor', exact: true })).toHaveAttribute('href', station.dataProvider.licenseUrl);
});

function routeResponse(url) {
  const parsed = new URL(url);
  const coordinates = decodeURIComponent(parsed.pathname.split('/driving/')[1]).split(';').map(point => point.split(',').map(Number));
  if (parsed.pathname.includes('/table/')) {
    const origin = coordinates[0];
    const distances = coordinates.slice(1).map(point => Math.hypot((point[0] - origin[0]) * 73, (point[1] - origin[1]) * 111) * 1000);
    return { code: 'Ok', distances: [distances], durations: [distances.map(metres => metres / 1000 * 60)] };
  }
  const legs = coordinates.slice(1).map((point, i) => {
    const previous = coordinates[i];
    const km = Math.hypot((point[0] - previous[0]) * 73, (point[1] - previous[1]) * 111);
    return { distance: km * 1000, duration: km * 60, steps: [] };
  });
  return { code: 'Ok', routes: [{ distance: legs.reduce((n, leg) => n + leg.distance, 0), duration: legs.reduce((n, leg) => n + leg.duration, 0),
    geometry: { type: 'LineString', coordinates }, legs }], waypoints: coordinates.map(location => ({ location, distance: 0 })) };
}

test('fast mode admits 400 kW CCS despite a saved ceiling and rejects Zoe AC charging', async ({ page }) => {
  await page.route('https://router.project-osrm.org/**', route => json(route, routeResponse(route.request().url())));
  await tab(page, 'viaje');
  await page.locator('.powerSelector select').selectOption('50');
  await page.getByRole('button', { name: 'Más rápido', exact: true }).click();
  await expect(page.locator('.powerSelector')).toContainText('1 estaciones compatibles');
  await tab(page, 'vehículo');
  await page.getByRole('button', { name: 'Renault Zoe R90', exact: true }).click();
  await tab(page, 'viaje');
  await expect(page.locator('.powerSelector')).toContainText('0 estaciones compatibles');
  await page.getByLabel('Origen', { exact: true }).fill('48.8, 2.3');
  await page.getByLabel('Destino 1', { exact: true }).fill('49.8, 2.3');
  await page.getByLabel('SOC salida (%)', { exact: true }).fill('20');
  await page.getByRole('button', { name: 'Calcular ruta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Calcular ruta', exact: true })).toBeEnabled();
  await expect(page.locator('.routeResult')).toContainText(/Zoe|100 kW|compatible|potencia/i);
  await expect(page.locator('.routeMapWrap')).toHaveCount(0);
});

test('three international destinations show each arrival and road-service failures clear the route', async ({ page }) => {
  let fail = false;
  await page.route('https://router.project-osrm.org/**', route => fail
    ? json(route, { code: 'NoRoute', routes: [] }) : json(route, routeResponse(route.request().url())));
  await tab(page, 'viaje');
  await page.getByRole('button', { name: '3 destinos', exact: true }).click();
  await page.getByLabel('Origen', { exact: true }).fill('48.8, 2.3');
  await page.getByLabel('Destino 1', { exact: true }).fill('48.85, 2.3');
  await page.getByLabel('Destino 2', { exact: true }).fill('48.9, 2.3');
  await page.getByLabel('Destino 3', { exact: true }).fill('48.95, 2.3');
  await page.getByRole('button', { name: 'Calcular ruta', exact: true }).click();
  const summary = page.getByLabel('Resumen visual del viaje', { exact: true });
  await expect(summary).toBeVisible();
  await expect(summary.locator('.tripSocLine')).toHaveCount(3);
  await expect(page.locator('.routeMapWrap #map')).toBeVisible();
  const arrivals = await summary.locator('.tripSocLine strong').allTextContents();
  const percentages = arrivals.map(value => Number(value.replace('%', '')));
  expect(percentages[0]).toBeGreaterThan(percentages[1]);
  expect(percentages[1]).toBeGreaterThan(percentages[2]);
  fail = true;
  await page.getByLabel('Destino 3', { exact: true }).fill('48.96, 2.3');
  await page.getByRole('button', { name: 'Calcular ruta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Calcular ruta', exact: true })).toBeEnabled();
  await expect(page.locator('.routeResult')).toContainText(/ruta|carretera|servicio/i);
  await expect(page.locator('.routeMapWrap')).toHaveCount(0);
  await expect(summary).toHaveCount(0);
});

test('a planned stop distinguishes unknown data from a manual price estimate', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.route('https://router.project-osrm.org/**', route => json(route, routeResponse(route.request().url())));
  await tab(page, 'viaje');
  await page.getByRole('button', { name: 'Más rápido', exact: true }).click();
  await page.getByLabel('Origen', { exact: true }).fill('48.8, 2.3');
  await page.getByLabel('Destino 1', { exact: true }).fill('49.3, 2.3');
  await page.getByLabel('SOC salida (%)', { exact: true }).fill('20');
  await page.getByLabel('Reserva mínima (%)', { exact: true }).fill('15');
  await page.getByRole('button', { name: 'Calcular ruta', exact: true }).click();
  const card = page.locator('.routeStopCard');
  await expect(card).toHaveCount(1);
  await expect(card.getByRole('heading')).toContainText('Fixture Paris CCS');
  await expect(card).toContainText('170 kW compatibles · toma CCS');
  const evidence = card.getByLabel('Confianza de los datos de esta parada', { exact: true });
  await expect(evidence.locator('.evidenceBadge')).toHaveText('Desconocido');
  await expect(evidence.locator('.evidenceRate')).toHaveCount(0);
  await expect(evidence).toContainText('Fecha no indicada por la fuente');
  await expect(evidence).toContainText('Sin confirmar en tiempo real');
  await expect(evidence.getByRole('link', { name: 'Synthetic browser fixture', exact: true })).toHaveAttribute('href', chargers[0].sourceUrl);
  await expect(evidence.getByRole('link', { name: 'CC BY 4.0', exact: true })).toHaveAttribute('href', chargers[0].dataProvider.licenseUrl);
  await page.getByLabel('Precio estimado para cargadores sin tarifa publicada (€/kWh)', { exact: true }).fill('0.45');
  await page.getByRole('button', { name: 'Calcular ruta', exact: true }).click();
  await expect(evidence.locator('.evidenceBadge')).toHaveText('Estimado');
  await expect(evidence.locator('.evidenceRate')).toHaveText('· 0,45 €/kWh');
  await expect(evidence.getByText('Confirmado', { exact: true })).toHaveCount(0);
  await expect(evidence).toContainText('Importe introducido por el usuario');
  await expect(evidence).toContainText('Sin confirmar en tiempo real');
  await card.screenshot({ path: testInfo.outputPath('planned-stop-manual-estimate.png') });
});
